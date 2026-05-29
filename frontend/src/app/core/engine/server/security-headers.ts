import { serverEnv } from './server-env';

/**
 * Header di sicurezza letti da Security.Headers di global-settings.json (unica sorgente
 * condivisa col backend). Fallback usato solo se il blocco manca dalla configurazione,
 * così il server parte comunque protetto.
 *
 * CSP base (con {SCRIPT_NONCE_PLACEHOLDER}): il catch-all Angular genera un nonce
 * per-request e lo sostituisce prima di inviare l'HTML. script-src non contiene
 * 'unsafe-inline'; style-src lo mantiene perché Angular usa [style.x] bindings ovunque
 * e i nonce non coprono gli attributi inline (solo i blocchi <style>).
 */
export const FALLBACK_SECURITY_HEADERS: Record<string, string> = {
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':
        "default-src 'self'; script-src 'self' {SCRIPT_NONCE_PLACEHOLDER}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
};

const configuredHeaders = Object.keys(serverEnv.security.headers).length > 0
    ? serverEnv.security.headers
    : FALLBACK_SECURITY_HEADERS;

/** CSP completa con placeholder del nonce, usata dal catch-all SSR per-request. */
export const defaultCsp = configuredHeaders['Content-Security-Policy']
    ?? FALLBACK_SECURITY_HEADERS['Content-Security-Policy'];

/** CSP per file statici (assets, index.csr.html): placeholder sostituito con 'unsafe-inline'. */
export const staticCsp = defaultCsp.replace('{SCRIPT_NONCE_PLACEHOLDER}', "'unsafe-inline'");

/** Header di sicurezza standard applicati a tutte le risposte non-API.
 *  La CSP usa la variante static (placeholder→'unsafe-inline'); le risposte SSR
 *  la sovrascrivono col nonce per-request. */
export const htmlSecurityHeaders: [string, string][] = [
    ...Object.entries(configuredHeaders)
        .filter(([name]) => name.toLowerCase() !== 'content-security-policy'),
    ['Content-Security-Policy', staticCsp],
];
