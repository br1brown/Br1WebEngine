import { inject, InjectionToken } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpErrorResponse, httpResource } from '@angular/common/http';
import type { HttpResourceRef } from '@angular/common/http';
import { Observable, throwError, firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { NotificationService } from './notification.service';
import { TranslateService } from './translate.service';
import { TokenService } from './auth.service';

export const SSR_BACKEND_ORIGIN = new InjectionToken<string>('SSR_BACKEND_ORIGIN');
export const SSR_API_PREFIX = new InjectionToken<string>('SSR_API_PREFIX');
export const SSR_API_KEY = new InjectionToken<string>('SSR_API_KEY');

/**
 * Classe base per i client HTTP del progetto.
 * Fornisce l'infrastruttura condivisa: headers, error handling e health check.
 *
 * Estendere questa classe in ApiService (o in servizi specializzati)
 * per aggiungere gli endpoint specifici del progetto tramite
 * this.get<T>() e this.post<T>().
 */
export abstract class BaseApiService {
    protected readonly http = inject(HttpClient);
    protected readonly notify = inject(NotificationService);
    protected readonly translate = inject(TranslateService);
    protected readonly tokenService = inject(TokenService);
    private readonly ssrOrigin = inject(SSR_BACKEND_ORIGIN, { optional: true });
    private readonly ssrApiPrefix = inject(SSR_API_PREFIX, { optional: true }) ?? '';
    private readonly ssrApiKey = inject(SSR_API_KEY, { optional: true });

    /**
     * Risolve l'URL in base al contesto di esecuzione:
     * - Browser: /api/social  → il proxy Node aggiunge X-Api-Key e fa strip del prefisso
     * - SSR:     http://backend:8080/social → chiamata diretta, X-Api-Key aggiunta da build_api_Headers
     */
    protected resolveUrl(url: string): string {
        const base = this.ssrOrigin ?? this.ssrApiPrefix ?? '/';
        return BaseApiService.joinUrl(base, url);
    }

    private static joinUrl(base: string, path: string): string {
        return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
    }

    /** Verifica che il backend sia raggiungibile. */
    getHealth(): Promise<void> {
        return this.api_get<void>('health');
    }

    // ─── Metodi HTTP protetti ─────────────────────────────────────────────
    // Le sottoclassi li usano per implementare i propri endpoint.

    protected api_get<T>(url: string, params?: HttpParams): Promise<T> {
        return firstValueFrom(
            this.http.get<T>(this.resolveUrl(url), { headers: this.build_api_Headers(), params })
                .pipe(catchError(err => this.handleError(err)))
        );
    }

    protected api_post<T>(url: string, body: unknown): Promise<T> {
        return firstValueFrom(
            this.http.post<T>(this.resolveUrl(url), body, { headers: this.build_api_Headers() })
                .pipe(catchError(err => this.handleError(err)))
        );
    }

    /**
     * Crea un httpResource SSR-compatibile. Usare al posto di resource() per le pagine
     * con renderMode:'server': httpResource integra con PendingTasks e TransferState,
     * evitando il hang di SSR causato da resource() sperimentale in Angular 19.
     */
    protected api_resource<T>(url: string, params?: HttpParams): HttpResourceRef<T | undefined> {
        return httpResource<T>(() => ({
            url: this.resolveUrl(url),
            headers: this.build_api_Headers(),
            ...(params ? { params } : {}),
        }));
    }

    // ─── Infrastruttura ──────────────────────────────────────────────────

    protected build_api_Headers(aggiunte?: { [key: string]: string }): HttpHeaders {
        // X-Api-Key solo in SSR: le chiamate browser passano per il proxy Node che la aggiunge,
        // evitando di esporre il segreto nel bundle JS scaricato dal browser.
        let headers = new HttpHeaders()
            .set('Accept-Language', this.translate.currentLang());

        if (this.ssrApiKey)
            headers = headers.set('X-Api-Key', this.ssrApiKey);

        if (this.tokenService.isLoggedIn())
            headers = headers.set('Authorization', `Bearer ${this.tokenService.token()}`);

        if (aggiunte) {
            for (const key in aggiunte) {
                headers = headers.set(key, aggiunte[key]);
            }
        }

        return headers;
    }

    /** Notifica l'utente e ri-lancia l'errore per eventuali handler a monte. */
    protected handleError(error: HttpErrorResponse): Observable<never> {
        this.notify.handleApiError(error.status, error.error);
        return throwError(() => error);
    }
}
