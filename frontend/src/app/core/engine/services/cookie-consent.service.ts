import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, Injector, computed, inject, isDevMode, PLATFORM_ID, signal } from '@angular/core';
import { TranslateService } from './translate.service';
import { ContestoSito } from '../../../site';
import { COOKIE_MAP, CookieCategory, type CookieKey, type CookieConfig } from '../../services/cookie-registry';

export { CookieCategory } from '../../services/cookie-registry';
export type { CookieKey } from '../../services/cookie-registry';

/**
 * Controlla se il consenso tecnico è stato già salvato in localStorage.
 * Fonte unica della chiave — usata anche da app.config.ts per decidere
 * se abilitare il Service Worker all'avvio dell'app.
 */
export function isTechnicalConsentGiven(): boolean {
    try {
        const slug = ContestoSito.config.appName.replaceAll(' ', '-').toLowerCase();
        return localStorage.getItem(`cookie-consent-${slug}-technical`) === '1';
    } catch {
        return false;
    }
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
 * Due funzionalità sono gestite direttamente dal servizio come metodi cappello,
 * al di fuori di COOKIE_KEYS/COOKIE_MAP perché omnipresenti nel sito:
 * - Preferenza lingua  →  lang  (tecnico, built-in)
 * - Service Worker     →  registrazione ngsw-worker.js  (tecnico, built-in)
 */
@Injectable({ providedIn: 'root' })
export class CookieConsentService {
    private readonly document = inject(DOCUMENT);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly injector = inject(Injector);

    private readonly appSlug = ContestoSito.config.appName.replaceAll(' ', '-').toLowerCase();
    private readonly consentKey = `cookie-consent-${this.appSlug}`;
    private readonly consentLogKey = `cookie-consent-log-${this.appSlug}`;

    // ─── CATEGORIE: isNeeded ────────────────────────────────────────────
    //
    // Ogni computed guarda esclusivamente la propria fetta di COOKIE_MAP.
    // isTechnicalNeeded include anche lingua built-in (multilingua) e SW (isWebApp).
    //
    // @remarks isTechnicalNeeded usa injector.get(TranslateService) anziché
    // inject() nel costruttore per spezzare la dipendenza circolare:
    // CookieConsentService → TranslateService → CookieConsentService.
    // @warning NON sostituire con inject(TranslateService) nel costruttore.

    readonly isTechnicalNeeded = computed(() =>
        this.injector.get(TranslateService).availableLangs().length > 1
        || ContestoSito.config.isWebApp
        || (Object.values(COOKIE_MAP) as CookieConfig[]).some(c => c.category === CookieCategory.Technical)
    );

    readonly isAnalyticsNeeded = computed(() =>
        (Object.values(COOKIE_MAP) as CookieConfig[]).some(c => c.category === CookieCategory.Analytics)
    );

    readonly isProfilingNeeded = computed(() =>
        (Object.values(COOKIE_MAP) as CookieConfig[]).some(c => c.category === CookieCategory.Profiling)
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

    /** True se l'utente ha interagito con il banner (ora o in sessioni precedenti). */
    readonly responded = signal(false);

    constructor() {
        if (this.isBrowser) {
            try {
                const technicalStored = localStorage.getItem(`${this.consentKey}-technical`);
                const analyticsStored = localStorage.getItem(`${this.consentKey}-analytics`);
                const profilingStored = localStorage.getItem(`${this.consentKey}-profiling`);

                if (technicalStored !== null) this._technicalAccepted.set(technicalStored === '1');
                if (analyticsStored !== null) this._analyticsAccepted.set(analyticsStored === '1');
                if (profilingStored !== null) this._profilingAccepted.set(profilingStored === '1');

                // isTechnicalNeeded() NON va chiamata qui (causa NG0200 via injector.get).
                // Replica la stessa logica usando ContestoSito e COOKIE_MAP direttamente.
                const isTechnicalNeededNow =
                    ContestoSito.config.availableLanguages.length > 1
                    || ContestoSito.config.isWebApp
                    || (Object.values(COOKIE_MAP) as CookieConfig[]).some(c => c.category === CookieCategory.Technical);
                const isAnalyticsNeededNow = (Object.values(COOKIE_MAP) as CookieConfig[]).some(c => c.category === CookieCategory.Analytics);
                const isProfilingNeededNow = (Object.values(COOKIE_MAP) as CookieConfig[]).some(c => c.category === CookieCategory.Profiling);

                const anyStored = technicalStored !== null || analyticsStored !== null || profilingStored !== null;
                const allAnswered =
                    (!isTechnicalNeededNow || technicalStored !== null) &&
                    (!isAnalyticsNeededNow || analyticsStored !== null) &&
                    (!isProfilingNeededNow || profilingStored !== null);
                if (anyStored && allAnswered) this.responded.set(true);
            } catch { }
        }
    }

    // ─── GESTIONE CONSENSO ──────────────────────────────────────────────

    /** Accetta tutte le categorie attualmente attive. */
    accept(): void {
        if (this.isTechnicalNeeded()) this._technicalAccepted.set(true);
        if (this.isAnalyticsNeeded()) this._analyticsAccepted.set(true);
        if (this.isProfilingNeeded()) this._profilingAccepted.set(true);
        this.responded.set(true);
        this.persistConsent();
    }

    /** Rifiuta tutte le categorie. */
    reject(): void {
        this._technicalAccepted.set(false);
        this._analyticsAccepted.set(false);
        this._profilingAccepted.set(false);
        this.responded.set(true);
        this.persistConsent();
    }

    /** Riapre il banner per permettere all'utente di modificare le proprie preferenze. */
    reopen(): void {
        this.responded.set(false);
    }

    /** Salva la selezione granulare fatta dall'utente tramite i toggle del banner. */
    saveSelected(technical: boolean, analytics: boolean, profiling: boolean): void {
        if (this.isTechnicalNeeded()) this._technicalAccepted.set(technical);
        if (this.isAnalyticsNeeded()) this._analyticsAccepted.set(analytics);
        if (this.isProfilingNeeded()) this._profilingAccepted.set(profiling);
        this.responded.set(true);
        this.persistConsent();
    }

    /**
     * Salva le scelte per categoria in localStorage, poi applica i side effect.
     * Include log per dimostrare la conformità in caso di audit (Accountability GDPR).
     */
    private persistConsent(): void {
        if (!this.isBrowser) return;
        try {
            // Categorie necessarie: scrivi il consenso. Non più necessarie: rimuovi la chiave
            // per evitare che un vecchio '1' venga ripristinato al reload se la categoria torna.
            if (this.isTechnicalNeeded()) localStorage.setItem(`${this.consentKey}-technical`, this._technicalAccepted() ? '1' : '0');
            else localStorage.removeItem(`${this.consentKey}-technical`);
            if (this.isAnalyticsNeeded()) localStorage.setItem(`${this.consentKey}-analytics`, this._analyticsAccepted() ? '1' : '0');
            else localStorage.removeItem(`${this.consentKey}-analytics`);
            if (this.isProfilingNeeded()) localStorage.setItem(`${this.consentKey}-profiling`, this._profilingAccepted() ? '1' : '0');
            else localStorage.removeItem(`${this.consentKey}-profiling`);
            localStorage.setItem(this.consentLogKey, JSON.stringify({
                categories: {
                    technical: this._technicalAccepted(),
                    analytics: this._analyticsAccepted(),
                    profiling: this._profilingAccepted(),
                },
                timestamp: new Date().toISOString(),
                version: ContestoSito.config.version,
            }));
        } catch { }
        try { this.applyConsent(); } catch { }
    }

    // ─── SIDE EFFECT DEL CONSENSO ───────────────────────────────────────
    //
    // Punto unico per tutto ciò che deve accadere quando l'utente accetta o rifiuta.
    // Per aggiungere un nuovo side effect: aggiungere un metodo applyXxx() e chiamarlo qui.

    private applyConsent(): void {
        this.applyServiceWorker();
        this.applyLanguagePreference();
    }

    /**
     * Metodo cappello SW: registra ngsw-worker.js nella sessione corrente appena
     * il consenso tecnico è dato. All'avvio successivo provideServiceWorker() usa
     * isTechnicalConsentGiven() e lo registra con l'integrazione Angular (SwUpdate).
     * Nessuna operazione se isWebApp è false in site.ts.
     */
    private applyServiceWorker(): void {
        if (!this.isBrowser || isDevMode() || !ContestoSito.config.isWebApp) return;
        if (this._technicalAccepted() && 'serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(existing => {
                if (!existing) {
                    navigator.serviceWorker.register('ngsw-worker.js', { scope: '/' }).catch(() => {
                        // Fallback silenzioso: il SW si registrerà al prossimo caricamento
                    });
                }
            });
        }
    }

    /**
     * Metodo cappello lingua: se il consenso tecnico è revocato rimuove il cookie lingua.
     * La scrittura avviene in setSavedLanguage() al momento del cambio lingua.
     */
    private applyLanguagePreference(): void {
        if (!this._technicalAccepted()) {
            this.eraseCookieDirect(this.LANG_KEY);
        }
    }

    // ─── COOKIE DI PROGETTO (tipizzati) ─────────────────────────────────
    //
    // Chiave fisica nel browser: {category}.{rawKey}
    //
    // CookieKey = keyof typeof COOKIE_MAP.
    // Con mappa vuota: CookieKey = never → setCookie/getCookie non sono invocabili
    // a compile-time — errore TypeScript prima ancora di arrivare a runtime.
    //
    // I tre metodi includono un check runtime difensivo per eventuali cast `as any`.
    // Una chiave non censita blocca la scrittura con console.error (Privacy by Default).

    private readonly _cm = COOKIE_MAP as Readonly<Record<string, CookieConfig | undefined>>;

    /** Scrive un cookie di progetto.
     *  Bloccato se la chiave non è censita in COOKIE_MAP o se il consenso manca. */
    setCookie(key: CookieKey, value: string, maxAgeSeconds: number): void {
        const rawKey = key as string;
        const config = this._cm[rawKey];
        if (!config) {
            console.error(`[CookieConsentService] Cookie "${rawKey}" non censito in COOKIE_MAP — scrittura bloccata. Aggiungilo a COOKIE_MAP in cookie-registry.ts.`);
            return;
        }
        if (!this.isCategoryAccepted(config.category)) return;
        this.writeCookieDirect(`${config.category}.${rawKey}`, value, maxAgeSeconds);
    }

    /** Legge un cookie di progetto. */
    getCookie(key: CookieKey): string | null {
        const rawKey = key as string;
        const config = this._cm[rawKey];
        if (!config) {
            console.error(`[CookieConsentService] Cookie "${rawKey}" non censito in COOKIE_MAP — lettura bloccata.`);
            return null;
        }
        return this.readCookieDirect(`${config.category}.${rawKey}`);
    }

    /** Rimuove un cookie di progetto. La rimozione è sempre consentita. */
    removeCookie(key: CookieKey): void {
        const rawKey = key as string;
        const config = this._cm[rawKey];
        this.eraseCookieDirect(config ? `${config.category}.${rawKey}` : rawKey);
    }

    // ─── PREFERENZA LINGUA (built-in) ───────────────────────────────────
    //
    // Metodo cappello: usa la stessa meccanica write/read ma non passa per COOKIE_MAP.
    // Chiave fisica: lang  (senza namespace — funzionalità built-in)

    private readonly LANG_KEY = 'lang';
    private readonly LANG_MAX_AGE = 60 * 60 * 24 * 365;

    getSavedLanguage(): string | null {
        return this.readCookieDirect(this.LANG_KEY);
    }

    setSavedLanguage(language: string): void {
        if (!this._technicalAccepted()) return;
        this.writeCookieDirect(this.LANG_KEY, language, this.LANG_MAX_AGE);
    }

    clearSavedLanguage(): void {
        this.eraseCookieDirect(this.LANG_KEY);
    }

    // ─── LISTA MARKDOWN DEI COOKIE ──────────────────────────────────────

    /**
     * Genera una tabella Markdown con i cookie presenti nel sito.
     * Restituisce stringa vuota se non ci sono cookie da mostrare.
     *
     * @param t Funzione di traduzione — riceve una chiave i18n e restituisce il testo tradotto.
     */
    listMarkdown(t: (key: string) => string): string {
        const rows: string[] = [];
        rows.push(`| ${t('nomeListaCookie')} | ${t('categoriaListaCookie')} | ${t('descrizioneListaCookie')} |`);
        rows.push('|---|---|---|');
        if (ContestoSito.config.availableLanguages.length > 1) {
            rows.push(`| \`lang\` | ${t('tecniciCategoriaCookie')} | ${t('linguaDescrizioneListaCookie')} |`);
        }
        if (ContestoSito.config.isWebApp) {
            rows.push(`| \`ngsw-worker.js\` | ${t('tecniciCategoriaCookie')} | ${t('swDescrizioneListaCookie')} |`);
        }
        for (const [rawKey, rawConfig] of Object.entries(COOKIE_MAP)) {
            const config = rawConfig as CookieConfig;
            const category = config.category;
            const desc = config.descriptionKey ? t(config.descriptionKey) : '';
            rows.push(`| \`${category}.${rawKey}\`  | ${t(`${category}CategoriaCookie`) }  | ${desc} |`);
        }
        if (rows.length <= 2) return '';
        return rows.join('\n');
    }

    // ─── PRIMITIVI COOKIE ───────────────────────────────────────────────

    private readCookieDirect(key: string): string | null {
        if (!this.isBrowser) return null;
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = this.document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedKey}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : null;
    }

    private writeCookieDirect(key: string, value: string, maxAgeSeconds: number): void {
        if (!this.isBrowser) return;
        this.document.cookie = `${key}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
    }

    private eraseCookieDirect(key: string): void {
        if (!this.isBrowser) return;
        this.document.cookie = `${key}=; Path=/; Max-Age=0; SameSite=Lax`;
    }

    private isCategoryAccepted(category: CookieCategory): boolean {
        switch (category) {
            case CookieCategory.Technical: return this._technicalAccepted();
            case CookieCategory.Analytics: return this._analyticsAccepted();
            case CookieCategory.Profiling: return this._profilingAccepted();
            default: return false;
        }
    }
}
