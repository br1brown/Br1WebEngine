import express, { type Request, type Response } from 'express';
import compression from 'compression';
import { resolve, join, sep } from 'node:path';
import { Readable } from 'node:stream';
import { randomBytes, randomUUID } from 'node:crypto';
import { ContestoSito } from '../../../site';
import {
    AngularNodeAppEngine,
    createNodeRequestHandler,
    isMainModule,
} from '@angular/ssr/node';
import { serverEnv, assertRequiredEnv, getBr1Settings } from './server-env';
import { fingerprintIdentitySections } from '../scripts/config/config-fingerprint';
import { environment } from '../../../../environments/environment';
import { API_PREFIX } from '../asset-config';
import { browserDistFolder } from './server-paths';
import { pruneImageCache, CACHE_SWEEP_INTERVAL_MS } from './image-cache';
import { getImageCacheStats } from './image-cache-metrics';
import { loadAssetMapping } from './asset-mapping';
import { immutableAssetPattern } from './asset-handler';
import { htmlSecurityHeaders, defaultCsp, eventReplayScriptSrc } from './security-headers';
import { injectCspNonceIntoAppRoot } from './csp';
import { fileExists } from './fs-utils';
import { apiProxyHandler } from './routes/api-proxy';
import { cdnAssetHandler } from './routes/cdn-asset';
import { ogPreviewHandler } from './routes/og-preview';
import { dynamicSitemapHandler, revalidateSitemapHandler, dynamicAuditPathsHandler, dynamicLlmsTxtHandler } from './routes/dynamic-sitemap';
import { securityTxtHandler } from './routes/dynamic-security-txt';
import { customFontFilePath } from './custom-font-detect';
import { resolvedFonts } from '../../../../styles/font-config';
import { extname } from 'node:path';

/** Alias sulla sezione server senza requireEnv, valutata al caricamento del modulo */
const { server: nodeCfg, site } = serverEnv;
// serverEnv.backend (BACKEND_ORIGIN, BACKEND_API_KEY) è acceduto lazily
// dentro i middleware delle rotte, mai al caricamento del modulo.

// Verifica l'allineamento di environment.ts con global-settings.json
if (environment.configFingerprint !== fingerprintIdentitySections(getBr1Settings())) {
    console.warn(
        '[br1-engine] src/environments/environment.ts sembra disallineato da global-settings.json ' +
        '(project/Localization/site). Esegui `npm run generate:statics` (già incluso in ' +
        '`npm run dev`/`start`/`build`: capita solo lanciando `ng serve` direttamente).'
    );
}

/** Endpoint CDN CGI serviti da questo server. Specchio di CdnCgi in asset.service.ts. */
const CdnCgiPaths = {
    asset: '/cdn-cgi/asset',
    preview: '/cdn-cgi/preview',
} as const;

/** Formato consentito per X-Request-Id. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function resolveRequestId(incoming: string | string[] | undefined): string {
    const value = Array.isArray(incoming) ? incoming[0] : incoming;
    return value && REQUEST_ID_PATTERN.test(value) ? value : randomUUID();
}


const normalizePagePath = (path: string): string => {
    const normalized = `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '');
    return normalized || '/';
};

const knownPagePaths = new Set(
    ContestoSito.serverRenderEntries.map(entry => normalizePagePath(entry.path))
);

/** Path marcati con noindex (richiedono auth o esclusi da SEO). */
const noindexPagePaths = new Set(
    ContestoSito.serverRenderEntries
        .filter(entry => entry.requiresAuth || entry.noindex)
        .map(entry => normalizePagePath(entry.path))
);

/** Verifica la corrispondenza del path con un pattern a segmenti o parametri. */
function pathMatchesPattern(pattern: string, path: string): boolean {
    const patternSegments = pattern.split('/');
    const pathSegments = path.split('/');
    if (patternSegments.length !== pathSegments.length) return false;
    return patternSegments.every((seg, i) => seg.startsWith(':') || seg === pathSegments[i]);
}

function isKnownPagePath(path: string, patterns: Set<string>): boolean {
    for (const pattern of patterns) {
        if (pathMatchesPattern(pattern, path)) return true;
    }
    return false;
}

