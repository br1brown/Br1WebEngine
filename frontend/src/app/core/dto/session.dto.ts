import type { SessionBase } from '../engine/models/session-base.model';

/**
 * Dettagli di sessione esposti al frontend, decodificati dal claim "session" del JWT.
 *
 * Estende il contratto universale dell'engine `SessionBase` (che garantisce `userId`)
 * con i campi di dominio del progetto. Corrisponde al record SessionInfo del backend
 * (backend/Models/SessionInfo.cs): tieni le due in sincronia a mano, niente codegen.
 * Le chiavi sono in camelCase perché il backend serializza con le opzioni JSON "Web".
 *
 * Esempio fornito col template — adatta i campi di dominio (insieme al record C#).
 */
export interface SessionInfo extends SessionBase {
    displayName: string;
    roles: string[];
}
