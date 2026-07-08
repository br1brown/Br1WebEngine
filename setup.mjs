#!/usr/bin/env node
/**
 * setup.mjs — Inizializza un nuovo progetto a partire dal template Br1WebEngine.
 *
 * Uso:
 *   node setup.mjs "Nome Progetto"
 *   node setup.mjs          ← chiede il nome in modo interattivo
 *
 * Cosa fa SEMPRE (battesimo):
 *   1. Imposta project.name in global-settings.json (file committabile: identità del progetto)
 *   2. Crea global-settings.local.json (gitignored) con pubblicazione (porte/deploy) e
 *      l'API key generata. La SecretKey JWT resta VUOTA: un progetto nasce col login
 *      spento — si attiva valorizzandola, scelta esplicita e mai un default.
 *   3. Rinomina gli identificatori npm/SW generici "app" → slug del prodotto
 *      (frontend/package.json, frontend/ngsw-config.json)
 *   4. Rinomina App.sln → NomeProgetto.sln
 *
 * Poi CHIEDE conferma [s/N] per la "cerimonia" da template a progetto (DISTRUTTIVA):
 *   5. Rimuove la demo (frontend + backend): pagina Social + galleria social
 *      (store/SiteService/social.json), home → placeholder, addon i18n → {},
 *      BaseController minimo, data/identity.json azzerato a scheletro, site.ts riscritto.
 *      L'identità del sito resta servita dall'Engine (GET /identity).
 *   6. Elimina il README.md vetrina del template.
 *   7. Esegue i controlli statici disponibili (lint/tsc/i18n/cicli) come gate.
 *   8. Auto-cancella questo setup.mjs.
 *   9. Fa un commit locale "init <Nome>".
 */

import { readFileSync, writeFileSync, existsSync, renameSync, rmSync } from 'fs';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { join, dirname } from 'path';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));

// ── Utilità ────────────────────────────────────────────────────────────────

function ask(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, answer => {
        rl.close();
        resolve(answer.trim());
    }));
}

/**
 * "Mercatino App" → "mercatino-app"
 * "MyCoolSite"    → "mycoolsite"
 */
