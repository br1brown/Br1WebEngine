import express, { type NextFunction, type Request, type Response } from 'express';
import { dirname, resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { lookup as mimeLookup } from 'mime-types';
import { ALLOWED_WIDTHS } from './src/app/app.config';
import {
    AngularNodeAppEngine,
    createNodeRequestHandler,
    isMainModule,
    writeResponseToNodeResponse
} from '@angular/ssr/node';
import { serverEnv } from './src/server-env';

/** Estrae le variabili d'ambiente validate dal file di configurazione server */
const { port, backendOrigin, backendApiKey, proxyTimeout } = serverEnv;

/** Individua la cartella dove risiede il codice server eseguito da Node */
const serverDistFolder = dirname(fileURLToPath(import.meta.url));
/** Risolve il percorso della cartella 'browser' che contiene gli asset statici finali */
const browserDistFolder = resolve(serverDistFolder, '../browser');

/** Definisce la sorgente dei file: usa ASSETS_DIR se impostata, altrimenti la cartella di build */
const assetFilesDir = serverEnv.assetsDir || join(browserDistFolder, 'assets/files');

/** Percorso della cache per le immagini processate da Sharp */
const cacheDir = join(assetFilesDir, 'image-cache');
/** Crea la cartella di cache se non esiste (recursive evita errori se mancano i padri) */
mkdirSync(cacheDir, { recursive: true });

/** Tipo per l'entry del JSON: può essere solo il nome file o un oggetto complesso */
type RawEntry = string | { file: string;[key: string]: unknown };
/** Dizionario ID -> NomeFile reale per nascondere i percorsi fisici agli utenti */
const assetMapping: Record<string, string> = {};

/** Funzione: scansiona vari percorsi per caricare il mapping degli asset (fondamentale per l'engine) */
function loadAssetMapping(): boolean {
    try {
        const mappingPaths = [
            join(browserDistFolder, 'assets/mapping.json'),
            join(process.cwd(), 'src/assets/mapping.json'),
            join(process.cwd(), 'frontend/src/assets/mapping.json')
        ];

        let mappingData: string | null = null;
        for (const p of mappingPaths) {
            if (existsSync(p)) {
                mappingData = readFileSync(p, 'utf-8');
                break;
            }
        }

        if (mappingData) {
            const raw = JSON.parse(mappingData) as Record<string, RawEntry>;
            // Pulisce le entry esistenti: serve a non mantenere file rimossi dal mapping
            for (const k of Object.keys(assetMapping)) delete assetMapping[k];
            for (const [id, val] of Object.entries(raw)) {
                /** Normalizza il mapping: estrae solo il nome file indipendentemente dal formato */
                assetMapping[id] = typeof val === 'string' ? val : val.file;
            }
            return true;
        }
    } catch { return false; }
    return false;
}

/** Tentativo di caricamento iniziale del mapping all'avvio del processo */
if (!loadAssetMapping()) {
    console.warn('[Server] assets/mapping.json non trovato all\'avvio (sarà ricaricato alla prima richiesta)');
}

/** Classe: raggruppa le utility per gestire l'invio dei file e il controllo dei formati */
class AssetHandler {
    /** Verifica se il file è un'immagine raster (no SVG) supportata per il resize */
    static isSharpCompatible(filename: string): boolean {
        const mime = mimeLookup(filename);
        if (mime) return mime.startsWith('image/') && mime !== 'image/svg+xml';
        return false;
    }

    /** Spedisce l'immagine al browser impostando il tipo WebP e cache eterna (1 anno) */
    static serveImage(res: Response, path: string): void {
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.sendFile(path);
    }

    /** Spedisce un file non-immagine (PDF, ecc) mantenendo il formato originale e cache eterna */
    static serveFile(res: Response, path: string): void {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.sendFile(path);
    }
}

/** Job di generazione miniature attualmente in volo: richieste concorrenti per la stessa chiave riusano la stessa Promise invece di rilanciare sharp */
const inProgress = new Map<string, Promise<unknown>>();
/** Pattern per identificare asset con hash (es. main.v123.js) per abilitare la cache immutabile */
const immutableAssetPattern = /\.[0-9a-f]{16,}\.(?:js|css|woff2?|ttf|eot|svg|png|jpe?g|gif|webp|avif|ico)$/i;

/** Inizializzazione applicazione Express */
const app = express();
/** Motore Angular SSR ufficiale: gestisce il rendering delle pagine lato server */
const angularApp = new AngularNodeAppEngine({
    allowedHosts: serverEnv.allowedHosts
});

/**
 * Policy di sicurezza: definisce permessi per script, immagini e connessioni esterne.
 *
 * Perché 'unsafe-inline' resta:
 * - script-src: Angular SSR con withEventReplay() (in app.config.ts) emette
 *   uno <script id="ng-event-dispatch-contract"> inline e un piccolo bootstrap
 *   inline che captura gli eventi pre-hydration. Per stringere a 'self'
 *   secco bisognerebbe rimuovere withEventReplay (perdendo il replay degli
 *   eventi pre-hydration) o iniettare un nonce per richiesta e configurarlo
 *   nel builder Angular. La build genera anche un onload="this.media='all'"
 *   inline per il preload degli stylesheet — disattivabile con
 *   optimization.styles.inlineCritical=false in angular.json (costo: CSS
 *   render-blocking, FCP leggermente peggiore).
 * - style-src: ViewEncapsulation.Emulated inietta <style> a runtime per i
 *   componenti, e le template usano comunemente style="..." attributi.
 */
const defaultCsp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
].join('; ');

