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
import { ContestoSito } from '../../../site';
import { ThemeService } from '../services/theme.service';
import { SitemapEntry, SitePage, isParentPage, isExternalPage } from '../siteBuilder';

const ROOT = join(__dirname, '../../../../../');

// Legge la configurazione locale da br1engine.json — unica sorgente di verità
const _br1 = JSON.parse(readFileSync(join(ROOT, '../br1engine.json'), 'utf-8')) as Record<string, unknown>;
const _loc = (_br1['Localization'] as Record<string, unknown>) ?? {};

const _normLang = (tag: unknown): string | null => {
    if (typeof tag !== 'string' || !tag.trim()) return null;
    try { return new Intl.Locale(tag.trim()).language ?? null; } catch { return null; }
};

const BR1_DEFAULT_LANG    = _normLang(_loc['DefaultLanguage']) ?? 'it';
const BR1_AVAILABLE_LANGS = ((_loc['SupportedLanguages'] as string[] | undefined) ?? [BR1_DEFAULT_LANG])
    .map(_normLang)
    .filter((l): l is string => l !== null)
    .filter((v, i, a) => a.indexOf(v) === i); // deduplication

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
    const lang = escapeHtml(BR1_DEFAULT_LANG);
    // 'default' è sicuro per qualsiasi tema: apple-mobile-web-app-status-bar-style
    // non supporta media queries e non può adattarsi all'OS preference a runtime.
    const iosStatusBar = 'default';

    let html = readFileSync(INDEX, 'utf8');

    // Regex flessibile: matcha <html> con qualsiasi combinazione di attributi, riscrive solo lang.
    html = replaceTag(html, /<html\b[^>]*>/, `<html lang="${lang}">`, '<html lang>');
    html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${appName}</title>`, '<title>');

    const defaultImageUrl = `${BASE_URL}/icons/icon-512x512.png`;
    const updatedTime = getLastCommitDate();

    // <meta name="theme-color"> è omesso: viene iniettato dinamicamente per-request
    // da ThemeService.buildThemeColorMeta() nel middleware SSR di server.ts,
    // con varianti light/dark via media attribute.
    const allMeta: ['name' | 'property', string, string][] = [
        ['name', 'app-version', ContestoSito.config.version],
        ['property', 'og:updated_time', updatedTime],
        ['name', 'description', description],
        ['name', 'apple-mobile-web-app-title', appName],
        ['name', 'apple-mobile-web-app-status-bar-style', iosStatusBar],
        ['name', 'application-name', appName],
        ['name', 'twitter:title', appName],
        ['name', 'twitter:description', description],
        ['name', 'twitter:image', defaultImageUrl],
        ['property', 'og:title', appName],
        ['property', 'og:description', description],
        ['property', 'og:site_name', appName],
        ['property', 'og:locale', lang],
        // Letto da app.config.ts come fallback quando TransferState è assente.
        // escapeHtml necessario: JSON contiene virgolette che romperebbero content="..."
        ['name', 'br1-locale', escapeHtml(JSON.stringify({ defaultLang: BR1_DEFAULT_LANG, availableLanguages: BR1_AVAILABLE_LANGS }))],
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
    const palette = ThemeService.computePalette(ContestoSito.config.colorTema);

    manifest['name'] = ContestoSito.config.appName;
    manifest['short_name'] = ContestoSito.config.appName;
    manifest['description'] = ContestoSito.config.description;
    manifest['lang'] = BR1_DEFAULT_LANG;
    // theme_color: colore WCAG-safe del brand per il chrome del browser nella schermata Home
    manifest['theme_color'] = palette.colorPrimary;
    // background_color: sfondo splash screen — usa colorBase del tone naturale
    // per una transizione fluida dallo splash all'app
    manifest['background_color'] = palette.naturalTone === 'light' ? palette.colorBaseLt : palette.colorBaseDk;
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
