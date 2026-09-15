import type { Request, Response } from 'express';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp, { type OverlayOptions } from 'sharp';
import { ContestoSito } from '../../../../site';
import { ThemeService, type PaletteTokens } from '../../services/theme.service';
import { ImgBuilderService } from '../../services/img-builder.service';
import { PreviewCrypto } from '../preview-crypto.server';
import { PreviewBuilder } from '../preview-builder';
import { cacheDir } from '../server-paths';
import { resolveAssetPath } from '../asset-mapping';
import { AssetHandler } from '../asset-handler';
import { defaultBlobUrl, defaultBlobUrlRaw, fetchBackendImage } from '../backend-blob';
import { inProgress, runImageJob } from '../image-cache';
import { recordCacheHit, recordCacheMiss } from '../image-cache-metrics';
import { fileExists } from '../fs-utils';

/** Palette multi-colore del sito: deterministica da config statica, calcolata una sola volta al
 *  load del modulo invece che ad ogni richiesta (anche sui cache-hit). */
const sitePalette: PaletteTokens = ThemeService.computePalette(ContestoSito.config.colorTema, {
    secondary: ContestoSito.config.colorSecondary,
    background: ContestoSito.config.colorBackground,
    text: ContestoSito.config.colorText,
    info: ContestoSito.config.colorInfo,
    customPalette: ContestoSito.config.customPalette,
});

/** Sfondo card con contrasto rinforzato, derivato dalla palette una sola volta. */
const strongBgColor = ImgBuilderService.strongFillColor(sitePalette.colorPrimary);

/** Normalizza gli spazi e tronca il testo entro `max` caratteri. */
function normalizeAndTruncate(text: string, max: number): string {
    const normalized = ImgBuilderService.normalizeWhitespace(text).trim();
    if (normalized.length <= max) return normalized;
    if (max <= 1) return normalized.slice(0, max);
    return normalized.slice(0, max - 1).trim() + '…';
}

/** Endpoint Social Preview: genera al volo l'immagine Open Graph / Twitter Card. */
export async function ogPreviewHandler(req: Request, res: Response): Promise<void> {
    try {
        const blob = String(req.query['p'] ?? '').trim();
        if (!blob) { res.status(400).send('Missing p'); return; }

        let payload: Record<string, string>;
        try {
            payload = PreviewCrypto.decrypt(blob);
        } catch {
            res.status(403).send('Invalid payload');
            return;
        }

        const title = normalizeAndTruncate(String(payload['title'] ?? ''), 200);
        const subtitle = normalizeAndTruncate(String(payload['subtitle'] ?? ''), 300);
        const id = String(payload['id'] ?? '').trim();
        const blobGuid = String(payload['blobGuid'] ?? '').trim();
        const onlyImage = payload['onlyImage'] === 'true';

        // Fallback al nome app se il titolo è vuoto
        const { appName } = ContestoSito.config;
        const effectiveTitle = title || appName;

        // Campi distinti: quale dei due sistemi è in uso emerge da quale è valorizzato (blobGuid
        // vince su entrambi) — stessa forma di OgImageRef in siteBuilder.ts.
        if (id || blobGuid) { await renderPreviewWithImage(res, { id, blobGuid }, effectiveTitle, subtitle, onlyImage); return; }
        await renderPreviewText(res, effectiveTitle, subtitle);
    } catch (err) {
        console.error('[Preview Error]:', err);
        // Fallback alla favicon statica in caso di errore
        if (!res.headersSent) {
            try {
                const faviconPath = await resolveAssetPath('favIcon');
                if (faviconPath) { AssetHandler.serveImage(res, faviconPath); return; }
            } catch { /* best-effort: si cade sul 500 */ }
            res.status(500).send('Error generating preview');
        }
    }
}

