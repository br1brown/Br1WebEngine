import express, { type Request, type Response } from 'express';
import compression from 'compression';
import { resolve, join, sep } from 'node:path';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
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
import { loadAssetMapping } from './asset-mapping';
import { immutableAssetPattern } from './asset-handler';
import { htmlSecurityHeaders, defaultCsp, eventReplayScriptSrc } from './security-headers';
import { fileExists } from './fs-utils';
import { apiProxyHandler } from './routes/api-proxy';
import { cdnAssetHandler } from './routes/cdn-asset';
import { ogPreviewHandler } from './routes/og-preview';
import { dynamicSitemapHandler, revalidateSitemapHandler } from './routes/dynamic-sitemap';
import { customFontFilePath } from './custom-font-detect';
import { resolvedFonts } from '../../../../styles/font-config';
import { extname } from 'node:path';

/** Alias sulla sezione server senza requireEnv, valutata al caricamento del modulo */
const { server: nodeCfg, site } = serverEnv;
// serverEnv.backend (BACKEND_ORIGIN, BACKEND_API_KEY) è acceduto lazily
// dentro i middleware delle rotte, mai al caricamento del modulo.

// Avviso "environment.ts disallineato": confronta l'impronta embeddata nel bundle (scritta da
// generate-statics.ts) con quella ricalcolata ORA da global-settings.json. Gira al boot, sia in
// prod (node server.mjs) sia in dev sotto `ng serve` (che importa questo modulo comunque, vedi
// isMainModule più sotto) — è proprio il caso "ng serve lanciato direttamente, senza passare da
// npm run dev/start/build" (che hanno il pre-hook generate:statics) a lasciare project/Localization/
// site del bundle stantii senza nessun errore. Solo un warning: environment.ts è comunque un seed
// valido e versionato, l'app parte lo stesso — semplicemente con dati potenzialmente vecchi.
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


