import { type CookieConfig } from "../engine/services/cookie/cookie-type";

/**
 * Registro UNICO dell'archiviazione client del progetto (cookie + Web Storage).
 *
 * Chiave  = nome raw della voce. Valore = configurazione: categoria, `storage` (mezzo: omesso =
 *           cookie, `'local'`/`'session'` = Web Storage), `valueType` (cast) e chiave i18n.
 *
 * Aggiungere una riga qui è sufficiente per:
 *   - Attivare automaticamente la sezione nel banner GDPR (per categoria)
 *   - Rendere la chiave tipizzata e leggibile/scrivibile via set/get/remove (instradati sul mezzo)
 *   - Includerla nella tabella {{cookieList}} nelle policy (col mezzo indicato)
 *   - Farla pulire automaticamente alla revoca del consenso della sua categoria
 *
 * Con mappa vuota: CookieKey = never → set/get non sono invocabili a compile-time.
 *
 * Per la Cookie Policy si possono dichiarare anche `provider` (omesso = prima parte; valorizzato =
 * nome del terzo), `providerUrl` (link alla policy del terzo → nome cliccabile) e `durationKey`
 * (chiave i18n della durata dichiarata del cookie; default "1 anno").
 *
 * Esempi:
 *   '_ga':           { category: ConsentCategory.Analytics, descriptionKey: 'cookieDescGa', provider: 'Google Analytics',
 *                      providerUrl: 'https://policies.google.com/privacy', durationKey: 'cookieDurataGa' },  // cookie di terza parte
 *   'mioSalvataggio': { category: ConsentCategory.Technical, storage: 'local', valueType: 'json', ... },     // localStorage
 *
 * NB: la data di "ultimo aggiornamento" delle pagine legali NON sta qui — vive in
 *     `pages/legal.pages.ts` (`legalUpdated`), accanto agli ID delle pagine legali.
 */
export const COOKIE_MAP = {

} as const satisfies Readonly<Record<string, CookieConfig>>;

export type CookieKey = keyof typeof COOKIE_MAP;
