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
 *   2. Rinomina App.sln → NomeProgetto.sln
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

    const rawName = process.argv[2] || await ask('Nome del progetto (es. MercatinoApp): ');

    if (!rawName) {
        console.error('Errore: nome non fornito.');
        process.exit(1);
    }

    const displayName = rawName.trim();        // "Mercatino App"  → mostrato all'utente
    const pascalName  = toPascal(rawName);     // "MercatinoApp"   → per il file .sln

    console.log(`\n  Nome visualizzato : ${displayName}`);
    console.log(`  Nome file .sln    : ${pascalName}.sln`);
    console.log('');

    // ── 1. appName in site.ts ────────────────────────────────────────────
    editFile(
        join(ROOT, 'frontend/src/app/site.ts'),
        src => src.replace(
            /(appName\s*:\s*)('.*?'|".*?")/,
            `$1'${displayName}'`
        )
    );

    // ── 2. Rinomina App.sln ──────────────────────────────────────────────
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
   • version      → a '1.0.0' 
   • description  → scrivi la descrizione del tuo progetto
   • colorTema    → imposta il colore principale del brand
──────────────────────────────────────────
`);
}

main().catch(err => {
    console.error('\nErrore durante il setup:', err.message);
    process.exit(1);
});
