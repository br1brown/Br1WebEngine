/**
 * Config Angular (punto d'ingresso): provider di servizi, interceptor, router e PWA.
 * La struttura del sito vive in `site.ts` (condivisa con gli script di build).
 */

import { ApplicationConfig, ErrorHandler, TransferState, inject, isDevMode, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideClientHydration, withEventReplay, withIncrementalHydration } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { routes } from './core/engine/routing';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/engine/services/theme.service';
import { TranslateService } from './core/engine/services/translate.service';
import { SSR_API_PREFIX } from './core/engine/services/base-api.service';
import { apiErrorInterceptor } from './core/engine/interceptors/api-error.interceptor';
import { isTechnicalOptionalConsentGiven } from './core/engine/services/cookie-consent.service';
import { ClientErrorReportingService } from './core/engine/services/client-error-reporting.service';
import { ContestoSito } from './site';
import { SITE_CONFIG } from './core/engine/siteBuilder';
import { SHELL_NAV_RESOLVER, ShellNavService } from './core/engine/services/shell-nav.service';
import { navResolver } from './nav';
import { LOCALE_CONFIG, LOCALE_STATE_KEY, type LocaleConfig } from './core/engine/services/translate.service';
import { APP_CUSTOM, CUSTOM_STATE_KEY, type AppCustom } from './core/engine/app-custom';
import { API_PREFIX } from './core/engine/asset-config';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
    providers: [
        // Zoneless: niente zone.js. La change detection è guidata dai signal e dagli
        // eventi gestiti da Angular (template/host). L'app è interamente signal-based.
        provideZonelessChangeDetection(),
        // Idratazione incrementale: i blocchi `@defer (hydrate ...)` vengono comunque
        // renderizzati dall'SSR (SEO invariata) ma idratati solo al trigger — sotto,
        // l'event replay conserva i click avvenuti prima dell'idratazione.
        provideClientHydration(withEventReplay(), withIncrementalHydration()),

        provideRouter(
            routes,
            // Collega piu' facilmente input componente e stato router.
            withComponentInputBinding(),
            // Gestisce il ripristino scroll quando si passa tra pagine diverse del sito.
            withInMemoryScrolling({
                scrollPositionRestoration: 'enabled',
                anchorScrolling: 'enabled'
            }),
            // Transizioni di pagina (View Transitions API). Progressive enhancement + off sotto
            // prefers-reduced-motion (base/_a11y.scss). skipInitialTransition: il primo load non è
            // una transizione "tra pagine" — senza, cross-fade dallo stato-shell non risolto →
            // sfarfallio su home full-bleed.
            withViewTransitions({ skipInitialTransition: true })
        ),

        // HttpClient con supporto fetch (migliore performance/compatibilità) e l'interceptor
        // che normalizza gli errori HTTP in ApiError e li notifica in automatico (opt-out via
        // { silent: true } per chi ha una UI d'errore propria, es. il login).
        provideHttpClient(withFetch(), withInterceptors([apiErrorInterceptor])),

        /** Inizializzazione app: sessione, traduzioni, tema */
        provideAppInitializer(async () => {
            const translateService = inject(TranslateService);
            const authService = inject(AuthService);
            // inject() PRIMA di ogni await: dopo il primo, l'injection context non è più garantito.
            const shellNavService = inject(ShellNavService);
            // Istanzia ThemeService subito così il listener prefersReducedMotion
            // è attivo prima che i componenti inizino a leggerne il signal.
            inject(ThemeService);

            // I titoli delle pagine nelle route sono chiavi di traduzione
            // La lingua iniziale va quindi caricata prima che l'app cominci a usarli
            await translateService.setInitialLanguage();

            // Navigazione di header/footer (ShellNavService): attesa qui, PRIMA che un componente
            // si costruisca — NavbarComponent la legge anche in un field initializer sincrono
            // (altroDropdownIndex), deve già essere pronta al primo render, non arrivare dopo.
            await shellNavService.resolve(translateService.currentLang());

            // Il ripristino sessione arriva subito dopo, cosi' le pagine protette custom
            // partono gia' con uno stato auth coerente
            authService.restoreSession();
        }),

        /** PWA: abilitato solo se isWebApp, fuori da devMode e con consenso tecnico già salvato.
         *  Al primo accesso è disabilitato; CookieConsentService.applyConsent() lo registra
         *  nella stessa sessione dopo l'accettazione, e da qui in poi parte integrato. */
        provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode() && ContestoSito.config.isWebApp && isTechnicalOptionalConsentGiven(),
            registrationStrategy: 'registerWhenStable:30000'
        }),
        // Segnala al backend (diagnostics/ui-fault → IErrorReportingService) ogni eccezione JS non
        // gestita nel browser. No-op di rete finché il webhook non è configurato (§ ErrorReporting
        // in global-settings.local.json) e comunque spento in sviluppo — vedi il servizio.
        { provide: ErrorHandler, useClass: ClientErrorReportingService },
        {
            provide: SSR_API_PREFIX,
            useValue: API_PREFIX,
        },
        {
            provide: SITE_CONFIG,
            useValue: ContestoSito.config,
        },
        {
            provide: SHELL_NAV_RESOLVER,
            useValue: navResolver,
        },
        {
            provide: LOCALE_CONFIG,
            useFactory: (transferState: TransferState): LocaleConfig => {
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
                // usa la configurazione generata a build time da generate-statics.ts
                return normalize(environment as LocaleConfig);
            },
            deps: [TransferState],
        },
        {
            // Sezione `Custom` serializzata dall'SSR: la rileggiamo in idratazione.
            // Senza SSR (ng serve / client diretto) la chiave non c'è → fallback `{}`.
            provide: APP_CUSTOM,
            useFactory: (transferState: TransferState): AppCustom =>
                transferState.hasKey(CUSTOM_STATE_KEY) ? transferState.get(CUSTOM_STATE_KEY, {}) : {},
            deps: [TransferState],
        },
    ]
};
