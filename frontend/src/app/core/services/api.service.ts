import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Profile } from '../engine/dto/profile.dto';
import { LoginRequest, LoginResult } from '../dto/auth.dto';
import { BaseApiService } from '../engine/services/base-api.service';

/** Endpoint backend. Aggiungere il path qui, poi il metodo pubblico sotto. */
const API = {
    social: 'social',
    profile: 'profile',
    login: 'auth/login',
    blob: (slug: string) => `blob/${encodeURIComponent(slug)}`,
    blobUpload: 'blob/up',
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
     * Recupera un file dal volume uploads come oggetto `Blob` (immagini, documenti, ecc.).
     * Utile quando il file deve essere elaborato in memoria (es. anteprima locale, download forzato).
     * Per visualizzare un'immagine direttamente in un `<img>`, preferisci `getBlobUrl()`.
     */
    getBlob(slug: string): Promise<Blob> {
        return this.api_get_blob(API.blob(slug));
    }

    /**
     * Restituisce l'URL relativo del blob per usarlo direttamente in template
     * (`<img [src]="url">`, `<a [href]="url">`, ecc.) senza scaricare il file in memoria.
     *
     * Restituisce sempre un path relativo (`/blob/{slug}`) anche in SSR:
     * il browser deve poterlo raggiungere tramite il proxy del frontend,
     * non attraverso l'URL interno del backend.
     *
     * @param slug  Identificativo del file restituito dall'upload.
     * @param webopt  Se `true` il backend ridimensiona
     *                l'immagine a max 1920 px (lato lungo) e la converte in WebP.
     *                Non ha effetto su file non immagine.
     */
    getBlobUrl(slug: string, webopt = true): string {
        const base = `/${API.blob(slug)}`;
        return webopt ? `${base}?webopt=true` : base;
    }

    /**
     * Carica un file nel volume uploads del backend e restituisce lo slug univoco
     * con cui recuperarlo in seguito tramite `getBlob()` o `getBlobUrl()`.
     *
     * Richiede che l'utente sia autenticato (JWT valido): il backend applica
     * `[Authorize(Policy = "RequireLogin")]` sull'endpoint POST.
     *
     * @param file  Il file da caricare (da `<input type="file">` o drag-and-drop).
     * @returns  `{ slug }` — lo slug del file appena salvato.
     */
    uploadBlob(file: File): Promise<{ slug: string }> {
        const formData = new FormData();
        formData.append('file', file);
        return this.api_post_form<{ slug: string }>(API.blobUpload, formData);
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
