import express, { type NextFunction, type Request, type Response } from 'express';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { lookup as mimeLookup } from 'mime-types';
import { ALLOWED_WIDTHS } from './src/app/app.config';
import { createProxyMiddleware } from 'http-proxy-middleware';
import {
    AngularNodeAppEngine,
    createNodeRequestHandler,
    isMainModule,
    writeResponseToNodeResponse
} from '@angular/ssr/node';
import { serverEnv } from './src/server-env';

const { port, backendOrigin, backendApiKey, proxyTimeout } = serverEnv;

// Percorsi del bundle Angular: server/ contiene server.mjs, browser/ gli asset statici
const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

// Cache immagini su disco: creata all'avvio, svuotata ad ogni rebuild del container
const cacheDir = join(browserDistFolder, 'assets/files/image-cache');
mkdirSync(cacheDir, { recursive: true });

// Carichiamo il mapping ID -> filename reale da assets/mapping.json.
// Cerchiamo in più percorsi per gestire sia il build finale che l'avvio in dev mode (ng serve).
// Formato valori in mapping.json: stringa semplice oppure { file: string, ... }
type RawEntry = string | { file: string; [key: string]: unknown };
const assetMapping: Record<string, string> = {};

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
            for (const [id, val] of Object.entries(raw)) {
                assetMapping[id] = typeof val === 'string' ? val : val.file;
            }
            return true;
        }
    } catch {
        // Fallimento silenzioso, gestito dal chiamante
    }
    return false;
}

// Caricamento iniziale all'avvio
if (!loadAssetMapping()) {
    console.warn('[Server] assets/mapping.json non trovato all\'avvio (sarà ricaricato alla prima richiesta)');
}

class AssetHandler {
    /** True se il file è un'immagine raster processabile da Sharp (MIME image/*, escluso SVG). */
    static isSharpCompatible(filename: string): boolean {
        const mime = mimeLookup(filename);
        if (mime) return mime.startsWith('image/') && mime !== 'image/svg+xml';
        return false;
    }

    /** Serve un'immagine WebP già pronta (da cache o appena elaborata). */
    static serveImage(res: Response, path: string): void {
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.sendFile(path);
    }

    /** Serve un file generico direttamente, con Content-Type rilevato da Express. */
    static serveFile(res: Response, path: string): void {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.sendFile(path);
    }
}

// Lock per evitare che richieste simultanee processino la stessa immagine (Race Condition)
const inProgress = new Map<string, Promise<void>>();
const immutableAssetPattern =
    /\.[0-9a-f]{16,}\.(?:js|css|woff2?|ttf|eot|svg|png|jpe?g|gif|webp|avif|ico)$/i;

const app = express();
const angularApp = new AngularNodeAppEngine({
    allowedHosts: [new URL(backendOrigin).hostname, 'localhost', '127.0.0.1']
});

// Security headers per le risposte HTML e gli asset statici.
// Le API (/api/*) ricevono questi header dal backend; li escludiamo qui per evitare duplicati.
// 'unsafe-inline' in script-src richiesto da Angular withEventReplay() (SSR hydration).
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

