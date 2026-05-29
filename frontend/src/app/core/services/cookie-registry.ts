import type { CookieConfig } from "../engine/services/cookie-consent.service";

/**
 * Registro unico dei cookie del progetto.
 *
 * Chiave  = nome raw del cookie nel browser  (il nome fisico sarà "{category}.{rawKey}")
 * Valore  = configurazione del cookie (categoria e chiave i18n per la descrizione)
 *
 * Aggiungere una riga qui è sufficiente per:
 *   - Attivare automaticamente la sezione nel banner GDPR
 *   - Rendere la chiave tipizzata e chiamabile via setCookie/getCookie/removeCookie
 *   - Includerla nella tabella {{cookieList}} nei file Markdown delle policy
 *
 * Con mappa vuota: CookieKey = never → setCookie/getCookie non sono invocabili a compile-time.
 *
 * Esempio:
 *   '_ga': { category: CookieCategory.Analytics, descriptionKey: 'cookieDescGa' },
 */
export const COOKIE_MAP = {

} as const satisfies Readonly<Record<string, CookieConfig>>;

export type CookieKey = keyof typeof COOKIE_MAP;
