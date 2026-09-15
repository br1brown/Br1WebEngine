import { RenderMode, provideServerRendering, type ServerRoute, withRoutes } from '@angular/ssr';
import { ApplicationConfig, CSP_NONCE, REQUEST_CONTEXT, TransferState, mergeApplicationConfig, inject, provideAppInitializer, DOCUMENT } from '@angular/core';

import { appConfig } from './app.config';
import { ContestoSito } from './site';
import type { SiteRenderMode } from './core/engine/siteBuilder';
import { SSR_BACKEND_ORIGIN, SSR_API_KEY } from './core/engine/services/base-api.service';
import { LEGAL_FILE_READER } from './core/engine/pages/content.resolver';
import { SSR_PREVIEW_ENCRYPT_FN, SSR_FRONTEND_ORIGIN } from './core/engine/services/page-meta.service';
import { ThemeService } from './core/engine/services/theme.service';
import { serverEnv, getBr1Settings } from './core/engine/server/server-env';
import { PreviewCrypto } from './core/engine/server/preview-crypto.server';
import { LOCALE_CONFIG, LOCALE_STATE_KEY, type LocaleConfig } from './core/engine/services/translate.service';
import { APP_CUSTOM, CUSTOM_STATE_KEY, type AppCustom } from './core/engine/app-custom';
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
    providers: [provideServerRendering(withRoutes(serverRoutes)), {
            provide: SSR_BACKEND_ORIGIN,
            useValue: serverEnv.backend.origin,
        }, {
            provide: SSR_API_KEY,
            useValue: serverEnv.backend.apiKey,
        }, {
            provide: CSP_NONCE,
            useFactory: () => {
                const ctx = inject(REQUEST_CONTEXT, { optional: true }) as { nonce?: string } | null;
                return ctx?.nonce ?? null;
            },
        }, provideAppInitializer(() => {
            const doc = inject(DOCUMENT);
            // Stesso nonce del provider CSP_NONCE sopra: qui serve esplicito perché il tag è
            // creato via DOM nativo (doc.createElement), non via Renderer2 — Angular applica il
            // nonce in automatico solo agli elementi che crea lui (es. gli <style> di encapsulation).
            const cspNonce = inject(CSP_NONCE, { optional: true });
            const { colorTema, colorSecondary, colorBackground, colorText, colorInfo, forceThemeTone, navSurface } = ContestoSito.config;
            const overrides = { secondary: colorSecondary, background: colorBackground, text: colorText, info: colorInfo };
            const palette = ThemeService.computePalette(colorTema, overrides);
            const tone = forceThemeTone ?? palette.naturalTone;

            // Attributi Bootstrap dark/light su <html>
            doc.documentElement.setAttribute('data-bs-theme', tone);
            doc.documentElement.setAttribute('data-theme-tone', tone);

            // <meta name="theme-color">: un solo meta senza media se il tono è forzato (coerente
            // col resto della pagina), altrimenti light + dark per la barra del browser / PWA.
            const themeColorEntries: readonly [string | null, string][] = forceThemeTone
                ? [[null, forceThemeTone === 'light' ? palette.colorBaseLt : palette.colorBaseDk]]
                : [
                    ['(prefers-color-scheme:light)', palette.colorBaseLt],
                    ['(prefers-color-scheme:dark)', palette.colorBaseDk],
                ];
            for (const [media, content] of themeColorEntries) {
                const meta = doc.createElement('meta');
                meta.setAttribute('name', 'theme-color');
                if (media) meta.setAttribute('media', media);
                meta.setAttribute('content', content);
                doc.head.appendChild(meta);
            }

            // <style id="theme-init"> con CSS vars per entrambi i toni (o uno solo se forzato):
            // iniettato prima di qualsiasi render component così Bootstrap legge le variabili
            // correttamente.
            const style = doc.createElement('style');
            style.setAttribute('id', 'theme-init');
            if (cspNonce) style.setAttribute('nonce', cspNonce);
            const styleHtml = ThemeService.buildThemeStyleTag(colorTema, overrides, forceThemeTone, navSurface);
            const openTag = '<style id="theme-init">';
            style.textContent = styleHtml.substring(openTag.length, styleHtml.length - '</style>'.length);
            doc.head.appendChild(style);
        }), {
            provide: SSR_PREVIEW_ENCRYPT_FN,
            useFactory: () => (p: Record<string, string>) => PreviewCrypto.encrypt(p),
        }, {
            provide: SSR_FRONTEND_ORIGIN,
            useValue: serverEnv.site.baseUrl,
        }, {
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
        }, {
            provide: LOCALE_CONFIG,
            useFactory: (transferState: TransferState): LocaleConfig => {
                // Codici lingua dichiarati in global-settings.json (Localization): seed sincrono per la
                // risoluzione lingua (routing, hreflang, sitemap). I nomi nativi e i primitivi di
                // cultura (BCP-47, giorni) li deriva il frontend via Intl (LocalizationService).
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
        }, {
            // `Custom` letta dal file lato server.
            provide: APP_CUSTOM,
            useFactory: (): AppCustom => {
                const raw = getBr1Settings()['Custom'];
                return (raw && typeof raw === 'object') ? raw as AppCustom : {};
            },
        },
        // Serializza `Custom` in TransferState per il browser. L'app-initializer forza il set:
        // il solo useFactory è lazy e senza un consumer non girerebbe.
        provideAppInitializer(() => {
            inject(TransferState).set(CUSTOM_STATE_KEY, inject(APP_CUSTOM));
        })]
};

/** Esportazione finale: unisce la configurazione base dell'app con quella specifica del server */
export const config: ApplicationConfig =
    mergeApplicationConfig(appConfig, serverConfig);
