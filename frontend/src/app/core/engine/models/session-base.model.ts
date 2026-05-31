/**
 * Contratto MINIMO di sessione garantito dall'engine: ogni sessione autenticata
 * identifica il proprio principale tramite `userId`.
 *
 * È la parte universale del payload del claim "session". Il progetto la estende
 * con i propri campi di dominio (vedi core/dto/session.dto.ts).
 *
 * Specchio lato backend: backend/Engine/Models/SessionBase.cs.
 */
export interface SessionBase {
    userId: string;
}
