import type { Response } from 'express';
import { utimes } from 'node:fs';
import { lookup as mimeLookup } from 'mime-types';

/** Pattern per identificare asset con hash (es. main.v123.js) per abilitare la cache immutabile. */
export const immutableAssetPattern = /\.[0-9a-f]{16,}\.(?:js|css|woff2?|ttf|eot|svg|png|jpe?g|gif|webp|avif|ico)$/i;

/** Raggruppa le utility per gestire l'invio dei file e il controllo dei formati. */
export class AssetHandler {
    /** Verifica se il file è un'immagine raster (no SVG) supportata per il resize. */
    static isSharpCompatible(filename: string): boolean {
        const mime = mimeLookup(filename);
        if (mime) return mime.startsWith('image/') && mime !== 'image/svg+xml';
        return false;
    }

    /** Spedisce l'immagine al browser impostando il tipo WebP e cache eterna (1 anno). */
    static serveImage(res: Response, path: string): void {
        // Rinfresca mtime (fire-and-forget) per la politica LRU dello sweep: un hit
        // marca il file come "caldo" e lo protegge dall'eviction. L'errore è ininfluente.
        const now = new Date();
        utimes(path, now, now, () => { /* best-effort */ });
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.sendFile(path);
    }

    /** Spedisce un file non-immagine (PDF, ecc) mantenendo il formato originale e cache eterna. */
    static serveFile(res: Response, path: string): void {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.sendFile(path);
    }
}
