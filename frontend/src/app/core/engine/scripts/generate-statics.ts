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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { ContestoSito } from '../../../site';
import { ThemeService } from '../services/theme.service';
import { SitemapEntry, SitePage, isParentPage, isExternalPage } from '../siteBuilder';

const ROOT = join(__dirname, '../../../../../');

// Localization a build-time. Resta global-settings.json la sorgente di verità, ma
// la lettura è env-first per il build dell'immagine Docker: lì il build context è
// ./frontend e global-settings.json (nella root del repo) NON è nell'immagine, quindi
// un readFileSync diretto crasherebbe con ENOENT. deploy.sh deriva DEFAULT_LANG e
// SUPPORTED_LANGS dal file e li passa come build ARG (come già fa per FRONTEND_BASE_URL).
// Su host/CI gli env non ci sono e si legge il file (guardato), per campo.
function readFileLocalization(): Record<string, unknown> {
    const candidates = [
        process.env['GLOBAL_SETTINGS_PATH'],
        join(ROOT, '../global-settings.json'), // host/CI: root del repo
        join(ROOT, 'global-settings.json'),
    ].filter((p): p is string => Boolean(p));

    for (const p of candidates) {
        try {
            if (existsSync(p)) {
                const s = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
                return (s['Localization'] as Record<string, unknown>) ?? {};
            }
        } catch { /* file illeggibile: prova il prossimo candidato */ }
    }
    return {};
}

const _fileLoc = readFileLocalization();

const _normLang = (tag: unknown): string | null => {
    if (typeof tag !== 'string' || !tag.trim()) return null;
    try { return new Intl.Locale(tag.trim()).language ?? null; } catch { return null; }
};

// Precedenza per campo: env (Docker) → file (host/CI) → default.
// `||` e non `??`: un env var vuoto ("") non deve sovrascrivere il valore del file.
const _defaultRaw   = process.env['DEFAULT_LANG'] || _fileLoc['DefaultLanguage'];
const _supportedRaw = process.env['SUPPORTED_LANGS']
    ? process.env['SUPPORTED_LANGS']!.split(',')
    : (_fileLoc['SupportedLanguages'] as string[] | undefined);

const DEFAULT_LANG    = _normLang(_defaultRaw) ?? 'it';
const AVAILABLE_LANGS = (_supportedRaw ?? [DEFAULT_LANG])
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

function toOpenGraphLocale(lang: string): string {
    try {
        const locale = new Intl.Locale(lang).maximize();
        return locale.region ? `${locale.language}_${locale.region}` : locale.language;
    } catch {
        const [base] = lang.split('-');
        return `${base}_${base.toUpperCase()}`;
    }
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
    const lang = escapeHtml(DEFAULT_LANG);
    const ogLocale = escapeHtml(toOpenGraphLocale(DEFAULT_LANG));
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
        ['property', 'og:locale', ogLocale],
        ['property', 'og:url', BASE_URL],
        ['property', 'og:image', defaultImageUrl],
    ];

    // Genera file TS con la configurazione della lingua per il frontend (invece di esporre JSON nel meta tag)
    const generatedTsPath = join(ROOT, 'src', 'environments', 'environment.ts');
    const generatedTsContent = `// FILE GENERATO AUTOMATICAMENTE DA scripts/generate-statics.ts
// Non modificare manualmente. Sorgente di verità: global-settings.json

export interface AppEnvironment {
    defaultLang: string;
    availableLanguages: string[];
}

export const environment: AppEnvironment = {
    defaultLang: '${DEFAULT_LANG}',
    availableLanguages: ${JSON.stringify(AVAILABLE_LANGS)}
};
`;
    writeFileSync(generatedTsPath, generatedTsContent, 'utf8');
    console.log('[statics] src/environments/environment.ts aggiornato');

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
    const palette = ThemeService.computePalette(ContestoSito.config.colorTema);

    const manifest: Record<string, unknown> = {
        name: ContestoSito.config.appName,
        short_name: ContestoSito.config.appName,
        description: ContestoSito.config.description,
        lang: DEFAULT_LANG,
        theme_color: palette.colorPrimary,
        background_color: palette.naturalTone === 'light' ? palette.colorBaseLt : palette.colorBaseDk,
        display: "standalone",
        scope: "./",
        start_url: "./",
        icons: [
            {
                src: "icons/icon-192x192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any"
            },
            {
                src: "icons/icon-512x512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any maskable"
            }
        ],
        version: ContestoSito.config.version
    };

    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 4)}\n`, 'utf8');
    console.log(`[statics] manifest.webmanifest aggiornato`);
}

// ── Generazione sitemap.xml ───────────────────────────────────────────────

function buildSitemapXml(entries: SitemapEntry[]): string {
    // Google usa <lastmod> solo se e' accurato e verificabile: usare la data
    // dell'ultimo commit e' piu' affidabile della data di build, che cambierebbe
    // anche senza modifiche reali ai contenuti.
    const lastmod = getLastCommitDate();
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
    const publicDir = join(ROOT, 'public');
    if (!existsSync(publicDir)) {
        mkdirSync(publicDir, { recursive: true });
    }

    updateIndexHtml();
    updateManifest();
    updateSitemap();
    updateRobots();
}

main();
