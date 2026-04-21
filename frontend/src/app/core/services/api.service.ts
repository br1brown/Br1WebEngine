import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Profile } from '../dto/profile.dto';
import { LoginResult } from '../dto/api.dto';
import { BaseApiService } from './base-api.service';

/**
 * Prefisso base di tutte le chiamate al backend.
 * Deve corrispondere a [Route("api")] nel BaseController.
 */
const apiBase = environment.apiUrl
    ? `${environment.apiUrl.replace(/\/$/, '')}/api`
    : '/api';

/** Endpoint backend. Aggiungere il path qui, poi il metodo pubblico sotto. */
const API = {
    social: `${apiBase}/social`,
    profile: `${apiBase}/profile`,
    login: `${apiBase}/auth/login`,
    blob: (slug: string) => `${apiBase}/blob/${encodeURIComponent(slug)}`,
    export: (format: string) => `${apiBase}/export/${format}`,
} as const;

/**
 * Client HTTP centralizzato. Ogni endpoint del backend ha un metodo pubblico dedicato.
 * La gestione errori e' automatica: NotificationService mostra l'errore all'utente.
 *
 * Per aggiungere un endpoint:
 *   - Aggiungere il path in API (sopra)
 *   - Aggiungere il metodo pubblico usando this.get<T>() o this.post<T>()
 */
@Injectable({ providedIn: 'root' })
export class ApiService extends BaseApiService {

    /** Recupera i dati profilo legale e i contatti pubblici. */
    getProfile(): Promise<Profile> {
        return this.api_get<Profile>(API.profile);
    }

    /**
     * Recupera i link ai social network.
     * @param nomi  Filtro opzionale: array di nomi (es. ['facebook','instagram']).
     * Genera query string con chiavi ripetute: ?nomi=facebook&nomi=instagram
     */
    getSocial(nomi?: string[]): Promise<Record<string, string>> {
        let params = new HttpParams();
        if (nomi?.length) {
            nomi.forEach(n => params = params.append('nomi', n));
        }
        return this.api_get<Record<string, string>>(API.social, params);
    }

    /**
     * Recupera un file dal volume uploads come Blob (immagini, documenti, ecc.).
     * Usa HttpClient direttamente: responseType 'blob' non e' compatibile con get<T>().
     */
    getBlob(slug: string): Promise<Blob> {
        return firstValueFrom(
            this.http.get(API.blob(slug), { headers: this.build_api_Headers(), responseType: 'blob' })
                .pipe(catchError(err => { throw err; }))
        );
    }

    /** Effettua il login inviando la password al backend. */
    login(password: string): Promise<LoginResult> {
        return this.api_post<LoginResult>(API.login, { pwd: password });
    }

    /**
     * Esporta il Markdown fornito come PDF o DOCX tramite Pandoc (backend).
     * Usa HttpClient direttamente: responseType 'blob' non e' compatibile con post<T>().
     * @param md Testo Markdown da convertire.
     * @param format Formato di output: 'pdf' o 'docx'.
     * @returns Blob del documento generato, pronto per il download.
     */
    exportDocument(md: string, format: 'pdf' | 'docx'): Promise<Blob> {
        return firstValueFrom(
            this.http.post(
                API.export(format),
                JSON.stringify(md),
                {
                    headers: this.build_api_Headers({ 'Content-Type': 'application/json' }),
                    responseType: 'blob',
                }
            ).pipe(catchError(err => { throw err; }))
        );
    }

}
