/**
 * Genera le icone PWA (192x192 e 512x512) a partire dal favicon definito in mapping.json.
 * Output: public/icons/ (file generati, non tracciati da git)
 *
 * Eseguire con:  npx tsx scripts/generate-icons.ts
 * Oppure:        npm run generate:icons
 */

import { existsSync, copyFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT       = join(__dirname, '..');
const ASSETS_DIR = join(ROOT, 'src', 'assets', 'files');
const ICONS_DIR  = join(ROOT, 'public', 'icons');
const SIZES      = [192, 512];

type RawMappingEntry = string | { file: string; [key: string]: unknown };

function resolveFaviconPath(): string {
    const mappingPath = join(ROOT, 'src', 'assets', 'mapping.json');
    const raw = JSON.parse(readFileSync(mappingPath, 'utf-8')) as Record<string, RawMappingEntry>;
    const entry = raw['favIcon'];
    if (!entry) throw new Error('[icons] Chiave "favIcon" non trovata in mapping.json');
    const filename = typeof entry === 'string' ? entry : entry.file;
    return join(ASSETS_DIR, filename);
}

async function main(): Promise<void> {
    const faviconPath = resolveFaviconPath();

    if (!existsSync(faviconPath)) {
        console.warn('[icons] favicon non trovata in', faviconPath);
        return;
    }

    mkdirSync(ICONS_DIR, { recursive: true });

    try {
        const sharp = (await import('sharp')).default;
        for (const size of SIZES) {
            const dest = join(ICONS_DIR, `icon-${size}x${size}.png`);
            await sharp(faviconPath).resize(size, size).toFile(dest);
            console.log(`[icons] Generata ${size}x${size}: ${dest}`);
        }
    } catch {
        for (const size of SIZES) {
            const dest = join(ICONS_DIR, `icon-${size}x${size}.png`);
            if (!existsSync(dest)) {
                copyFileSync(faviconPath, dest);
                console.log(`[icons] Copiata favicon come ${size}x${size} (installa sharp per resize): ${dest}`);
            } else {
                console.log(`[icons] ${size}x${size} gia' presente: ${dest}`);
            }
        }
    }
}

main().catch(err => {
    console.error('[icons] ERRORE:', err);
    process.exit(1);
});
