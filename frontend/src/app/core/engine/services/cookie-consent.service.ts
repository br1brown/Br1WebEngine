import { isPlatformBrowser } from '@angular/common';
import { Injectable, computed, inject, isDevMode, PLATFORM_ID, REQUEST, signal, DOCUMENT } from '@angular/core';
import { COOKIE_MAP, type CookieKey } from '../../services/cookie-registry';
import { LOCALE_CONFIG } from '../services/translate.service';
import { SITE_CONFIG } from '../siteBuilder';
import { ConsentCategory, CookieConfig, CookieValueType, ENGINE_COOKIE_MAP, EngineCookieKey, ESSENTIAL_ENGINE_STORAGE_KEYS, CONSENT_COOKIE_MAP, CONSENT_KEYS, StorageMedium } from './cookie/cookie-type';

export type { CookieKey } from '../../services/cookie-registry';

/**
 * Utility type per inferire il tipo di ritorno di getCookie/setCookie in base alla configurazione.
 * Legge la proprietà 'valueType' da COOKIE_MAP o ENGINE_COOKIE_MAP. Se non specificata, ricade su 'string'.
 */
export type InferCookieType<K extends CookieKey | EngineCookieKey> =
    (typeof ENGINE_COOKIE_MAP & typeof COOKIE_MAP)[K] extends { valueType: 'boolean' } ? boolean :
    (typeof ENGINE_COOKIE_MAP & typeof COOKIE_MAP)[K] extends { valueType: 'number' } ? number :
    (typeof ENGINE_COOKIE_MAP & typeof COOKIE_MAP)[K] extends { valueType: 'json' } ? unknown :
    string;

/**
 * Controlla se il consenso tecnico è stato già salvato nei cookie fisici del browser.
 * Fonte unica della chiave — usata anche da app.config.ts per decidere
 * se abilitare il Service Worker all'avvio dell'app prima del bootstrap di Angular.
 *
 * @returns {boolean} True se il cookie di consenso tecnico è presente e vale '1'.
 */
