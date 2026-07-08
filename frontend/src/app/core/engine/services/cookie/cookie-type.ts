/** Categoria di consenso (GDPR/ePrivacy) di una voce di archiviazione — vale per cookie E Web
 *  Storage. Abbina la voce al consenso dell'utente; indipendente dal mezzo (`storage`). */
export enum ConsentCategory {
    /** Strettamente necessari al funzionamento del sito (lingua, SW, sessione). */
    Technical,
    /** Raccolta dati aggregati per misurare l'utilizzo del sito. */
    Analytics,
    /** Pubblicità comportamentale e profilazione utente. */
    Profiling,
}

export type CookieValueType = 'string' | 'number' | 'boolean' | 'json';

/** Mezzo di archiviazione di una voce censita. Default `'cookie'`. `'local'`/`'session'` =
 *  Web Storage: NON passano da `setCookie`/`getCookie` (che restano cookie-only e tipizzati),
 *  ma sono comunque elencate nella policy automatica e pulite alla revoca del consenso. */
export type StorageMedium = 'cookie' | 'local' | 'session';

/** Metadati di una voce registrata in `COOKIE_MAP`/`ENGINE_COOKIE_MAP` (cookie o Web Storage, secondo `storage`). */
export interface CookieConfig {
    /** Categoria di consenso a cui appartiene la voce. */
    category: ConsentCategory;
    /** Chiave i18n per la descrizione nella pagina Cookie Policy (opzionale). */
    descriptionKey?: string;
    /** Tipo primitivo per il cast automatico (solo cookie). Se omesso, di default è 'string' */
    valueType?: CookieValueType;
    /** Mezzo di archiviazione. Omesso = `'cookie'`. */
    storage?: StorageMedium;
    /** Strategia di match della chiave per la pulizia sul Web Storage. Omesso/`'exact'` = chiave
     *  esatta. `'prefix'` = la voce rappresenta una FAMIGLIA di chiavi che condividono questo
     *  prefisso (tipico della telemetria di terza parte con suffisso dinamico, es. un token): alla
     *  revoca vengono rimosse TUTTE le chiavi che iniziano per la chiave della voce. Ha senso solo
     *  con `storage:'local'|'session'`. Su una voce `prefix` la scrittura via `set` è un no-op
     *  (le chiavi reali le crea il provider, non noi): esiste per la policy + la pulizia. */
    match?: 'exact' | 'prefix';
    /** Provider della voce, per la Cookie Policy. Omesso = prima parte (questo sito); valorizzato =
     *  nome del terzo che la imposta (es. `'Google Analytics'`). Il Web Storage è sempre prima parte. */
    provider?: string;
    /** URL alla privacy/cookie policy del provider terzo (opzionale). Se presente, nella policy il
     *  nome del provider diventa un link. Ha senso solo insieme a `provider`. */
    providerUrl?: string;
    /** Chiave i18n della durata dichiarata (solo cookie), per la Cookie Policy. Omessa → default
     *  "1 anno" (il Max-Age predefinito di `set()`). Per il Web Storage la durata è derivata dal
     *  mezzo (sessione / persistente) e questo campo è ignorato. */
    durationKey?: string;
}

export const CONSENT_KEYS = {
    technical: 'consent_technical',
    analytics: 'consent_analytics',
    profiling: 'consent_profiling'
} as const;

export const CONSENT_COOKIE_MAP = {
    /** Memorizza le preferenze dell'utente sui cookie tecnici. Max-Age 180 giorni (vedi
     *  CookieConsentService.CONSENT_MAX_AGE_SECONDS): durationKey esplicito per non farlo
     *  ricadere sul default "1 anno" della Cookie Policy. */
    [CONSENT_KEYS.technical]: {
        category: ConsentCategory.Technical,
        descriptionKey: 'consentTechnicalDescrizioneListaCookie',
        durationKey: 'durataSeiMesiListaCookie',
        valueType: 'boolean'
    },
    /** Memorizza le preferenze dell'utente sui cookie analitici */
    [CONSENT_KEYS.analytics]: {
        category: ConsentCategory.Technical,
        descriptionKey: 'consentAnalyticsDescrizioneListaCookie',
        durationKey: 'durataSeiMesiListaCookie',
        valueType: 'boolean'
    },
    /** Memorizza le preferenze dell'utente sui cookie di profilazione */
    [CONSENT_KEYS.profiling]: {
        category: ConsentCategory.Technical,
        descriptionKey: 'consentProfilingDescrizioneListaCookie',
        durationKey: 'durataSeiMesiListaCookie',
        valueType: 'boolean'
    }
} as const satisfies Readonly<Record<string, CookieConfig>>;

/**
 * Voci built-in del MOTORE, su qualsiasi mezzo (`storage`): cookie (lingua, SW, memorie del
 * consenso) e Web Storage (consent_log, bearerToken). Mappa unica → la stessa logica di policy,
 * gate e pulizia le tratta tutte; il mezzo lo decide il campo `storage` di ogni voce.
 */
export const ENGINE_COOKIE_MAP = {
    /** Cookie. Incluso nella lista pubblica solo se `localeConfig.availableLanguages.length > 1` */
    lang: {
        category: ConsentCategory.Technical,
        descriptionKey: 'linguaDescrizioneListaCookie',
    },
    /** Cookie. Incluso nella lista pubblica solo se `isWebApp` è `true` in site.ts */
    'ngsw-worker.js': {
        category: ConsentCategory.Technical,
        descriptionKey: 'swDescrizioneListaCookie',
    },
    /** localStorage. Log della scelta di consenso (accountability GDPR). Scritto da CookieConsentService.
     *  ESSENZIALE → elencato in policy ma mai cancellato dalla revoca. */
    consent_log: {
        category: ConsentCategory.Technical,
        storage: 'local',
        descriptionKey: 'consentLogDescrizioneListaCookie',
    },
    /** sessionStorage. Token di autenticazione (TokenService). Incluso solo se è configurato un login.
     *  ESSENZIALE → elencato in policy ma mai cancellato dalla revoca. */
    bearerToken: {
        category: ConsentCategory.Technical,
        storage: 'session',
        descriptionKey: 'bearerTokenDescrizioneListaCookie',
    },
    ...CONSENT_COOKIE_MAP
} as const satisfies Readonly<Record<string, CookieConfig>>;

export type EngineCookieKey = keyof typeof ENGINE_COOKIE_MAP;

/** Chiavi delle voci essenziali del motore su Web Storage: elencate in policy ma MAI cancellate
 *  alla revoca (prova del consenso + autenticazione). */
export const ESSENTIAL_ENGINE_STORAGE_KEYS = ['consent_log', 'bearerToken'] as const;
