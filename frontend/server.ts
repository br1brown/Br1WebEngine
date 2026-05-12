import express, { type NextFunction, type Request, type Response } from 'express';
import { dirname, resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { lookup as mimeLookup } from 'mime-types';
import { ALLOWED_WIDTHS } from './src/app/app.config';
import { ContestoSito } from './src/app/site';
import { ImgBuilderService } from './src/app/core/services/img-builder.service';
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

/** Tipo per l'entry del JSON: puÃ² essere solo il nome file o un oggetto complesso */
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
    console.warn('[Server] assets/mapping.json non trovato all\'avvio (sarÃ  ricaricato alla prima richiesta)');
}

/**
 * Risolve un ID asset nel percorso assoluto del file sorgente.
 * Se l'ID non è nel mapping tenta un hot-reload del JSON
 * Restituisce null se l'ID non esiste o il file manca sul disco.
 */
function resolveAssetPath(id: string): string | null {
    let filename = assetMapping[id];
    if (!filename) {
        loadAssetMapping();
        filename = assetMapping[id];
    }
    if (!filename) return null;
    const filePath = join(assetFilesDir, filename);
    return existsSync(filePath) ? filePath : null;
}

/** Classe: raggruppa le utility per gestire l'invio dei file e il controllo dei formati */
class AssetHandler {
    /** Verifica se il file Ã¨ un'immagine raster (no SVG) supportata per il resize */
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
 * PerchÃ© 'unsafe-inline' resta:
 * - script-src: Angular SSR con withEventReplay() (in app.config.ts) emette
 *   uno <script id="ng-event-dispatch-contract"> inline e un piccolo bootstrap
 *   inline che captura gli eventi pre-hydration. Per stringere a 'self'
 *   secco bisognerebbe rimuovere withEventReplay (perdendo il replay degli
 *   eventi pre-hydration) o iniettare un nonce per richiesta e configurarlo
 *   nel builder Angular. La build genera anche un onload="this.media='all'"
 *   inline per il preload degli stylesheet â€” disattivabile con
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

/** Nasconde l'uso di Express per rendere piÃ¹ difficile il fingerprinting del server */
app.disable('x-powered-by');
/**
 * Abilita il riconoscimento degli IP reali quando il server Ã¨ dietro un reverse proxy.
 * Lista ristretta (default: subnet private) per evitare che un client esterno
 * possa spoofare X-Forwarded-Host / X-Forwarded-For e bypassare l'allowlist.
 */
app.set('trust proxy', serverEnv.trustProxy);

/** TEMP DEBUG: log ogni richiesta in ingresso con host e path */
// app.use((req, _res, next) => {
//     console.log(`[debug-req] ${req.method} ${req.path} | host=${req.hostname} | headers.host=${req.headers.host}`);
//     next();
// });

/** Rotta Health: usata dai sistemi di monitoraggio per sapere se il frontend Ã¨ attivo */
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

/** Proxy manuale: /api/* â†’ backend, stripping il prefisso /api */
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
            // duplex 'half' Ã¨ richiesto da undici quando body Ã¨ uno stream
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

        const absolutePath = resolveAssetPath(id);
        if (!absolutePath) return res.status(404).send('Asset not found');

        // File non-immagine: serve diretto senza elaborazione
        const filename = absolutePath.split(/[\\/]/).pop()!;
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

        /** Se la miniatura esiste giÃ  in cache, la serve istantaneamente */
        if (existsSync(cacheFile)) return AssetHandler.serveImage(res, cacheFile);

