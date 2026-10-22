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
import { serverEnv, assertRequiredEnv, getBr1Settings, computeLegalFacts } from './server-env';
import { fingerprintIdentitySections } from '../scripts/config/config-fingerprint';
import { readFeaturesLikeBackend } from '../scripts/config/features';
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
import { legalFactsHandler } from './routes/legal-facts';
import { securityTxtHandler } from './routes/dynamic-security-txt';
import { systemFontHandler } from './routes/system-font';

/** Alias sulla sezione server senza requireEnv, valutata al caricamento del modulo */
const { server: nodeCfg, site } = serverEnv;

/** Host canonico da FRONTEND_BASE_URL, per il redirect 301 www/alias→canonico sotto. Null se `site.baseUrl` è assente/malformato (dev locale: nessun redirect). `Hostname` (senza porta) per il confronto con `request.hostname`, `Host` (con porta) per costruire l'URL. */
const canonicalHostname: string | null = (() => {
    try {
        return new URL(site.baseUrl).hostname.toLowerCase() || null;
    } catch {
        return null;
    }
})();
const canonicalHost: string | null = (() => {
    try {
        return new URL(site.baseUrl).host.toLowerCase() || null;
    } catch {
        return null;
    }
})();
// serverEnv.backend (BACKEND_ORIGIN, BACKEND_API_KEY) è acceduto lazily
// dentro i middleware delle rotte, mai al caricamento del modulo.

// Verifica l'allineamento di environment.ts con global-settings.json
if (environment.configFingerprint !== fingerprintIdentitySections(getBr1Settings())) {
    console.warn(
        '[br1-engine] src/environments/environment.ts sembra disallineato da global-settings.json ' +
        '(project/Localization/site/Features). Esegui `npm run generate:statics` (già incluso in ' +
        '`npm run dev`/`start`/`build`: capita solo lanciando `ng serve` direttamente).'
    );
}

/** Endpoint CDN CGI serviti da questo server. Specchio di CdnCgi in asset.service.ts. */
const CdnCgiPaths = {
    asset: '/cdn-cgi/asset',
    preview: '/cdn-cgi/preview',
} as const;

/** Path del font self-hosted — SOLO server-side (generato da `systemFontFaceUrl()` in
 *  font-system.ts dentro l'HTML/CSS renderizzato, mai costruito da JS client): nessuno specchio
 *  in asset.service.ts, a differenza di `CdnCgiPaths`. */
const SYSTEM_FONT_PATH = '/cdn-cgi/font/:key/:index';

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
    // Pagina "sei offline / server non raggiungibile" (ErrorComponent, raggiunta dal browser): se la
    // chiede il server, l'unica risposta onesta è "adesso no, riprova" (503), non 404: la rotta esiste.
    if (normalized === '/error/offline') return 503;
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

/** Normalizzazione SEO: 301 su host alias→canonico (es. www durante una migrazione DNS) e su slash finale. `<link rel="canonical">` da solo non impedisce l'indicizzazione della variante: qui non viene proprio servita. `/health` escluso (probe di infrastruttura si aspettano 200 diretto). */
app.use((request, response, next) => {
    if (request.path === '/health' || (request.method !== 'GET' && request.method !== 'HEAD')) {
        next();
        return;
    }

    const requestHost = (request.hostname ?? '').trim().toLowerCase();
    const hostMismatch = canonicalHostname != null && requestHost !== '' && requestHost !== canonicalHostname;
    const hasTrailingSlash = request.path.length > 1 && request.path.endsWith('/');

    if (!hostMismatch && !hasTrailingSlash) {
        next();
        return;
    }

    // Open redirect: con un trust proxy permissivo l'Host grezzo può divergere da request.hostname
    // (validato da allowedHosts). Si riflette l'Host solo se il suo hostname coincide con quello validato.
    const rawHost = (request.get('host') ?? '').toLowerCase();
    const reflectsValidatedHost = rawHost === requestHost || rawHost.startsWith(requestHost + ':');
    const targetHost = hostMismatch
        ? canonicalHost
        : (canonicalHost ?? (reflectsValidatedHost ? rawHost : request.hostname));
    const targetPath = hasTrailingSlash ? request.path.replace(/\/+$/, '') || '/' : request.path;
    const queryIndex = request.url.indexOf('?');
    const queryString = queryIndex !== -1 ? request.url.slice(queryIndex) : '';
    response.redirect(301, `${request.protocol}://${targetHost}${targetPath}${queryString}`);
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

/** Endpoint font di sistema self-hosted: serve i file reali di SYSTEM_FONTS per il @font-face. */
app.get(SYSTEM_FONT_PATH, systemFontHandler);

/** Endpoint sitemap.xml generato a runtime. */
app.get('/sitemap.xml', dynamicSitemapHandler);
app.get('/llms.txt', dynamicLlmsTxtHandler);

/** Invalidazione on-demand della cache sitemap da backend. */
app.post('/internal/revalidate-sitemap', revalidateSitemapHandler);

/** Path dinamici per audit live (Pa11y / Lighthouse). */
app.get('/internal/dynamic-audit-paths', dynamicAuditPathsHandler);

/** Fatti per la Privacy Policy: scorta per il browser sulle pagine senza SSR (vedi routes/legal-facts.ts). */
app.get('/internal/legal-facts', legalFactsHandler);

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
        // 503 = "adesso no, riprova": Retry-After è l'indicazione che crawler e client si aspettano
        // con quello status (RFC 9110 §10.2.3); per gli altri codici d'errore non è definito.
        if (seoStatus === 503) response.setHeader('Retry-After', '60');
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
            // Propaga il nonce al bootstrap client (RenderMode.Client, requiresAuth, navigazioni
            // successive): senza, gli <style> di encapsulation restano bloccati da style-src-elem.
            if (nonce) {
                const nonceStream = injectCspNonceIntoAppRoot(nonce);
                // Come per `stream` sopra: un errore qui non ascoltato farebbe crashare l'intero processo Node.
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
    // Controlli di avvio: un errore qui chiude il processo con codice 1. Un throw nudo lo
    // intercetterebbe il gestore globale di @angular/ssr, che logga e lascia uscire con 0.
    try {
        assertRequiredEnv();
        // Features compilato (environment.ts) contro quello del file montato, letto come lo legge il
        // backend: se divergono (Features nel .local, chiave in minuscolo, "true" come stringa, build
        // vecchio) il backend farebbe cose che navbar e Privacy Policy non dicono. Meglio non partire.
        const runtimeFeatures = readFeaturesLikeBackend(getBr1Settings() as Record<string, unknown>);
        // Fatti dell'installazione per la Privacy Policy: un file indicato ma non valido ferma l'avvio; assente o vuoto = testo generico.
        if (serverEnv.hostingInfo === null) {
            console.warn('[frontend] frontend.hostingInfo non configurato: la Privacy Policy usa il testo generico sui dati di navigazione.');
        }
        // `Backup` di global-settings: un valore non valido ferma l'avvio.
        computeLegalFacts();
        if (JSON.stringify(runtimeFeatures) !== JSON.stringify(environment.features)) {
            throw new Error(
                '[br1-engine] Features del file montato non coincide con quello compilato nel frontend: ' +
                `compilato ${JSON.stringify(environment.features)}, montato ${JSON.stringify(runtimeFeatures)}. ` +
                'Features va solo in global-settings.json (non nel .local), poi va ricompilato il frontend.'
            );
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }

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
