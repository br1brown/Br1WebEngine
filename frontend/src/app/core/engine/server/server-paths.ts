import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { serverEnv } from './server-env';

/** Alias sulla sezione site, valutata al caricamento del modulo. */
const { site } = serverEnv;

/** Individua la cartella dove risiede il codice server eseguito da Node. */
export const serverDistFolder = dirname(fileURLToPath(import.meta.url));

/** Risolve il percorso della cartella 'browser' che contiene gli asset statici finali. */
export const browserDistFolder = resolve(serverDistFolder, '../browser');

/** Definisce la sorgente dei file: usa ASSETS_DIR se impostata, altrimenti la cartella di build. */
export const assetFilesDir = site.assetsDir
    ? resolve(site.assetsDir)
    : join(browserDistFolder, 'assets/files');

/** Percorso della cache per le immagini processate da Sharp. */
export const cacheDir = join(assetFilesDir, 'image-cache');

/**
 * Crea la cartella di cache se non esiste (recursive evita errori se mancano i padri).
 * Resta sincrono: gira una sola volta all'import del modulo, prima che il server
 * accetti richieste — qui bloccare l'event loop è irrilevante e semplifica l'ordine d'avvio.
 */
mkdirSync(cacheDir, { recursive: true });
