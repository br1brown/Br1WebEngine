import { inject, InjectionToken } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpErrorResponse, httpResource } from '@angular/common/http';
import type { HttpResourceRef } from '@angular/common/http';
import { Observable, throwError, firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { NotificationService } from './notification.service';
import { TranslateService } from './translate.service';
import { TokenService } from './token.service';

/** 
 * Interfaccia basata sullo standard RFC 9457 (Problem Details for HTTP APIs)
 * Molti framework moderni (ASP.NET Core, Spring, NestJS) usano questo formato.
 */
export interface ProblemDetails {
    type?: string;
    title?: string;
    status?: number;
    detail?: string;
    instance?: string;
    errors?: string[] | Record<string, string[]>;
}

/**
 * Errore applicativo normalizzato propagato dai metodi API.
 *
 * I wrapper (`api_get`, `api_post`, ...) catturano l'`HttpErrorResponse` grezzo di Angular
 * e lo ri-lanciano sempre come `ApiError`: un tipo stabile che espone lo `status` HTTP e gli
 * eventuali `ProblemDetails` (RFC 9457) del backend, così i chiamati possono mappare gli stati
 * (es. 401 → "credenziali errate", 404/0 → "servizio non disponibile") senza dipendere dai
 * dettagli di trasporto di Angular. `status === 0` indica errore di rete / server irraggiungibile.
 */
export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly problem: ProblemDetails | null
    ) {
        super(problem?.detail ?? problem?.title ?? `HTTP ${status}`);
        this.name = 'ApiError';
    }
}

/** Opzioni per le singole chiamate API. */
export interface ApiCallOptions {
    /**
     * Se `true`, l'Engine salta la notifica automatica (modale/toast) e si limita a propagare
     * un `ApiError`, lasciando che sia il chiamante a gestire l'errore con la propria UI
     * (es. il form di login lo mostra inline). Default `false`: notifica automatica attiva.
     */
    silent?: boolean;
}

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
    protected api_get<T>(url: string, params?: HttpParams, opts?: ApiCallOptions): Promise<T> {
        return firstValueFrom(
            this.http.get<T>(this.resolveUrl(url), {
                headers: this.build_api_Headers(),
                params
            }).pipe(catchError(err => this.handleError(err, opts?.silent)))
        );
    }

    /**
     * Esegue una GET che restituisce dati binari (immagini, PDF, ecc.).
     * `responseType: 'blob'` non è compatibile con la firma generica di `api_get<T>`,
     * quindi ha un metodo dedicato — ma passa comunque per `resolveUrl` e per gli
     * header/gestione errori centralizzati come tutte le altre chiamate.
     */
    protected api_get_blob(url: string, params?: HttpParams, opts?: ApiCallOptions): Promise<Blob> {
        return firstValueFrom(
            this.http.get(this.resolveUrl(url), {
                headers: this.build_api_Headers(),
                params,
                responseType: 'blob'
            }).pipe(catchError(err => this.handleError(err, opts?.silent)))
        );
    }

    /** Esegue una richiesta POST inviando un body. */
    protected api_post<T>(url: string, body: unknown, opts?: ApiCallOptions): Promise<T> {
        return firstValueFrom(
            this.http.post<T>(this.resolveUrl(url), body, {
                headers: this.build_api_Headers()
            }).pipe(catchError(err => this.handleError(err, opts?.silent)))
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

    /** Estrae in modo sicuro i ProblemDetails (RFC 9457) dal body della risposta. */
    protected extractProblemDetails(body: unknown): ProblemDetails | null {
        if (!body) return null;

        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch {
                return null;
            }
        }

        if (typeof body === 'object' && body !== null) {
            return body as ProblemDetails;
        }

        return null;
    }

    /**
     * Gestione centralizzata degli errori HTTP.
     *
     * Comportamento di default (`silent` assente/`false`): mostra la notifica automatica all'utente.
     * È la "killer feature" per le chiamate fire-and-forget (footer, profilo) che non hanno una UI
     * d'errore propria.
     *
     * Con `silent: true` la notifica viene saltata: il chiamante (es. il form di login) gestisce
     * l'errore con la propria UI. In entrambi i casi l'errore viene **sempre** ri-lanciato come
     * `ApiError` tipizzato, così chi vuole può ispezionare `status` e `problem`.
     */
    protected handleError(error: HttpErrorResponse, silent = false): Observable<never> {
        const problem = this.extractProblemDetails(error.error);

        if (!silent) {
            /* Il try-catch garantisce il degrado grazioso: se NotificationService non riesce a mostrare
               l'errore (es. SweetAlert2 non ancora caricato), si cade su console.error senza bloccare il flusso. */
            try {
                let overrideKeys: { titleKey?: string, descKey?: string } | undefined;

                switch (error.status) {
                    case 401:
                        overrideKeys = {
                            titleKey: 'risorsa401Titolo',
                            descKey: 'risorsa401Descrizione'
                        };
                        break;
                    case 403:
                        overrideKeys = {
                            titleKey: 'risorsa403Titolo',
                            descKey: 'risorsa403Descrizione'
                        };
                        break;
                    case 404:
                        overrideKeys = {
                            titleKey: 'risorsa404Titolo',
                            descKey: 'risorsa404Descrizione'
                        };
                        break;
                    // Qui l'API service può decidere altre chiavi in base allo status
                }

                this.notify.handleApiError(error.status, problem, overrideKeys);
            } catch {
                console.error('[API Error]', error.status, error.message);
            }
        }

        return throwError(() => new ApiError(error.status, problem));
    }
}