function getSeoStatusForPath(path: string): number | null {
    const normalized = normalizePagePath(path);
    const errorMatch = /^\/error\/(\d{3})$/.exec(normalized);
    if (errorMatch) {
        // Solo status HTTP di errore reali (4xx/5xx)
        const code = Number(errorMatch[1]);
        if (code >= 400 && code <= 599) return code;
    }
    if (normalized === '/error') return 500;
    return isKnownPagePath(normalized, knownPagePaths) ? null : 404;
}

/** Caricamento iniziale asincrono del mapping degli asset. */
loadAssetMapping().then((ok) => {
    if (!ok) {
        console.warn('[Server] assets/mapping.json non trovato all\'avvio (sarà ricaricato alla prima richiesta)');
    }
});

/** Inizializzazione applicazione Express */
const app = express();

/** Header proxy fidati per Angular SSR. */
const TRUSTED_PROXY_HEADERS = [
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-port',
    'x-forwarded-proto',
    'x-forwarded-prefix',
    'x-forwarded-scheme',
] as const;

/** Motore Angular SSR ufficiale: gestisce il rendering delle pagine lato server */
const angularApp = new AngularNodeAppEngine({
    allowedHosts: nodeCfg.allowedHosts,
    trustProxyHeaders: TRUSTED_PROXY_HEADERS,
});

/** Nasconde l'uso di Express per rendere più difficile il fingerprinting del server */
app.disable('x-powered-by');

/** Riconoscimento IP e host reali dietro reverse proxy. */
app.set('trust proxy', nodeCfg.trustProxy);

/** Correlazione delle richieste tramite X-Request-Id (riutilizzato o generato). */
app.use((request, response, next) => {
    const requestId = resolveRequestId(request.headers['x-request-id']);
    response.locals['requestId'] = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
});

/** Compressione gzip per risposte testuali con esclusione di Server-Sent Events. */
app.use(compression({
    filter: (request, response) => {
        const contentType = response.getHeader('Content-Type');
        if (typeof contentType === 'string' && contentType.includes('text/event-stream')) return false;
        return compression.filter(request, response);
    },
}));

/** Rotta Health: stato del server, percorsi di audit e metriche cache immagini. */
app.get('/health', (_request, response) => {
    response.json({
        status: 'ok',
        mode: 'ssr',
        auditPaths: ContestoSito.getAuditPaths(),
        imageCache: getImageCacheStats(),
    });
});

/** Rifiuta richieste pubbliche con host non autorizzato prima di raggiungere proxy o SSR */
app.use((request, response, next) => {
    // /health è sempre libero (usato da monitoraggio e preflight deploy).
    if (request.path === '/health') {
        next();
        return;
    }

    const requestHost = (request.hostname ?? '').trim().toLowerCase();
    const isAllowed = nodeCfg.allowedHosts.some((host) => host.toLowerCase() === requestHost);

    if (isAllowed) {
        next();
        return;
    }

    console.warn(`[debug-host-blocked] host="${requestHost}" not in allowedHosts=[${nodeCfg.allowedHosts.join(',')}]`);
    response.status(421).json({
        status: 421,
        title: 'Misdirected Request',
        detail: 'Host non autorizzato.'
    });
});

/** Proxy manuale: /api/* → backend, stripping il prefisso /api */
app.use(API_PREFIX, apiProxyHandler);

/** Middleware Security: inietta gli header di protezione in ogni risposta (non API) */
app.use((_request, response, next) => {
    for (const [name, value] of htmlSecurityHeaders) {
        response.setHeader(name, value);
    }
    next();
});

/** Endpoint CDN Asset: recupero e ottimizzazione delle immagini al volo */
app.get(CdnCgiPaths.asset, cdnAssetHandler);

/** Endpoint Social Preview: genera al volo l'immagine Open Graph / Twitter Card */
app.get(CdnCgiPaths.preview, ogPreviewHandler);

/** Endpoint sitemap.xml generato a runtime. */
app.get('/sitemap.xml', dynamicSitemapHandler);
app.get('/llms.txt', dynamicLlmsTxtHandler);