const htmlSecurityHeaders: [string, string][] = [
    ['X-Frame-Options', 'SAMEORIGIN'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
    ['Content-Security-Policy', defaultCsp],
];

app.disable('x-powered-by');  // non esporre la versione di Express negli header
app.set('trust proxy', true); // necessario per leggere l'IP reale dietro reverse proxy

// Endpoint di health check per Docker e monitor esterni
app.get('/health', (_request, response) => {
    response.json({
        status: 'ok',
        mode: 'ssr'
    });
});

// Proxy /api/* → backend: intercetta le chiamate con prefisso /api e le gira al backend
// strippando il prefisso stesso. Il backend non conosce /api: i controller partono da /.
// pathFilter (non app.use('/api', ...)): evita che Express strisci il prefisso prima del middleware.
app.use(createProxyMiddleware({
    target: backendOrigin,
    pathFilter: '/api',
    pathRewrite: { '^/api': '' },
    changeOrigin: true,
    xfwd: true,
    proxyTimeout: proxyTimeout,
    timeout: proxyTimeout,
    on: {
        proxyReq: (proxyReq) => proxyReq.setHeader('x-api-key', backendApiKey),
        error: (err, _req, res, next) => {
            const response = res as Response;
            if (response.headersSent) {
                // Headers già inviati: non possiamo mandare un nuovo status.
                // Passiamo l'errore a Express per logging e cleanup.
                (next as NextFunction)(err);
                return;
            }
            // ProblemDetails (RFC 9457): il frontend legge .detail per il messaggio.
            // Tutti gli errori del proxy sono errori gateway (504), indipendentemente
            // dalla causa (timeout, ECONNREFUSED, ecc.).
            response.status(504).json({
                status: 504,
                title: 'Gateway Timeout',
                detail: 'Il backend non ha risposto in tempo.'
            });
        }
    }
}));

// Applica security headers a tutte le risposte non-API (HTML, assets statici).
// Posizionato dopo il proxy /api: quelle risposte non passano da qui.
app.use((_request, response, next) => {
    for (const [name, value] of htmlSecurityHeaders) {
        response.setHeader(name, value);
    }
    next();
});

app.get('/cdn-cgi/asset', async (req, res) => {
    try {
        const id = req.query['id'] as string;
        if (!id) return res.status(400).send('Missing id');

        let filename = assetMapping[id];
        if (!filename) {
            // Se non trovato, proviamo a ricaricare il mapping (potrebbe essere stato creato dopo l'avvio)
            loadAssetMapping();
            filename = assetMapping[id];
        }

        if (!filename) return res.status(404).send('Asset not found');

        const absolutePath = join(browserDistFolder, 'assets/files/', filename);
        if (!existsSync(absolutePath))
            return res.status(404).send('Source file not found');

        // File non-immagine: serve diretto senza elaborazione
        if (!AssetHandler.isSharpCompatible(filename)) return AssetHandler.serveFile(res, absolutePath);

        // Larghezza: usa il massimo consentito se non specificata; rifiuta valori fuori whitelist
        const format = 'webp';
        let requestedWidth = parseInt(req.query['w'] as string);

        if (isNaN(requestedWidth)) {
            requestedWidth = Math.max(...ALLOWED_WIDTHS);
        } else if (!ALLOWED_WIDTHS.includes(requestedWidth as any)) {
            return res.status(400).send(`Invalid width. Allowed: ${ALLOWED_WIDTHS.join(', ')}`);
        }

        // Evita upscaling: se l'originale è più piccolo della larghezza richiesta, si usa quella
        const metadata = await sharp(absolutePath).metadata();
        const originalWidth = metadata.width || 0;
        const finalWidth = originalWidth < requestedWidth ? originalWidth : requestedWidth;

        // Chiave cache univoca per ID + dimensione finale
        const cacheKey = `${id}_w${finalWidth}.${format}`;
        const cacheFile = join(cacheDir, cacheKey);

        if (existsSync(cacheFile)) return AssetHandler.serveImage(res, cacheFile);

        // Richiesta concorrente per la stessa chiave: aspetta il job già in corso
        if (inProgress.has(cacheKey)) {
            await inProgress.get(cacheKey);
            return AssetHandler.serveImage(res, cacheFile);
        }

        // Prima richiesta: elabora e salva in cache
        const job = sharp(absolutePath)
            .resize(finalWidth, null, { withoutEnlargement: true, fastShrinkOnLoad: true })
            .toFormat(format, { quality: 80 })
            .toFile(cacheFile);

        inProgress.set(cacheKey, job as any);
        try {
            await job;
        } finally {
            inProgress.delete(cacheKey);
        }

        AssetHandler.serveImage(res, cacheFile);
    } catch (err) {
        console.error('[Asset Error]:', err);
        res.status(500).send('Error processing asset');
    }
});

// Blocca accesso diretto ad assets/files/: tutto deve passare per /cdn-cgi/asset?id=
app.use('/assets/files', (_req, res) => { res.status(404).end(); });

app.use(
    express.static(browserDistFolder, {
        index: false,
        redirect: false,
        setHeaders(response, filePath) {
            const fileName = filePath.split(/[\\/]/).pop() ?? '';

            if (immutableAssetPattern.test(fileName)) {
                // File con hash nel nome: non cambiano mai → cache permanente
                response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                return;
            }

            if (fileName === 'ngsw-worker.js' || fileName === 'ngsw.json') {
                response.setHeader('Cache-Control', 'no-store');
                return;
            }

            if (fileName === 'manifest.webmanifest') {
                response.setHeader('Cache-Control', 'public, max-age=86400');
                return;
            }

            // Tutto il resto (asset non hashati: i18n, legal, ecc.) → rivalidare ad ogni deploy
            response.setHeader('Cache-Control', 'no-cache');
        }
    })
);

// Tutte le richieste non gestite sopra arrivano ad Angular SSR
app.use((request, response, next) => {
    angularApp
        .handle(request)
        .then((renderedResponse) => {
            if (renderedResponse) {
                return writeResponseToNodeResponse(renderedResponse, response);
            }
            next(); // nessuna route Angular corrispondente → 404 di Express
            return;
        })
        .catch(next);
});

// Avvio diretto (node server.mjs): non eseguito quando Angular usa reqHandler
if (isMainModule(import.meta.url)) {
    app.listen(port, () => {
        console.log(`[frontend] Node SSR server listening on http://localhost:${port}`);
        console.log(`[frontend] Backend origin: ${backendOrigin}`);
    });
}

// Handler esportato per Angular SSR (usato da main.server.ts in modalità integrata)
export const reqHandler = createNodeRequestHandler(app);
