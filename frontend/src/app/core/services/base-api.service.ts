import { inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { NotificationService } from './notification.service';
import { TranslateService } from './translate.service';
import { TokenService } from './auth.service';

const healthUrl = environment.apiUrl
    ? `${environment.apiUrl.replace(/\/$/, '')}/health`
    : '/health';

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

    /** Verifica che il backend sia raggiungibile. */
    getHealth(): Promise<void> {
        return this.api_get<void>(healthUrl);
    }

    // ─── Metodi HTTP protetti ─────────────────────────────────────────────
    // Le sottoclassi li usano per implementare i propri endpoint.

    protected api_get<T>(url: string, params?: HttpParams): Promise<T> {
        return firstValueFrom(
            this.http.get<T>(url, { headers: this.build_api_Headers(), params })
                .pipe(catchError(err => this.handleError(err)))
        );
    }

    protected api_post<T>(url: string, body: unknown): Promise<T> {
        return firstValueFrom(
            this.http.post<T>(url, body, { headers: this.build_api_Headers() })
                .pipe(catchError(err => this.handleError(err)))
        );
    }

    // ─── Infrastruttura ──────────────────────────────────────────────────

    protected build_api_Headers(aggiunte?: { [key: string]: string }): HttpHeaders {
        let headers = new HttpHeaders()
            .set('X-Api-Key', environment.apiKey)
            .set('Accept-Language', this.translate.currentLang());

        if (this.tokenService.isLoggedIn())
            headers = headers.set('Authorization', `Bearer ${this.tokenService.token}`);

        if (aggiunte) {
            for (var key in aggiunte) {
                headers = headers.set(key, aggiunte[key]);
            }
        }

        return headers;
    }

    /** Notifica l'utente e ri-lancia l'errore per eventuali handler a monte. */
    private handleError(error: HttpErrorResponse): Observable<never> {
        this.notify.handleApiError(error.status, error.error);
        return throwError(() => error);
    }
}