        /**
         * Lookup singolo nella mappa: se la generazione Ã¨ giÃ  in corso si riusa
         * la stessa Promise, altrimenti se ne avvia una nuova. Il .finally()
         * rimuove l'entry quando il job termina (successo o errore), cosÃ¬ la
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

/** Endpoint Social Preview: genera al volo l'immagine Open Graph / Twitter Card. */
app.get('/cdn-cgi/preview', async (req, res) => {
    try {
        // Hard-limit sui parametri per evitare cache poisoning con input giganti
        const title = String(req.query['title'] ?? '').slice(0, 200).trim();
        const subtitle = String(req.query['subtitle'] ?? '').slice(0, 300).trim();

        if (!title) return res.status(400).send('Missing title');

        const { colorTema, version, appName } = ContestoSito.config;
        const r = PreviewBuilder.resolve({ appName, title, subtitle, bgColor: colorTema });

        // Chiave cache deterministica: stessi input e stessi default => stesso file
        const keyData = JSON.stringify({ version, ...r });
        const hash = createHash('sha1').update(keyData).digest('hex').slice(0, 16);
        const cacheKey = `preview_${hash}.webp`;
        const cacheFile = join(cacheDir, cacheKey);

        if (existsSync(cacheFile)) return AssetHandler.serveImage(res, cacheFile);

        // Single-flight: richieste concorrenti per la stessa preview riusano lo stesso job
        let job = inProgress.get(cacheKey);
        if (!job) {
            job = (async () => {
                // Favicon: recuperata tramite mapping (stessa logica degli altri asset).
                // Il resize visivo è delegato agli attributi width/height del tag <image> SVG:
                // non ha senso degradare il sorgente prima, specie se l'icona è ad alta risoluzione.
                let faviconDataUrl = '';
                const faviconPath = resolveAssetPath('favicon');
                if (faviconPath) {
                    faviconDataUrl = `data:image/png;base64,${readFileSync(faviconPath).toString('base64')}`;
                }

                const { svg } = PreviewBuilder.build({ ...r, faviconDataUrl });
                await sharp(Buffer.from(svg, 'utf-8')).webp({ quality: 85 }).toFile(cacheFile);
            })().finally(() => inProgress.delete(cacheKey));
            inProgress.set(cacheKey, job);
        }
        await job;

        AssetHandler.serveImage(res, cacheFile);
    } catch (err) {
        console.error('[Preview Error]:', err);
        if (!res.headersSent) res.status(500).send('Error generating preview');
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
                // File con hash nel nome: non cambiano mai â†’ cache permanente
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

/** Avvio del server se il file Ã¨ eseguito come modulo principale (node server.mjs) */
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

// ─── Preview Builder ──────────────────────────────────────────────────────────
// Genera l'SVG strutturato per le immagini Open Graph / Twitter Card.
// Vive solo in server.ts: non è un servizio Angular, non tocca il DOM.
// Riusa wrapText / escapeXml / normalizeWhitespace di ImgBuilderService
// (statici puri, zero Angular) per evitare duplicazione della logica di layout.

interface PreviewSvgOptions {
    appName: string;
    title: string;
    subtitle?: string | null;
    bgColor: string;
    faviconDataUrl?: string;
    textColor?: string;
    width?: number;
    height?: number;
    fontFamily?: string;
    appFontSize?: number;
    titleFontSize?: number;
    subtitleFontSize?: number;
    faviconSize?: number;
    spacing?: number;
    horizontalPadding?: number;
    titleLineHeight?: number;
    subtitleLineHeight?: number;
}

class PreviewBuilder {
    static resolve(opts: PreviewSvgOptions) {
        return {
            appName: ImgBuilderService.normalizeWhitespace(opts.appName),
            title: ImgBuilderService.normalizeWhitespace(opts.title),
            subtitle: ImgBuilderService.normalizeWhitespace(opts.subtitle ?? ''),
            bgColor: opts.bgColor,
            faviconDataUrl: opts.faviconDataUrl ?? '',
            textColor: opts.textColor ?? ImgBuilderService.getReadableTextColor(opts.bgColor),
            width: Math.max(1, Math.ceil(opts.width ?? 1200)),
            height: Math.max(1, Math.ceil(opts.height ?? 630)),
            fontFamily: opts.fontFamily ?? `system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`,
            appFontSize: opts.appFontSize ?? 26,
            titleFontSize: opts.titleFontSize ?? 54,
            subtitleFontSize: opts.subtitleFontSize ?? 26,
            faviconSize: opts.faviconSize ?? 64,
            spacing: opts.spacing ?? 24,
            horizontalPadding: opts.horizontalPadding ?? 80,
            titleLineHeight: opts.titleLineHeight ?? 1.25,
            subtitleLineHeight: opts.subtitleLineHeight ?? 1.4,
        };
    }

    static build(opts: PreviewSvgOptions): { svg: string; width: number; height: number } {
        const r = PreviewBuilder.resolve(opts);
        const cx = r.width / 2;
        const maxWidthPx = r.width - r.horizontalPadding * 2;
        const titleLineStep = r.titleFontSize * r.titleLineHeight;
        const subtitleLineStep = r.subtitleFontSize * r.subtitleLineHeight;
        const esc = ImgBuilderService.escapeXml;

        const titleLines = ImgBuilderService.wrapText(r.title, maxWidthPx, r.titleFontSize);
        const subtitleLines = r.subtitle
            ? ImgBuilderService.wrapText(r.subtitle, maxWidthPx, r.subtitleFontSize)
            : [];

        const titleBlockHeight = r.titleFontSize + (titleLines.length - 1) * titleLineStep;
        const subtitleBlockHeight = subtitleLines.length > 0
            ? r.subtitleFontSize + (subtitleLines.length - 1) * subtitleLineStep
            : 0;

        const totalHeight = r.appFontSize
            + r.spacing + r.faviconSize
            + r.spacing + titleBlockHeight
            + (subtitleBlockHeight > 0 ? r.spacing + subtitleBlockHeight : 0);
        let topY = (r.height - totalHeight) / 2;

        const appNameEl =
            `<text x="${cx}" y="${topY + r.appFontSize}" font-family="${esc(r.fontFamily)}" font-size="${r.appFontSize}" font-weight="400" fill="${esc(r.textColor)}" text-anchor="middle" opacity="0.65">${esc(r.appName)}</text>`;
        topY += r.appFontSize + r.spacing;

        const faviconEl = r.faviconDataUrl
            ? `<image href="${r.faviconDataUrl}" x="${cx - r.faviconSize / 2}" y="${topY}" width="${r.faviconSize}" height="${r.faviconSize}"/>`
            : '';
        topY += r.faviconSize + r.spacing;

        const titleTspans = titleLines
            .map((line, i) => `<tspan x="${cx}" dy="${i === 0 ? 0 : titleLineStep}">${esc(line)}</tspan>`)
            .join('');
        const titleEl =
            `<text x="${cx}" y="${topY + r.titleFontSize}" font-family="${esc(r.fontFamily)}" font-size="${r.titleFontSize}" font-weight="700" fill="${esc(r.textColor)}" text-anchor="middle">${titleTspans}</text>`;
        topY += titleBlockHeight + r.spacing;

        let subtitleEl = '';
        if (subtitleLines.length > 0) {
            const subtitleTspans = subtitleLines
                .map((line, i) => `<tspan x="${cx}" dy="${i === 0 ? 0 : subtitleLineStep}">${esc(line)}</tspan>`)
                .join('');
            subtitleEl =
                `<text x="${cx}" y="${topY + r.subtitleFontSize}" font-family="${esc(r.fontFamily)}" font-size="${r.subtitleFontSize}" font-weight="400" fill="${esc(r.textColor)}" text-anchor="middle" opacity="0.80">${subtitleTspans}</text>`;
        }

        const svg =
            `<?xml version="1.0" encoding="UTF-8"?>` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}" viewBox="0 0 ${r.width} ${r.height}">` +
            `<rect width="${r.width}" height="${r.height}" fill="${esc(r.bgColor)}"/>` +
            appNameEl + faviconEl + titleEl + subtitleEl +
            `</svg>`;

        return { svg, width: r.width, height: r.height };
    }
}
