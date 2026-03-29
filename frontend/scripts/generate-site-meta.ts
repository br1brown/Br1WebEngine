/**
 * Sincronizza i metadata globali del sito nei file statici.
 *
 * Aggiorna:
 * - src/index.html
 * - public/manifest.webmanifest
 *
 * Eseguire con:
 *   npm run generate:site-meta
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ContestoSito } from '../src/app/site';

const INDEX_PATH = join(__dirname, '..', 'src', 'index.html');
const MANIFEST_PATH = join(__dirname, '..', 'public', 'manifest.webmanifest');

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function replaceOrThrow(source: string, pattern: RegExp, replacement: string, label: string): string {
    if (!pattern.test(source)) {
        throw new Error(`[site-meta] Impossibile trovare ${label}.`);
    }

    return source.replace(pattern, replacement);
}

function updateIndexHtml(): void {
    const appName = escapeHtml(ContestoSito.config.appName);
    const description = escapeHtml(ContestoSito.config.description);
    const lang = escapeHtml(ContestoSito.config.defaultLang);
    const themeColor = escapeHtml(ContestoSito.config.colorTema);

    let html = readFileSync(INDEX_PATH, 'utf8');

    html = replaceOrThrow(
        html,
        /<html lang="[^"]*">/,
        `<html lang="${lang}">`,
        '<html lang>'
    );
    html = replaceOrThrow(
        html,
        /<title>[^<]*<\/title>/,
        `<title>${appName}</title>`,
        '<title>'
    );
    html = replaceOrThrow(
        html,
        /<meta name="description" content="[^"]*">/,
        `<meta name="description" content="${description}">`,
        'meta[name="description"]'
    );
    html = replaceOrThrow(
        html,
        /<meta property="og:title" content="[^"]*">/,
        `<meta property="og:title" content="${appName}">`,
        'meta[property="og:title"]'
    );
    html = replaceOrThrow(
        html,
        /<meta property="og:description" content="[^"]*">/,
        `<meta property="og:description" content="${description}">`,
        'meta[property="og:description"]'
    );
    html = replaceOrThrow(
        html,
        /<meta property="og:site_name" content="[^"]*">/,
        `<meta property="og:site_name" content="${appName}">`,
        'meta[property="og:site_name"]'
    );
    html = replaceOrThrow(
        html,
        /<meta property="og:locale" content="[^"]*">/,
        `<meta property="og:locale" content="${lang}">`,
        'meta[property="og:locale"]'
    );
    html = replaceOrThrow(
        html,
        /<meta name="twitter:title" content="[^"]*">/,
        `<meta name="twitter:title" content="${appName}">`,
        'meta[name="twitter:title"]'
    );
    html = replaceOrThrow(
        html,
        /<meta name="twitter:description" content="[^"]*">/,
        `<meta name="twitter:description" content="${description}">`,
        'meta[name="twitter:description"]'
    );
    html = replaceOrThrow(
        html,
        /<meta name="apple-mobile-web-app-title" content="[^"]*">/,
        `<meta name="apple-mobile-web-app-title" content="${appName}">`,
        'meta[name="apple-mobile-web-app-title"]'
    );
    html = replaceOrThrow(
        html,
        /<meta name="apple-mobile-web-app-status-bar-style" content="[^"]*">/,
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
        'meta[name="apple-mobile-web-app-status-bar-style"]'
    );
    html = replaceOrThrow(
        html,
        /<meta name="application-name" content="[^"]*">/,
        `<meta name="application-name" content="${appName}">`,
        'meta[name="application-name"]'
    );
    html = replaceOrThrow(
        html,
        /<meta name="theme-color" content="[^"]*">/,
        `<meta name="theme-color" content="${themeColor}">`,
        'meta[name="theme-color"]'
    );
    html = replaceOrThrow(
        html,
        /<!-- Meta Open Graph[\s\S]*?-->/,
        '<!-- Meta Open Graph di base, sincronizzati da scripts/generate-site-meta.ts -->',
        'commento Open Graph'
    );
    html = replaceOrThrow(
        html,
        /<!-- Meta Twitter[\s\S]*?-->/,
        '<!-- Meta Twitter di base, sincronizzati da scripts/generate-site-meta.ts -->',
        'commento Twitter'
    );

    writeFileSync(INDEX_PATH, html, 'utf8');
    console.log(`[site-meta] Aggiornato: ${INDEX_PATH}`);
}

function updateManifest(): void {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, unknown>;

    manifest['name'] = ContestoSito.config.appName;
    manifest['short_name'] = ContestoSito.config.appName;
    manifest['description'] = ContestoSito.config.description;
    manifest['lang'] = ContestoSito.config.defaultLang;
    manifest['theme_color'] = ContestoSito.config.colorTema;
    manifest['background_color'] = ContestoSito.config.colorTema;

    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 4)}\n`, 'utf8');
    console.log(`[site-meta] Aggiornato: ${MANIFEST_PATH}`);
}

function main(): void {
    updateIndexHtml();
    updateManifest();
}

main();
