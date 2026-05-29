import type { Request, Response } from 'express';
import { join } from 'node:path';
import sharp from 'sharp';
import { ALLOWED_WIDTHS } from '../../../../app.config';
import { cacheDir } from '../server-paths';
import { resolveAssetPath } from '../asset-mapping';
import { AssetHandler } from '../asset-handler';
import { inProgress } from '../image-cache';
import { fileExists } from '../fs-utils';

/**
 * Endpoint CDN Asset: gestisce il recupero e l'ottimizzazione delle immagini al volo.
 * Risolve l'ID nel file sorgente, valida la larghezza contro la whitelist, e serve
 * (o genera al volo) una miniatura WebP in cache. Le richieste concorrenti per la
 * stessa chiave riusano lo stesso job sharp (mappa inProgress).
 */
export async function cdnAssetHandler(req: Request, res: Response): Promise<void> {
    try {
        const id = req.query['id'] as string;
        if (!id) { res.status(400).send('Missing id'); return; }

        const absolutePath = await resolveAssetPath(id);
        if (!absolutePath) { res.status(404).send('Asset not found'); return; }

        // File non-immagine: serve diretto senza elaborazione
        const filename = absolutePath.split(/[\\/]/).pop()!;
        if (!AssetHandler.isSharpCompatible(filename)) { AssetHandler.serveFile(res, absolutePath); return; }

        // Larghezza: usa il massimo consentito se non specificata; rifiuta valori fuori whitelist
        const format = 'webp';
        let requestedWidth = parseInt(req.query['w'] as string);

        /** Gestione larghezza: usa il massimo consentito se omessa, valida contro la whitelist */
        if (isNaN(requestedWidth)) {
            requestedWidth = Math.max(...ALLOWED_WIDTHS);
        } else if (!(ALLOWED_WIDTHS as readonly number[]).includes(requestedWidth)) {
            res.status(400).send(`Invalid width. Allowed: ${ALLOWED_WIDTHS.join(', ')}`);
            return;
        }

        /** Analizza i metadati dell'originale per evitare di ingrandire immagini piccole (pixel sgranati) */
        const metadata = await sharp(absolutePath).metadata();
        const originalWidth = metadata.width || 0;
        const finalWidth = originalWidth < requestedWidth ? originalWidth : requestedWidth;

        /** Chiave cache basata su ID e dimensione: identifica univocamente la miniatura generata */
        const cacheKey = `${id}_w${finalWidth}.${format}`;
        const cacheFile = join(cacheDir, cacheKey);

        /** Se la miniatura esiste già in cache, la serve istantaneamente */
        if (await fileExists(cacheFile)) { AssetHandler.serveImage(res, cacheFile); return; }

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
}
