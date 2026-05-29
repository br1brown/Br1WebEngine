import type { Request, Response } from 'express';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ContestoSito } from '../../../../site';
import { ThemeService } from '../../services/theme.service';
import { ImgBuilderService } from '../../services/img-builder.service';
import { PreviewCrypto } from '../preview-crypto.server';
import { PreviewBuilder } from '../preview-builder';
import { cacheDir } from '../server-paths';
import { resolveAssetPath } from '../asset-mapping';
import { AssetHandler } from '../asset-handler';
import { inProgress } from '../image-cache';
import { fileExists } from '../fs-utils';

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

        const title = String(payload['title'] ?? '').slice(0, 200).trim();
        const subtitle = String(payload['subtitle'] ?? '').slice(0, 300).trim();
        const id = String(payload['id'] ?? '').trim();
        const onlyImage = payload['onlyImage'] === 'true';

        if (!title) { res.status(400).send('Missing title'); return; }

        if (id) { await renderPreviewWithImage(res, id, title, onlyImage); return; }
        await renderPreviewText(res, title, subtitle);
    } catch (err) {
        console.error('[Preview Error]:', err);
        if (!res.headersSent) res.status(500).send('Error generating preview');
    }
}

/** Variante testuale: SVG con app name + favicon + titolo + sottotitolo. */
async function renderPreviewText(res: Response, title: string, subtitle: string): Promise<void> {
    const { colorTema, version, appName } = ContestoSito.config;
    const r = PreviewBuilder.resolvePreviewBuilder({ appName, title, subtitle, bgColor: colorTema });

    const keyData = JSON.stringify({ version, ...r });
    const hash = createHash('sha1').update(keyData).digest('hex').slice(0, 16);
    const cacheKey = `preview_${hash}.webp`;
    const cacheFile = join(cacheDir, cacheKey);

    if (await fileExists(cacheFile)) { AssetHandler.serveImage(res, cacheFile); return; }

    let job = inProgress.get(cacheKey);
    if (!job) {
        job = (async () => {
            let faviconDataUrl = '';
            const faviconPath = await resolveAssetPath('favIcon');
            if (faviconPath) {
                faviconDataUrl = `data:image/png;base64,${(await readFile(faviconPath)).toString('base64')}`;
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
    const absolutePath = await resolveAssetPath(ogImageId);
    if (!absolutePath) { res.status(404).send('Asset not found'); return; }

    const filename = absolutePath.split(/[\\/]/).pop()!;
    if (!AssetHandler.isSharpCompatible(filename)) { AssetHandler.serveFile(res, absolutePath); return; }

    const normalizedTitle = ImgBuilderService.normalizeWhitespace(title).slice(0, 100).trim();
    const { version } = ContestoSito.config;
    const hash = createHash('sha1').update(JSON.stringify({ version, id: ogImageId, title: normalizedTitle, onlyImage: !!onlyImage })).digest('hex').slice(0, 16);
    const cacheKey = `preview_img_${hash}.webp`;
    const cacheFile = join(cacheDir, cacheKey);

    if (await fileExists(cacheFile)) { AssetHandler.serveImage(res, cacheFile); return; }

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
                const faviconPath = await resolveAssetPath('favIcon');
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
                        bgColor: ThemeService.computePalette(ContestoSito.config.colorTema).colorPrimary,
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