/** Variante testuale: genera l'anteprima in SVG. */
async function renderPreviewText(res: Response, title: string, subtitle: string): Promise<void> {
    const { version } = ContestoSito.config;
    const r = PreviewBuilder.resolvePreviewBuilder({ title, subtitle, bgColor: strongBgColor });

    const keyData = JSON.stringify({ version, ...r });
    const hash = createHash('sha1').update(keyData).digest('hex').slice(0, 16);
    // PNG per bordi netti e compatibilità crawler social
    const cacheKey = `preview_${hash}.png`;
    const cacheFile = join(cacheDir, cacheKey);

    if (await fileExists(cacheFile)) { recordCacheHit(); AssetHandler.serveImage(res, cacheFile); return; }
    recordCacheMiss();

    let job = inProgress.get(cacheKey);
    if (!job) {
        job = runImageJob(async () => {
            let faviconDataUrl = '';
            const faviconPath = await resolveAssetPath('favIcon');
            if (faviconPath) {
                faviconDataUrl = `data:image/png;base64,${(await readFile(faviconPath)).toString('base64')}`;
            }
            const { svg } = PreviewBuilder.buildPreview({ ...r, faviconDataUrl });
            await sharp(Buffer.from(svg, 'utf-8')).png({ compressionLevel: 9 }).toFile(cacheFile);
        }).finally(() => inProgress.delete(cacheKey));
        inProgress.set(cacheKey, job);
    }
    await job;
    AssetHandler.serveImage(res, cacheFile);
}

/** Sorgente immagine risolta: un file locale (path su disco) oppure i byte già scaricati dal
 *  backend. `sharp()` accetta entrambi indifferentemente, quindi a valle il flusso è identico. */
type ImageSource = { kind: 'path'; path: string } | { kind: 'buffer'; buffer: Buffer };

/** Stessa forma/precedenza di {@link OgImageRef} (siteBuilder.ts), duplicata qui per non
 *  accoppiare il layer server al bundle Angular. */
type PreviewImageRef = { id: string; blobGuid: string };

/** Risolve il riferimento in una sorgente: `blobGuid` recupera i byte dal backend (un contenuto
 *  dinamico porta così la propria immagine senza registrarla a build time), con fallback
 *  all'originale solo sulla convenzione di default. `id` resta l'asset statico di sempre. */
async function resolveImageSource(ref: PreviewImageRef): Promise<ImageSource | null> {
    if (ref.blobGuid) {
        const override = ContestoSito.config.resolveBlobImageUrl;
        const path = override?.(ref.blobGuid) ?? defaultBlobUrl(ref.blobGuid);
        let buffer = await fetchBackendImage(path);
        if (!buffer && !override) buffer = await fetchBackendImage(defaultBlobUrlRaw(ref.blobGuid));
        return buffer ? { kind: 'buffer', buffer } : null;
    }
    const path = await resolveAssetPath(ref.id);
    return path ? { kind: 'path', path } : null;
}