export function isTechnicalConsentGiven(): boolean {
    try {
        if (typeof document === 'undefined') return false;

        // Per recuperare la chiave usiamo direttamente il builder bypassando la DI
        const fullKey = buildPhysicalCookieKey(CONSENT_KEYS.technical);
        if (!fullKey) return false;

        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith(fullKey + '=')) {
                return decodeURIComponent(cookie.substring(fullKey.length + 1)) === '1';
            }
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Costruisce il nome fisico completo (namespace) con cui il cookie verrà salvato nel browser.
 * Questa funzione è esportata ma vive fuori dalla classe del servizio, in modo da non sporcare
 * l'API pubblica che gli sviluppatori vedono quando iniettano CookieConsentService.
 *
 * @param rawKey Chiave di base censita in COOKIE_MAP o ENGINE_COOKIE_MAP.
 * @param config Parametro opzionale per fornire la configurazione senza re-interrogare la mappa.
 * @returns Il nome del cookie sanificato e prefissato, o null se la chiave non è censita.
 */
export function buildPhysicalCookieKey(rawKey: CookieKey | EngineCookieKey, config?: CookieConfig): string | null {
    if (rawKey === CookieConsentService.NGSW_WORKER) {
        return rawKey;
    }

    const cfg = config ?? ({ ...ENGINE_COOKIE_MAP, ...COOKIE_MAP } as Readonly<Record<string, CookieConfig | undefined>>)[rawKey];
    if (!cfg) {
        console.error(`[CookieConsentService] Cookie "${rawKey}" non censito.`);
        return null;
    }

    // Sanitizzazione sicura (sottobanco): rimuove qualsiasi carattere che non sia
    // alfanumerico, trattino o underscore per evitare problemi nel parser nativo
    const safeKey = rawKey.replace(/[^a-zA-Z0-9_-]/g, '');
    const prefix = ConsentCategory[cfg.category].toLowerCase();
    return `${prefix}_${safeKey}`;
}

/**
 * COOKIE CONSENT SERVICE
 * Gestione centralizzata del consenso cookie — Conformità EU (ePrivacy + GDPR).
 *
 * Il principio cardine è il "Privacy by Default": le scritture sono bloccate
 * finché l'utente non esprime un consenso esplicito per la categoria relativa.
 *
 * isXxxNeeded è auto-calcolata dalla propria fetta di COOKIE_MAP.
 * Aggiungere un cookie a COOKIE_MAP fa comparire automaticamente la sezione nel banner.
 *
 * Le funzionalità built-in (lingua e service worker) sono gestite tramite
 * ENGINE_COOKIE_MAP per mantenere la COOKIE_MAP pulita per lo sviluppatore.
 */
@Injectable({ providedIn: 'root' })
export class CookieConsentService {
    public static readonly NGSW_WORKER = 'ngsw-worker.js';
    /** Durata della memoria del consenso: 180 giorni. Oltre questa soglia il Garante Privacy
     *  (Linee guida cookie 2021, confermate nell'aggiornamento 2024-25) richiede di riproporre
     *  il banner — più corta del Max-Age di default di `set()` (1 anno), usato per i cookie
     *  applicativi generici che non sono soggetti a questo vincolo. */
    private static readonly CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

    private readonly document = inject(DOCUMENT);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    /** Richiesta SSR: serve a leggere i cookie lato server (document.cookie è vuoto in SSR). */
    private readonly request = inject(REQUEST, { optional: true });
    private readonly localeConfig = inject(LOCALE_CONFIG);
    private readonly siteConfig = inject(SITE_CONFIG);

    // ─── CATEGORIE: isNeeded ────────────────────────────────────────────
    //
    // Ogni computed guarda esclusivamente la propria fetta di COOKIE_MAP.
    // isTechnicalNeeded include anche lingua built-in (multilingua) e SW (isWebApp).
    //
    // Usa localeConfig.availableLanguages (lista raw da global-settings.json) — non la lista
    // post-probeLanguages di TranslateService, che può essere ridotta se un file JSON
    // manca. La decisione sul cookie deve riflettere la configurazione dichiarata,
    // non l'esito dei file probe: altrimenti un file mancante fa sparire silenziosamente
    // il banner e blocca il salvataggio del consenso in un loop.

    readonly isTechnicalNeeded = computed(() =>
        this.localeConfig.availableLanguages.length > 1
        || this.siteConfig.isWebApp
        || (Object.values(COOKIE_MAP) as CookieConfig[]).some(c => c.category === ConsentCategory.Technical)
    );

    readonly isAnalyticsNeeded = computed(() =>
        (Object.values(COOKIE_MAP) as CookieConfig[]).some(c => c.category === ConsentCategory.Analytics)
    );

    readonly isProfilingNeeded = computed(() =>
        (Object.values(COOKIE_MAP) as CookieConfig[]).some(c => c.category === ConsentCategory.Profiling)
    );

    /** True se almeno una categoria richiede il consenso.
     *  Falso lato server: il banner non va nell'HTML SSR, compare solo dopo l'idratazione. */
    readonly isNeeded = computed(() =>
        this.isBrowser && (this.isTechnicalNeeded() || this.isAnalyticsNeeded() || this.isProfilingNeeded())
    );

    // ─── CONSENSO PER CATEGORIA ─────────────────────────────────────────

    private readonly _technicalAccepted = signal(false);
    private readonly _analyticsAccepted = signal(false);
    private readonly _profilingAccepted = signal(false);

    readonly technicalAccepted = this._technicalAccepted.asReadonly();
    readonly analyticsAccepted = this._analyticsAccepted.asReadonly();
    readonly profilingAccepted = this._profilingAccepted.asReadonly();

    /** True se l'utente ha interagito con il banner (ora o in sessioni precedenti).
     *  Sola lettura: si modifica solo via accept/reject/saveSelected/reopen. */
    private readonly _responded = signal(false);
    readonly responded = this._responded.asReadonly();

    /** Voci built-in del motore attive per questa configurazione (cookie lingua/SW/memorie del
     *  consenso + Web Storage consent_log/bearerToken). Esposte alla policy per l'elenco unico. */
    private readonly _activeEngine = signal<Record<string, CookieConfig>>({});
    readonly activeEngine = this._activeEngine.asReadonly();
    private readonly _cm: Readonly<Record<string, CookieConfig | undefined>>;

    constructor() {
        // Popoliamo le voci "engine" (built-in) dinamicamente in base alla configurazione.
        // Mappa unica: cookie (lingua, SW, memorie del consenso) + Web Storage (consent_log, bearerToken).
        const engine: Record<string, CookieConfig> = {};

        // Se ci sono più lingue, il cookie della lingua diventa tecnicamente necessario
        if (this.localeConfig.availableLanguages.length > 1) {
            engine['lang'] = ENGINE_COOKIE_MAP['lang'];
        }

        // Se è una PWA, il cookie del service worker diventa necessario
        if (this.siteConfig.isWebApp) {
            engine[CookieConsentService.NGSW_WORKER] = ENGINE_COOKIE_MAP['ngsw-worker.js'];
        }

        // ATTENZIONE: le proprietà isXxxNeeded() sono computed signals.
        // Durante la fase di costruttore (o init), chiamarle potrebbe restituire dati falsati o dare errore
        // se altri signal di cui dipendono non si sono stabilizzati.
        // Per questo motivo, qui ricalcoliamo la stessa logica "a mano" in modo sincrono usando i dati grezzi.
        const isTechnicalNeededNow =
            this.localeConfig.availableLanguages.length > 1
            || this.siteConfig.isWebApp
            || (Object.values(COOKIE_MAP) as CookieConfig[]).some(c => c.category === ConsentCategory.Technical);

        const isAnalyticsNeededNow = (Object.values(COOKIE_MAP) as CookieConfig[]).some(c => c.category === ConsentCategory.Analytics);
        const isProfilingNeededNow = (Object.values(COOKIE_MAP) as CookieConfig[]).some(c => c.category === ConsentCategory.Profiling);

        // Se una categoria richiede consenso, registriamo i cookie built-in che memorizzano quel consenso
        if (isTechnicalNeededNow) engine[CONSENT_KEYS.technical] = CONSENT_COOKIE_MAP[CONSENT_KEYS.technical];
        if (isAnalyticsNeededNow) engine[CONSENT_KEYS.analytics] = CONSENT_COOKIE_MAP[CONSENT_KEYS.analytics];
        if (isProfilingNeededNow) engine[CONSENT_KEYS.profiling] = CONSENT_COOKIE_MAP[CONSENT_KEYS.profiling];

        // Web Storage del motore: consent_log quando il banner è attivo, bearerToken solo se è
        // configurato un login. Essenziali → elencati in policy ma esclusi dalla pulizia alla revoca.
        if (isTechnicalNeededNow || isAnalyticsNeededNow || isProfilingNeededNow) {
            engine['consent_log'] = ENGINE_COOKIE_MAP['consent_log'];
        }
        if (this.siteConfig.loginPage != null) {
            engine['bearerToken'] = ENGINE_COOKIE_MAP['bearerToken'];
        }

        this._activeEngine.set(engine);
        this._cm = { ...engine, ...COOKIE_MAP };

        if (this.isBrowser) {
            try {
                const technicalStored = this.getCookie(CONSENT_KEYS.technical);
                const analyticsStored = this.getCookie(CONSENT_KEYS.analytics);
                const profilingStored = this.getCookie(CONSENT_KEYS.profiling);

                if (technicalStored !== null) this._technicalAccepted.set(technicalStored);
                if (analyticsStored !== null) this._analyticsAccepted.set(analyticsStored);
                if (profilingStored !== null) this._profilingAccepted.set(profilingStored);

                const anyStored = technicalStored !== null || analyticsStored !== null || profilingStored !== null;
                const allAnswered =
                    (!isTechnicalNeededNow || technicalStored !== null) &&
                    (!isAnalyticsNeededNow || analyticsStored !== null) &&
                    (!isProfilingNeededNow || profilingStored !== null);
                if (anyStored && allAnswered) this._responded.set(true);

                // ─── PULIZIA DEI COOKIE REVOCATI ───
                this.clearRevokedCookies();

                // ─── PULIZIA SW ALL'AVVIO ───
                // Se la PWA non deve essere attiva (isWebApp:false o consenso tecnico negato) ma un
                // SW è rimasto da una sessione/configurazione precedente, de-registralo subito: gli
                // utenti di ritorno già "risposti" non rivedono il banner e non ripassano da
                // persistConsent, quindi senza questo il SW resterebbe vivo a servire una cache obsoleta.
                if (!isDevMode() && (!this.siteConfig.isWebApp || !this._technicalAccepted())) {
                    this.unregisterServiceWorker();
                }
            } catch { }
        }
    }



    // ─── GESTIONE CONSENSO ──────────────────────────────────────────────

    /** Accetta tutte le categorie attualmente attive. */
    accept(): void {
        if (this.isTechnicalNeeded()) this._technicalAccepted.set(true);
        if (this.isAnalyticsNeeded()) this._analyticsAccepted.set(true);
        if (this.isProfilingNeeded()) this._profilingAccepted.set(true);
        this._responded.set(true);
        this.persistConsent();
    }

    /** Rifiuta tutte le categorie. */
    reject(): void {
        this._technicalAccepted.set(false);
        this._analyticsAccepted.set(false);
        this._profilingAccepted.set(false);
        this._responded.set(true);
        this.persistConsent();
    }

    /** Riapre il banner per permettere all'utente di modificare le proprie preferenze. */
    reopen(): void {
        this._responded.set(false);
    }

    /** Salva la selezione granulare fatta dall'utente tramite i toggle del banner. */
    saveSelected(technical: boolean, analytics: boolean, profiling: boolean): void {
        if (this.isTechnicalNeeded()) this._technicalAccepted.set(technical);
        if (this.isAnalyticsNeeded()) this._analyticsAccepted.set(analytics);
        if (this.isProfilingNeeded()) this._profilingAccepted.set(profiling);
        this._responded.set(true);
        this.persistConsent();
    }

    /**
     * Salva le scelte per categoria, poi applica i side effect.
     * Include log per dimostrare la conformità in caso di audit (Accountability GDPR).
     */
    private persistConsent(): void {
        if (!this.isBrowser) return;
        try {
            if (this.isTechnicalNeeded())
                this.setCookie(CONSENT_KEYS.technical, this._technicalAccepted(), CookieConsentService.CONSENT_MAX_AGE_SECONDS);
            else
                this.removeCookie(CONSENT_KEYS.technical);

            if (this.isAnalyticsNeeded())
                this.setCookie(CONSENT_KEYS.analytics, this._analyticsAccepted(), CookieConsentService.CONSENT_MAX_AGE_SECONDS);
            else
                this.removeCookie(CONSENT_KEYS.analytics);

            if (this.isProfilingNeeded())
                this.setCookie(CONSENT_KEYS.profiling, this._profilingAccepted(), CookieConsentService.CONSENT_MAX_AGE_SECONDS);
            else
                this.removeCookie(CONSENT_KEYS.profiling);

            const logValue = JSON.stringify({
                categories: {
                    technical: this._technicalAccepted(),
                    analytics: this._analyticsAccepted(),
                    profiling: this._profilingAccepted(),
                },
                timestamp: new Date().toISOString(),
                version: this.siteConfig.version,
            });
            localStorage.setItem('consent_log', logValue);
        } catch { }

        try {
            // ─── SIDE EFFECT DEL CONSENSO ───────────────────────────────────────

            // 1. Service Worker: allinea lo stato del SW al flag isWebApp e al consenso tecnico.
            if (!isDevMode() && 'serviceWorker' in navigator) {
                if (this.siteConfig.isWebApp && this._technicalAccepted()) {
                    // PWA attiva e consenso dato: registra nella sessione corrente (se non già presente).
                    navigator.serviceWorker.getRegistration().then(existing => {
                        if (!existing) {
                            navigator.serviceWorker.register(CookieConsentService.NGSW_WORKER, { scope: '/' }).catch(() => { });
                        }
                    });
                } else {
                    // PWA disattivata (isWebApp:false) o consenso tecnico negato: de-registra ogni SW
                    // residuo e svuota le sue cache, così chi aveva già il SW non resta servito da una
                    // copia obsoleta. Stessa pulizia gira anche all'avvio (costruttore), per gli utenti
                    // di ritorno che non ripassano da qui.
                    this.unregisterServiceWorker();
                }
            }

            // 2. Pulizia: rimuove attivamente tutti i cookie la cui categoria non è approvata
            this.clearRevokedCookies();
        } catch { }
    }

    // ─── GESTIONE ARCHIVIAZIONE (cookie + Web Storage) ──────────────────
    //
    // Chiave fisica del cookie: {category}_{rawKey} (eccetto service worker). Per il Web Storage
    // la chiave è raw. Il mezzo lo decide `config.storage`; set/get/remove instradano da soli.
    // Gestisce in modo unificato CookieKey (progetto) ed EngineCookieKey (built-in).
    // Una chiave non censita blocca la scrittura (Privacy by Default).

    /**
     * Scrive una voce nello storage del browser — cookie o Web Storage, secondo `config.storage`.
     * Bloccata se la chiave non è censita o se manca il consenso per la categoria (Privacy by Default).
     * I cookie di memoria del consenso bypassano il gate (serve poter salvare lo "0" su rifiuto).
     *
     * @param key La chiave tipizzata, presente in `COOKIE_MAP`/`ENGINE_COOKIE_MAP`.
     * @param value Il valore tipizzato in base alla configurazione.
     * @param maxAgeSeconds Durata in secondi (solo cookie; ignorata dal Web Storage).
     */
    set<K extends CookieKey | EngineCookieKey>(key: K, value: InferCookieType<K>, maxAgeSeconds: number = 60 * 60 * 24 * 365): void {
        const rawKey = key as string;
        const config = this._cm[rawKey];
        if (!config || !this.isBrowser) return;

        // Voce a prefisso: rappresenta una famiglia di chiavi create dal provider (non da noi) →
        // la scrittura via API non ha una chiave singola su cui operare. È solo policy + pulizia.
        if (config.match === 'prefix') return;

        // I memo del consenso bypassano il gate, altrimenti non potremmo salvare uno "0" su rifiuto.
        const isConsentMemo = (Object.values(CONSENT_KEYS) as string[]).includes(rawKey);
        if (!this.isCategoryAccepted(config.category) && !isConsentMemo) return;

        const strValue = this.serialize(value, config.valueType);
        if (strValue === null) return; // valore non serializzabile → nessuna scrittura (niente crash)
        const medium = config.storage ?? 'cookie';

        if (medium === 'cookie') {
            const fullKey = buildPhysicalCookieKey(key, config);
            if (!fullKey) return;
            this.document.cookie = `${fullKey}=${encodeURIComponent(strValue)}; Max-Age=${maxAgeSeconds}${this.cookieSecurityAttributes()}`;
        } else {
            this.writeWebStorage(rawKey, strValue, medium);
        }
    }

    /** Serializza un valore in stringa secondo il `valueType` (comune a cookie e Web Storage).
     *  Ritorna `null` se il valore non è serializzabile (JSON circolare, `undefined`, ecc.): la
     *  scrittura viene SALTATA invece di propagare un'eccezione e rompere il chiamante. */
    private serialize(value: unknown, type: CookieValueType = 'string'): string | null {
        try {
            if (type === 'boolean') return value ? '1' : '0';
            if (type === 'number') return String(value);
            if (type === 'json') return JSON.stringify(value) ?? null;
            return String(value);
        } catch (err) {
            if (isDevMode()) console.warn('[CookieConsentService] valore non serializzabile, scrittura saltata', err);
            return null;
        }
    }

    /**
     * Attributi di sicurezza comuni a tutti i cookie scritti dal template.
     * `Secure` viene aggiunto automaticamente quando la pagina è servita su HTTPS:
     * in produzione (dietro reverse proxy TLS) i cookie viaggiano solo cifrati, mentre
     * in locale su http restano scrivibili. Zero-config, deciso a runtime dal protocollo.
     */
    private cookieSecurityAttributes(): string {
        const secure = this.isBrowser && this.document.location?.protocol === 'https:' ? '; Secure' : '';
        return `; Path=/; SameSite=Lax${secure}`;
    }

    /**
     * Legge una voce — cookie o Web Storage, secondo `config.storage`. Ritorna `null` se non
     * censita o assente. Le letture non richiedono consenso (il gate è solo sulla scrittura).
     * I cookie si leggono anche in SSR (header della request); il Web Storage è browser-only → in
     * SSR torna `null` (per questo le voci storage non vanno usate per contenuto renderizzato SSR).
     *
     * @param key La chiave tipizzata della voce.
     * @returns Il valore decodificato e castato, o `null` se assente o non censito.
     */
    get<K extends CookieKey | EngineCookieKey>(key: K): InferCookieType<K> | null {
        const config = this._cm[key as string];
        if (!config) return null;
        const medium = config.storage ?? 'cookie';
        const raw = medium === 'cookie'
            ? this.readRawCookie(buildPhysicalCookieKey(key, config) ?? (key as string))
            : this.readWebStorage(key as string, medium);
        if (raw === null) return null;
        return this.deserialize<InferCookieType<K>>(raw, config.valueType);
    }

    /** Deserializza una stringa nel tipo dichiarato (`valueType`). Comune a cookie e Web Storage. */
    private deserialize<T>(raw: string, type: CookieValueType = 'string'): T | null {
        if (type === 'boolean') return (raw === '1' || raw === 'true') as T;
        if (type === 'number') { const n = parseFloat(raw); return isNaN(n) ? null : (n as T); }
        if (type === 'json') { try { return JSON.parse(raw) as T; } catch { return null; } }
        return raw as T;
    }

    /**
     * Valore grezzo di un cookie: da `document.cookie` nel browser, dall'header `cookie`
     * della REQUEST in SSR. Senza la lettura SSR, getCookie tornerebbe null lato server
     * (document.cookie è vuoto): la lingua salvata verrebbe ignorata e l'HTML SSR uscirebbe
     * in defaultLang → hydration mismatch col primo render client. Le letture non richiedono
     * consenso (il gate GDPR è solo sulla scrittura).
     */
    private readRawCookie(fullKey: string): string | null {
        const header = this.isBrowser
            ? this.document.cookie
            : (this.request?.headers.get('cookie') ?? '');
        if (!header) return null;
        for (const part of header.split(';')) {
            const cookie = part.trim();
            if (cookie.startsWith(fullKey + '=')) {
                return decodeURIComponent(cookie.substring(fullKey.length + 1));
            }
        }
        return null;
    }

    /**
     * Rimuove una voce — cookie o Web Storage, secondo `config.storage`.
     * A differenza della scrittura, l'eliminazione è sempre consentita anche a consenso revocato.
     *
     * @param key La chiave tipizzata della voce da eliminare.
     */
    remove(key: CookieKey | EngineCookieKey): void {
        if (!this.isBrowser) return;
        const config = this._cm[key as string];
        const medium = config?.storage ?? 'cookie';
        if (medium === 'cookie') {
            // Best-effort: una chiave non censita qui è innocua, risolviamo il nome in silenzio.
            const fullKey = config ? buildPhysicalCookieKey(key, config) ?? (key as string) : (key as string);
            this.document.cookie = `${fullKey}=; Max-Age=0${this.cookieSecurityAttributes()}`;
        } else {
            this.removeWebStorage(key as string, medium, config?.match);
        }
    }

    // ─── ALIAS DI COMPATIBILITÀ (deprecati) ─────────────────────────────
    // L'API era storicamente cookie-only. Ora set/get/remove instradano anche sul Web Storage in
    // base a `config.storage`; questi alias restano per non rompere i call-site esistenti.

    /** @deprecated Usa `set` (instrada anche su Web Storage). */
    setCookie<K extends CookieKey | EngineCookieKey>(key: K, value: InferCookieType<K>, maxAgeSeconds?: number): void {
        this.set(key, value, maxAgeSeconds);
    }
    /** @deprecated Usa `get`. */
    getCookie<K extends CookieKey | EngineCookieKey>(key: K): InferCookieType<K> | null {
        return this.get(key);
    }
    /** @deprecated Usa `remove`. */
    removeCookie(key: CookieKey | EngineCookieKey): void {
        this.remove(key);
    }

    /** Scrive nel Web Storage (browser-only, best-effort). Chiave raw, non prefissata come i cookie. */
    private writeWebStorage(rawKey: string, value: string, medium: StorageMedium): void {
        if (!this.isBrowser) return;
        try { (medium === 'session' ? sessionStorage : localStorage).setItem(rawKey, value); } catch { }
    }

    /** Legge dal Web Storage (browser-only). Chiave raw. */
    private readWebStorage(rawKey: string, medium: StorageMedium): string | null {
        if (!this.isBrowser) return null;
        try { return (medium === 'session' ? sessionStorage : localStorage).getItem(rawKey); } catch { return null; }
    }

    // ─── PREFERENZA LINGUA (built-in) ───────────────────────────────────
    //
    // Metodi cappello per esporre un'API pulita, appoggiati sui primitivi standard
    // e sull'ENGINE_COOKIE_MAP.

    getSavedLanguage(): string | null {
        return this.getCookie('lang');
    }

    setSavedLanguage(language: string): void {
        this.setCookie('lang', language);
    }

    clearSavedLanguage(): void {
        this.removeCookie('lang');
    }

    // ─── HELPER INTERNI ───────────────────────────────────────────────

    private isCategoryAccepted(category: ConsentCategory): boolean {
        switch (category) {
            case ConsentCategory.Technical: return this._technicalAccepted();
            case ConsentCategory.Analytics: return this._analyticsAccepted();
            case ConsentCategory.Profiling: return this._profilingAccepted();
            default: return false;
        }
    }

    /**
     * De-registra ogni Service Worker residuo e svuota le sue cache. Idempotente e browser-only:
     * se non c'è nulla da rimuovere è un no-op. Usato quando la PWA non deve essere attiva
     * (`isWebApp:false` o consenso tecnico negato), sia all'avvio sia al cambio di consenso, così
     * un SW registrato in passato non continua a servire una copia in cache obsoleta.
     */
    private unregisterServiceWorker(): void {
        if (!this.isBrowser || !('serviceWorker' in navigator)) return;
        navigator.serviceWorker.getRegistrations()
            .then(regs => regs.forEach(r => r.unregister().catch(() => { })))
            .catch(() => { });
        if (typeof caches !== 'undefined') {
            caches.keys()
                .then(keys => keys.forEach(k => caches.delete(k).catch(() => { })))
                .catch(() => { });
        }
    }

    /**
     * Rimuove fisicamente dal browser tutte le voci gestite (cookie + Web Storage) la cui categoria
     * è attualmente rifiutata dall'utente. Sono ignorate: le memorie del consenso e il Web Storage
     * essenziale del motore (consent_log, bearerToken), per non perdere prova del consenso e sessione.
     */
    private clearRevokedCookies(): void {
        if (!this.isBrowser) return;

        for (const [rawKey, config] of Object.entries(this._cm) as [string, CookieConfig | undefined][]) {
            // Saltiamo: Service Worker, memorie del consenso e Web Storage essenziale del motore.
            if (!config
                || rawKey === CookieConsentService.NGSW_WORKER
                || (Object.values(CONSENT_KEYS) as string[]).includes(rawKey)
                || (ESSENTIAL_ENGINE_STORAGE_KEYS as readonly string[]).includes(rawKey)) {
                continue;
            }
            // remove() instrada da solo su cookie o Web Storage in base a config.storage.
            if (!this.isCategoryAccepted(config.category)) {
                this.remove(rawKey as CookieKey | EngineCookieKey);
            }
        }
    }

    /** Rimuove una voce dal Web Storage (browser-only, best-effort). Il nome è la chiave raw,
     *  non prefissata come i cookie. Con `match:'prefix'` rimuove l'intera famiglia di chiavi che
     *  iniziano per `rawKey` (telemetria di terza parte con suffisso dinamico), altrimenti la
     *  singola chiave esatta. */
    private removeWebStorage(rawKey: string, medium: StorageMedium, match: 'exact' | 'prefix' = 'exact'): void {
        if (!this.isBrowser) return;
        try {
            const store = medium === 'session' ? sessionStorage : localStorage;
            if (match === 'prefix') {
                // Snapshot delle chiavi: removeItem muta l'indice dello Storage durante il ciclo.
                // Le chiavi ESSENZIALI del motore (consent_log, bearerToken) sono saltate SEMPRE: un
                // prefisso del progetto non può conoscerle né distinguerle, ma cancellarle vuol dire
                // perdere la prova del consenso o la sessione. Sono protette a monte in
                // clearRevokedCookies per le loro voci; qui va difeso anche il match collaterale.
                for (const k of Object.keys(store)) {
                    if (k.startsWith(rawKey) && !(ESSENTIAL_ENGINE_STORAGE_KEYS as readonly string[]).includes(k)) {
                        store.removeItem(k);
                    }
                }
            } else {
                store.removeItem(rawKey);
            }
        } catch { }
    }
}
