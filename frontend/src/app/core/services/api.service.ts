import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Profile } from '../dto/profile.dto';
import { LoginResult } from '../dto/api.dto';
import { BaseApiService } from '../engine/services/base-api.service';

/** Endpoint backend. Aggiungere il path qui, poi il metodo pubblico sotto. */
const API = {
    social: 'social',
    profile: 'profile',
    login: 'auth/login',
    blob: (slug: string) => `blob/${encodeURIComponent(slug)}`,
} as const;

/**
 * Client HTTP centralizzato. Ogni endpoint del backend ha un metodo pubblico dedicato.
 * La gestione errori e' automatica: BaseApiService.handleError() notifica l'utente via
 * NotificationService e ri-lancia l'errore per chi vuole gestire lo stato localmente.
 *
 * Per aggiungere un endpoint:
 *   1. Aggiungere il path nella costante API (sopra)
 *   2. Aggiungere il metodo pubblico:
 *      - chiamate una-tantum  → this.api_get<T>() / this.api_post<T>()
 *      - componenti reattivi  → this.api_resource<T>()  (si aggiorna ai cambi di signal)
 *   3. Se il dato carica una pagina, aggiungere un case in ContentResolver.loadResolved()
 */
@Injectable({ providedIn: 'root' })
export class ApiService extends BaseApiService {

    /** Recupera i dati profilo legale e i contatti pubblici. */
    getProfile(): Promise<Profile> {
        return this.api_get<Profile>(API.profile);
    }

    /**
     * Versione reattiva di getProfile() basata su httpResource.
     * Si aggiorna automaticamente al cambio lingua (via Accept-Language nell'header).
     * Usare nei componenti persistenti come il footer.
     */
    getProfileResource() {
        return this.api_resource<Profile>(API.profile);
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
                .pipe(catchError(err => this.handleError(err)))
        );
    }

    /** Effettua il login inviando la password al backend. */
    login(password: string): Promise<LoginResult> {
        return this.api_post<LoginResult>(API.login, { pwd: password });
    }

}
