import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, inject, PLATFORM_ID, signal } from '@angular/core';
import { TranslateService } from './translate.service';

/**
 * Gestione centralizzata del consenso cookie — Conformità EU (ePrivacy + GDPR).
 *
 * Nessun altro servizio deve accedere direttamente a document.cookie: tutto passa da qui.
 *
 * - Le letture (getCookie) funzionano sempre — il dato potrebbe essere
 *   stato scritto con un consenso precedente.
 * - Le scritture (setCookie) sono bloccate finché l'utente non accetta.
 * - Le rimozioni (removeCookie) funzionano sempre — la pulizia è sempre consentita.
 *
 * Il consenso stesso è salvato in localStorage (non in un cookie,
 * per evitare la circolarità di usare un cookie per il consenso cookie).
 */
@Injectable({ providedIn: 'root' })
export class CookieConsentService {
    private readonly document = inject(DOCUMENT);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly consentKey = 'cookie-consent-accepted';
    private readonly consentLogKey = 'cookie-consent-log';
    private readonly languagePreferenceKey = 'lang';
    private readonly languagePreferenceMaxAgeSeconds = 60 * 60 * 24 * 365;

    /** true se il banner è necessario — logica in {@link CookieConsentService.requiresCookieConsent} */
    readonly isNeeded = CookieConsentService.requiresCookieConsent();

    /** true se l'utente ha accettato i cookie */
    readonly accepted = signal(false);

    /** true se l'utente ha risposto al banner (accettato o rifiutato) */
    readonly responded = signal(false);

    constructor() {
        if (this.isBrowser) {
            try {
                const stored = localStorage.getItem(this.consentKey);
                if (stored !== null) {
                    this.responded.set(true);
                    this.accepted.set(stored === '1');
                }
            } catch {
                // localStorage non disponibile — consent resta false.
            }
        }
    }

    // ─── Consenso ──────────────────────────────────────────────────────

    /** Registra l'accettazione dell'utente. */
    accept(): void {
        this.accepted.set(true);
        this.responded.set(true);
        this.persistConsent('accepted');
    }

    /** Registra il rifiuto dell'utente. */
    reject(): void {
        this.accepted.set(false);
        this.responded.set(true);
        this.persistConsent('rejected');
    }

    /** Salva lo stato del consenso e il log con timestamp. */
    private persistConsent(action: 'accepted' | 'rejected'): void {
        if (!this.isBrowser) return;
        try {
            localStorage.setItem(this.consentKey, action === 'accepted' ? '1' : '0');
            const log = {
                action,
                timestamp: new Date().toISOString(),
                version: '1.0'
            };
            localStorage.setItem(this.consentLogKey, JSON.stringify(log));
        } catch { /* storage non disponibile */ }
    }

    // ─── Cookie ────────────────────────────────────────────────────────

    /** Legge un cookie per nome. Sempre consentito (il dato potrebbe esistere da prima). */
    getCookie(key: string): string | null {
        if (!this.isBrowser) return null;
        const match = this.document.cookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : null;
    }

    /** Scrive un cookie — solo se il consenso è stato dato. */
    setCookie(key: string, value: string, maxAgeSeconds: number): void {
        if (!this.isBrowser || !this.accepted()) return;
        this.document.cookie =
            `${key}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
    }

    /** Rimuove un cookie (sempre consentito — è pulizia). */
    removeCookie(key: string): void {
        if (!this.isBrowser) return;
        this.document.cookie = `${key}=; Path=/; Max-Age=0; SameSite=Lax`;
    }

    /** Restituisce la lingua salvata nel cookie di preferenza, se presente. */
    getSavedLanguage(): string | null {
        return this.getCookie(this.languagePreferenceKey);
    }

    /** Salva la lingua preferita nel cookie dedicato. */
    setSavedLanguage(language: string): void {
        this.setCookie(this.languagePreferenceKey, language, this.languagePreferenceMaxAgeSeconds);
    }

    /** Rimuove il cookie della lingua preferita. */
    clearSavedLanguage(): void {
        this.removeCookie(this.languagePreferenceKey);
    }

    /**
    * Restituisce true se il consenso cookie è necessario.
    * Aggiungere qui ogni nuova condizione che richiede persistenza lato client.
    */
    public static requiresCookieConsent(): boolean {
        let req = false;

        if (TranslateService.availableLanguages().length > 1)
            req = true;

        return req;
    }

}
