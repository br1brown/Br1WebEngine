import { access } from 'node:fs/promises';

/**
 * Verifica asincrona dell'esistenza di un path senza bloccare l'event loop.
 * Sostituisce existsSync sul percorso di richiesta: un singolo access() non
 * sospende il thread mentre il disco risponde, a differenza della variante sync.
 * Ritorna false su qualsiasi errore (file mancante, permessi, ecc).
 */
export async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}