/** Invalidazione on-demand della cache sitemap da backend. */
app.post('/internal/revalidate-sitemap', revalidateSitemapHandler);

/** Path dinamici per audit live (Pa11y / Lighthouse). */
app.get('/internal/dynamic-audit-paths', dynamicAuditPathsHandler);

/** Sicurezza: nega l'accesso diretto alla cartella file per forzare l'uso della CDN via ID */
app.use('/assets/files', (_req, res) => { res.status(404).end(); });

/** Serve i file Markdown legali (no cache) con protezione da path traversal. */
app.use('/assets/legal', async (req, res, next) => {
    const legalDir = join(browserDistFolder, 'assets/legal');
    const resolved = resolve(join(legalDir, req.path));
    if (!resolved.startsWith(legalDir + sep)) {
        res.status(403).end();
        return;
    }
    if (await fileExists(resolved)) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(resolved);
        return;
    }
    next();
});

/** MIME per le estensioni font supportate da `custom-font-detect.ts`. */
const FONT_CONTENT_TYPE: Record<string, string> = {
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
};

/** Serve il font custom configurato. */
if (customFontFilePath && resolvedFonts.custom) {
    const filePath: string = customFontFilePath;
    const url = `/assets/fonts/${encodeURIComponent(resolvedFonts.custom.file)}`;
    app.get(url, (_req, res) => {
        res.set('Content-Type', FONT_CONTENT_TYPE[extname(filePath).toLowerCase()] ?? 'application/octet-stream');
        res.set('Cache-Control', 'public, max-age=3600');
        res.sendFile(filePath, err => { if (err) res.status(404).end(); });
    });
}

/** security.txt (RFC 9116) generato a runtime. */
app.get('/.well-known/security.txt', securityTxtHandler);

/** Risponde con 404 per manifest.webmanifest se la modalità PWA è disabilitata. */
if (!ContestoSito.config.isWebApp) {
    app.get('/manifest.webmanifest', (_req, res) => { res.status(404).end(); });
}

/** Blocca l'indicizzazione per ambienti con SEO_NOINDEX. */
if (site.noindex) {
    app.use((_req, res, next) => {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        next();
    });
    app.get('/robots.txt', (_req, res) => {
        res.type('text/plain').send('User-agent: *\nDisallow: /\n');
    });
}

/** Serve tutti i restanti file statici (JS, CSS, Immagini del template) */
app.use(
    express.static(browserDistFolder, {
        index: false,
        redirect: false,
        setHeaders(response, filePath) {
            const fileName = filePath.split(/[\\/]/).pop() ?? '';
            /** Applica cache eterna agli asset con hash nel nome (gestiti da Angular) */
            if (immutableAssetPattern.test(fileName)) {
                response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                return;
            }
            /** Forza i file del Service Worker a non essere mai cachati per permettere aggiornamenti app */
            if (fileName === 'ngsw-worker.js' || fileName === 'ngsw.json') {
                response.setHeader('Cache-Control', 'no-store');
                return;
            }
            /** Cache di un giorno per il file manifest della PWA */
            if (fileName === 'manifest.webmanifest') {
                response.setHeader('Cache-Control', 'public, max-age=86400');
                return;
            }
            /** Tutto il resto (traduzioni, icone standard) viene rivalidato a ogni richiesta */
            response.setHeader('Cache-Control', 'no-cache');
        }
    })
);

/** Rileva se il server è in modalità sviluppo o standalone. */
const isDevMode = !isMainModule(import.meta.url);

