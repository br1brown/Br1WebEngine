/**
 * CONFIGURAZIONE PRINCIPALE - Punto di ingresso Angular
 *
 * Provider Angular: servizi, interceptor, router e PWA.
 * La configurazione del sito vive in `site.ts` ed e' condivisa con gli script di build.
 */

import { ApplicationConfig, TransferState, inject, isDevMode, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/engine/services/theme.service';
import { TranslateService } from './core/engine/services/translate.service';
import { SSR_API_PREFIX } from './core/engine/services/base-api.service';
import { isTechnicalConsentGiven } from './core/engine/services/cookie-consent.service';
import { ContestoSito } from './site';
import { LOCALE_CONFIG, LOCALE_STATE_KEY, type LocaleConfig } from './core/engine/locale-config.token';

/**
 * Whitelist delle larghezze consentite per l'ottimizzazione immagini.
 * Condivisa tra il frontend (AssetService) e il backend (server.ts).
 */
export const ALLOWED_WIDTHS = [125, 320, 512, 480, 640, 768, 1024, 1080, 1366, 1600, 1920] as const;

/** Prefisso del proxy API: unica fonte di verità per server.ts (proxy Express) e il DI Angular (browser) */
export const API_PREFIX = '/api';

/**
 * Tipo derivato dalla whitelist per l'utilizzo nei parametri dei componenti/servizi.
 */
export type AssetWidth = typeof ALLOWED_WIDTHS[number];

export const appConfig: ApplicationConfig = {
    providers: [
        provideZoneChangeDetection({ eventCoalescing: true }),
        provideClientHydration(withEventReplay()),

        provideRouter(
            routes,
            // Collega piu' facilmente input componente e stato router.
            withComponentInputBinding(),
            // Gestisce il ripristino scroll quando si passa tra pagine diverse del sito.
            withInMemoryScrolling({
                scrollPositionRestoration: 'enabled',
                anchorScrolling: 'enabled'
            })
        ),

        // HttpClient con supporto fetch: migliore performance, compatibilità e gestione errori
        provideHttpClient(withFetch()),

        /** Inizializzazione app: sessione, traduzioni, tema */
        provideAppInitializer(async () => {
            const translateService = inject(TranslateService);
            const authService = inject(AuthService);
            // Istanzia ThemeService subito così il listener prefersReducedMotion
            // è attivo prima che i componenti inizino a leggerne il signal.
            inject(ThemeService);

            // I titoli delle pagine nelle route sono chiavi di traduzione
            // La lingua iniziale va quindi caricata prima che l'app cominci a usarli
            await translateService.setInitialLanguage();

            // Il ripristino sessione arriva subito dopo, cosi' le pagine protette custom
            // partono gia' con uno stato auth coerente
            authService.restoreSession();
        }),

        /** PWA: abilitato solo se isWebApp, fuori da devMode e con consenso tecnico già salvato.
         *  Al primo accesso è disabilitato; CookieConsentService.applyConsent() lo registra
         *  nella stessa sessione dopo l'accettazione, e da qui in poi parte integrato. */
        provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode() && ContestoSito.config.isWebApp && isTechnicalConsentGiven(),
            registrationStrategy: 'registerWhenStable:30000'
        }),
        {
            provide: SSR_API_PREFIX,
            useValue: API_PREFIX,
        },
        {
            provide: LOCALE_CONFIG,
            useFactory: (transferState: TransferState, doc: Document): LocaleConfig => {
                const normLang = (tag: unknown): string | null => {
                    if (typeof tag !== 'string' || !tag.trim()) return null;
                    try { return new Intl.Locale(tag.trim()).language ?? null; } catch { return null; }
                };
                const normalize = (raw: LocaleConfig): LocaleConfig => {
                    const defaultLang = normLang(raw.defaultLang) ?? 'it';
                    const langs = (raw.availableLanguages ?? [defaultLang])
                        .map(normLang)
                        .filter((l): l is string => l !== null);
                    return { defaultLang, availableLanguages: langs.length > 0 ? langs : [defaultLang] };
                };

                // Caso normale (SSR): il server ha già serializzato la config in TransferState.
                if (transferState.hasKey(LOCALE_STATE_KEY)) {
                    return normalize(transferState.get(LOCALE_STATE_KEY, { defaultLang: 'it', availableLanguages: ['it'] }));
                }
                // Fallback per ng serve e route RenderMode.Client navigate direttamente:
                // generate-statics.ts scrive la config in <meta name="br1-locale"> da br1engine.json.
                try {
                    const content = doc.querySelector('meta[name="br1-locale"]')?.getAttribute('content');
                    if (content) return normalize(JSON.parse(content) as LocaleConfig);
                } catch { }
                // Ultima risorsa: se index.html non è stato aggiornato da generate-statics.ts.
                if (isDevMode()) {
                    console.warn('[LOCALE_CONFIG] TransferState vuoto e <meta br1-locale> assente — usando fallback. Eseguire: npm run generate:statics');
                }
                return { defaultLang: 'it', availableLanguages: ['it'] };
            },
            deps: [TransferState, DOCUMENT],
        },
    ]
};
