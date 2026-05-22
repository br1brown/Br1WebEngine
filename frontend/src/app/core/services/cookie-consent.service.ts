import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, Injector, computed, inject, isDevMode, PLATFORM_ID, signal } from '@angular/core';
import { TranslateService } from './translate.service';
import { ContestoSito } from '../../site';

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
 * Il nome fisico del cookie nel browser sarà: {appSlug}.{category}.{rawKey}
 * Es. COOKIE_KEYS = { GA: '_ga' }, COOKIE_MAP = { _ga: Analytics }
 *   → cookie "myapp.analytics._ga"
 *
 * Cookie non censiti (non in COOKIE_MAP) usano {appSlug}.{rawKey} senza categoria
 * e generano un console.warn — il progetto resta funzionante ma non è GDPR compliant.
 */
export const COOKIE_KEYS = {} as const;
export type CookieKey = typeof COOKIE_KEYS[keyof typeof COOKIE_KEYS];

type CookieMap = Readonly<Record<string, CookieCategory>>;
const COOKIE_MAP: CookieMap = {};

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
 * - Preferenza lingua  →  {appSlug}.lang  (tecnico, built-in)
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
        || Object.values(COOKIE_MAP).some(c => c === CookieCategory.Technical)
    );

    readonly isAnalyticsNeeded = computed(() =>
        Object.values(COOKIE_MAP).some(c => c === CookieCategory.Analytics)
    );

    readonly isProfilingNeeded = computed(() =>
        Object.values(COOKIE_MAP).some(c => c === CookieCategory.Profiling)
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
                    || Object.values(COOKIE_MAP).some(c => c === CookieCategory.Technical);
                const isAnalyticsNeededNow = Object.values(COOKIE_MAP).some(c => c === CookieCategory.Analytics);
                const isProfilingNeededNow = Object.values(COOKIE_MAP).some(c => c === CookieCategory.Profiling);

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
            if (this.isTechnicalNeeded()) localStorage.setItem(`${this.consentKey}-technical`, this._technicalAccepted() ? '1' : '0');
            if (this.isAnalyticsNeeded()) localStorage.setItem(`${this.consentKey}-analytics`, this._analyticsAccepted() ? '1' : '0');
            if (this.isProfilingNeeded()) localStorage.setItem(`${this.consentKey}-profiling`, this._profilingAccepted() ? '1' : '0');
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
        this.applyConsent();
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
    // Chiave fisica nel browser: {appSlug}.{category}.{rawKey}  ← censito in COOKIE_MAP
    //                            {appSlug}.{rawKey}             ← non censito (+ console.warn)
    //
    // Quando COOKIE_KEYS = {}, CookieKey = never: setCookie/getCookie non sono invocabili
    // a compile-time — errore TypeScript prima ancora di arrivare a runtime.

    /** Scrive un cookie di progetto.
     *  Bloccato silenziosamente se il consenso per la categoria non è stato dato. */
    setCookie(key: CookieKey, value: string, maxAgeSeconds: number): void {
        const rawKey = key as string;
        const category = COOKIE_MAP[rawKey];
        if (!category) {
            this.warnUnregistered(rawKey, 'set');
            if (!this._technicalAccepted()) return;
            this.writeCookieDirect(`${this.appSlug}.${rawKey}`, value, maxAgeSeconds);
            return;
        }
        if (!this.isCategoryAccepted(category)) return;
        this.writeCookieDirect(`${this.appSlug}.${category}.${rawKey}`, value, maxAgeSeconds);
    }

    /** Legge un cookie di progetto. */
    getCookie(key: CookieKey): string | null {
        const rawKey = key as string;
        const category = COOKIE_MAP[rawKey];
        if (!category) {
            this.warnUnregistered(rawKey, 'get');
            return this.readCookieDirect(`${this.appSlug}.${rawKey}`);
        }
        return this.readCookieDirect(`${this.appSlug}.${category}.${rawKey}`);
    }

    /** Rimuove un cookie di progetto. La rimozione è sempre consentita. */
    removeCookie(key: CookieKey): void {
        const rawKey = key as string;
        const category = COOKIE_MAP[rawKey];
        const storageKey = category
            ? `${this.appSlug}.${category}.${rawKey}`
            : `${this.appSlug}.${rawKey}`;
        this.eraseCookieDirect(storageKey);
    }

    // ─── PREFERENZA LINGUA (built-in) ───────────────────────────────────
    //
    // Metodo cappello: usa la stessa meccanica write/read ma non passa per COOKIE_MAP.
    // Chiave fisica: {appSlug}.lang  (namespaced, senza categoria — funzionalità built-in)

    private readonly LANG_KEY = `${this.appSlug}.lang`;
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

    // ─── PRIMITIVI COOKIE ───────────────────────────────────────────────

    private warnUnregistered(key: string, op: 'set' | 'get'): void {
        console.warn(
            `[CookieConsentService] ${op === 'set' ? 'Scrittura' : 'Lettura'} del cookie "${key}" — non censito in COOKIE_MAP.`,
            `Chiave usata nel browser: "${this.appSlug}.${key}" (senza categoria — non GDPR compliant).`,
            'Per censirlo: aggiungilo a COOKIE_KEYS e COOKIE_MAP in cookie-consent.service.ts.'
        );
    }

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
        }
    }
}
