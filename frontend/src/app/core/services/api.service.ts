import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { NotificationService } from './notification.service';
import { TranslateService } from './translate.service';
import { TokenService } from './auth.service';
import { Profile } from '../dto/profile.dto';
import { LoginResult } from '../dto/api.dto';

/**
 * Prefisso base di tutte le chiamate al backend.
 * Deve corrispondere a [Route("api")] nel BaseController.
 */
const apiBase = environment.apiUrl
    ? `${environment.apiUrl.replace(/\/$/, '')}/api`
    : '/api';

/** Endpoint backend. Aggiungere il path qui, poi il metodo pubblico sotto. */
const API = {
    social:  `${apiBase}/social`,
    profile: `${apiBase}/profile`,
    login:   `${apiBase}/auth/login`,
} as const;

/**
 * Client HTTP centralizzato. Ogni endpoint del backend ha un metodo pubblico dedicato.
 * La gestione errori e' automatica: NotificationService mostra l'errore all'utente.
 *
 * Per aggiungere un endpoint:
 *   1. Aggiungere il path in API (sopra)
 *   2. Aggiungere il metodo pubblico usando this.get<T>() o this.post<T>()
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);
    private readonly notify = inject(NotificationService);
    private readonly translate = inject(TranslateService);
    private readonly tokenService = inject(TokenService);

    // ─── Endpoint pubblici ──────────────────────────────────────────────

    /** Recupera i dati profilo legale e i contatti pubblici. */
    getProfile(): Promise<Profile> {
        return this.get<Profile>(API.profile);
    }

    /**
     * Recupera i link ai social network.
     * @param nomi  Filtro opzionale: array di nomi (es. ['facebook','instagram']).
     *              Genera query string con chiavi ripetute: ?nomi=facebook&nomi=instagram
     */
    getSocial(nomi?: string[]): Promise<Record<string, string>> {
        let params = new HttpParams();
        if (nomi?.length) {
            nomi.forEach(n => params = params.append('nomi', n));
        }
        return this.get<Record<string, string>>(API.social, params);
    }


    /** Effettua il login inviando la password al backend. */
    login(password: string): Promise<LoginResult> {
        return this.post<LoginResult>(API.login, { pwd: password });
    }

    // ─── Metodi HTTP interni ─────────────────────────────────────────────
    // Centralizzano headers, firstValueFrom e gestione errori.
    // I metodi pubblici sopra li chiamano senza ripetere la struttura.

    private get<T>(url: string, params?: HttpParams): Promise<T> {
        return firstValueFrom(
            this.http.get<T>(url, { headers: this.buildHeaders(), params })
                .pipe(catchError(err => this.handleError(err)))
        );
    }

    private post<T>(url: string, body: unknown): Promise<T> {
        return firstValueFrom(
            this.http.post<T>(url, body, { headers: this.buildHeaders() })
                .pipe(catchError(err => this.handleError(err)))
        );
    }

    // ─── Infrastruttura ──────────────────────────────────────────────────

    private buildHeaders(): HttpHeaders {
        let headers = new HttpHeaders()
            .set('X-Api-Key', environment.apiKey)
            .set('Accept-Language', this.translate.currentLang());

        const token = this.tokenService.token();
        if (token) headers = headers.set('Authorization', `Bearer ${token}`);

        return headers;
    }

    /** Notifica l'utente e ri-lancia l'errore per eventuali handler a monte. */
    private handleError(error: HttpErrorResponse): Observable<never> {
        this.notify.handleApiError(error.status, error.error);
        return throwError(() => error);
    }
}
