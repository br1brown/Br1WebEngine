import { ErrorHandler, Injectable, PLATFORM_ID, inject, isDevMode } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BaseApiService } from './base-api.service';

/**
 * CLIENT ERROR REPORTING SERVICE
 *
 * `ErrorHandler` globale: cattura ogni eccezione JavaScript non gestita nel browser e la inoltra
 * a `POST diagnostics/ui-fault`, che il backend accoda allo stesso `IErrorReportingService` (webhook
 * generico, spento finché non configuri un URL — vedi `global-settings.local.json` §
 * `ErrorReporting`) già usato per i bug lato API: un solo canale di allerta, non due sistemi.
 *
 * Estende `BaseApiService` (non lo consuma via un `ApiService` di progetto) proprio per restare
 * nell'Engine: risoluzione URL/SSR e header sono già lì, non serve reinventarli né dipendere da
 * codice di Dominio.
 *
 * IMPORTANTE — app zoneless (`provideZonelessChangeDetection`): senza zone.js, `ErrorHandler` da
 * solo intercetta solo gli errori sollevati DENTRO l'esecuzione che Angular già traccia (template,
 * `effect`, HttpClient) — un errore in un `setTimeout` nudo, in un listener DOM aggiunto a mano o
 * in uno script di terze parti sfuggirebbe del tutto, silenzioso (verificato: senza i listener
 * `window` sotto, un errore fuori da un contesto Angular non arriva mai a `handleError`). Da qui i
 * listener `error`/`unhandledrejection` in aggiunta, non alternativi — coprono insieme tutta la
 * superficie, senza doppioni: un errore che Angular già gestisce con try/catch interno non risale
 * mai fino a diventare un evento `window` non gestito.
 *
 * Non consumo di rete aggiunto se il webhook non è configurato: il backend risponde comunque 202
 * ma non fa nulla (`IErrorReportingService.IsEnabled` false) — l'unico costo è una POST innocua
 * per ogni errore reale, mai per traffico normale. Spento anche in sviluppo (`isDevMode()`): un
 * errore mentre iteri in locale non deve spammare un webhook di produzione.
 */
@Injectable({ providedIn: 'root' })
export class ClientErrorReportingService extends BaseApiService implements ErrorHandler {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    constructor() {
        super();
        if (!this.isBrowser) return; // SSR: niente `window`, e un errore lì è già nei log del processo server.

        window.addEventListener('error', event => this.report(event.error ?? event.message));
        window.addEventListener('unhandledrejection', event => this.report(event.reason));
    }

    /** Chiamato da Angular per gli errori che già traccia (template, `effect`, HttpClient). */
    handleError(error: unknown): void {
        this.report(error);
    }

    /** Punto unico: log in console (mai silenziato, come il default di Angular) + segnalazione al
     *  backend, usato sia da `handleError` sia dai listener `window` nel costruttore. */
    private report(error: unknown): void {
        console.error(error);

        if (!this.isBrowser || isDevMode()) return;

        const err = error instanceof Error ? error : undefined;
        const message = err?.message ?? String(error);

        // Ignora gli "Script error" anonimi (CORS) dovuti a script di terze parti (es. Ads, Analytics)
        // per non spammare il webhook di errori non azionabili e senza stacktrace.
        if (message === 'Script error.') return;

        const body = {
            message,
            exceptionType: err?.name,
            path: location.pathname,
            stackTrace: err?.stack,
        };

        // Fire-and-forget, silent: un errore nel segnalare un errore non deve mai propagarne un
        // altro (rientrerebbe qui stesso) né mostrare un toast per una chiamata di telemetria.
        void this.api_post('diagnostics/ui-fault', body, { silent: true }).catch(() => { });
    }
}
