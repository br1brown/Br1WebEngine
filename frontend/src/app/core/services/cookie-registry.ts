export enum CookieCategory {
    Technical = 'technical',
    Analytics = 'analytics',
    Profiling = 'profiling',
}

/**
 * Registro unico dei cookie del progetto.
 *
 * Chiave  = nome raw del cookie nel browser  (il nome fisico sarà "{category}.{rawKey}")
 * Valore  = categoria di consenso richiesta
 *
 * Aggiungere una riga qui è sufficiente per:
 *   - Attivare automaticamente la sezione nel banner GDPR
 *   - Rendere la chiave tipizzata e chiamabile via setCookie/getCookie/removeCookie
 *   - Includerla nella tabella {{cookieList}} nei file Markdown delle policy
 *
 * Con mappa vuota: CookieKey = never → setCookie/getCookie non sono invocabili a compile-time.
 *
 * Esempio:
 *   '_ga':           CookieCategory.Analytics,
 *   '_ga_XXXXXXXX':  CookieCategory.Analytics,
 */
export const COOKIE_MAP = {

} as const satisfies Readonly<Record<string, CookieCategory>>;

export type CookieKey = keyof typeof COOKIE_MAP;