/** Catch-all: rendering delle pagine tramite Angular SSR in streaming. */
app.use(async (request: Request, response: Response, next) => {
    const nonce = isDevMode ? null : randomBytes(16).toString('base64url');

    try {
        const renderedResponse = await angularApp.handle(
            request,
            nonce ? { nonce } : undefined,
        );
        if (!renderedResponse) { next(); return; }

        const seoStatus = getSeoStatusForPath(request.path);
        response.status(seoStatus ?? renderedResponse.status);
        response.setHeader('Cache-Control', 'no-cache');

        // Header noindex per pagine protette o escluse da SEO
        if (isKnownPagePath(normalizePagePath(request.path), noindexPagePaths)) {
            response.setHeader('X-Robots-Tag', 'noindex, nofollow');
        }

        // Inoltra gli header Angular, escludendo quelli che gestiamo noi
        renderedResponse.headers.forEach((value, key) => {
            const lk = key.toLowerCase();
            if (lk === 'cache-control' || lk === 'content-security-policy' || lk === 'content-length') return;
            response.setHeader(key, value);
        });

        // Iniezione CSP con nonce (prod) o unsafe-inline (dev). Lo stesso nonce copre sia
        // script-src sia style-src-elem (compare due volte nella policy, vedi security-headers.json):
        // riuso legittimo, un nonce vale per l'intera risposta, non per singola direttiva.
        const scriptSrc = nonce ? `'nonce-${nonce}'${eventReplayScriptSrc}` : "'unsafe-inline'";
        const styleElemSrc = nonce ? `'nonce-${nonce}'` : "'unsafe-inline'";
        response.setHeader('Content-Security-Policy',
            defaultCsp.replace('{NONCE_PLACEHOLDER}', scriptSrc).replace('{NONCE_PLACEHOLDER}', styleElemSrc));

        if (renderedResponse.body) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stream = Readable.fromWeb(renderedResponse.body as any);
            // Gestione errori sullo stream per chiudere la risposta ed evitare crash
            stream.on('error', (err) => {
                console.error('[SSR stream]', `requestId=${response.locals['requestId']}`, err);
                response.destroy(err);
            });
            // Propaga il nonce anche al bootstrap che avviene per intero nel browser (vedi
            // injectCspNonceIntoAppRoot): senza, le rotte RenderMode.Client (jolly /error/**,
            // pagine requiresAuth) e ogni navigazione client-side successiva perderebbero gli
            // <style> di encapsulation, bloccati in silenzio da style-src-elem.
            if (nonce) {
                const nonceStream = injectCspNonceIntoAppRoot(nonce);
                // Stesso motivo dell'handler su `stream` sopra: senza, un errore qui (per quanto
                // improbabile, sono solo operazioni sincrone su Buffer) è un 'error' non ascoltato
                // su questo stream intermedio e fa crashare l'intero processo Node, non solo la
                // richiesta corrente.
                nonceStream.on('error', (err) => {
                    console.error('[SSR stream]', `requestId=${response.locals['requestId']}`, err);
                    response.destroy(err);
                });
                stream.pipe(nonceStream).pipe(response);
            } else {
                stream.pipe(response);
            }
        } else {
            response.end();
        }
    } catch (err) {
        next(err);
    }
});

/** Avvio del server se il file è eseguito come modulo principale (node server.mjs) */
if (isMainModule(import.meta.url)) {
    assertRequiredEnv();

    // Pulizia periodica della cache immagini
    pruneImageCache();
    setInterval(pruneImageCache, CACHE_SWEEP_INTERVAL_MS).unref();

    const server = app.listen(nodeCfg.port, () => {
        console.log(`[frontend] Node SSR server listening on http://localhost:${nodeCfg.port}`);
        console.log(`[frontend] Backend origin: ${serverEnv.backend.origin}`);
        console.log(`[frontend] Frontend base URL: ${site.baseUrl || '(not set)'}`);
        console.log(`[frontend] Allowed hosts: ${nodeCfg.allowedHosts.join(', ')}`);
    });

    /** Graceful shutdown su SIGTERM / SIGINT con timeout di sicurezza a 10s. */
    const shutdown = (signal: string): void => {
        console.log(`[frontend] ${signal} ricevuto: chiusura graceful in corso...`);
        server.close(() => {
            console.log('[frontend] Connessioni drenate, processo in uscita.');
            process.exit(0);
        });
        setTimeout(() => {
            console.warn('[frontend] Timeout shutdown: uscita forzata.');
            process.exit(1);
        }, 10_000).unref();
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
}

/** Esporta l'handler per l'integrazione nativa di Angular SSR (usato da main.server.ts) */
export const reqHandler = createNodeRequestHandler(app);
