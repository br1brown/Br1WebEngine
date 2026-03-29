/**
 * Genera sitemap.xml dal modello centrale del sito.
 *
 * Eseguire con:  npx tsx scripts/generate-sitemap.ts
 * Oppure:        npm run generate:sitemap
 *
 * Variabile d'ambiente:
 *   SITEMAP_BASE_URL — URL base del sito (default: https://example.com con warning)
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { ContestoSito } from '../src/app/site';

const BASE_URL = process.env['SITEMAP_BASE_URL'] || 'https://example.com';
const OUT_DIR = join(__dirname, '..', 'public');

function buildSitemapXml(paths: string[]): string {
    const lastmod = new Date().toISOString().split('T')[0];
    const urls = paths
        .map(p => `  <url>\n    <loc>${BASE_URL}${p}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function main(): void {
    const paths = ContestoSito.getSitemapPaths();

    if (paths.length === 0) {
        console.warn('[sitemap] Nessuna pagina per sitemap trovata.');
        return;
    }

    console.log(`[sitemap] Pagine: ${paths.join(', ')}`);

    const xml = buildSitemapXml(paths);
    const dest = join(OUT_DIR, 'sitemap.xml');
    writeFileSync(dest, xml, 'utf8');
    console.log(`[sitemap] Generata: ${dest}`);

    if (BASE_URL === 'https://example.com') {
        console.warn('[sitemap] ATTENZIONE: SITEMAP_BASE_URL non configurato. ' +
            'Impostare SITEMAP_BASE_URL=https://tuodominio.it prima del build di produzione.');
    }
}

main();
