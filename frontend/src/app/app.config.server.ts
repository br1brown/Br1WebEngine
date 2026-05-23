import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideServerRouting, RenderMode, type ServerRoute } from '@angular/ssr';
import { appConfig } from './app.config';
import { ContestoSito } from './site';
import type { SiteRenderMode } from './siteBuilder';
import { SSR_BACKEND_ORIGIN, SSR_API_KEY } from './core/services/base-api.service';
import { SSR_PREVIEW_ENCRYPT_FN, SSR_FRONTEND_ORIGIN } from './core/services/page-meta.service';
import { serverEnv } from '../server-env';
import { PreviewCrypto } from '../preview-crypto.server';

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
    ]
};

/** Esportazione finale: unisce la configurazione base dell'app con quella specifica del server */
export const config: ApplicationConfig =
    mergeApplicationConfig(appConfig, serverConfig);
