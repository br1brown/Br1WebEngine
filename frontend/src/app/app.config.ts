/**
 * CONFIGURAZIONE PRINCIPALE - Punto di ingresso Angular
 *
 * Provider Angular: servizi, interceptor, router e PWA.
 * La configurazione del sito vive in `site.ts` ed e' condivisa con gli script di build.
 */

import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { HttpInterceptorFn, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter, TitleStrategy, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { AppTitleStrategy } from './core/services/app-title.strategy';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';
import { TranslateService } from './core/services/translate.service';

const apiPrefix = environment.apiUrl
    ? `${environment.apiUrl.replace(/\/$/, '')}/api`
    : '/api';

/**
 * Aggiunge automaticamente headers a ogni richiesta HTTP verso il backend.
 *
 * PER OGNI RICHIESTA VERSO IL BACKEND:
 *   - Aggiunge l'header "Accept-Language" con la lingua corrente (RFC 9110)
 *   - Aggiunge l'header "X-Api-Key" con la chiave API (da environment.ts)
 *
 * SE L'UTENTE E' AUTENTICATO:
 *   - Aggiunge l'header standard "Authorization: Bearer <token>" (RFC 6750)
 *  Il token JWT viene recuperato da AuthService.token(), che conserva solo token
 *  ben formati e non scaduti lato client. La firma resta validata dal backend.
 *  Se il token e' scaduto o mancante, la richiesta viene inviata senza header di autenticazione.
 **/
const authInterceptor: HttpInterceptorFn = (req, next) => {
    const authService = inject(AuthService);
    const translate = inject(TranslateService);

    // Determina se la richiesta e' diretta al nostro backend
    const isBackendRequest = req.url === apiPrefix || req.url.startsWith(`${apiPrefix}/`);

    if (!isBackendRequest) {
        return next(req);
    }

    let headers = req.headers
        .set('X-Api-Key', environment.apiKey)
        .set('Accept-Language', translate.currentLang());

    // Token JWT standard (Authorization: Bearer)
    const token = authService.token();
    if (token) {
        headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return next(req.clone({ headers }));
};

export const appConfig: ApplicationConfig = {
    providers: [
        provideZoneChangeDetection({ eventCoalescing: true }),
        provideClientHydration(withEventReplay()),

        // `routes` e' il risultato finale della definizione custom delle pagine.
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

        provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
        { provide: TitleStrategy, useClass: AppTitleStrategy },

        /** Inizializzazione app: sessione, traduzioni, tema */
        provideAppInitializer(async () => {
            const translateService = inject(TranslateService);
            const authService = inject(AuthService);
            // L'injection basta per attivare la logica del tema fin da subito.
            inject(ThemeService);

            // I titoli delle pagine nelle route sono chiavi di traduzione.
            // La lingua iniziale va quindi caricata prima che l'app cominci a usarli.
            await translateService.setInitialLanguage();

            // Il ripristino sessione arriva subito dopo, cosi' le pagine protette custom
            // partono gia' con uno stato auth coerente.
            authService.restoreSession();
        }),

        /** PWA: Service Worker ufficiale Angular (solo in produzione) */
        provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
        }),
    ]
};
