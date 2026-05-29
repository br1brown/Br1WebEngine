import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { cacheDir } from './server-paths';

/** Cap massimo della cache immagini su disco (MB → byte). Oltre questa soglia lo sweep
 *  LRU elimina i file meno recenti. Configurabile via IMAGE_CACHE_MAX_MB (default 500). */
const _cacheMaxMb = Number(process.env['IMAGE_CACHE_MAX_MB']);
export const CACHE_MAX_BYTES = (Number.isFinite(_cacheMaxMb) && _cacheMaxMb > 0 ? _cacheMaxMb : 500) * 1024 * 1024;

/** Intervallo dello sweep periodico della cache (6 ore). */
export const CACHE_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Job di generazione miniature attualmente in volo: richieste concorrenti per la stessa chiave
 *  riusano la stessa Promise invece di rilanciare sharp. Condiviso tra le rotte cdn-asset e og-preview. */
export const inProgress = new Map<string, Promise<unknown>>();

/**
 * Sweep LRU della cache immagini. Se la dimensione totale supera CACHE_MAX_BYTES,
 * elimina i file meno recenti (per mtime) finché la cache scende sotto il 90% del cap.
 * Il margine al 90% evita di ri-sweepare a ogni singolo file aggiunto.
 * mtime viene "rinfrescato" a ogni hit (vedi AssetHandler.serveImage), così i file
 * realmente usati sopravvivono e vengono scartati solo i thumbnail dimenticati.
 *
 * Interamente asincrono (fs/promises): lo sweep gira in background su una cache che può
 * contenere centinaia di file, quindi non deve bloccare l'event loop come farebbe la
 * variante sync di readdir/stat/unlink.
 */
export async function pruneImageCache(): Promise<void> {
    try {
        const names = await readdir(cacheDir);
        const stats = await Promise.all(names.map(async (name) => {
            const full = join(cacheDir, name);
            try {
                const st = await stat(full);
                return st.isFile() ? { full, size: st.size, mtime: st.mtimeMs } : null;
            } catch { return null; }
        }));
        const entries = stats.filter((e): e is { full: string; size: number; mtime: number } => e !== null);

        let total = entries.reduce((sum, e) => sum + e.size, 0);
        if (total <= CACHE_MAX_BYTES) return;

        const target = CACHE_MAX_BYTES * 0.9;
        entries.sort((a, b) => a.mtime - b.mtime); // meno recenti per primi

        for (const e of entries) {
            if (total <= target) break;
            try { await unlink(e.full); total -= e.size; } catch { /* già rimosso da un'altra istanza */ }
        }
    } catch (err) {
        console.error('[cache-prune]', err);
    }
}
