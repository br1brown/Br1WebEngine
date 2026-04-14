import { environment } from '../../environments/environment';

/**
 * Prefisso comune di tutte le chiamate al backend.
 *
 * - Stesso host (default): `/api`
 * - Deploy separato (API_URL impostato): `https://api.example.com/api`
 *
 * Usato da `app.config.ts` (interceptor) e `api.service.ts` (endpoint) come unica
 * sorgente di verità: cambiare `environment.apiUrl` aggiorna entrambi automaticamente.
 */
export const apiPrefix = environment.apiUrl
    ? `${environment.apiUrl.replace(/\/$/, '')}/api`
    : '/api';
