import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideServerRouting, RenderMode, type ServerRoute } from '@angular/ssr';
import { appConfig } from './app.config';
import { ContestoSito } from './site';
import type { SiteRenderMode } from './core/engine/siteBuilder';
import { SSR_BACKEND_ORIGIN, SSR_API_KEY } from './core/engine/services/base-api.service';
import { LEGAL_FILE_READER } from './pages/content.resolver';
import { SSR_PREVIEW_ENCRYPT_FN, SSR_FRONTEND_ORIGIN } from './core/engine/services/page-meta.service';
import { serverEnv } from './core/engine/server/server-env';
import { PreviewCrypto } from './core/engine/server/preview-crypto.server';
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
        /**
         * Cifratura sincrona del payload preview (Node.js crypto) — solo SSR.
         * NOTA: useFactory è obbligatorio — useValue non propaga funzioni correttamente
         * in Angular 19 SSR (i due bundle server.mjs e main.server.mjs hanno istanze
         * di modulo separate; useFactory risolve il valore nel contesto DI corretto).
         */
        {
            provide: SSR_PREVIEW_ENCRYPT_FN,
            useFactory: () => (p: Record<string, string>) => PreviewCrypto.encrypt(p),
        },
        /**
         * Origin canonico del frontend da FRONTEND_BASE_URL.
         * Usato da PageMetaService come sorgente di verità per og:image: garantisce https://
         * indipendentemente da come Angular ricostruisce document.URL dall'header proxy.
         * useValue è sufficiente (stringa, non funzione).
         */
        {
            provide: SSR_FRONTEND_ORIGIN,
            useValue: serverEnv.frontendBaseUrl,
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
                    console.warn(`[LEGAL_FILE_READER] File non trovato: assets/legal/${slug}.${lang}.md`);
                    return null;
                }
            },
        },
    ]
};

/** Esportazione finale: unisce la configurazione base dell'app con quella specifica del server */
export const config: ApplicationConfig =
    mergeApplicationConfig(appConfig, serverConfig);
