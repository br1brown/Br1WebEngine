import { ApplicationConfig, CSP_NONCE, REQUEST_CONTEXT, TransferState, mergeApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { provideServerRendering } from '@angular/platform-server';
import { provideServerRouting, RenderMode, type ServerRoute } from '@angular/ssr';
import { appConfig } from './app.config';
import { ContestoSito } from './site';
import type { SiteRenderMode } from './core/engine/siteBuilder';
import { SSR_BACKEND_ORIGIN, SSR_API_KEY } from './core/engine/services/base-api.service';
import { LEGAL_FILE_READER } from './pages/content.resolver';
import { SSR_PREVIEW_ENCRYPT_FN, SSR_FRONTEND_ORIGIN } from './core/engine/services/page-meta.service';
import { ThemeService } from './core/engine/services/theme.service';
import { serverEnv, getBr1Settings } from './core/engine/server/server-env';
import { PreviewCrypto } from './core/engine/server/preview-crypto.server';
import { LOCALE_CONFIG, LOCALE_STATE_KEY, type LocaleConfig } from './core/engine/services/translate.service';
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
            useValue: serverEnv.backend.origin,
        },
        /** Inietta la chiave API */
        {
            provide: SSR_API_KEY,
            useValue: serverEnv.backend.apiKey,
        },
        /**
         * CSP nonce per-request: passato da Express come requestContext nel catch-all SSR.
         * Angular usa questo valore per stampare nonce="..." su tutti gli <script> inline
         * che genera durante il rendering SSR, eliminando il bisogno di 'unsafe-inline'
         * per script-src. In dev (ng serve) il contesto è null → nonce null → no stamping.
         */
        {
            provide: CSP_NONCE,
            useFactory: () => {
                const ctx = inject(REQUEST_CONTEXT, { optional: true }) as { nonce?: string } | null;
                return ctx?.nonce ?? null;
            },
        },
        /**
         * Iniezione tema nella DOM SSR: eseguita una volta per request prima che Angular
         * serializzzi la pagina. Sostituisce il post-processing regex di injectTheme() in
         * server.ts, permettendo lo streaming diretto senza bufferizzare l'intera risposta.
         */
        provideAppInitializer(() => {
            const doc = inject(DOCUMENT);
            const { colorTema } = ContestoSito.config;
            const palette = ThemeService.computePalette(colorTema);
            const tone = palette.naturalTone;

            // Attributi Bootstrap dark/light su <html>
            doc.documentElement.setAttribute('data-bs-theme', tone);
            doc.documentElement.setAttribute('data-theme-tone', tone);

            // <meta name="theme-color"> light + dark per la barra del browser / PWA
            for (const [media, content] of [
                ['(prefers-color-scheme:light)', palette.colorBaseLt],
                ['(prefers-color-scheme:dark)', palette.colorBaseDk],
            ] as const) {
                const meta = doc.createElement('meta');
                meta.setAttribute('name', 'theme-color');
                meta.setAttribute('media', media);
                meta.setAttribute('content', content);
                doc.head.appendChild(meta);
            }

            // <style id="theme-init"> con CSS vars per entrambi i toni: iniettato prima
            // di qualsiasi render component così Bootstrap legge le variabili correttamente.
            const style = doc.createElement('style');
            style.setAttribute('id', 'theme-init');
            const styleHtml = ThemeService.buildThemeStyleTag(colorTema);
            const openTag = '<style id="theme-init">';
            style.textContent = styleHtml.substring(openTag.length, styleHtml.length - '</style>'.length);
            doc.head.appendChild(style);
        }),
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
            useValue: serverEnv.site.baseUrl,
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
                } catch (err) {
                    // ENOENT è atteso in `ng serve` (nessun dist/browser): il resolver
                    // ricade su HTTP, quindi non è un errore. Logghiamo solo il resto.
                    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
                        console.warn(`[LEGAL_FILE_READER] Lettura fallita per assets/legal/${slug}.${lang}.md`, err);
                    }
                    return null;
                }
            },
        },
        {
            provide: LOCALE_CONFIG,
            useFactory: (transferState: TransferState): LocaleConfig => {
                const s = getBr1Settings();
                const loc = s['Localization'] as Record<string, unknown> | undefined;
                const normLang = (tag: unknown): string | null => {
                    if (typeof tag !== 'string' || !tag.trim()) return null;
                    try { return new Intl.Locale(tag.trim()).language ?? null; } catch { return null; }
                };
                const defaultLang = normLang(loc?.['DefaultLanguage']) ?? 'it';
                const rawLangs = loc?.['SupportedLanguages'] as string[] | undefined;
                const availableLanguages = (rawLangs ?? [defaultLang])
                    .map(normLang)
                    .filter((l): l is string => l !== null);
                const config: LocaleConfig = {
                    defaultLang,
                    availableLanguages: availableLanguages.length > 0 ? availableLanguages : [defaultLang],
                };
                transferState.set(LOCALE_STATE_KEY, config);
                return config;
            },
            deps: [TransferState],
        },
    ]
};

/** Esportazione finale: unisce la configurazione base dell'app con quella specifica del server */
export const config: ApplicationConfig =
    mergeApplicationConfig(appConfig, serverConfig);
