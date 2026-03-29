import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { NotificationService } from './notification.service';
import { Profile } from '../dto/profile.dto';
import { LoginResult } from '../dto/api.dto';

/** Endpoint backend. Aggiungere qui ogni nuovo path per evitare stringhe duplicate. */
const apiBase = environment.apiUrl.replace(/\/$/, '');
const API = {
    social:  `${apiBase}/api/social`,
    profile: `${apiBase}/api/profile`,
    login:   `${apiBase}/api/auth/login`,
} as const;

/**
 * Client HTTP centralizzato. Ogni endpoint del backend ha un metodo pubblico dedicato.
 * La gestione errori e' automatica: NotificationService mostra l'errore all'utente.
 *
 * Per aggiungere un nuovo endpoint:
 *   1. Aggiungere il path in API (costante in cima al file)
 *   2. Aggiungere il metodo pubblico (es. getProducts())
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);
    private readonly notify = inject(NotificationService);

    // ─── Endpoint pubblici ──────────────────────────────────────────────
    // Aggiungere qui un metodo per ogni endpoint del backend.

    /** Recupera i dati profilo legale e i contatti pubblici. */
    getProfile(): Promise<Profile> {
        return firstValueFrom(
            this.http.get<Profile>(API.profile)
                .pipe(catchError(err => this.handleError(err)))
        );
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
        return firstValueFrom(
            this.http.get<Record<string, string>>(API.social, { params })
                .pipe(catchError(err => this.handleError(err)))
        );
    }

    /** Effettua il login inviando la password al backend (form URL-encoded). */
    login(password: string): Promise<LoginResult> {
        const body = new URLSearchParams({ pwd: password }).toString();
        const headers = new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' });
        return firstValueFrom(
            this.http.post<LoginResult>(API.login, body, { headers })
                .pipe(catchError(err => this.handleError(err)))
        );
    }

    // ─── Gestione errori ────────────────────────────────────────────────

    /** Notifica l'utente e ri-lancia l'errore per eventuali handler a monte. */
    private handleError(error: HttpErrorResponse): Observable<never> {
        this.notify.handleApiError(error.status, error.error);
        return throwError(() => error);
    }
}
