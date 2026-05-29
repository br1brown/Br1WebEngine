import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Profile } from '../dto/profile.dto';
import { LoginRequest, LoginResult } from '../dto/api.dto';
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
 * La gestione errori e' automatica per default: BaseApiService.handleError() notifica l'utente via
 * NotificationService e ri-lancia un ApiError tipizzato per chi vuole gestire lo stato localmente.
 * Passando { silent: true } la notifica automatica viene saltata e l'errore (ApiError) resta solo
 * da gestire al chiamante: usarlo per i flussi con UI d'errore propria (es. il form di login).
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
     * Delega a api_get_blob della base: stessa risoluzione URL (SSR-aware), header e gestione errori.
     */
    getBlob(slug: string): Promise<Blob> {
        return this.api_get_blob(API.blob(slug));
    }

    /**
     * Effettua il login inviando le credenziali al backend.
     * `silent: true`: niente notifica automatica — l'esito (anche l'errore) è gestito
     * inline dal form di login tramite AuthService.
     */
    login(username: string, password: string): Promise<LoginResult> {
        const request: LoginRequest = { username, pwd: password };
        return this.api_post<LoginResult>(API.login, request, { silent: true });
    }

}
