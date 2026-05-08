import { computed, inject, Injectable, isDevMode, OnDestroy, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ApiService } from './api.service';

/**
 * TOKEN SERVICE
 * Conserva il token JWT: unica sorgente di verità sulla sessione attiva.
 * È separato da AuthService per risolvere il problema delle "Circular Dependencies":
 * ApiService usa TokenService, e AuthService usa ApiService.
 */
@Injectable({ providedIn: 'root' })
export class TokenService implements OnDestroy {
    // Identifica se il codice sta girando nel browser o sul server (SSR)
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    // Signal reattivo per lo stato del token
    private readonly _token = signal<string | null>(null);

    // Riferimento al timer per il logout automatico alla scadenza del token
    private expirationTimer: ReturnType<typeof setTimeout> | null = null;

    // Esposizione pubblica dei dati in sola lettura
    readonly token = this._token.asReadonly();
    readonly isLoggedIn = computed(() => this._token() !== null);

    /**
     * Salva il token, ne verifica la validità e avvia il timer di scadenza.
     * @param token Stringa JWT ricevuta dal backend.
     */
    store(token: string): boolean {
        const expiration = this.getExpirationTime(token);

        // Se il token è malformato o già scaduto, annulla l'operazione
        if (expiration === null || expiration <= Date.now()) {
            this.clear();
            return false;
        }

        this._token.set(token);

        // Persistenza: usiamo sessionStorage affinché il login resti attivo al refresh
        // ma venga rimosso alla chiusura della scheda (tab) del browser.
        if (this.isBrowser) sessionStorage.setItem('bearerToken', token);

        this.scheduleExpiration(expiration);
        return true;
    }

    /** Rimuove il token, pulisce i timer e svuota il SessionStorage. */
    clear(): void {
        this._token.set(null);
        if (this.expirationTimer !== null) {
            clearTimeout(this.expirationTimer);
            this.expirationTimer = null;
        }
        if (this.isBrowser) sessionStorage.removeItem('bearerToken');
    }

    /** Tenta di ripristinare una sessione esistente (es. dopo F5). */
    restore(): void {
        if (!this.isBrowser) return;
        const token = sessionStorage.getItem('bearerToken');
        if (token) this.store(token);
    }

    /** Lifecycle hook: assicura che i timer vengano distrutti se il servizio muore. */
    ngOnDestroy(): void {
        this.clear();
    }

    /**
     * Pianifica il logout automatico. 
     * Gestisce anche il limite massimo di setTimeout di JS (circa 24 giorni).
     */
    private scheduleExpiration(expiration: number): void {
        if (!this.isBrowser) return; // I timer di scadenza non servono in SSR
        if (this.expirationTimer !== null) clearTimeout(this.expirationTimer);

        const delay = expiration - Date.now();
        if (delay <= 0) { this.clear(); return; }

        // Il delay massimo supportato da setTimeout è un intero a 32 bit
        const nextDelay = Math.min(delay, 2147483647);
        this.expirationTimer = setTimeout(() => {
            if (expiration <= Date.now()) {
                this.clear();
                return;
            }
            // Se il token scade tra molto tempo, ri-schedula ricorsivamente
            this.scheduleExpiration(expiration);

        }, nextDelay);
    }

    /**
     * Decodifica il payload del JWT (Base64) per estrarre il campo 'exp'.
     * @returns Timestamp di scadenza in millisecondi o null.
     */
    private getExpirationTime(token: string): number | null {
        // Prende la parte centrale del JWT (payload Base64url)
        const payloadSegment = token.split('.')[1];
        if (!payloadSegment) return null;
        try {
            // Normalizzazione Base64URL in Base64 standard
            const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized.padEnd(
                normalized.length + ((4 - (normalized.length % 4)) % 4), '='
            );
            // atob decodifica la stringa Base64
            const payload = JSON.parse(atob(padded)) as { exp?: unknown };

            // Il campo 'exp' nei JWT è solitamente in secondi, lo convertiamo in ms
            return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
        } catch (err) {
            // Trattiamo il token come scaduto (fail closed). In dev logghiamo
            // per distinguere "token corrotto" da "nessuna scadenza valida"
            if (isDevMode()) console.warn('[auth] decoding del token JWT fallito', err);
            return null;
        }
    }
}

/**
 * AUTH SERVICE
 * Facciata di alto livello per la gestione dell'autenticazione.
 * Coordina le chiamate API e l'aggiornamento dello stato nel TokenService.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly api = inject(ApiService);
    private readonly tokenService = inject(TokenService);

    // Proxy verso le proprietà reattive del TokenService
    readonly isLoggedIn = this.tokenService.isLoggedIn;
    readonly token = this.tokenService.token;

    /**
     * Effettua il login inviando la password al backend.
     * Se il login è valido, riceve un token e lo memorizza.
     */
    async login(password: string): Promise<{ valid: boolean; error?: string }> {
        const result = await this.api.login(password);

        if (result.valid && result.token) {
            // Se lo storage del token fallisce (es. token già scaduto dal server)
            if (this.tokenService.store(result.token)) {
                return { valid: true };
            }
            return { valid: false, error: 'Token non valido o scaduto.' };
        }

        return { valid: result.valid, error: result.error };
    }

    /** Termina la sessione dell'utente. */
    logout(): void {
        this.tokenService.clear();
    }

    /** Carica il token salvato precedentemente in sessionStorage. */
    restoreSession(): void {
        this.tokenService.restore();
    }
}