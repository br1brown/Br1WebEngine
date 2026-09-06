#!/usr/bin/env node
'use strict';

// Unisce le pagine SSR statiche da /health (incluse le policy noindex) alle URL
// concrete di /sitemap.xml, che include le pagine dynamicParams enumerate dal backend.
// Uso: node discover-audit-paths.cjs BASE_URL MAX_DYNAMIC

const http = require('http');
const https = require('https');

const [baseUrlArg, maxDynamicArg] = process.argv.slice(2);
if (!baseUrlArg) {
    console.error('Uso: discover-audit-paths.cjs BASE_URL MAX_DYNAMIC');
    process.exit(2);
}

let baseUrl;
try {
    baseUrl = new URL(baseUrlArg);
} catch {
    console.error(`[audit-paths] BASE_URL non valido: "${baseUrlArg}" (serve URL assoluto, es. http://localhost:3000)`);
    process.exit(2);
}
const maxDynamic = Math.max(0, Number(maxDynamicArg) || 0);
const client = baseUrl.protocol === 'https:' ? https : http;

function get(path) {
    return new Promise((resolve, reject) => {
        const request = client.get(new URL(path, baseUrl), response => {
            let raw = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { raw += chunk; });
            response.on('end', () => {
                if ((response.statusCode ?? 500) >= 400) return reject(new Error(`${path} -> HTTP ${response.statusCode}`));
                resolve(raw);
            });
        });
        request.setTimeout(30_000, () => request.destroy(new Error(`${path} -> timeout`)));
        request.on('error', reject);
    });
}

function decodeXml(value) {
    return value
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'");
}

function sitemapPaths(xml) {
    const paths = [];
    for (const match of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)) {
        const url = new URL(decodeXml(match[1]));
        // Ignora url.origin: in test locali la sitemap potrebbe avere URL di produzione (FRONTEND_BASE_URL)
        paths.push(`${url.pathname}${url.search}`);
    }
    return paths;
}

// Distribuisce il campione nell'ordine stabile della sitemap: con contenuti multilingua
// non finisce per controllare soltanto la prima lingua o soltanto i primi record.
function sampleEvenly(paths, limit) {
    if (limit === 0 || paths.length <= limit) return paths;
    return Array.from({ length: limit }, (_, index) => paths[Math.floor(index * paths.length / limit)]);
}

(async () => {
    const [healthRaw, xml] = await Promise.all([get('/health'), get('/sitemap.xml')]);
    const health = JSON.parse(healthRaw);
    if (!Array.isArray(health.a11yPaths)) throw new Error('/health non contiene a11yPaths');

    const staticPaths = health.a11yPaths;
    const staticSet = new Set(staticPaths);
    const dynamicPaths = sitemapPaths(xml).filter(path => !staticSet.has(path));
    const selectedDynamic = sampleEvenly(dynamicPaths, maxDynamic);
    const paths = [...new Set([...staticPaths, ...selectedDynamic])];

    console.error(`[audit-paths] statiche/SSR: ${staticPaths.length}; dinamiche sitemap: ${dynamicPaths.length}; dinamiche selezionate: ${selectedDynamic.length}; totale: ${paths.length}`);
    paths.forEach(path => console.log(path));
})().catch(error => {
    console.error(`[audit-paths] ${error.message}`);
    process.exit(1);
});
