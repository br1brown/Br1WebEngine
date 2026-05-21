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
import { FontConfig } from './src/styles/font-config';
import { PreviewCrypto } from './src/preview-crypto.server';
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
const assetFilesDir = serverEnv.assetsDir
    ? resolve(serverEnv.assetsDir)
    : join(browserDistFolder, 'assets/files');

/** Percorso della cache per le immagini processate da Sharp */
const cacheDir = join(assetFilesDir, 'image-cache');
/** Crea la cartella di cache se non esiste (recursive evita errori se mancano i padri) */
mkdirSync(cacheDir, { recursive: true });

/** Endpoint CDN CGI serviti da questo server. Specchio di CdnCgi in asset.service.ts. */
const CdnCgiPaths = {
    asset: '/cdn-cgi/asset',
    preview: '/cdn-cgi/preview',
} as const;

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
        mode: 'ssr',
        a11yPaths: ContestoSito.getSitemapEntries().map(e => e.path),
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
app.get(CdnCgiPaths.asset, async (req, res) => {
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

/**
 * Endpoint Social Preview unico: genera al volo l'immagine Open Graph / Twitter Card.
 *
 * Parametri:
 *   - p: blob AES-GCM (base64url) prodotto da `PreviewCrypto.encrypt()` in
 *        preview-crypto.server.ts. Decifra a `{ title, subtitle?, id? }`.
 *        Manomissione → decifrazione fallisce → 403.
 *
 * Dispatch variante: `id` presente nel payload → sovrapposizione asset; assente → SVG testo.
 */
app.get(CdnCgiPaths.preview, async (req, res) => {
    try {
        const blob = String(req.query['p'] ?? '').trim();
        if (!blob) return res.status(400).send('Missing p');

        let payload: Record<string, string>;
        try {
            payload = PreviewCrypto.decrypt(blob);
        } catch {
            return res.status(403).send('Invalid payload');
        }

        const title = String(payload['title'] ?? '').slice(0, 200).trim();
        const subtitle = String(payload['subtitle'] ?? '').slice(0, 300).trim();
        const id = String(payload['id'] ?? '').trim();
        const onlyImage = payload['onlyImage'] === 'true';

        if (!title) return res.status(400).send('Missing title');

        if (id) return renderPreviewWithImage(res, id, title, onlyImage);
        return renderPreviewText(res, title, subtitle);
    } catch (err) {
        console.error('[Preview Error]:', err);
        if (!res.headersSent) res.status(500).send('Error generating preview');
    }
});

/** Variante testuale: SVG con app name + favicon + titolo + sottotitolo. */
async function renderPreviewText(res: Response, title: string, subtitle: string): Promise<void> {
    const { colorTema, version, appName } = ContestoSito.config;
    const r = PreviewBuilder.resolvePreviewBuilder({ appName, title, subtitle, bgColor: colorTema });

    const keyData = JSON.stringify({ version, ...r });
    const hash = createHash('sha1').update(keyData).digest('hex').slice(0, 16);
    const cacheKey = `preview_${hash}.webp`;
    const cacheFile = join(cacheDir, cacheKey);

    if (existsSync(cacheFile)) return AssetHandler.serveImage(res, cacheFile);

    let job = inProgress.get(cacheKey);
    if (!job) {
        job = (async () => {
            let faviconDataUrl = '';
            const faviconPath = resolveAssetPath('favIcon');
            if (faviconPath) {
                faviconDataUrl = `data:image/png;base64,${readFileSync(faviconPath).toString('base64')}`;
            }
            const { svg } = PreviewBuilder.buildPreview({ ...r, faviconDataUrl });
            await sharp(Buffer.from(svg, 'utf-8')).webp({ quality: 85 }).toFile(cacheFile);
        })().finally(() => inProgress.delete(cacheKey));
        inProgress.set(cacheKey, job);
    }
    await job;
    AssetHandler.serveImage(res, cacheFile);
}

/** Variante con immagine: sfondo + immagine + favicon + badge titolo. */
async function renderPreviewWithImage(res: Response, ogImageId: string, title: string, onlyImage?: boolean): Promise<void> {
    const absolutePath = resolveAssetPath(ogImageId);
    if (!absolutePath) return void res.status(404).send('Asset not found');

    const filename = absolutePath.split(/[\\/]/).pop()!;
    if (!AssetHandler.isSharpCompatible(filename)) return AssetHandler.serveFile(res, absolutePath);

    const normalizedTitle = ImgBuilderService.normalizeWhitespace(title).slice(0, 100).trim();
    const { version } = ContestoSito.config;
    const hash = createHash('sha1').update(JSON.stringify({ version, id: ogImageId, title: normalizedTitle, onlyImage: !!onlyImage })).digest('hex').slice(0, 16);
    const cacheKey = `preview_img_${hash}.webp`;
    const cacheFile = join(cacheDir, cacheKey);

    if (existsSync(cacheFile)) return AssetHandler.serveImage(res, cacheFile);

    let job = inProgress.get(cacheKey);
    if (!job) {
        job = (async () => {
            const OG_W = 1200, OG_H = 630;

            const bgBuffer = await sharp(absolutePath)
                .resize(OG_W, OG_H, { fit: 'cover' })
                .blur(28)
                .webp({ quality: 50 })
                .toBuffer();

            const fgBuffer = await sharp(absolutePath)
                .resize(OG_W, OG_H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer();

            const composites: sharp.OverlayOptions[] = [{ input: fgBuffer, left: 0, top: 0 }];

            if (!onlyImage) {
                const iconSize = Math.round(OG_H * 0.26);
                const padding = Math.round(iconSize * 0.30);
                const iconLeft = padding;
                const iconTop = OG_H - iconSize - padding;
                const faviconPath = resolveAssetPath('favIcon');
                if (faviconPath) {
                    const iconBuffer = await sharp(faviconPath)
                        .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                        .png()
                        .toBuffer();
                    composites.push({ input: iconBuffer, left: iconLeft, top: iconTop });
                }
                if (normalizedTitle) {
                    const badgeSvg = PreviewBuilder.buildTitleBadge({
                        canvasW: OG_W,
                        canvasH: OG_H,
                        anchorLeft: iconLeft + iconSize + Math.round(iconSize * 0.20),
                        anchorCenterY: iconTop + iconSize / 2,
                        maxRight: OG_W - padding,
                        title: normalizedTitle,
                        bgColor: ContestoSito.config.colorTema,
                        fontSize: 40,
                    });
                    composites.push({ input: Buffer.from(badgeSvg, 'utf-8'), left: 0, top: 0 });
                }
            }

            await sharp(bgBuffer)
                .composite(composites)
                .webp({ quality: 85 })
                .toFile(cacheFile);
        })().finally(() => inProgress.delete(cacheKey));
        inProgress.set(cacheKey, job);
    }
    await job;
    AssetHandler.serveImage(res, cacheFile);
}

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
interface PreviewSvgOptions {
    /** Nome applicazione mostrato nella preview SVG. */
    appName: string;
    /** Titolo principale della preview. */
    title: string;
    /** Sottotitolo opzionale mostrato sotto il titolo. */
    subtitle?: string | null;
    /** Colore di sfondo dell'intera immagine SVG. */
    bgColor: string;
    /** Favicon/logo codificato come data URL SVG/PNG. */
    faviconDataUrl?: string;
    /** Colore principale del testo. */
    textColor?: string;
    /** Larghezza canvas SVG finale. */
    width?: number;
    /** Altezza canvas SVG finale. */
    height?: number;
    /** Font-family globale usato nei text node SVG. */
    fontFamily?: string;
    /** Font-size del nome applicazione. */
    appFontSize?: number;
    /** Font-size del titolo principale. */
    titleFontSize?: number;
    /** Font-size del sottotitolo. */
    subtitleFontSize?: number;
    /** Dimensione quadrata favicon/logo. */
    faviconSize?: number;
    /** Spaziatura verticale tra i blocchi. */
    spacing?: number;
    /** Padding orizzontale interno. */
    horizontalPadding?: number;
    /** Moltiplicatore line-height del titolo. */
    titleLineHeight?: number;
    /** Moltiplicatore line-height del sottotitolo. */
    subtitleLineHeight?: number;
}

interface TitleBadgeOptions {
    /** Larghezza del canvas SVG di output (deve combaciare con la cover OG). */
    canvasW: number;
    /** Altezza del canvas SVG di output. */
    canvasH: number;
    /** X del bordo sinistro del badge (di solito a destra dell'icona favicon). */
    anchorLeft: number;
    /** Y del centro verticale a cui ancorare il badge (di solito il centro dell'icona). */
    anchorCenterY: number;
    /** Limite destro entro cui il badge non può sconfinare. */
    maxRight: number;
    /** Testo del badge (già normalizzato). */
    title: string;
    /** Colore di sfondo del pill; il testo riceve automaticamente il contrasto WCAG. */
    bgColor: string;
    /** Override del font-size (default: FONT_PRIMARY). */
    fontSize?: number;
    /** Padding orizzontale sinistro (default: SPACING_MD). */
    hPadL?: number;
    /** Padding orizzontale destro (default: SPACING_MD). */
    hPadR?: number;
    /** Padding verticale sopra/sotto il testo (default: SPACING_SM). */
    vPad?: number;
    /** Opacità del pill (default: OPACITY_OVERLAY). */
    fillOpacity?: number;
}

class PreviewBuilder {
    // =========================================================
    // DESIGN SYSTEM & TOKENS CONDIVISI
    // =========================================================

    // --- Tipografia ---
    /** Font size per elementi primari (Titolo preview, Testo badge) */
    static readonly FONT_PRIMARY = 40;
    /** Font size per elementi secondari (Sottotitolo, Nome App) */
    static readonly FONT_SECONDARY = 30;
    /** Moltiplicatore line-height universale per tutti i testi multilinea */
    static readonly LINE_HEIGHT = 1.3;

    /** Stima px/char per i calcoli della larghezza dei font SVG (usata in wrapText e calcolo box). */
    static readonly CHAR_WIDTH_RATIO = 0.55;
    /** Offset per spostarsi dalla cima del cap-box alla baseline tipografica nei nodi <text>. */
    static readonly BASELINE_OFFSET_RATIO = 0.8;

    // --- Spaziature (Padding & Margini) ---
    /** Padding verticale ridotto (es. interno verticale del badge) */
    static readonly SPACING_SM = 16;
    /** Spaziatura standard tra i blocchi della preview e padding orizzontale del badge */
    static readonly SPACING_MD = 32;
    /** Padding orizzontale globale del canvas della preview (per evitare bordi troppo vicini) */
    static readonly SPACING_LG = 48;

    // --- Opacità ---
    /** Opacità unificata per testi non principali (Nome App, Sottotitolo) per gerarchia visiva. */
    static readonly OPACITY_TEXT_SECONDARY = 0.75;
    /** Opacità per lo sfondo di elementi in overlay (es. sfondo del badge OG). */
    static readonly OPACITY_OVERLAY = 0.9;

    // --- Dimensioni Specifiche Preview ---
    static readonly CANVAS_WIDTH = 1200;
    static readonly CANVAS_HEIGHT = 630;
    static readonly FAVICON_SIZE = 200;

    // =========================================================
    // LOGICA PREVIEW SVG
    // =========================================================

    /** Risolve tutte le opzioni della preview applicando normalizzazione e fallback ai token del Design System. */
    static resolvePreviewBuilder(opts: PreviewSvgOptions) {
        return {
            appName: ImgBuilderService.normalizeWhitespace(opts.appName),
            title: ImgBuilderService.normalizeWhitespace(opts.title),
            subtitle: ImgBuilderService.normalizeWhitespace(opts.subtitle ?? ''),
            bgColor: opts.bgColor,
            faviconDataUrl: opts.faviconDataUrl ?? '',
            textColor: opts.textColor ?? ImgBuilderService.getReadableTextColor(opts.bgColor),
            width: Math.max(1, Math.ceil(opts.width ?? this.CANVAS_WIDTH)),
            height: Math.max(1, Math.ceil(opts.height ?? this.CANVAS_HEIGHT)),
            fontFamily: opts.fontFamily ?? FontConfig.DEFAULT_SERVER_FONT,
            appFontSize: opts.appFontSize ?? this.FONT_SECONDARY,
            titleFontSize: opts.titleFontSize ?? this.FONT_PRIMARY,
            subtitleFontSize: opts.subtitleFontSize ?? this.FONT_SECONDARY,
            faviconSize: opts.faviconSize ?? this.FAVICON_SIZE,
            spacing: opts.spacing ?? this.SPACING_MD,
            horizontalPadding: opts.horizontalPadding ?? this.SPACING_LG,
            titleLineHeight: opts.titleLineHeight ?? this.LINE_HEIGHT,
            subtitleLineHeight: opts.subtitleLineHeight ?? this.LINE_HEIGHT,
        };
    }

    /** Costruisce una preview SVG completa centrata verticalmente con nome app, favicon, titolo e sottotitolo. */
    static buildPreview(opts: PreviewSvgOptions): { svg: string; width: number; height: number } {
        const r = this.resolvePreviewBuilder(opts);

        // Centro asse X
        const cx = r.width / 2;
        // Spazio massimo in larghezza a disposizione del testo
        const maxWidthPx = r.width - r.horizontalPadding * 2;

        // Calcolo dello step (in pixel) tra una riga e l'altra basato sul line-height
        const titleLineStep = r.titleFontSize * r.titleLineHeight;
        const subtitleLineStep = r.subtitleFontSize * r.subtitleLineHeight;

        const esc = ImgBuilderService.escapeXml;

        // Suddivisione in righe basata sullo spazio orizzontale
        const titleLines = ImgBuilderService.wrapText(r.title, maxWidthPx, r.titleFontSize);
        const subtitleLines = r.subtitle
            ? ImgBuilderService.wrapText(r.subtitle, maxWidthPx, r.subtitleFontSize)
            : [];

        // Calcolo dell'altezza totale del blocco titolo (Font base + N righe aggiuntive)
        const titleBlockHeight = r.titleFontSize + (titleLines.length - 1) * titleLineStep;

        // Calcolo dell'altezza totale del blocco sottotitolo (se presente)
        const subtitleBlockHeight = subtitleLines.length > 0
            ? r.subtitleFontSize + (subtitleLines.length - 1) * subtitleLineStep
            : 0;

        // Altezza cumulativa di tutti gli elementi per poterli centrare verticalmente nel canvas
        const totalHeight = r.appFontSize
            + r.spacing + r.faviconSize
            + r.spacing + titleBlockHeight
            + (subtitleBlockHeight > 0 ? r.spacing + subtitleBlockHeight : 0);

        // Coordinata Y di partenza per centrare in blocco il contenuto
        let topY = (r.height - totalHeight) / 2;

        /** Nodo SVG del nome applicazione (in alto). */
        const appNameEl =
            `<text x="${cx}" y="${topY + r.appFontSize}" font-family="${esc(r.fontFamily)}" font-size="${r.appFontSize}" font-weight="400" fill="${esc(r.textColor)}" text-anchor="middle" opacity="${this.OPACITY_TEXT_SECONDARY}">${esc(r.appName)}</text>`;

        topY += r.appFontSize + r.spacing;

        /** Nodo SVG favicon/logo centrale. Centrato rispetto a X = cx. */
        const faviconEl = r.faviconDataUrl
            ? `<image href="${r.faviconDataUrl}" x="${cx - r.faviconSize / 2}" y="${topY}" width="${r.faviconSize}" height="${r.faviconSize}"/>`
            : '';

        topY += r.faviconSize + r.spacing;

        /** Tspan multilinea del titolo principale. La prima riga ha dy=0, le successive scendono di titleLineStep. */
        const titleTspans = titleLines
            .map((line, i) => `<tspan x="${cx}" dy="${i === 0 ? 0 : titleLineStep}">${esc(line)}</tspan>`)
            .join('');

        /** Nodo SVG del titolo principale. */
        const titleEl =
            `<text x="${cx}" y="${topY + r.titleFontSize}" font-family="${esc(r.fontFamily)}" font-size="${r.titleFontSize}" font-weight="700" fill="${esc(r.textColor)}" text-anchor="middle">${titleTspans}</text>`;

        topY += titleBlockHeight + r.spacing;

        let subtitleEl = '';

        if (subtitleLines.length > 0) {
            /** Tspan multilinea del sottotitolo. */
            const subtitleTspans = subtitleLines
                .map((line, i) => `<tspan x="${cx}" dy="${i === 0 ? 0 : subtitleLineStep}">${esc(line)}</tspan>`)
                .join('');

            /** Nodo SVG del sottotitolo. */
            subtitleEl =
                `<text x="${cx}" y="${topY + r.subtitleFontSize}" font-family="${esc(r.fontFamily)}" font-size="${r.subtitleFontSize}" font-weight="400" fill="${esc(r.textColor)}" text-anchor="middle" opacity="${this.OPACITY_TEXT_SECONDARY}">${subtitleTspans}</text>`;
        }

        /** SVG finale completo di background e raggruppamento nodi. */
        const svg =
            `<?xml version="1.0" encoding="UTF-8"?>` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}" viewBox="0 0 ${r.width} ${r.height}">` +
            `<rect width="${r.width}" height="${r.height}" fill="${esc(r.bgColor)}"/>` +
            appNameEl + faviconEl + titleEl + subtitleEl +
            `</svg>`;

        return { svg, width: r.width, height: r.height };
    }

    // =========================================================
    // LOGICA BADGE SVG
    // =========================================================

    /** Risolve configurazione finale del badge applicando fallback ai token del Design System. */
    private static resolveTitleBadgeBuilder(opts: TitleBadgeOptions) {
        const fontSize = opts.fontSize ?? this.FONT_PRIMARY;
        // Unificato il padding orizzontale destro/sinistro usando la spaziatura media condivisa
        const hPadL = opts.hPadL ?? this.SPACING_MD;
        const hPadR = opts.hPadR ?? this.SPACING_MD;
        const vPad = opts.vPad ?? this.SPACING_SM;

        return {
            ...opts,
            fontSize,
            hPadL,
            hPadR,
            vPad,
            fillOpacity: opts.fillOpacity ?? this.OPACITY_OVERLAY,
            fontFamily: FontConfig.DEFAULT_SERVER_FONT,
            lineStep: fontSize * this.LINE_HEIGHT,
            textColor: ImgBuilderService.getReadableTextColor(opts.bgColor),
        };
    }

    /** Restituisce l'SVG completo (canvas canvasW × canvasH) con il solo pill/badge disegnato. */
    static buildTitleBadge(opts: TitleBadgeOptions): string {
        const r = this.resolveTitleBadgeBuilder(opts);
        const esc = ImgBuilderService.escapeXml;

        // Spazio disponibile per il testo (al netto dei padding orizzontali e del limite destro del canvas).
        const maxTextW = r.maxRight - r.anchorLeft - r.hPadL - r.hPadR;

        /** Righe wrappate del titolo badge. */
        const lines = ImgBuilderService.wrapText(r.title, maxTextW, r.fontSize);

        /** Lunghezza in caratteri della riga più lunga (serve per calcolare la larghezza del rettangolo di sfondo). */
        const longestLen = Math.max(...lines.map(l => l.length));

        /** Altezza del blocco multilinea del testo badge (senza padding). */
        const blockHeight = r.fontSize + (lines.length - 1) * r.lineStep;

        /** Altezza finale del rettangolo del badge/pill (includendo i padding verticali). */
        const badgeH = Math.round(blockHeight + r.vPad * 2);

        /** Larghezza finale del badge, che non deve superare il margine destro impostato (maxRight). 
         *  Si basa sulla costante CHAR_WIDTH_RATIO per stimare la larghezza del testo. */
        const badgeW = Math.round(Math.min(
            longestLen * r.fontSize * this.CHAR_WIDTH_RATIO + r.hPadL + r.hPadR,
            r.maxRight - r.anchorLeft
        ));

        /** Coordinata Y superiore del rettangolo del badge (centrato verticalmente su anchorCenterY). */
        const badgeY = Math.round(r.anchorCenterY - badgeH / 2);

        /** Border radius finale del pill. 
         *  Se è una riga singola forma un semicerchio perfetto sui bordi, 
         *  se è multilinea si limita il raggio per non arrotondare eccessivamente i lati. */
        const radius = Math.round(Math.min(badgeH / 2, r.fontSize / 2 + r.vPad));

        /** Coordinata X iniziale di partenza per scrivere il testo all'interno del badge. */
        const textX = r.anchorLeft + r.hPadL;

        /** Baseline Y della prima riga del testo badge.
         *  Centra verticalmente il blocco testuale nel pill.
         *  Il fattore BASELINE_OFFSET_RATIO (0.8) sposta la Y dalla cima del font-box alla sua baseline tipografica. */
        const firstBaselineY = badgeY + (badgeH - blockHeight) / 2 + r.fontSize * this.BASELINE_OFFSET_RATIO;

        /** Tspan multilinea del testo badge. */
        const tspans = lines
            .map((line, i) => `<tspan x="${textX}" dy="${i === 0 ? 0 : r.lineStep}">${esc(line)}</tspan>`)
            .join('');

        return `<?xml version="1.0" encoding="UTF-8"?>` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="${r.canvasW}" height="${r.canvasH}">` +
            `<rect x="${r.anchorLeft}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="${radius}" fill="${esc(r.bgColor)}" fill-opacity="${r.fillOpacity}"/>` +
            `<text x="${textX}" y="${firstBaselineY}" ` +
            `font-family="${esc(r.fontFamily)}" ` +
            `font-size="${r.fontSize}" font-weight="700" fill="${esc(r.textColor)}" ` +
            `text-anchor="start">${tspans}</text>` +
            `</svg>`;
    }
}