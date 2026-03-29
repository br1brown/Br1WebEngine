import { isPlatformBrowser } from '@angular/common';
import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { ApiService } from './api.service';

/**
 * Gestisce login, logout e stato della sessione utente.
 *
 * Flusso: password → POST /auth/login → token JWT → sessionStorage.
 * L'interceptor aggiunge il token come Authorization: Bearer nelle richieste successive.
 *
 * Password e chiave JWT si configurano in appsettings.json (sezione Security.Token).
 * Per proteggere una pagina: requiresAuth: true nella route in app.routes.ts.
 *
 * Sessione: sessionStorage (sopravvive al refresh, si cancella chiudendo la tab).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
    private api = inject(ApiService);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    /** Token JWT corrente (null = non autenticato) */
    private _token = signal<string | null>(null);

    /** true se l'utente è autenticato (signal reattivo: la UI si aggiorna automaticamente) */
    readonly isLoggedIn = computed(() => this._token() !== null);

    /** Token JWT in sola lettura (per i componenti che devono leggerlo) */
    readonly token = this._token.asReadonly();

    /**
     * Invia la password al backend e, se corretta, salva il token.
     * @returns Un oggetto con valid=true se il login è riuscito,
     *          oppure valid=false + error con il messaggio di errore
     */
    async login(password: string): Promise<{ valid: boolean; error?: string }> {
        const result = await this.api.login(password);

        if (result.valid && result.token) {
            this._token.set(result.token);
            if (this.isBrowser) {
                sessionStorage.setItem('bearerToken', result.token);
            }
        }

        return { valid: result.valid, error: result.error };
    }

    /** Effettua il logout: cancella il token dalla memoria e dal sessionStorage */
    logout(): void {
        this._token.set(null);
        if (this.isBrowser) {
            sessionStorage.removeItem('bearerToken');
        }
    }

    /**
     * Recupera il token dal sessionStorage (se presente).
     * Viene chiamato all'avvio dell'app per ripristinare la sessione
     * dopo un refresh della pagina.
     */
    restoreSession(): void {
        if (!this.isBrowser) return;

        const token = sessionStorage.getItem('bearerToken');
        if (token) {
            this._token.set(token);
        }
    }
}