/** Header di sicurezza standard applicati a tutte le risposte HTML */
const htmlSecurityHeaders: [string, string][] = [
    ['X-Frame-Options', 'SAMEORIGIN'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
    ['Content-Security-Policy', defaultCsp],
];

/** Nasconde l'uso di Express per rendere più difficile il fingerprinting del server */
app.disable('x-powered-by');
/**
 * Abilita il riconoscimento degli IP reali quando il server è dietro un reverse proxy.
 * Lista ristretta (default: subnet private) per evitare che un client esterno
 * possa spoofare X-Forwarded-Host / X-Forwarded-For e bypassare l'allowlist.
 */
app.set('trust proxy', serverEnv.trustProxy);

/** TEMP DEBUG: log ogni richiesta in ingresso con host e path */
// app.use((req, _res, next) => {
//     console.log(`[debug-req] ${req.method} ${req.path} | host=${req.hostname} | headers.host=${req.headers.host}`);
//     next();
// });

/** Rotta Health: usata dai sistemi di monitoraggio per sapere se il frontend è attivo */
app.get('/health', (_request, response) => {
    response.json({
        status: 'ok',
        mode: 'ssr'
    });
});

/** Rifiuta richieste pubbliche con host non autorizzato prima di raggiungere proxy o SSR */
app.use((request, response, next) => {
    if (serverEnv.allowedHosts.length === 0 || request.path === '/health') {
        next();
        return;
    }

    const requestHost = request.hostname.trim().toLowerCase();
    const isAllowed = serverEnv.allowedHosts.some((host) => host.toLowerCase() === requestHost);

    if (isAllowed) {
        next();
        return;
    }

    console.warn(`[debug-host-blocked] host="${requestHost}" not in allowedHosts=[${serverEnv.allowedHosts.join(',')}]`);
    response.status(421).json({
        status: 421,
        title: 'Misdirected Request',
        detail: 'Host non autorizzato.'
    });
});

/** Proxy manuale: /api/* → backend, stripping il prefisso /api */
app.use('/api', async (req: Request, res: Response) => {
    const url = `${backendOrigin}${req.url}`;
    const headers: Record<string, string> = { 'x-api-key': backendApiKey };

    for (const h of ['content-type', 'authorization', 'accept', 'accept-language', 'range']) {
        const v = req.headers[h];
        if (v) headers[h] = Array.isArray(v) ? v.join(', ') : v;
    }
    if (req.headers['x-forwarded-for']) headers['x-forwarded-for'] = req.headers['x-forwarded-for'] as string;
    if (req.headers.host) headers['x-forwarded-host'] = req.headers.host;

    try {
        const { Readable } = await import('node:stream');

        /** Streaming del body: niente buffering in RAM per upload anche grossi */
        let body: ReadableStream<Uint8Array> | undefined;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
        }

        const response = await fetch(url, {
            method: req.method,
            headers,
            body,
            // duplex 'half' è richiesto da undici quando body è uno stream
            duplex: 'half',
            signal: AbortSignal.timeout(proxyTimeout),
        } as RequestInit & { duplex?: 'half' });

        res.status(response.status);

        // set-cookie va trattato a parte: forEach/get della Headers Web API
        // joina cookie multipli con la virgola, rompendo le date Expires
        const skipHeaders = new Set(['transfer-encoding', 'connection', 'keep-alive', 'set-cookie']);
        response.headers.forEach((val, key) => {
            if (!skipHeaders.has(key.toLowerCase())) res.setHeader(key, val);
        });
        const cookies = response.headers.getSetCookie?.() ?? [];
        if (cookies.length) res.setHeader('set-cookie', cookies);

        if (response.body) {
            Readable.fromWeb(response.body as any).pipe(res);
        } else {
            res.end();
        }
    } catch (err) {
        console.error('[proxy /api]', err);
        if (!res.headersSent) {
            res.status(504).json({
                status: 504,
                title: 'Gateway Timeout',
                detail: 'Il backend non ha risposto in tempo.',
            });
        }
    }
});

/** Middleware Security: inietta gli header di protezione in ogni risposta (non API) */
app.use((_request, response, next) => {
    for (const [name, value] of htmlSecurityHeaders) {
        response.setHeader(name, value);
    }
    next();
});

