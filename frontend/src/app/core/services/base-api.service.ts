import { inject, InjectionToken } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpErrorResponse, httpResource } from '@angular/common/http';
import type { HttpResourceRef } from '@angular/common/http';
import { Observable, throwError, firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { NotificationService } from './notification.service';
import { TranslateService } from './translate.service';
import { TokenService } from './auth.service';

/**
 * TOKEN DI INIEZIONE (Dependency Injection)
 * Utilizzati per configurare il comportamento del servizio in base all'ambiente (Browser vs SSR).
 */
// URL assoluto del backend (usato solo lato server)
export const SSR_BACKEND_ORIGIN = new InjectionToken<string>('SSR_BACKEND_ORIGIN');
// Prefisso API (es. /api/v1)
export const SSR_API_PREFIX = new InjectionToken<string>('SSR_API_PREFIX');
// Chiave segreta (usata solo lato server)
export const SSR_API_KEY = new InjectionToken<string>('SSR_API_KEY');

/**
 * CLASSE BASE PER I CLIENT HTTP
 * Centralizza la logica di comunicazione, la gestione degli header e degli errori.
 * Essendo abstract, non può essere istanziata direttamente ma va estesa.
 */
export abstract class BaseApiService {
    // Dipendenze iniettate tramite la funzione inject() (Pattern Angular 14+)
    protected readonly http = inject(HttpClient);
    protected readonly notify = inject(NotificationService);
    protected readonly translate = inject(TranslateService);
    protected readonly tokenService = inject(TokenService);

    // Configurazioni opzionali per SSR
    private readonly ssrOrigin = inject(SSR_BACKEND_ORIGIN, { optional: true });
    private readonly ssrApiPrefix = inject(SSR_API_PREFIX, { optional: true }) ?? '';
    private readonly ssrApiKey = inject(SSR_API_KEY, { optional: true });

    /**
     * Determina l'endpoint finale della richiesta.
     * Gestisce la differenza tra chiamate client-side (relative) e server-side (assolute).
     * @param url - Il path relativo dell'endpoint (es. 'users')
     */
    protected resolveUrl(url: string): string {
        const base = this.ssrOrigin ?? this.ssrApiPrefix ?? '/';
        return BaseApiService.joinUrl(base, url);
    }

    /** Utility statica per concatenare path evitando doppi slash o slash mancanti. */
    private static joinUrl(base: string, path: string): string {
        return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
    }

    /** Esegue un controllo di base sulla raggiungibilità del servizio. */
    getHealth(): Promise<void> {
        return this.api_get<void>('health');
    }

    // ─── METODI HTTP WRAPPER ─────────────────────────────────────────────
    // Forniscono un'interfaccia basata su Promise e automatizzano header ed errori.

    /** Esegue una richiesta GET. */
    protected api_get<T>(url: string, params?: HttpParams): Promise<T> {
        return firstValueFrom(
            this.http.get<T>(this.resolveUrl(url), {
                headers: this.build_api_Headers(),
                params
            }).pipe(catchError(err => this.handleError(err)))
        );
    }

    /** Esegue una richiesta POST inviando un body. */
    protected api_post<T>(url: string, body: unknown): Promise<T> {
        return firstValueFrom(
            this.http.post<T>(this.resolveUrl(url), body, {
                headers: this.build_api_Headers()
            }).pipe(catchError(err => this.handleError(err)))
        );
    }

    /**
     * Versione reattiva di `api_get` — esegue esclusivamente richieste **GET**.
     *
     * Restituisce un `HttpResourceRef<T | undefined>` con i signal `.value()` e `.isLoading`
     * aggiornati automaticamente ogni volta che cambia un segnale reattivo letto
     * all'interno della factory (es. lingua corrente, token).
     *
     * Usa questo metodo per componenti **sempre attivi** (header, footer) che devono
     * rimanere sincronizzati senza richiedere navigazione o trigger manuali.
     * Per chiamate una-tantum usa `api_get`; per mutazioni usa `api_post`.
     *
     * Ottimizzato per SSR: non blocca il rendering durante il recupero dati.
     */
    protected api_resource<T>(url: string, params?: HttpParams): HttpResourceRef<T | undefined> {
        return httpResource<T>(() => ({
            url: this.resolveUrl(url),
            headers: this.build_api_Headers(),
            ...(params ? { params } : {}),
        }));
    }

    // ─── INFRASTRUTTURA E SICUREZZA ───────────────────────────────────────

    /**
     * Costruisce gli header per ogni richiesta.
     * Gestisce dinamicamente: Lingua, API Key (solo SSR) e Token di Autenticazione.
     * @param aggiunte - Eventuali header extra specifici per una singola chiamata.
     */
    protected build_api_Headers(aggiunte?: { [key: string]: string }): HttpHeaders {
        let headers = new HttpHeaders()
            .set('Accept-Language', this.translate.currentLang());

        // Sicurezza: La X-Api-Key viene inclusa solo se siamo in ambiente SSR.
        // Nel browser, l'API Key è gestita dal Reverse Proxy/BFF per non esporla nel codice sorgente.
        if (this.ssrApiKey) {
            headers = headers.set('X-Api-Key', this.ssrApiKey);
        }

        // Aggiunge il Bearer Token se l'utente ha effettuato l'accesso.
        if (this.tokenService.isLoggedIn()) {
            headers = headers.set('Authorization', `Bearer ${this.tokenService.token()}`);
        }

        // Merge di eventuali header aggiuntivi passati come argomento.
        if (aggiunte) {
            for (const key in aggiunte) {
                headers = headers.set(key, aggiunte[key]);
            }
        }

        return headers;
    }

    /**
     * Gestione centralizzata degli errori HTTP.
     * Invia una notifica alla UI e propaga l'errore per logica specifica nei componenti.
     */
    protected handleError(error: HttpErrorResponse): Observable<never> {
        /* Il try-catch garantisce il degrado grazioso: se NotificationService non riesce a mostrare
           l'errore (es. SweetAlert2 non ancora caricato), si cade su console.error senza bloccare il flusso. */
        try {
            this.notify.handleApiError(error.status, error.error);
        } catch {
            console.error('[API Error]', error.status, error.message);
        }
        return throwError(() => error);
    }
}