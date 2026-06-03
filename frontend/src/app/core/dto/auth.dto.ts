/** Payload di POST /auth/login. */
export interface LoginRequest {
    username: string;
    pwd: string;
}

/**
 * Risposta di POST /auth/login.
 * Gli errori di autenticazione arrivano come errore HTTP (ProblemDetails) e vengono
 * tradotti per status code in AuthService.login.
 */
export interface LoginResult {
    valid: boolean;
    token?: string;
}
