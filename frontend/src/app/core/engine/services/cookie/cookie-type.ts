/** Categoria GDPR/ePrivacy del cookie, usata per abbinare il cookie al consenso dell'utente. */
export enum CookieCategory {
    /** Strettamente necessari al funzionamento del sito (lingua, SW, sessione). */
    Technical,
    /** Raccolta dati aggregati per misurare l'utilizzo del sito. */
    Analytics,
    /** Pubblicità comportamentale e profilazione utente. */
    Profiling,
}

/** Metadati di un cookie registrato in `COOKIE_MAP`. */
export interface CookieConfig {
    /** Categoria di consenso a cui appartiene il cookie. */
    category: CookieCategory;
    /** Chiave i18n per la descrizione nella pagina Cookie Policy (opzionale). */
    descriptionKey?: string;
}
