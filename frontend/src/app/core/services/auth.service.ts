import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { ApiService } from './api.service';

/**
 * Gestisce login, logout e stato della sessione utente.
 *
 * Flusso previsto nel progetto finale: password -> POST /auth/login -> token JWT -> sessionStorage.
 * Nel template base il backend lascia il login come placeholder e non emette token finche'
 * non viene implementata la verifica reale delle credenziali.
 * L'interceptor aggiunge il token come Authorization: Bearer nelle richieste successive.
 *
 * Il frontend conserva solo token ben formati e non ancora scaduti in base al claim exp.
 * Per proteggere una pagina: requiresAuth: true nella route in app.routes.ts.
 *
 * Sessione: sessionStorage (sopravvive al refresh, si cancella chiudendo la tab).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly api = inject(ApiService);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private expirationTimer: ReturnType<typeof setTimeout> | null = null;

    /** Token JWT corrente (null = non autenticato) */
    private readonly _token = signal<string | null>(null);

    /** true se l'utente e' autenticato (signal reattivo: la UI si aggiorna automaticamente) */
    readonly isLoggedIn = computed(() => this._token() !== null);

    /** Token JWT in sola lettura (per i componenti che devono leggerlo) */
    readonly token = this._token.asReadonly();

    /**
     * Invia la password al backend e, se il progetto ha implementato il login reale, salva il token.
     * @returns Un oggetto con valid=true se il login e' riuscito,
     *          oppure valid=false + error con il messaggio di errore
     */
    async login(password: string): Promise<{ valid: boolean; error?: string }> {
        const result = await this.api.login(password);

        if (result.valid && result.token) {
            if (this.storeToken(result.token)) {
                return { valid: true };
            }

            return { valid: false, error: 'Token non valido o scaduto.' };
        }

        return { valid: result.valid, error: result.error };
    }

    /** Effettua il logout: cancella il token dalla memoria e dal sessionStorage */
    logout(): void {
        this.clearToken();
    }

    /**
     * Recupera il token dal sessionStorage (se presente e non scaduto).
     * Viene chiamato all'avvio dell'app per ripristinare la sessione
     * dopo un refresh della pagina.
     */
    restoreSession(): void {
        if (!this.isBrowser) return;

        const token = sessionStorage.getItem('bearerToken');
        if (token) {
            this.storeToken(token);
        }
    }

    private storeToken(token: string): boolean {
        const expiration = this.getExpirationTime(token);
        if (expiration === null || expiration <= Date.now()) {
            this.clearToken();
            return false;
        }

        this._token.set(token);

        if (this.isBrowser) {
            sessionStorage.setItem('bearerToken', token);
        }

        this.scheduleExpiration(expiration);
        return true;
    }

    private clearToken(): void {
        this._token.set(null);

        if (this.expirationTimer !== null) {
            clearTimeout(this.expirationTimer);
            this.expirationTimer = null;
        }

        if (this.isBrowser) {
            sessionStorage.removeItem('bearerToken');
        }
    }

    private scheduleExpiration(expiration: number): void {
        if (!this.isBrowser) return;

        if (this.expirationTimer !== null) {
            clearTimeout(this.expirationTimer);
        }

        const delay = expiration - Date.now();
        if (delay <= 0) {
            this.clearToken();
            return;
        }

        const nextDelay = Math.min(delay, 2147483647);
        this.expirationTimer = setTimeout(() => {
            if (expiration <= Date.now()) {
                this.clearToken();
                return;
            }

            this.scheduleExpiration(expiration);
        }, nextDelay);
    }

    private getExpirationTime(token: string): number | null {
        const payloadSegment = token.split('.')[1];
        if (!payloadSegment) {
            return null;
        }

        try {
            const normalized = payloadSegment
                .replace(/-/g, '+')
                .replace(/_/g, '/');
            const padded = normalized.padEnd(
                normalized.length + ((4 - (normalized.length % 4)) % 4),
                '='
            );
            const payload = JSON.parse(atob(padded)) as { exp?: unknown };

            return typeof payload.exp === 'number'
                ? payload.exp * 1000
                : null;
        } catch {
            return null;
        }
    }
}
