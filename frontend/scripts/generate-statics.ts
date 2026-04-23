/**
 * Sincronizza i file statici con la configurazione centrale del sito.
 *
 * Aggiorna:
 * - src/index.html        → lang, title, theme-color, meta PWA
 * - public/manifest.webmanifest → nome, descrizione, colori
 * - public/sitemap.xml    → tutte le pagine indicizzabili
 *
 * Eseguire con:
 *   npm run generate:statics
 *
 * Variabile d'ambiente:
 *   SITEMAP_BASE_URL — URL base del sito (default: https://example.com con warning)
 *
 * Esclusioni sitemap automatiche (gestite dal siteBuilder):
 *   - Pagine disabilitate (enabled: false)
 *   - Pagine esterne (externalUrl)
 *   - Pagine protette da autenticazione (requiresAuth: true)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ContestoSito } from '../src/app/site';
import { SitemapEntry } from '../src/app/siteBuilder';

const ROOT     = join(__dirname, '..');
const INDEX    = join(ROOT, 'src', 'index.html');
const MANIFEST = join(ROOT, 'public', 'manifest.webmanifest');
const SITEMAP  = join(ROOT, 'public', 'sitemap.xml');
const BASE_URL = process.env['SITEMAP_BASE_URL'] || 'https://example.com';

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function replaceMeta(
    html: string,
    attr: 'name' | 'property',
    key: string,
    content: string
): string {
    const selector = `${attr}="${key}"`;
    const pattern = new RegExp(`<meta ${selector} content="[^"]*">`);
    const replacement = `<meta ${selector} content="${content}">`;

    if (!pattern.test(html)) {
        throw new Error(`[statics] Impossibile trovare meta[${selector}] in index.html.`);
    }

    return html.replace(pattern, replacement);
}

function replaceTag(html: string, pattern: RegExp, replacement: string, label: string): string {
    if (!pattern.test(html)) {
        throw new Error(`[statics] Impossibile trovare ${label} in index.html.`);
    }

    return html.replace(pattern, replacement);
}

// ── Calcolo priority e changefreq per sitemap ─────────────────────────────

function getPriority(path: string): string {
    const depth = path === '/' ? 0 : path.split('/').filter(Boolean).length;
    return Math.max(0.3, 1.0 - depth * 0.2).toFixed(1);
}

function getChangefreq(path: string): string {
    const depth = path === '/' ? 0 : path.split('/').filter(Boolean).length;
    if (depth === 0) return 'weekly';
    if (depth === 1) return 'monthly';
    return 'yearly';
}

// ── Aggiornamento index.html ──────────────────────────────────────────────

function updateIndexHtml(): void {
    const appName     = escapeHtml(ContestoSito.config.appName);
    const description = escapeHtml(ContestoSito.config.description);
    const lang        = escapeHtml(ContestoSito.config.defaultLang);
    const themeColor  = escapeHtml(ContestoSito.config.colorTema);

    let html = readFileSync(INDEX, 'utf8');

    html = replaceTag(html, /<html lang="[^"]*">/, `<html lang="${lang}">`, '<html lang>');
    html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${appName}</title>`, '<title>');

    const defaultImageUrl = `${BASE_URL}/icons/icon-512x512.png?v=${ContestoSito.config.version}`;

    const nameMeta: [string, string][] = [
        ['app-version',                  ContestoSito.config.version],
        ['description',                  description],
        ['apple-mobile-web-app-title',   appName],
        ['apple-mobile-web-app-status-bar-style', 'default'],
        ['application-name',             appName],
        ['theme-color',                  themeColor],
        ['twitter:title',                appName],
        ['twitter:description',          description],
        ['twitter:image',                defaultImageUrl],
    ];

    const propertyMeta: [string, string][] = [
        ['og:title',       appName],
        ['og:description', description],
        ['og:site_name',   appName],
        ['og:locale',      lang],
        ['og:url',         BASE_URL],
        ['og:image',       defaultImageUrl],
    ];

    for (const [key, value] of nameMeta) {
        html = replaceMeta(html, 'name', key, value);
    }

    for (const [key, value] of propertyMeta) {
        html = replaceMeta(html, 'property', key, value);
    }

    html = replaceTag(
        html,
        /<!-- Meta Open Graph[\s\S]*?-->/,
        '<!-- Meta Open Graph di base, sincronizzati da scripts/generate-statics.ts -->',
        'commento Open Graph'
    );
    html = replaceTag(
        html,
        /<!-- Meta Twitter[\s\S]*?-->/,
        '<!-- Meta Twitter di base, sincronizzati da scripts/generate-statics.ts -->',
        'commento Twitter'
    );

    html = replaceTag(
        html,
        /<link rel="icon" type="image\/png" href="[^"]*">/,
        '<link rel="icon" type="image/png" href="icons/icon-192x192.png">',
        '<link rel="icon">'
    );

    writeFileSync(INDEX, html, 'utf8');
    console.log(`[statics] index.html aggiornato`);
}

// ── Aggiornamento manifest.webmanifest ────────────────────────────────────

function updateManifest(): void {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, unknown>;

    manifest['name']             = ContestoSito.config.appName;
    manifest['short_name']       = ContestoSito.config.appName;
    manifest['description']      = ContestoSito.config.description;
    manifest['lang']             = ContestoSito.config.defaultLang;
    manifest['theme_color']      = ContestoSito.config.colorTema;
    manifest['background_color'] = ContestoSito.config.colorTema;
    manifest['version']          = ContestoSito.config.version;

    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 4)}\n`, 'utf8');
    console.log(`[statics] manifest.webmanifest aggiornato`);
}

// ── Generazione sitemap.xml ───────────────────────────────────────────────

function buildSitemapXml(entries: SitemapEntry[]): string {
    const lastmod = new Date().toISOString().split('T')[0];
    const urls = entries
        .map(({ path }) => [
            '  <url>',
            `    <loc>${BASE_URL}${path}</loc>`,
            `    <lastmod>${lastmod}</lastmod>`,
            `    <changefreq>${getChangefreq(path)}</changefreq>`,
            `    <priority>${getPriority(path)}</priority>`,
            '  </url>',
        ].join('\n'))
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function updateSitemap(): void {
    const entries = ContestoSito.getSitemapEntries();

    if (entries.length === 0) {
        console.warn('[statics] Nessuna pagina per sitemap trovata.');
        return;
    }

    writeFileSync(SITEMAP, buildSitemapXml(entries), 'utf8');
    console.log(`[statics] sitemap.xml aggiornata (${entries.length} pagine)`);

    if (BASE_URL === 'https://example.com') {
        console.warn('[statics] ATTENZIONE: SITEMAP_BASE_URL non configurato. ' +
            'Impostare SITEMAP_BASE_URL=https://tuodominio.it prima del build di produzione.');
    }
}

// ── Entry point ───────────────────────────────────────────────────────────

function main(): void {
    updateIndexHtml();
    updateManifest();
    updateSitemap();
}

main();
