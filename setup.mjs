#!/usr/bin/env node
/**
 * setup.mjs — Inizializza un nuovo progetto a partire dal template Br1WebEngine.
 *
 * Uso:
 *   node setup.mjs "Nome Progetto"
 *   node setup.mjs          ← chiede il nome in modo interattivo
 *
 * Cosa fa:
 *   1. Aggiorna appName in frontend/src/app/site.ts
 *   2. Aggiorna COMPOSE_PROJECT_NAME in .env.param
 *   3. Rinomina App.sln → NomeProgetto.sln
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
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
        console.log(`  =  già aggiornato: ${filePath}`);
        return false;
    }
    writeFileSync(filePath, after, 'utf-8');
    console.log(`  ✓  aggiornato: ${filePath}`);
    return true;
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

    // ── 1. appName in site.ts ────────────────────────────────────────────
    editFile(
        join(ROOT, 'frontend/src/app/site.ts'),
        src => src.replace(
            /(appName\s*:\s*)('[^']*'|"[^"]*")/,
            `$1${JSON.stringify(displayName)}`
        )
    );

    // ── 2. project.name in br1engine.json ───────────────────────────────
    editFile(
        join(ROOT, 'br1engine.json'),
        src => {
            const cfg = JSON.parse(src);
            cfg.project = { ...cfg.project, name: displayName };
            return JSON.stringify(cfg, null, 2) + '\n';
        }
    );

    // ── 3. Rinomina App.sln ──────────────────────────────────────────────
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

    // ── Promemoria per il resto ──────────────────────────────────────────
    console.log(`
──────────────────────────────────────────
 ✅  Completato!

 Prossimi passi consigliati in site.ts:
   • version      → imposta la versione iniziale del tuo progetto
   • description  → scrivi la descrizione del tuo progetto
   • colorTema    → imposta il colore principale del brand

 Prossimi passi in br1engine.json:
   • frontend.hostname    → dominio del sito (es. miodominio.it)
   • frontend.port        → porta esposta dal container
   • Security.ApiKeys[0]  → chiave API condivisa (minimo 32 char in prod)
   • Security.CorsOrigins → ["https://tuodominio.it"] se usi un hostname
   • Security.BehindProxy → true se stai dietro un reverse proxy
──────────────────────────────────────────
`);
}

main().catch(err => {
    console.error('\nErrore durante il setup:', err.message);
    process.exit(1);
});
