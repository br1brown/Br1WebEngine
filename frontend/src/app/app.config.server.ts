import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideServerRouting, RenderMode, type ServerRoute } from '@angular/ssr';
import { appConfig } from './app.config';
import { ContestoSito } from './site';
import type { SiteRenderMode } from './siteBuilder';
import { SSR_BACKEND_ORIGIN, SSR_API_KEY } from './core/services/base-api.service';
import { SSR_PREVIEW_ENCRYPT_FN } from './core/services/page-meta.service';
import { LEGAL_FILE_READER } from './pages/content.resolver';
import { serverEnv } from '../server-env';
import { PreviewCrypto } from '../preview-crypto.server';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

/** Funzione utility: pulisce i percorsi delle rotte per Angular (es: trasforma "/home" in "home") */
const toAngularServerPath = (path: string): string =>
    path === '/' ? '' : path.replace(/^\/+/, '');

/** Funzione di mappatura: trasforma la logica del tuo engine nel formato richiesto da Angular SSR */
function toServerRoute(path: string, renderMode: SiteRenderMode): ServerRoute {
    const normalizedPath = toAngularServerPath(path);
    return {
        path: normalizedPath,
        renderMode: renderMode === 'server' ? RenderMode.Server : RenderMode.Client
    };
}

/** Array delle rotte server: prende le impostazioni da ContestoSito e le converte per Angular */
const serverRoutes: ServerRoute[] = [
    /** Spatola (spread) tutte le pagine definite nella configurazione del tuo sito */
    ...ContestoSito.serverRenderEntries.map(({ path, renderMode }) =>
        toServerRoute(path, renderMode)
    ),
    /** Wildcard: tutto ci che non  mappato esplicitamente viene gestito solo dal browser (Client Side) */
    {
        path: '**',
        renderMode: RenderMode.Client
    }
];

/** Configurazione specifica per il lato Server */
const serverConfig: ApplicationConfig = {
    providers: [
        /** Abilita i servizi necessari per far girare Angular su Node.js */
        provideServerRendering(),
        /** Applica la strategia di rendering (Prerender/Server/Client) definita sopra */
        provideServerRouting(serverRoutes),
        /** Inietta l'URL del backend: il server ha bisogno dell'indirizzo completo */
        {
            provide: SSR_BACKEND_ORIGIN,
            useValue: serverEnv.backendOrigin,
        },
        /** Inietta la chiave API */
        {
            provide: SSR_API_KEY,
            useValue: serverEnv.backendApiKey,
        },
        /** Cifratura sincrona del payload preview (Node.js crypto) — solo SSR */
        {
            provide: SSR_PREVIEW_ENCRYPT_FN,
            useValue: (p: Record<string, string>) => PreviewCrypto.encrypt(p),
        },
        /** Legge i file .md delle policy da disco, evitando la chiamata HTTP loopback in SSR */
        {
            provide: LEGAL_FILE_READER,
            useValue: async (slug: string, lang: string): Promise<string | null> => {
                try {
                    return await readFile(
                        join(browserDistFolder, 'assets', 'legal', `${slug}.${lang}.md`),
                        'utf-8'
                    );
                } catch {
                    return null;
                }
            },
        },
    ]
};

/** Esportazione finale: unisce la configurazione base dell'app con quella specifica del server */
export const config: ApplicationConfig =
    mergeApplicationConfig(appConfig, serverConfig);
