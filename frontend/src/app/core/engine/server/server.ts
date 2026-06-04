import express, { type Request, type Response } from 'express';
import { resolve, join, sep } from 'node:path';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { ContestoSito } from '../../../site';
import {
    AngularNodeAppEngine,
    createNodeRequestHandler,
    isMainModule,
} from '@angular/ssr/node';
import { serverEnv, assertRequiredEnv } from './server-env';
import { API_PREFIX } from '../../../app.config';
import { browserDistFolder } from './server-paths';
import { pruneImageCache, CACHE_SWEEP_INTERVAL_MS } from './image-cache';
import { loadAssetMapping } from './asset-mapping';
import { immutableAssetPattern } from './asset-handler';
import { htmlSecurityHeaders, defaultCsp } from './security-headers';
import { fileExists } from './fs-utils';
import { apiProxyHandler } from './routes/api-proxy';
import { cdnAssetHandler } from './routes/cdn-asset';
import { ogPreviewHandler } from './routes/og-preview';

/** Alias sulla sezione server senza requireEnv, valutata al caricamento del modulo */
const { server: nodeCfg, site } = serverEnv;
// serverEnv.backend (BACKEND_ORIGIN, BACKEND_API_KEY) è acceduto lazily
// dentro i middleware delle rotte, mai al caricamento del modulo.

/** Endpoint CDN CGI serviti da questo server. Specchio di CdnCgi in asset.service.ts. */
const CdnCgiPaths = {
    asset: '/cdn-cgi/asset',
    preview: '/cdn-cgi/preview',
} as const;

/** Tentativo di caricamento iniziale del mapping all'avvio del processo (non bloccante:
 *  resolveAssetPath fa hot-reload alla prima richiesta se qui fallisce). */
loadAssetMapping().then((ok) => {
    if (!ok) {
        console.warn('[Server] assets/mapping.json non trovato all\'avvio (sarà ricaricato alla prima richiesta)');
    }
});

/** Inizializzazione applicazione Express */
const app = express();

/**
 * Header proxy fidati inviati da Nginx Proxy Manager.
 *
 * trustProxyHeaders è necessario non per ricostruire l'URL (l'origin di og:image
 * viene da SSR_FRONTEND_ORIGIN, indipendente dagli header), ma perché Angular SSR
 * senza questa opzione, ricevendo qualsiasi X-Forwarded-*, scende silenziosamente
 * a index.csr.html (CSR) invece di eseguire il rendering server-side.
 * X-Forwarded-Scheme è non-standard ma inviato da NPM/nginx.
 */
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

/**
 * Abilita il riconoscimento degli IP reali quando il server è dietro un reverse proxy.
 * Lista ristretta (default: subnet private) per evitare che un client esterno
 * possa spoofare X-Forwarded-Host / X-Forwarded-For e bypassare l'allowlist.
 */
app.set('trust proxy', nodeCfg.trustProxy);

