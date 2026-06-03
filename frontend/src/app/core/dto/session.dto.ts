/**
 * Payload di sessione decodificato dal claim "session" del JWT.
 *
 * Corrisponde al record SessionInfo del backend (backend/Models/SessionInfo.cs):
 * tieni le due in sincronia a mano, niente codegen.
 * Le chiavi sono in camelCase perché il backend serializza con le opzioni JSON "Web".
 *
 * Esempio fornito col template — adatta i campi di dominio (insieme al record C#).
 */
export interface SessionInfo {
    userId: string;
    displayName: string;
    roles: string[];
}
