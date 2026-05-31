import { COOKIE_MAP } from '../../../services/cookie-registry';
import { environment } from '../../../../../environments/environment';

/**
 * Controlla in modo statico se sono necessari i cookie per il sito.
 * È usato da site.ts a build time / runtime precoce per determinare
 * se abilitare o meno la pagina Cookie Policy.
 */
export function hasCookiesConfigured(): boolean {
    // 1. Ci sono cookie espliciti di progetto?
    if (Object.keys(COOKIE_MAP).length > 0) return true;

    // 2. Multilingua o altre config nel file di environment generato?
    if (environment.availableLanguages && environment.availableLanguages.length > 1) {
        return true;
    }

    return false;
}