/** Rotta Health: usata dai sistemi di monitoraggio per sapere se il frontend è attivo */
app.get('/health', (_request, response) => {
    response.json({
        status: 'ok',
        mode: 'ssr',
        a11yPaths: ContestoSito.getSitemapEntries().map(e => e.path),
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

/** Sicurezza: nega l'accesso diretto alla cartella file per forzare l'uso della CDN via ID */
app.use('/assets/files', (_req, res) => { res.status(404).end(); });

/** Middleware Legal: serve i file Markdown delle policy garantendo che siano sempre aggiornati (no cache).
 *  Usa resolve() + prefix check invece di replace(/\.\./g,'') per bloccare path traversal anche via
 *  URL encoding (%2e%2e) o sequenze come ....// che Express decodifica prima del middleware. */
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

/** Serve tutti i restanti file statici (JS, CSS, Immagini del template) */
app.use(
    express.static(browserDistFolder, {
        index: false,
        redirect: false,
        setHeaders(response, filePath) {
            const fileName = filePath.split(/[\\/]/).pop() ?? '';
            /** Applica cache eterna agli asset con hash nel nome (gestiti da Angular) */
            if (immutableAssetPattern.test(fileName)) {
                // File con hash nel nome: non cambiano mai → cache permanente
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

/**
 * In dev (ng serve) il bundle server è importato come modulo dal dev server di Angular,
 * non eseguito come processo principale. isMainModule() lo rileva:
 * - false → dev: niente nonce, script-src usa 'unsafe-inline' (HMR/live-reload lo richiedono)
 * - true  → prod (node server.mjs): nonce per-request via requestContext
 */
const isDevMode = !isMainModule(import.meta.url);

/**
 * Catch-all: ogni richiesta non risolta viene passata al motore Angular SSR.
 *
 * Streaming: la risposta viene inoltrata direttamente senza bufferizzare l'HTML.
 * Il tema è già iniettato da Angular durante il rendering (provideAppInitializer
 * in app.config.server.ts), quindi non serve il post-processing regex di injectTheme.
 *
 * CSP nonce per-request (solo prod): un nonce casuale rimpiazza '{SCRIPT_NONCE_PLACEHOLDER}'
 * nella policy. Il nonce viene passato ad Angular via requestContext (REQUEST_CONTEXT token
 * in app.config.server.ts) che lo stampa su tutti gli <script> inline che emette in SSR.
 * In dev il placeholder viene sostituito con 'unsafe-inline' per compatibilità con HMR.
 */
app.use(async (request: Request, response: Response, next) => {
    const nonce = isDevMode ? null : randomBytes(16).toString('base64url');

    try {
        const renderedResponse = await angularApp.handle(
            request,
            nonce ? { nonce } : undefined,
        );
        if (!renderedResponse) { next(); return; }

        response.status(renderedResponse.status);
        response.setHeader('Cache-Control', 'no-cache');

        // Inoltra gli header Angular, escludendo quelli che gestiamo noi
        renderedResponse.headers.forEach((value, key) => {
            const lk = key.toLowerCase();
            if (lk === 'cache-control' || lk === 'content-security-policy' || lk === 'content-length') return;
            response.setHeader(key, value);
        });

        // CSP: in prod nonce per-request, in dev 'unsafe-inline' (richiesto da HMR)
        const scriptSrc = nonce ? `'nonce-${nonce}'` : "'unsafe-inline'";
        response.setHeader('Content-Security-Policy',
            defaultCsp.replace('{SCRIPT_NONCE_PLACEHOLDER}', scriptSrc));

        // Streaming diretto: nessun buffer RAM — la risposta arriva al browser man mano che Angular la produce
        if (renderedResponse.body) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Readable.fromWeb(renderedResponse.body as any).pipe(response);
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

    // Sweep iniziale + periodico della cache immagini. unref() evita che il timer
    // da solo tenga vivo il processo. Solo in prod (isMainModule), mai durante la
    // route-extraction del build dove il modulo è importato senza essere eseguito.
    pruneImageCache();
    setInterval(pruneImageCache, CACHE_SWEEP_INTERVAL_MS).unref();

    app.listen(nodeCfg.port, () => {
        console.log(`[frontend] Node SSR server listening on http://localhost:${nodeCfg.port}`);
        console.log(`[frontend] Backend origin: ${serverEnv.backend.origin}`);
        console.log(`[frontend] Frontend base URL: ${site.baseUrl || '(not set)'}`);
        console.log(
            `[frontend] Allowed hosts: ${nodeCfg.allowedHosts.includes('*')
                ? "* (any host — SSR aperto, protezione via API key + reverse proxy)"
                : nodeCfg.allowedHosts.join(', ')
            }`
        );
    });
}

/** Esporta l'handler per l'integrazione nativa di Angular SSR (usato da main.server.ts) */
export const reqHandler = createNodeRequestHandler(app);