const normalizePagePath = (path: string): string => {
    const normalized = `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '');
    return normalized || '/';
};

const knownPagePaths = new Set(
    ContestoSito.serverRenderEntries.map(entry => normalizePagePath(entry.path))
);

/** Path non indicizzabili: pagine protette (`requiresAuth`) e pagine `otherSEO.noindex`.
 *  Il server le marca `noindex` via header così non finiscono nell'indice, senza elencarle
 *  in robots.txt (che ne rivelerebbe i path). */
const noindexPagePaths = new Set(
    ContestoSito.serverRenderEntries
        .filter(entry => entry.requiresAuth || entry.noindex)
        .map(entry => normalizePagePath(entry.path))
);

/** true se ogni segmento di `pattern` combacia col segmento corrispondente di `path`: un segmento
 *  che inizia per ":" combacia con QUALSIASI valore in quella posizione. Serve perché le rotte
 *  parametriche finiscono in `serverRenderEntries` col loro template letterale (":slug"). */
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
        // Solo status HTTP di errore reali (4xx/5xx): un /error/200 o /error/999
        // non deve produrre uno status fuori standard, cade su 404 come pagina ignota.
        const code = Number(errorMatch[1]);
        if (code >= 400 && code <= 599) return code;
    }
    if (normalized === '/error') return 500;
    return isKnownPagePath(normalized, knownPagePaths) ? null : 404;
}

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

/**
 * Compressione (gzip) di tutte le risposte testuali: HTML SSR, JS, CSS, JSON, SVG.
 * Zero-config, attiva di default. Le immagini già compresse vengono saltate in base
 * al Content-Type, ed è compatibile con lo streaming SSR (intercetta write/end della
 * response). La teniamo a livello applicativo — non solo nel reverse proxy — così la
 * compressione è garantita comunque, anche se il proxy davanti non ricomprime
 * l'upstream: coerente con la filosofia "funziona da solo, senza configurazione".
 *
 * ECCEZIONE SSE: gli stream `text/event-stream` (es. il proxy verso /api/notifications/stream)
 * NON vanno compressi. gzip bufferizza per accumulare dati prima di emettere, quindi i piccoli
 * frame SSE non arriverebbero MAI al browser in tempo reale (il client manda `Accept-Encoding:
 * gzip` → senza questa esclusione il campanellino non riceve nulla). Il filtro li lascia non
 * compressi; tutto il resto usa il filtro di default di `compression`.
 */
app.use(compression({
    filter: (request, response) => {
        const contentType = response.getHeader('Content-Type');
        if (typeof contentType === 'string' && contentType.includes('text/event-stream')) return false;
        return compression.filter(request, response);
    },
}));

/** Rotta Health: usata dai sistemi di monitoraggio per sapere se il frontend è attivo */
app.get('/health', (_request, response) => {
    response.json({
        status: 'ok',
        mode: 'ssr',
        // Endpoint pubblici da auditare live in CI (Pa11y + Lighthouse, non solo accessibilità
        // nonostante il vecchio nome "a11yPaths" — rinominato per riflettere entrambi gli usi).
        auditPaths: ContestoSito.getAuditPaths(),
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

/** sitemap.xml: non più un file statico generato al build — endpoint runtime, davanti allo
 *  static handler apposta. Dettagli (cache, dynamicParams) in routes/dynamic-sitemap.ts. */
app.get('/sitemap.xml', dynamicSitemapHandler);

/** Invalidazione on-demand della cache sitemap, chiamata dal backend .NET (`SitemapNotifier`).
 *  Auth e logica in routes/dynamic-sitemap.ts. */
app.post('/internal/revalidate-sitemap', revalidateSitemapHandler);

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

/** MIME per le estensioni font supportate da `custom-font-detect.ts`. */
const FONT_CONTENT_TYPE: Record<string, string> = {
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
};

/** Font custom: un solo file già noto (`customFontFilePath`), nessuna route con parametro quindi
 *  nessun path traversal da difendere. Cache moderata, non "immutable": il nome file non porta un
 *  hash di contenuto, un redeploy con lo stesso nome ma contenuto diverso deve propagarsi. */
if (customFontFilePath && resolvedFonts.custom) {
    const filePath: string = customFontFilePath;
    const url = `/assets/fonts/${encodeURIComponent(resolvedFonts.custom.file)}`;
    app.get(url, (_req, res) => {
        res.set('Content-Type', FONT_CONTENT_TYPE[extname(filePath).toLowerCase()] ?? 'application/octet-stream');
        res.set('Cache-Control', 'public, max-age=3600');
        res.sendFile(filePath, err => { if (err) res.status(404).end(); });
    });
}

/**
 * security.txt (RFC 9116) sul percorso canonico /.well-known/.
 * Il file fisico è generato al build in public/security.txt (vedi generate-statics.ts):
 * tenerlo fuori da una cartella dotfile evita problemi di copia degli asset Angular,
 * mentre questa rotta espone l'URL canonico richiesto dallo standard. Il file alla
 * radice (/security.txt) resta servito dallo static handler come fallback.
 */
app.get('/.well-known/security.txt', (_req, res) => {
    res.type('text/plain').sendFile(join(browserDistFolder, 'security.txt'), (err) => {
        if (err) res.status(404).end();
    });
});

/**
 * PWA disattivata (isWebApp:false): il manifest non deve essere servito, altrimenti il
 * sito resterebbe installabile anche dopo aver tolto link/meta PWA da index.html. 404
 * esplicito davanti allo static handler — fail-safe anche se un manifest fosse rimasto
 * in dist da un build precedente. Con isWebApp:true questa rotta non è registrata e il
 * manifest viene servito (con la sua cache) dallo static handler qui sotto.
 */
if (!ContestoSito.config.isWebApp) {
    app.get('/manifest.webmanifest', (_req, res) => { res.status(404).end(); });
}

/**
 * Deploy non indicizzabile (SEO_NOINDEX): tipico di staging/anteprima dietro lo stesso
 * reverse proxy della produzione. Vieta l'indicizzazione in modo solido su due fronti:
 * - `X-Robots-Tag: noindex, nofollow` su OGNI risposta (header, vale anche se un crawler
 *   ignora robots.txt e copre asset/SSR indistintamente);
 * - un `robots.txt` dinamico `Disallow: /` che sovrascrive quello statico generato al build.
 * Entrambi i blocchi stanno davanti allo static handler. Default OFF: in produzione "as-is"
 * il sito resta indicizzabile, nessun impatto sullo sviluppo locale.
 */
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

        const seoStatus = getSeoStatusForPath(request.path);
        response.status(seoStatus ?? renderedResponse.status);
        response.setHeader('Cache-Control', 'no-cache');

        // Pagine protette (requiresAuth): mai indicizzate. Sono client-rendered, quindi un bot
        // riceverebbe lo shell con meta `index,follow`; l'header noindex (autoritativo) lo evita.
        if (isKnownPagePath(normalizePagePath(request.path), noindexPagePaths)) {
            response.setHeader('X-Robots-Tag', 'noindex, nofollow');
        }

        // Inoltra gli header Angular, escludendo quelli che gestiamo noi
        renderedResponse.headers.forEach((value, key) => {
            const lk = key.toLowerCase();
            if (lk === 'cache-control' || lk === 'content-security-policy' || lk === 'content-length') return;
            response.setHeader(key, value);
        });

        // CSP: in prod nonce per-request (+ hash dello script event-dispatch build-time,
        // vedi eventReplayScriptSrc), in dev 'unsafe-inline' (richiesto da HMR)
        const scriptSrc = nonce ? `'nonce-${nonce}'${eventReplayScriptSrc}` : "'unsafe-inline'";
        response.setHeader('Content-Security-Policy',
            defaultCsp.replace('{SCRIPT_NONCE_PLACEHOLDER}', scriptSrc));

        // Streaming diretto: nessun buffer RAM — la risposta arriva al browser man mano che Angular la produce
        if (renderedResponse.body) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stream = Readable.fromWeb(renderedResponse.body as any);
            // Senza questo handler un errore sullo stream durante il piping emette un evento
            // 'error' non gestito sull'EventEmitter → crash del processo: il try/catch sopra è
            // già passato (il piping è asincrono) e .pipe() non distrugge la destinazione sul
            // fallimento della sorgente. Abbattiamo la response per chiudere la connessione.
            stream.on('error', (err) => {
                console.error('[SSR stream]', err);
                response.destroy(err);
            });
            stream.pipe(response);
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

    const server = app.listen(nodeCfg.port, () => {
        console.log(`[frontend] Node SSR server listening on http://localhost:${nodeCfg.port}`);
        console.log(`[frontend] Backend origin: ${serverEnv.backend.origin}`);
        console.log(`[frontend] Frontend base URL: ${site.baseUrl || '(not set)'}`);
        console.log(`[frontend] Allowed hosts: ${nodeCfg.allowedHosts.join(', ')}`);
    });

    /**
     * Graceful shutdown: su SIGTERM/SIGINT (docker stop, redeploy, rollout k8s)
     * smettiamo di accettare nuove connessioni e lasciamo terminare quelle in volo
     * prima di uscire — nessuna richiesta troncata a metà durante un redeploy.
     * Timeout di sicurezza a 10s se qualcosa resta appeso.
     */
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
