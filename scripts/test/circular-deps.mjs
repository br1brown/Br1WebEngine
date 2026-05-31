// =============================================================================
// circular-deps.mjs  —  Rilevatore generico di dipendenze cicliche pericolose
//
// Suite di template: vale per QUALSIASI codice, non solo per i cookie.
//
// Non tutti i cicli di import sono un problema. In Angular i cicli via Dependency
// Injection (servizi che si iniettano a vicenda con `inject()`) sono leciti e
// idiomatici — il "modello autoalimentato". Un controllo "qualsiasi ciclo =
// errore" (es. `madge --circular`) sarebbe rosso su codice perfettamente valido.
//
// Pericoloso è invece il ciclo EAGER: un modulo che, durante l'inizializzazione,
// legge a livello di modulo (non dentro una funzione) un binding di un altro
// modulo del ciclo non ancora inizializzato → quel binding è `undefined`.
// È esattamente il bug storico della mappa cookie: cookie-registry.ts costruiva
// COOKIE_MAP usando il VALORE dell'enum CookieCategory importato da
// cookie-consent.service.ts, che a sua volta importa COOKIE_MAP.
//
// Come distingue eager da lazy (analisi dell'AST TypeScript):
//   • eager  → `extends X`, chiamate/riferimenti al top-level del modulo,
//              inizializzatori di `const`/`let` di modulo, decoratori di classe
//   • lazy   → dentro corpi di funzione/metodo/costruttore/accessor, oppure
//              inizializzatori di campo di classe (`x = inject(Service)`)
//   • assenti→ `import type` / `export type` (cancellati da tsc)
//
// Poi simula l'ordine reale di valutazione dei moduli ES a partire dai veri
// entry point (main.ts, main.server.ts) e segnala un ciclo solo se un arco
// eager punta a un modulo ancora "in valutazione" (sullo stack).
//
// Uso:
//   node scripts/test/circular-deps.mjs
//
// Exit code:
//   0  Nessun ciclo eager pericoloso
//   1  Almeno un ciclo eager pericoloso (rischio `undefined` all'init)
//   2  TypeScript non disponibile (dipendenze non installate) — test saltato
// =============================================================================

import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = resolve(SCRIPT_DIR, '..', '..', 'frontend');
const SRC_DIR = norm(resolve(FRONTEND_DIR, 'src'));

let ts;
try {
    ts = (await import(`file://${resolve(FRONTEND_DIR, 'node_modules/typescript/lib/typescript.js')}`)).default;
} catch {
    try { ts = (await import('typescript')).default; } catch { /* gestito sotto */ }
}
if (!ts) {
    console.log('  WARN typescript non installato — controllo dipendenze cicliche saltato');
    process.exit(2);
}

// ── tsconfig + module resolution ────────────────────────────────────────────
const configPath = resolve(FRONTEND_DIR, 'tsconfig.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, FRONTEND_DIR);
const options = parsed.options;
const host = ts.createCompilerHost(options);
const program = ts.createProgram(parsed.fileNames, options, host);

const isInternal = f => {
    const n = norm(f);
    return n.startsWith(SRC_DIR + '/') && n.endsWith('.ts') && !n.endsWith('.d.ts');
};

// ── Costruzione del grafo (archi di valore, marcati eager/lazy) ──────────────
// graph: nodo → array ordinato di { target, eager }
const graph = new Map();

for (const sf of program.getSourceFiles()) {
    if (!isInternal(sf.fileName)) continue;
    const self = norm(sf.fileName);

    const edges = [];                 // ordinati per posizione nel sorgente
    const edgeByTarget = new Map();   // target → edge (per marcatura eager)
    const valueNameToTarget = new Map(); // local name di valore → target

    const addEdge = (target, eager) => {
        let e = edgeByTarget.get(target);
        if (!e) { e = { target, eager: false }; edges.push(e); edgeByTarget.set(target, e); }
        if (eager) e.eager = true;
        return e;
    };

    const resolveSpec = spec => {
        const r = ts.resolveModuleName(spec, sf.fileName, options, host).resolvedModule;
        if (!r) return null;
        const t = norm(r.resolvedFileName);
        return isInternal(t) ? t : null;
    };

    // 1) Dichiarazioni import/export con specificatore di modulo
    for (const st of sf.statements) {
        if (ts.isImportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
            const target = resolveSpec(st.moduleSpecifier.text);
            if (!target || target === self) continue;
            const clause = st.importClause;
            if (!clause) { addEdge(target, true); continue; }   // import './x' — side-effect, eager
            if (clause.isTypeOnly) continue;                    // import type — cancellato
            addEdge(target, false);
            if (clause.name) valueNameToTarget.set(clause.name.text, target); // default
            const nb = clause.namedBindings;
            if (nb && ts.isNamespaceImport(nb)) valueNameToTarget.set(nb.name.text, target);
            if (nb && ts.isNamedImports(nb)) {
                for (const el of nb.elements) {
                    if (el.isTypeOnly) continue;
                    valueNameToTarget.set(el.name.text, target);
                }
            }
        } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
            if (st.isTypeOnly) continue;
            const target = resolveSpec(st.moduleSpecifier.text);
            if (!target || target === self) continue;
            addEdge(target, true); // re-export: esegue il modulo target all'init
        }
    }

    // 2) Analisi d'uso: un binding di valore importato, riferito in posizione
    //    EAGER, rende l'arco eager.
    // I nodi di createProgram non hanno `.parent`: lo passiamo a mano.
    const visit = (node, parent, eager, inType) => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return; // già gestiti
        const nowType = inType || ts.isTypeNode(node) || ts.isTypeAliasDeclaration(node)
            || ts.isInterfaceDeclaration(node);
        const nowEager = eager && !isDeferred(node);

        if (eager && !inType && ts.isIdentifier(node) && isValueReference(node, parent)) {
            const target = valueNameToTarget.get(node.text);
            if (target) { const e = edgeByTarget.get(target); if (e) e.eager = true; }
        }
        ts.forEachChild(node, c => visit(c, node, nowEager, nowType));
    };
    ts.forEachChild(sf, c => visit(c, sf, true, false));

    // `class X extends Base`: la classe base è valutata eager alla definizione
    // della classe (non è una posizione di tipo come `implements`).
    const markExtends = node => {
        if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.heritageClauses) {
            for (const h of node.heritageClauses) {
                if (h.token !== ts.SyntaxKind.ExtendsKeyword) continue;
                for (const t of h.types) {
                    let ex = t.expression;
                    while (ts.isPropertyAccessExpression(ex)) ex = ex.expression;
                    if (ts.isIdentifier(ex)) {
                        const target = valueNameToTarget.get(ex.text);
                        if (target) { const e = edgeByTarget.get(target); if (e) e.eager = true; }
                    }
                }
            }
        }
        ts.forEachChild(node, markExtends);
    };
    markExtends(sf);

    graph.set(self, edges);

    function isDeferred(n) {
        return ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)
            || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n)
            || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n)
            || ts.isPropertyDeclaration(n); // inizializzatore di campo → runtime di costruzione
    }
}