/** Variante con immagine: sfondo, favicon e badge titolo. */
async function renderPreviewWithImage(res: Response, ref: PreviewImageRef, title: string, subtitle: string, onlyImage?: boolean): Promise<void> {
    const source = await resolveImageSource(ref);
    if (!source) { res.status(404).send('Asset not found'); return; }

    // Se l'asset locale non è rasterizzabile da sharp, viene servito tal quale. Un'immagine
    // recuperata dal backend è sempre trattata come rasterizzabile (foto caricate via blob storage).
    let isSvg = false;
    if (source.kind === 'path') {
        const filename = source.path.split(/[\\/]/).pop()!;
        isSvg = /\.svg$/i.test(filename);
        if (!isSvg && !AssetHandler.isSharpCompatible(filename)) { AssetHandler.serveFile(res, source.path); return; }
    }

    const normalizedTitle = normalizeAndTruncate(title, 100);
    const normalizedSubtitle = normalizeAndTruncate(subtitle, 150);
    const { version } = ContestoSito.config;
    const hash = createHash('sha1').update(JSON.stringify({ version, ref, title: normalizedTitle, subtitle: normalizedSubtitle, onlyImage: !!onlyImage })).digest('hex').slice(0, 16);
    // JPEG per massima compatibilità con le piattaforme social
    const cacheKey = `preview_img_${hash}.jpg`;
    const cacheFile = join(cacheDir, cacheKey);

    if (await fileExists(cacheFile)) { recordCacheHit(); AssetHandler.serveImage(res, cacheFile); return; }
    recordCacheMiss();

    let job = inProgress.get(cacheKey);
    if (!job) {
        job = runImageJob(async () => {
            const OG_W = 1200, OG_H = 630;
            // SVG: densità alta in input così la rasterizzazione resta nitida a 1200x630.
            const inputOpts = isSvg ? { density: 384 } : undefined;
            const sharpSource: string | Buffer = source.kind === 'path' ? source.path : source.buffer;

            const bgBuffer = await sharp(sharpSource, inputOpts)
                .resize(OG_W, OG_H, { fit: 'cover' })
                .blur(28)
                .webp({ quality: 50 })
                .toBuffer();

            const fgBuffer = await sharp(sharpSource, inputOpts)
                .resize(OG_W, OG_H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer();

            const composites: OverlayOptions[] = [{ input: fgBuffer, left: 0, top: 0 }];

            if (!onlyImage) {
                // Posizionamento del chip nell'angolo in alto a sinistra con safe-margin
                const palette = sitePalette;
                const SAFE_MARGIN = PreviewBuilder.SPACING_LG;
                const iconSize = Math.round(OG_H * 0.26);
                const chipPad = Math.round(iconSize * 0.12);
                const chipSize = iconSize + chipPad * 2;
                const chipLeft = SAFE_MARGIN;
                const chipTop = SAFE_MARGIN;
                const iconLeft = chipLeft + chipPad;
                const iconTop = chipTop + chipPad;
                const faviconPath = await resolveAssetPath('favIcon');
                if (faviconPath) {
                    // Chip arrotondato dietro la favicon per garantire contrasto
                    const chipRadius = Math.round(chipSize * 0.18);
                    const chipSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${chipSize}" height="${chipSize}"><rect width="${chipSize}" height="${chipSize}" rx="${chipRadius}" ry="${chipRadius}" fill="${palette.colorBaseLt}" fill-opacity="0.95"/></svg>`;
                    composites.push({ input: Buffer.from(chipSvg, 'utf-8'), left: chipLeft, top: chipTop });

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
                        maxRight: OG_W - SAFE_MARGIN,
                        title: normalizedTitle,
                        subtitle: normalizedSubtitle || undefined,
                        bgColor: strongBgColor,
                        fontSize: 48,
                    });
                    composites.push({ input: Buffer.from(badgeSvg, 'utf-8'), left: 0, top: 0 });
                }
            }

            await sharp(bgBuffer)
                .composite(composites)
                .jpeg({ quality: 85, mozjpeg: true })
                .toFile(cacheFile);
        }).finally(() => inProgress.delete(cacheKey));
        inProgress.set(cacheKey, job);
    }
    try {
        await job;
    } catch (err) {
        // Fallback al file originale se la rasterizzazione SVG non è supportata (solo asset locali:
        // isSvg è true solo quando source.kind === 'path', vedi sopra)
        if (isSvg && source.kind === 'path') { console.warn('[Preview] SVG non rasterizzabile, servo l\'originale:', err); AssetHandler.serveFile(res, source.path); return; }
        // Formato che sharp non decodifica (es. BMP non passato per webopt, file corrotto): una
        // card testuale con titolo/sottotitolo già noti comunica più di un'icona muta o di un 500.
        console.warn('[Preview] Immagine non rasterizzabile, fallback a preview testuale:', err);
        await renderPreviewText(res, title, subtitle);
        return;
    }
    AssetHandler.serveImage(res, cacheFile);
}