function toSlug(s) {
    return s.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * "mercatino app" → "MercatinoApp"
 * "my-cool-site"  → "MyCoolSite"
 */
function toPascal(s) {
    return s.trim()
        .split(/[\s\-_]+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
}

function editFile(filePath, transform) {
    if (!existsSync(filePath)) {
        console.warn(`  ⚠  non trovato: ${filePath}`);
        return false;
    }
    const before = readFileSync(filePath, 'utf-8');
    const after = transform(before);
    if (before === after) {
        console.log(`  =  invariato: ${filePath}`);
        return false;
    }
    writeFileSync(filePath, after, 'utf-8');
    console.log(`  ✓  aggiornato: ${filePath}`);
    return true;
}

function writeNew(filePath, content) {
    writeFileSync(filePath, content, 'utf-8');
    console.log(`  ✓  riscritto: ${filePath}`);
}

function removeChunk(src, chunk, label) {
    if (!src.includes(chunk)) {
        console.warn(`  ⚠  blocco non trovato (${label}): salto`);
        return src;
    }
    return src.replace(chunk, '');
}

// ── Contenuti minimi del "progetto vuoto" (scritti dall'eject) ───────────────

const MINIMAL_SITE_TS = `import { buildSite } from './core/engine/siteBuilder';

export type {
    SiteConfig,
    SitePageInput,
    SmokeSettings
} from './core/engine/siteBuilder';

// ═══════════════════════════════════════════════════════════════════════
// ENUM PageType — identità di ogni pagina
// ═══════════════════════════════════════════════════════════════════════
// Ogni pagina DEVE avere un valore qui. Aggiungine uno e usalo in
// pages / headerNav / footerNav: rotte, menu e sitemap si aggiornano da soli.
export enum PageType {
    PrivacyPolicy,
    CookiePolicy,
    TermsOfService,
    LegalNotice,
    AccessibilityStatement,
    Home,
}

// Struttura del sito: opzioni globali, pagine e menu. Identità ed estetica
// (nome, versione, lingue, descrizione, tema) vivono in global-settings.json.
//
// LOGIN SPENTO di default, coerente con Security.Token.SecretKey vuota.
// Per attivarlo: valorizza la SecretKey (>=32 char), poi qui aggiungi
// PageType.Login + la sua pagina in pages, imposta loginPage: PageType.Login
// e shell.showLoginInHeader: true. I pezzi pronti (pagina login, app-login-form,
// app-user-nav) sono gia' nel progetto: vanno solo ricablati.
export const ContestoSito = buildSite({
    homePage: PageType.Home,

    legalPages: {
        privacy: PageType.PrivacyPolicy,
        cookie: PageType.CookiePolicy,
        tos: PageType.TermsOfService,
        legal: PageType.LegalNotice,
        accessibility: PageType.AccessibilityStatement,
    },

    shell: {
        showNav: true,
        showFooter: true,
        fixedTopHeader: true,
        showBrandIconInHeader: true,
        showLoginInHeader: false,
        forcedLightPanel: true,
    },

    isWebApp: true,
    onlyPlainImage: false,

    pages: () => [
        {
            path: '',
            title: '',
            pageType: PageType.Home,
            component: () => import('./pages/home/home.component').then(m => m.HomeComponent),
            // Skeleton pulito: la home parte senza navbar. Togli questo layout
            // (o metti showNav: true) quando vuoi la shell anche qui.
            layout: { showNav: false },
        },
    ],

    headerNav: (h) => {
        h.addGroup('menuPolicy', g => {
            g.addPage(PageType.PrivacyPolicy);
            g.addPage(PageType.CookiePolicy);
            g.addPage(PageType.AccessibilityStatement);
            g.addGroup('menuLegale', sg => {
                sg.addPage(PageType.TermsOfService);
                sg.addPage(PageType.LegalNotice);
            });
        });
    },

    footerNav: (f) => {
        f.addGroup('menuPolicy', g => {
            g.addPage(PageType.PrivacyPolicy);
            g.addPage(PageType.CookiePolicy);
            g.addPage(PageType.AccessibilityStatement);
            g.addGroup('menuLegale', sg => {
                sg.addPage(PageType.TermsOfService);
                sg.addPage(PageType.LegalNotice);
            });
        });
    },
});
`;

const MINIMAL_HOME_TS = `import { Component } from '@angular/core';
import { PageBaseComponent } from '../../core/engine/pages/page-base.component';

/** Home del progetto — punto di partenza vuoto. Riempila col tuo contenuto. */
@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
})
export class HomeComponent extends PageBaseComponent<void> {}
`;

const MINIMAL_HOME_HTML = `<!-- La home del tuo progetto: parti da qui. -->
`;

const MINIMAL_BASECONTROLLER_CS = `using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

/// <summary>
/// Controller pubblico del progetto (API key). Eredita sicurezza e logger da
/// <see cref="EngineApiController"/>. Punto di partenza vuoto: aggiungi qui i tuoi endpoint.
/// </summary>
/// <remarks>
/// L'identità del sito (footer, pagine legali, SEO) è servita dall'Engine su GET /identity:
/// non si scrive qui, basta riempire data/identity.json.
/// </remarks>
[Route("")]
public class BaseController : EngineApiController
{
    /// <summary>Inizializza il controller col logger ereditato dall'Engine.</summary>
    public BaseController(ILogger<BaseController> logger) : base(logger) { }
}
`;

// identity.json azzerato a scheletro: il figlio lo riempie (o lo lascia così → /identity
// risponde null e footer/pagine legali/JSON-LD si nascondono da soli). Lo schema (engine,
// in Engine/Models/Identity/) dà validazione e autocomplete su questo file.
const MINIMAL_IDENTITY_JSON = `{
    "$schema": "../Engine/Models/Identity/identity.schema.json",
    "personal": false,
    "ragioneSociale": "",
    "partitaIva": "",
    "codiceFiscale": "",
    "sedeLegale": { "via": "", "civico": "", "cap": "", "citta": "", "provincia": "", "nazione": "" },
    "contatti": { "telefono": "", "email": "", "pec": "" },
    "datiSocietari": { "registroImprese": "", "numeroRea": "", "codiceSdi": "" },
    "social": [],
    "openingHours": [],
    "currency": "EUR",
    "metadatiAggiuntivi": {}
}
`;

// ── Eject: da template a progetto ────────────────────────────────────────────

function ejectDemo() {
    console.log('\n  Rimozione demo (template → progetto)...');
    const fe = join(ROOT, 'frontend/src');
    const be = join(ROOT, 'backend');

    // Riscrittura dei file "di partenza" (dominio del figlio).
    writeNew(join(fe, 'app/site.ts'), MINIMAL_SITE_TS);
    writeNew(join(fe, 'app/pages/home/home.component.ts'), MINIMAL_HOME_TS);
    writeNew(join(fe, 'app/pages/home/home.component.html'), MINIMAL_HOME_HTML);
    writeNew(join(fe, 'assets/i18n/addon.it.json'), '{}\n');
    writeNew(join(fe, 'assets/i18n/addon.en.json'), '{}\n');
    writeNew(join(be, 'Controllers/BaseController.cs'), MINIMAL_BASECONTROLLER_CS);

    // L'identità è servita dall'Engine (GET /identity): qui resta solo il dato, azzerato a scheletro.
    // La galleria social era una demo (store + SiteService + social.json) → brucia per intero.
    writeNew(join(be, 'data/identity.json'), MINIMAL_IDENTITY_JSON);
    rmSync(join(be, 'Services/SiteService.cs'), { force: true });
    rmSync(join(be, 'Store/IContentStore.cs'), { force: true });
    rmSync(join(be, 'Store/FileContentStore.cs'), { force: true });
    rmSync(join(be, 'data/social.json'), { force: true });
    console.log('  ✓  bruciati: SiteService, IContentStore/FileContentStore, data/social.json');
    console.log('  ✓  azzerato a scheletro: backend/data/identity.json');

    // Program.cs: via le registrazioni dello store/SiteService demo (l'identità resta su AddTemplateIdentity).
    editFile(join(be, 'Program.cs'), src => {
        src = removeChunk(src, `builder.Services.AddSingleton<IContentStore, FileContentStore>();\n`, 'Program IContentStore reg');
        src = removeChunk(src, `builder.Services.AddScoped<SiteService>();\n`, 'Program SiteService reg');
        src = src.replace(
`// IContentStore (FileContentStore): accesso dati demo (galleria social), sostituibile con DB.
// SiteService: logica di business del progetto. L'identità del sito è servita dall'engine (vedi AddTemplateIdentity).
// AuthService: infrastruttura JWT, registrata solo se LoginEnabled.`,
`// BlobStore: storage dei file caricati (upload).
// AuthService: infrastruttura JWT, registrata solo se LoginEnabled.
// L'identità del sito è servita dall'Engine (GET /identity): riempi data/identity.json.`);
        return src;
    });

    // content.resolver: via il case Social (e la dipendenza ApiService, ora inutile).
    // Rimozioni mirate perché il file contiene template-literal (${...}) non incorporabili.
    editFile(join(fe, 'app/pages/content.resolver.ts'), src => {
        src = removeChunk(src, `import { ApiService } from '../core/services/api.service';\n`, 'resolver ApiService import');
        src = removeChunk(src, `    private readonly apiService = inject(ApiService);\n`, 'resolver ApiService field');
        src = src.replace(
            `            if (legalSlug) {
                content = await this.tryLoadPolicy(legalSlug, language);
            } else {
                switch (pageType) {
                    case PageType.Social:
                        content = await this.apiService.getSocial();
                        break;
                }
            }`,
            `            if (legalSlug) {
                content = await this.tryLoadPolicy(legalSlug, language);
            }`
        );
        return src;
    });

    // api.service: via getSocial + path + import HttpParams (usato solo lì).
    editFile(join(fe, 'app/core/services/api.service.ts'), src => {
        src = removeChunk(src, `import { HttpParams } from '@angular/common/http';\n`, 'api HttpParams import');
        src = removeChunk(src, `    social: 'social',\n`, 'api social path');
        src = removeChunk(src,
`    /**
     * Recupera i link ai social network.
     * @param nomi  Filtro opzionale: array di nomi (es. ['facebook','instagram']).
     * Genera query string con chiavi ripetute: ?nomi=facebook&nomi=instagram
     */
    getSocial(nomi?: string[]): Promise<Record<string, string>> {
        let params = new HttpParams();
        if (nomi?.length) {
            nomi.forEach(n => params = params.append('nomi', n));
        }
        return this.api_get<Record<string, string>>(API.social, params);
    }

`, 'api getSocial method');
        return src;
    });

    // Cancella la pagina demo Social.
    rmSync(join(fe, 'app/pages/social'), { recursive: true, force: true });
    console.log('  ✓  rimossa: frontend/src/app/pages/social');

    // Asset demo 4K (usato dal playground di resize nella home demo): via il file e la voce
    // dal mapping. Nel progetto resta solo la favicon; la home placeholder non lo referenzia.
    // Robusto: legge il nome reale del file da mapping.json (chiave img4k), così non è hardcoded.
    const mappingPath = join(fe, 'assets/mapping.json');
    if (existsSync(mappingPath)) {
        try {
            const mapping = JSON.parse(readFileSync(mappingPath, 'utf-8'));
            if (mapping.img4k) {
                rmSync(join(fe, 'assets/files', mapping.img4k), { force: true });
                delete mapping.img4k;
                writeFileSync(mappingPath, JSON.stringify(mapping, null, 4) + '\n', 'utf-8');
                console.log('  ✓  rimosso asset demo 4K (file + voce mapping; resta la favicon)');
            }
        } catch {
            console.warn('  ⚠  mapping.json non leggibile: salto la rimozione dell\'asset 4K');
        }
    }
}

/**
 * Controlli statici disponibili come gate pre-commit. Ritorna true se si può committare.
 * Senza node_modules i controlli che richiedono i tool vengono saltati (non bloccano).
 */
function runChecks() {
    if (!existsSync(join(ROOT, 'frontend/node_modules'))) {
        console.warn('  ⚠  frontend/node_modules assente: salto i controlli statici (lancia `npm install` e ri-verifica).');
        return true;
    }
    const checks = [
        ['lint', 'bash scripts/test/lint-check.sh'],
        ['tsc', 'bash scripts/test/tsc-check.sh'],
        ['i18n', 'bash scripts/test/i18n-check.sh'],
        ['cicli', 'bash scripts/test/circular-deps-check.sh'],
    ];
    let ok = true;
    for (const [name, cmd] of checks) {
        console.log(`\n  ▶ ${name}`);
        try {
            execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
        } catch (e) {
            if (e && e.status === 2) { console.warn(`  ⚠  ${name}: saltato (tool non disponibile)`); continue; }
            console.error(`  ✗  ${name}: FALLITO`);
            ok = false;
        }
    }
    return ok;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n──────────────────────────────────────────');
    console.log(' Setup progetto da template Br1WebEngine');
    console.log('──────────────────────────────────────────\n');

    const rawName = process.argv.slice(2).join(' ').trim() || await ask('Nome del progetto (es. MercatinoApp): ');

    if (!rawName) {
        console.error('Errore: nome non fornito.');
        process.exit(1);
    }

    const displayName = rawName.trim();        // "Mercatino App"  → mostrato all'utente
    const pascalName  = toPascal(rawName);     // "MercatinoApp"   → per il file .sln
    const slugName    = toSlug(rawName);       // "mercatino-app"  → COMPOSE_PROJECT_NAME

    console.log(`\n  Nome visualizzato : ${displayName}`);
    console.log(`  Nome file .sln    : ${pascalName}.sln`);
    console.log(`  COMPOSE_PROJECT_NAME: ${slugName}`);
    console.log('');

    // ── 1. Nome del progetto in global-settings.json (file committabile) ──
    // L'identità (nome, versione, lingue, config di sito) vive qui ed è versionabile dal figlio.
    editFile(
        join(ROOT, 'global-settings.json'),
        // Primo "name" del file = project.name.
        src => src.replace(/("name"\s*:\s*)"[^"]*"/, `$1${JSON.stringify(displayName)}`)
    );

    // ── 2. global-settings.local.json: pubblicazione + API key generata (gitignored) ──
    // Porte, dominio, CORS e le chiavi vivono SOLO qui, fuori dal repo.
    // SecretKey resta VUOTA: il login è spento finché non la si valorizza (≥32 char) —
    // attivarlo deve essere una scelta esplicita, non un effetto collaterale del setup.
    const localPath = join(ROOT, 'global-settings.local.json');
    if (existsSync(localPath)) {
        console.log('  =  global-settings.local.json già presente — non sovrascritto');
    } else {
        const local = {
            $schema: './global-settings.schema.json',
            frontend: { hostname: '', port: 3000 },
            backend: { public: false, publicPort: null },
            Security: {
                ApiKeys: [randomBytes(32).toString('base64')],
                CorsOrigins: [],
                BehindProxy: false,
                Token: { SecretKey: '' },
            },
        };
        writeFileSync(localPath, JSON.stringify(local, null, 2) + '\n', 'utf-8');
        console.log('  ✓  creato global-settings.local.json (porte/deploy + API key generata; login spento: SecretKey vuota)');
    }

    // ── 3. Nomi npm "app" → slug del prodotto ────────────────────────────
    // Identificatori npm/SW generici: rinominati così non resta "app" in giro.
    // Non tocco i path di build interni (dist/app, DIST_PATH): non sono il nome del prodotto.
    editFile(
        join(ROOT, 'frontend/package.json'),
        src => src.replace(/("name"\s*:\s*)"app"/, `$1"${slugName}"`)
    );
    editFile(
        join(ROOT, 'frontend/ngsw-config.json'),
        src => src.replace(/("name"\s*:\s*)"app"/, `$1"${slugName}"`)
    );

    // ── 4. Rinomina App.sln ──────────────────────────────────────────────
    const slnOld = join(ROOT, 'App.sln');
    const slnNew = join(ROOT, `${pascalName}.sln`);

    if (!existsSync(slnOld) && existsSync(slnNew)) {
        console.log(`  =  .sln già rinominato: ${pascalName}.sln`);
    } else if (!existsSync(slnOld)) {
        console.warn(`  ⚠  non trovato: App.sln`);
    } else if (existsSync(slnNew)) {
        console.warn(`  ⚠  esiste già ${pascalName}.sln — App.sln non rinominato`);
    } else {
        renameSync(slnOld, slnNew);
        console.log(`  ✓  rinominato: App.sln → ${pascalName}.sln`);
    }

    // ── 5. Cerimonia "da template a progetto" (DISTRUTTIVA, su conferma) ──
    console.log('\n──────────────────────────────────────────');
    console.log(' Cerimonia: da TEMPLATE a PROGETTO');
    console.log('──────────────────────────────────────────');
    console.log(' Rimuove la demo (Social + galleria social + home svuotata + addon + backend minimo,');
    console.log(' identity.json azzerato),');
    console.log(' elimina il README vetrina, esegue i controlli, AUTO-CANCELLA setup.mjs');
    console.log(` e fa un commit locale "init ${displayName}".`);
    const answer = (await ask('\n  Procedo? [s/N]: ')).toLowerCase();

    if (answer !== 's' && answer !== 'si' && answer !== 'sì') {
        console.log('\n  Cerimonia saltata: resta il template completo (demo inclusa).');
        console.log('  Puoi rilanciare `node setup.mjs` quando sei pronto.\n');
        return;
    }

    ejectDemo();

    // README vetrina: il template stesso dice "nel figlio si elimina solo questo README".
    rmSync(join(ROOT, 'README.md'), { force: true });
    console.log('  ✓  rimosso: README.md (vetrina del template)');

    // Gate: i controlli devono passare prima del commit.
    console.log('\n  Controlli pre-commit...');
    if (!runChecks()) {
        console.error('\n  ✗  Controlli falliti: NIENTE commit. Correggi gli errori e committa a mano.');
        process.exit(1);
    }

    // ── Commit "init" + auto-rimozione dello script ─────────────────────
    // Lo script esce dal versionamento con `git rm --cached`: entra UNA sola volta
    // nel commit di init (come rimozione) e il file fisico si cancella DOPO il commit.
    // Cancellare lo script mentre gira è sicuro: Node lo ha già letto in memoria.
    // (Il commit mostrerà comunque la rimozione di setup.mjs: il figlio conserva la
    //  storia del template per i merge, quindi non si può nascondere del tutto.)
    const selfPath = fileURLToPath(import.meta.url);
    try {
        execSync('git add -A', { cwd: ROOT, stdio: 'inherit' });
        try {
            execSync('git rm --cached --quiet -- setup.mjs', { cwd: ROOT, stdio: 'ignore' });
        } catch { /* già non tracciato: ok */ }
        execSync(`git commit -m ${JSON.stringify(`init ${displayName}`)}`, { cwd: ROOT, stdio: 'inherit' });
        rmSync(selfPath, { force: true });
        console.log(`\n  ✅  Progetto inizializzato — commit "init ${displayName}" creato, setup.mjs rimosso. Buon lavoro!\n`);
    } catch {
        console.warn('\n  ⚠  Commit non riuscito (git assente o niente da committare): setup.mjs lasciato sul posto, committa a mano.\n');
    }
}

main().catch(err => {
    console.error('\nErrore durante il setup:', err.message);
    process.exit(1);
});