// Un Identifier è un riferimento di VALORE (non nome di proprietà/dichiarazione).
function isValueReference(id, p) {
    if (!p) return false;
    if (ts.isPropertyAccessExpression(p) && p.name === id) return false; // a.b → b
    if (ts.isQualifiedName(p) && p.right === id) return false;
    if (ts.isPropertyAssignment(p) && p.name === id) return false;       // { b: ... }
    if (ts.isBindingElement(p) && p.propertyName === id) return false;
    if ((ts.isPropertyDeclaration(p) || ts.isParameter(p) || ts.isVariableDeclaration(p)
        || ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p)) && p.name === id) return false;
    return true;
}

// ── Simulazione dell'ordine di valutazione dei moduli ES dagli entry ─────────
const entries = ['src/main.ts', 'src/main.server.ts']
    .map(p => norm(resolve(FRONTEND_DIR, p)))
    .filter(p => graph.has(p));

const rel = f => relative(FRONTEND_DIR, f).split(sep).join('/');
const hazards = new Map(); // "src→tgt" → { from, to, cycle[] }

for (const entry of entries) {
    const state = new Map(); // 0/undef unvisited, 1 in valutazione (stack), 2 valutato
    const stack = [];
    evaluate(entry);

    function evaluate(m) {
        state.set(m, 1);
        stack.push(m);
        const edges = graph.get(m) ?? [];
        for (const e of edges) {                 // fase 1: valuta le dipendenze (ordine sorgente)
            if (!state.get(e.target)) evaluate(e.target);
        }
        for (const e of edges) {                 // fase 2: esegue il corpo (letture eager)
            if (e.eager && state.get(e.target) === 1) {
                const idx = stack.indexOf(e.target);
                const cycle = [...stack.slice(idx), e.target];
                hazards.set(`${m}->${e.target}`, { from: m, to: e.target, cycle });
            }
        }
        stack.pop();
        state.set(m, 2);
    }
}

// ── Esito ───────────────────────────────────────────────────────────────────
const internalCount = [...graph.keys()].length;

if (hazards.size === 0) {
    console.log(`  Analizzati ${internalCount} moduli da ${entries.length} entry — nessun ciclo eager pericoloso`);
    process.exit(0);
}

console.error(`  PERICOLO: ${hazards.size} ciclo/i eager (binding letto prima dell'init):\n`);
for (const { from, to, cycle } of hazards.values()) {
    console.error('   ' + cycle.map(rel).join('\n     → '));
    console.error(`     ⮑ ${rel(from)} legge a livello di modulo un binding di ${rel(to)} non ancora inizializzato\n`);
}
console.error('  Spezza il ciclo: estrai enum/tipi/costanti condivise in un modulo foglia');
console.error('  e importa i soli tipi con `import type`.');
process.exit(1);

// ── util ────────────────────────────────────────────────────────────────────
function norm(p) { return p.replace(/\\/g, '/'); }
