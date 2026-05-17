import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, Injector, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { TranslateService } from './translate.service';
import { ContestoSito } from '../../site';

export enum CookieCategory {
    Technical = 'technical',
    Analytics = 'analytics',
    Profiling = 'profiling',
}

/**
 * COOKIE CONSENT SERVICE
 * Gestione centralizzata del consenso cookie — Conformità EU (ePrivacy + GDPR).
 *
 * Il principio cardine è il "Privacy by Default": le scritture sono bloccate
 * finché l'utente non esprime un consenso esplicito per la categoria relativa.
 *
 * Ogni categoria ha una computed `isXxxNeeded` che determina se la sezione
 * compare nel banner. Default: false (categoria inattiva, non appare nel banner).
 * Per attivare una categoria: modifica la funzione perché ritorni true.
 * La funzione è computed quindi può essere dinamica — es. condizionata allo
 * stato di login, alla presenza di uno script di terze parti, ecc.
 *
 * La categoria è dichiarata al momento della scrittura (setCookie).
 * La lettura (getCookie) non richiede la categoria: se il consenso non fu
 * mai dato, il cookie non fu mai scritto e la lettura restituisce null da sola.
 */
@Injectable({ providedIn: 'root' })
export class CookieConsentService {
    private readonly document = inject(DOCUMENT);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly injector = inject(Injector);

    private readonly appSlug = ContestoSito.config.appName.replaceAll(' ', '-').toLowerCase();
    private readonly consentKey = `cookie-consent-${this.appSlug}`;
    private readonly consentLogKey = `cookie-consent-log-${this.appSlug}`;
    private readonly languagePreferenceKey = 'lang';
    private readonly languagePreferenceMaxAgeSeconds = 60 * 60 * 24 * 365;

    // ─── CATEGORIE: isNeeded ────────────────────────────────────────────
    //
    // Ogni categoria sa autonomamente se è necessaria, leggendo lo stato
    // dei servizi che la riguardano. Il servizio cookie è lui a sapere dove
    // andare a recuperare l'informazione — chi usa il servizio non deve
    // occuparsene.
    //
    // @remarks isTechnicalNeeded usa injector.get(TranslateService) anziché
    // inject() nel costruttore per spezzare la dipendenza circolare:
    // CookieConsentService → TranslateService → CookieConsentService.
    // injector.get() è lazy: risolto solo quando la computed viene letta,
    // dopo che entrambi i servizi sono stati costruiti.
    // @warning NON sostituire con inject(TranslateService) nel costruttore.

    readonly isTechnicalNeeded = computed(() =>
        this.injector.get(TranslateService).availableLangs().length > 1
    );

    readonly isAnalyticsNeeded = computed(() => true);

    readonly isProfilingNeeded = computed(() => true);

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

                // Carica sempre i valori salvati (pre-riempiono i toggle anche se il banner riappare)
                if (technicalStored !== null) this._technicalAccepted.set(technicalStored === '1');
                if (analyticsStored !== null) this._analyticsAccepted.set(analyticsStored === '1');
                if (profilingStored !== null) this._profilingAccepted.set(profilingStored === '1');

                // responded = true solo se tutte le categorie attualmente attive hanno una risposta.
                // isTechnicalNeeded() NON va chiamata qui: usa injector.get(TranslateService) che
                // causa NG0200 (ciclo DI) se chiamato durante la costruzione del servizio.
                // Usiamo ContestoSito.config.availableLanguages — stessa logica, senza injector.
                const isTechnicalNeededNow = ContestoSito.config.availableLanguages.length > 1;
                const anyStored = technicalStored !== null || analyticsStored !== null || profilingStored !== null;
                const allAnswered =
                    (!isTechnicalNeededNow || technicalStored !== null) &&
                    (!this.isAnalyticsNeeded() || analyticsStored !== null) &&
                    (!this.isProfilingNeeded() || profilingStored !== null);
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
     * Salva le scelte per categoria in localStorage.
     * Include log per dimostrare la conformità in caso di audit (Accountability GDPR).
     */
    private persistConsent(): void {
        if (!this.isBrowser) return;
        try {
            if (this.isTechnicalNeeded()) localStorage.setItem(`${this.consentKey}-technical`, this._technicalAccepted() ? '1' : '0');
            if (this.isAnalyticsNeeded()) localStorage.setItem(`${this.consentKey}-analytics`, this._analyticsAccepted() ? '1' : '0');
            if (this.isProfilingNeeded()) localStorage.setItem(`${this.consentKey}-profiling`, this._profilingAccepted() ? '1' : '0');
            const log = {
                categories: {
                    technical: this._technicalAccepted(),
                    analytics: this._analyticsAccepted(),
                    profiling: this._profilingAccepted(),
                },
                timestamp: new Date().toISOString(),
                version: ContestoSito.config.version,
            };
            localStorage.setItem(this.consentLogKey, JSON.stringify(log));
        } catch { }
    }

    // ─── OPERAZIONI SUI COOKIE ──────────────────────────────────────────

    /** Legge un cookie. Se il consenso non fu dato, il cookie non fu scritto: restituisce null da solo. */
    getCookie(key: string): string | null {
        if (!this.isBrowser) return null;
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = this.document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedKey}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : null;
    }

    /**
     * Scrive un cookie per la categoria dichiarata.
     * Bloccato silenziosamente se il consenso per quella categoria non è stato dato.
     */
    setCookie(key: string, value: string, maxAgeSeconds: number, category: CookieCategory): void {
        if (!this.isBrowser || !this.isCategoryAccepted(category)) return;
        this.document.cookie =
            `${key}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
    }

    /** Rimuove un cookie. La rimozione è sempre consentita. */
    removeCookie(key: string): void {
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

    // ─── PREFERENZA LINGUA ──────────────────────────────────────────────

    getSavedLanguage(): string | null {
        return this.getCookie(this.languagePreferenceKey);
    }

    setSavedLanguage(language: string): void {
        this.setCookie(this.languagePreferenceKey, language, this.languagePreferenceMaxAgeSeconds, CookieCategory.Technical);
    }

    clearSavedLanguage(): void {
        this.removeCookie(this.languagePreferenceKey);
    }
}