/** Endpoint CDN Asset: gestisce il recupero e l'ottimizzazione delle immagini al volo */
app.get('/cdn-cgi/asset', async (req, res) => {
    try {
        const id = req.query['id'] as string;
        if (!id) return res.status(400).send('Missing id');

        /** Cerca il nome file nel mapping; se non c'è, tenta un ricaricamento a caldo del JSON */
        let filename = assetMapping[id];
        if (!filename) {
            // Se non trovato, proviamo a ricaricare il mapping (potrebbe essere stato creato dopo l'avvio)
            loadAssetMapping();
            filename = assetMapping[id];
        }

        if (!filename) return res.status(404).send('Asset not found');

        const absolutePath = join(assetFilesDir, filename);
        if (!existsSync(absolutePath))
            return res.status(404).send('Source file not found');

        // File non-immagine: serve diretto senza elaborazione
        if (!AssetHandler.isSharpCompatible(filename)) return AssetHandler.serveFile(res, absolutePath);

        // Larghezza: usa il massimo consentito se non specificata; rifiuta valori fuori whitelist
        const format = 'webp';
        let requestedWidth = parseInt(req.query['w'] as string);

        /** Gestione larghezza: usa il massimo consentito se omessa, valida contro la whitelist */
        if (isNaN(requestedWidth)) {
            requestedWidth = Math.max(...ALLOWED_WIDTHS);
        } else if (!ALLOWED_WIDTHS.includes(requestedWidth as any)) {
            return res.status(400).send(`Invalid width. Allowed: ${ALLOWED_WIDTHS.join(', ')}`);
        }

        /** Analizza i metadati dell'originale per evitare di ingrandire immagini piccole (pixel sgranati) */
        const metadata = await sharp(absolutePath).metadata();
        const originalWidth = metadata.width || 0;
        const finalWidth = originalWidth < requestedWidth ? originalWidth : requestedWidth;

        /** Chiave cache basata su ID e dimensione: identifica univocamente la miniatura generata */
        const cacheKey = `${id}_w${finalWidth}.${format}`;
        const cacheFile = join(cacheDir, cacheKey);

        /** Se la miniatura esiste già in cache, la serve istantaneamente */
        if (existsSync(cacheFile)) return AssetHandler.serveImage(res, cacheFile);

        /**
         * Lookup singolo nella mappa: se la generazione è già in corso si riusa
         * la stessa Promise, altrimenti se ne avvia una nuova. Il .finally()
         * rimuove l'entry quando il job termina (successo o errore), così la
         * mappa contiene solo job effettivamente in volo.
         */
        let job = inProgress.get(cacheKey);
        if (!job) {
            job = sharp(absolutePath)
                .resize(finalWidth, null, { withoutEnlargement: true, fastShrinkOnLoad: true })
                .toFormat(format, { quality: 80 })
                .toFile(cacheFile)
                .finally(() => inProgress.delete(cacheKey));
            inProgress.set(cacheKey, job);
        }
        await job;

        AssetHandler.serveImage(res, cacheFile);
    } catch (err) {
        console.error('[Asset Error]:', err);
        res.status(500).send('Error processing asset');
    }
});

/** Sicurezza: nega l'accesso diretto alla cartella file per forzare l'uso della CDN via ID */
app.use('/assets/files', (_req, res) => { res.status(404).end(); });

/** Middleware Legal: serve i file Markdown delle policy garantendo che siano sempre aggiornati (no cache).
 *  Usa resolve() + prefix check invece di replace(/\.\./g,'') per bloccare path traversal anche via
 *  URL encoding (%2e%2e) o sequenze come ....// che Express decodifica prima del middleware. */
app.use('/assets/legal', (req, res, next) => {
    const legalDir = join(browserDistFolder, 'assets/legal');
    const resolved = resolve(join(legalDir, req.path));
    if (!resolved.startsWith(legalDir + sep)) {
        res.status(403).end();
        return;
    }
    if (existsSync(resolved)) {
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

/** Catch-all: ogni richiesta non risolta dai file o dalla CDN viene passata al motore Angular SSR */
app.use((request, response, next) => {
    angularApp
        .handle(request)
        .then((renderedResponse) => {
            if (renderedResponse) {
                /** Converte la risposta web standard di Angular in una risposta compatibile con Node.js/Express */
                return writeResponseToNodeResponse(renderedResponse, response);
            }
            next(); // Se Angular non ha una rotta corrispondente, passa al 404 di Express
            return;
        })
        .catch(next);
});

/** Avvio del server se il file è eseguito come modulo principale (node server.mjs) */
if (isMainModule(import.meta.url)) {
    app.listen(port, () => {
        console.log(`[frontend] Node SSR server listening on http://localhost:${port}`);
        console.log(`[frontend] Backend origin: ${backendOrigin}`);
        console.log(`[frontend] Frontend base URL: ${serverEnv.frontendBaseUrl || '(not set)'}`);
        console.log(
            `[frontend] NG_ALLOWED_HOSTS: ${serverEnv.allowedHosts.length > 0
                ? serverEnv.allowedHosts.join(', ')
                : '(not set)'
            }`
        );
    });
}

/** Esporta l'handler per l'integrazione nativa di Angular SSR (usato da main.server.ts) */
export const reqHandler = createNodeRequestHandler(app);
