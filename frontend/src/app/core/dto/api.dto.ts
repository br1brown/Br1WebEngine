
/** Risposta di POST /auth/login. */
export interface LoginResult {
    valid: boolean;
    token?: string;
    error?: string;
}
