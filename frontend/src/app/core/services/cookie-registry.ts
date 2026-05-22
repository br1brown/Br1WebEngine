export enum CookieCategory {
    Technical = 'technical',
    Analytics = 'analytics',
    Profiling = 'profiling',
}

/**
 * Registro dei cookie del progetto: chiave costante → categoria di consenso.
 *
 * Per aggiungere un cookie del progetto:
 *   1. Aggiungere la chiave a COOKIE_KEYS
 *   2. Aggiungere la mappatura chiave → categoria in COOKIE_MAP
 *   3. Il banner comparirà automaticamente se la categoria diventa necessaria
 *
 * Il nome fisico del cookie nel browser sarà: {category}.{rawKey}
 * Es. COOKIE_KEYS = { GA: '_ga' }, COOKIE_MAP = { _ga: Analytics }
 *   → cookie "analytics._ga"
 *
 * Cookie non censiti usano {rawKey} senza categoria, generano console.warn
 * su set e get — funzionante ma non GDPR compliant.
 */
export const COOKIE_KEYS = {} as const;
export type CookieKey = typeof COOKIE_KEYS[keyof typeof COOKIE_KEYS];

export type CookieMap = Readonly<Record<string, CookieCategory>>;
export const COOKIE_MAP: CookieMap = {};
