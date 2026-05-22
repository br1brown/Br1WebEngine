/**
 * CONFIGURAZIONE PRINCIPALE - Punto di ingresso Angular
 *
 * Provider Angular: servizi, interceptor, router e PWA.
 * La configurazione del sito vive in `site.ts` ed e' condivisa con gli script di build.
 */

import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';
import { TranslateService } from './core/services/translate.service';
import { SSR_API_PREFIX } from './core/services/base-api.service';
import { isTechnicalConsentGiven } from './core/services/cookie-consent.service';
import { ContestoSito } from './site';

/**
 * Whitelist delle larghezze consentite per l'ottimizzazione immagini.
 * Condivisa tra il frontend (AssetService) e il backend (server.ts).
 */
export const ALLOWED_WIDTHS = [125, 320, 512, 480, 640, 768, 1024, 1080, 1366, 1600, 1920] as const;

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
            // L'injection basta per attivare la logica del tema fin da subito
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
            useValue: '/api',
        },
    ]
};
