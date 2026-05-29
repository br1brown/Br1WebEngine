import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { browserDistFolder, assetFilesDir } from './server-paths';
import { fileExists } from './fs-utils';

/** Tipo per l'entry del JSON: può essere solo il nome file o un oggetto complesso. */
type RawEntry = string | { file: string;[key: string]: unknown };

/** Dizionario ID -> NomeFile reale per nascondere i percorsi fisici agli utenti. */
const assetMapping: Record<string, string> = {};

/**
 * Scansiona vari percorsi per caricare il mapping degli asset (fondamentale per l'engine).
 * Asincrono: l'I/O del JSON non blocca l'event loop, importante perché resolveAssetPath
 * può richiamarlo a runtime (hot-reload) sul percorso di richiesta.
 */
export async function loadAssetMapping(): Promise<boolean> {
    try {
        const mappingPaths = [
            join(browserDistFolder, 'assets/mapping.json'),
            join(process.cwd(), 'src/assets/mapping.json'),
            join(process.cwd(), 'frontend/src/assets/mapping.json')
        ];

        let mappingData: string | null = null;
        for (const p of mappingPaths) {
            if (await fileExists(p)) {
                mappingData = await readFile(p, 'utf-8');
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

/**
 * Risolve un ID asset nel percorso assoluto del file sorgente.
 * Se l'ID non è nel mapping tenta un hot-reload del JSON.
 * Restituisce null se l'ID non esiste o il file manca sul disco.
 */
export async function resolveAssetPath(id: string): Promise<string | null> {
    let filename = assetMapping[id];
    if (!filename) {
        await loadAssetMapping();
        filename = assetMapping[id];
    }
    if (!filename) return null;
    const filePath = join(assetFilesDir, filename);
    return (await fileExists(filePath)) ? filePath : null;
}
