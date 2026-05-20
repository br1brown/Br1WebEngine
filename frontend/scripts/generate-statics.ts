/**
 * Sincronizza i file statici con la configurazione centrale del sito.
 *
 * Aggiorna:
 * - src/index.html           → lang, title, theme-color, meta PWA
 * - public/manifest.webmanifest → nome, descrizione, colori
 * - public/sitemap.xml       → tutte le pagine indicizzabili
 * - public/robots.txt        → user-agent, disallow, sitemap URL
 *
 * Eseguire con:
 *   npm run generate:statics
 *
 * Variabile d'ambiente:
 *   FRONTEND_BASE_URL — URL base del sito (default: https://example.com con warning)
 *
 * Esclusioni sitemap e robots automatiche (gestite dal siteBuilder):
 *   - Pagine disabilitate (enabled: false)
 *   - Pagine esterne (externalUrl)
 *   - Pagine protette da autenticazione (requiresAuth: true)
 */

// Necessario: carica il JIT compiler di Angular così i decoratori @Injectable
// funzionano quando Node.js importa site.ts e il suo grafo di dipendenze.
import '@angular/compiler';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { ContestoSito } from '../src/app/site';
import { SitemapEntry, SitePage, isParentPage, isExternalPage } from '../src/app/siteBuilder';

const ROOT = join(__dirname, '..');
const INDEX = join(ROOT, 'src', 'index.html');
const MANIFEST = join(ROOT, 'public', 'manifest.webmanifest');
const SITEMAP = join(ROOT, 'public', 'sitemap.xml');
const ROBOTS = join(ROOT, 'public', 'robots.txt');

// Rimuove lo slash finale per evitare doppi slash negli URL generati
const BASE_URL = (process.env['FRONTEND_BASE_URL'] || 'https://example.com').replace(/\/$/, '');

/**
 * Data (YYYY-MM-DD) dell'ultimo commit, usata come `og:updated_time` globale.
 * Granularità giornaliera per evitare diff a ogni commit nello stesso giorno:
 * il valore cambia solo quando cambia la giornata, non a ogni build.
 * Fallback alla data odierna se git non è disponibile (es. build da tarball).
 */
function getLastCommitDate(): string {
    try {
        return execSync('git log -1 --format=%cs', { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {
        return new Date().toISOString().slice(0, 10);
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceMeta(
    html: string,
    attr: 'name' | 'property',
    key: string,
    content: string
): string {
    const escapedKey = escapeRegex(key);
    // Tolera qualsiasi ordine degli attributi nel tag meta
    const pattern = new RegExp(`<meta\\s[^>]*${attr}="${escapedKey}"[^>]*>`, 'i');
    const replacement = `<meta ${attr}="${key}" content="${content}">`;

    if (!pattern.test(html)) {
        throw new Error(`[statics] Impossibile trovare meta[${attr}="${key}"] in index.html.`);
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
    const appName = escapeHtml(ContestoSito.config.appName);
    const description = escapeHtml(ContestoSito.config.description);
    const lang = escapeHtml(ContestoSito.config.defaultLang);
    const themeColor = escapeHtml(ContestoSito.config.colorTema);

    let html = readFileSync(INDEX, 'utf8');

    html = replaceTag(html, /<html\s+lang="[^"]*">/, `<html lang="${lang}">`, '<html lang>');
    html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${appName}</title>`, '<title>');

    const defaultImageUrl = `${BASE_URL}/icons/icon-512x512.png`;
    const updatedTime = getLastCommitDate();

    const allMeta: ['name' | 'property', string, string][] = [
        ['name', 'app-version', ContestoSito.config.version],
        ['property', 'og:updated_time', updatedTime],
        ['name', 'description', description],
        ['name', 'apple-mobile-web-app-title', appName],
        ['name', 'apple-mobile-web-app-status-bar-style', 'default'],
        ['name', 'application-name', appName],
        ['name', 'theme-color', themeColor],
        ['name', 'twitter:title', appName],
        ['name', 'twitter:description', description],
        ['name', 'twitter:image', defaultImageUrl],
        ['property', 'og:title', appName],
        ['property', 'og:description', description],
        ['property', 'og:site_name', appName],
        ['property', 'og:locale', lang],
        ['property', 'og:url', BASE_URL],
        ['property', 'og:image', defaultImageUrl],
    ];

    for (const [attr, key, value] of allMeta) {
        html = replaceMeta(html, attr, key, value);
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

    manifest['name'] = ContestoSito.config.appName;
    manifest['short_name'] = ContestoSito.config.appName;
    manifest['description'] = ContestoSito.config.description;
    manifest['lang'] = ContestoSito.config.defaultLang;
    manifest['theme_color'] = ContestoSito.config.colorTema;
    manifest['background_color'] = ContestoSito.config.colorTema;
    manifest['version'] = ContestoSito.config.version;

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
        console.warn('[statics] ATTENZIONE: FRONTEND_BASE_URL non configurato. ' +
            'Impostare FRONTEND_BASE_URL=https://tuodominio.it prima del build di produzione.');
    }
}

// ── Generazione robots.txt ────────────────────────────────────────────────

function collectProtectedPaths(pages: SitePage[], parentPath = ''): string[] {
    return pages.flatMap(page => {
        if (!page.enabled) return [];
        if (isExternalPage(page)) return [];

        const fullPath = `/${[parentPath, page.path].filter(Boolean).join('/')}`.replace(/\/+/g, '/');

        if (isParentPage(page)) {
            return collectProtectedPaths(page.children, fullPath);
        }

        return page.requiresAuth ? [fullPath] : [];
    });
}

function updateRobots(): void {
    const protectedPaths = collectProtectedPaths(ContestoSito.pages);

    const lines = ['User-agent: *', 'Allow: /'];
    for (const path of protectedPaths) {
        lines.push(`Disallow: ${path}`);
    }
    lines.push('', `Sitemap: ${BASE_URL}/sitemap.xml`);

    writeFileSync(ROBOTS, lines.join('\n') + '\n', 'utf8');
    console.log(`[statics] robots.txt aggiornato`);
}

// ── Entry point ───────────────────────────────────────────────────────────

function main(): void {
    updateIndexHtml();
    updateManifest();
    updateSitemap();
    updateRobots();
}

main();
