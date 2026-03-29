/**
 * Genera le icone PWA (192x192 e 512x512) a partire da favicon.png.
 * Richiede sharp (devDependency).
 *
 * Eseguire con:  npx tsx scripts/generate-icons.ts
 * Oppure:        npm run generate:icons
 */

import { existsSync, copyFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const FAVICON = join(ROOT, 'src', 'assets', 'file', 'favicon.png');
const ICONS_DIR = join(ROOT, 'src', 'assets', 'file');
const SIZES = [192, 512];

async function main(): Promise<void> {
    if (!existsSync(FAVICON)) {
        console.warn('[icons] favicon.png non trovata in', FAVICON);
        return;
    }

    try {
        const sharp = (await import('sharp')).default;
        for (const size of SIZES) {
            const dest = join(ICONS_DIR, `icon-${size}x${size}.png`);
            await sharp(FAVICON).resize(size, size).toFile(dest);
            console.log(`[icons] Generata ${size}x${size}: ${dest}`);
        }
    } catch {
        // sharp non disponibile: copia semplice
        for (const size of SIZES) {
            const dest = join(ICONS_DIR, `icon-${size}x${size}.png`);
            if (!existsSync(dest)) {
                copyFileSync(FAVICON, dest);
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
