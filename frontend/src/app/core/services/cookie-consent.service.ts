import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, Injector, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { TranslateService } from './translate.service';
import { ContestoSito } from '../../site';

/**
 * COOKIE CONSENT SERVICE
 * Gestione centralizzata del consenso cookie — Conformità EU (ePrivacy + GDPR).
 * 
 * Il principio cardine è il "Privacy by Default": le scritture sono bloccate
 * finché l'utente non esprime un consenso esplicito.
 */
@Injectable({ providedIn: 'root' })
export class CookieConsentService {
    // Iniezione delle dipendenze per l'accesso sicuro al DOM e al contesto SSR
    private readonly document = inject(DOCUMENT);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly injector = inject(Injector);

    // Chiavi per lo storage
    private readonly consentKey = 'cookie-consent-accepted';
    private readonly consentLogKey = 'cookie-consent-log';
    private readonly languagePreferenceKey = 'lang';
    private readonly languagePreferenceMaxAgeSeconds = 60 * 60 * 24 * 365; // 1 anno

    /**
     * True se l'app ha funzionalità che richiedono cookie.
     * computed() reattivo: si aggiorna automaticamente quando cambiano le dipendenze.
     *
     * Aggiungere condizioni qui per nuove funzionalità future (font preference, analytics, ecc.).
     */
    readonly isNeeded = computed(() => this.requiresCookieConsent());

    /**
     * Logica centralizzata che stabilisce se il banner va mostrato.
     * Legge autonomamente lo stato dell'app — il chiamante non deve sapere nulla dei criteri.
     *
     * @remarks Perché `injector.get()` invece di `inject(TranslateService)` nel costruttore:
     * esiste una dipendenza circolare tra i due servizi:
     * `CookieConsentService` → `TranslateService` (per `availableLangs`) e
     * `TranslateService` → `CookieConsentService` (per `getSavedLanguage` / `setSavedLanguage`).
     * Angular lancerebbe un errore al boot se entrambi i lati usassero `inject()` nel costruttore.
     * `injector.get()` è lazy: viene risolto solo quando la `computed` viene letta,
     * ovvero dopo che entrambi i servizi sono stati costruiti, spezzando il ciclo.
     *
     * @warning NON sostituire con `inject(TranslateService)` nel costruttore: l'app crasherebbe al boot.
     */
    private requiresCookieConsent(): boolean {
        return this.injector.get(TranslateService).availableLangs().length > 1;
    }

    /** Signal: stato attuale del consenso (true = accettato) */
    readonly accepted = signal(false);

    /** Signal: indica se l'utente ha interagito con il banner in questa sessione o in passato */
    readonly responded = signal(false);

    constructor() {
        // Al caricamento, recuperiamo lo stato salvato nel browser
        if (this.isBrowser) {
            try {
                const stored = localStorage.getItem(this.consentKey);
                if (stored !== null) {
                    this.responded.set(true);
                    this.accepted.set(stored === '1');
                }
            } catch {
                // Gestione silenziosa se localStorage è disabilitato (es. navigazione anonima restrittiva)
            }
        }
    }

    // ─── GESTIONE CONSENSO ──────────────────────────────────────────────

    /** Azione: L'utente clicca su "Accetta tutto" */
    accept(): void {
        this.accepted.set(true);
        this.responded.set(true);
        this.persistConsent('accepted');
    }

    /** Azione: L'utente clicca su "Rifiuta" */
    reject(): void {
        this.accepted.set(false);
        this.responded.set(true);
        this.persistConsent('rejected');
    }

    /** 
     * Salva permanentemente la scelta dell'utente in localStorage.
     * Include un log per dimostrare la conformità in caso di audit (Accountability GDPR).
     */
    private persistConsent(action: 'accepted' | 'rejected'): void {
        if (!this.isBrowser) return;
        try {
            localStorage.setItem(this.consentKey, action === 'accepted' ? '1' : '0');
            const log = {
                action,
                timestamp: new Date().toISOString(),
                version: ContestoSito.config.version,
            };
            localStorage.setItem(this.consentLogKey, JSON.stringify(log));
        } catch { /* storage non disponibile */ }
    }

    // ─── OPERAZIONI SUI COOKIE ──────────────────────────────────────────

    /** 
     * Legge un cookie dal documento. 
     * Nota: La lettura è sempre permessa perché non viola la privacy "scrivere" dati.
     */
    getCookie(key: string): string | null {
        if (!this.isBrowser) return null;
        // Regex per estrarre il valore del cookie in modo sicuro
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = this.document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedKey}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : null;
    }

    /** 
     * Scrive un cookie.
     * PROTEZIONE: Se il consenso non è stato dato, l'operazione viene annullata silenziosamente.
     */
    setCookie(key: string, value: string, maxAgeSeconds: number): void {
        if (!this.isBrowser || !this.accepted()) return;

        // Impostazione standard con SameSite=Lax per sicurezza CSRF
        this.document.cookie =
            `${key}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
    }

    /** 
     * Rimuove un cookie impostando la scadenza nel passato.
     * Sempre consentito (operazione di pulizia).
     */
    removeCookie(key: string): void {
        if (!this.isBrowser) return;
        this.document.cookie = `${key}=; Path=/; Max-Age=0; SameSite=Lax`;
    }

    // ─── PREFERENZA LINGUA ──────────────────────────────────────────────

    /** Recupera la lingua salvata (se esiste) */
    getSavedLanguage(): string | null {
        return this.getCookie(this.languagePreferenceKey);
    }

    /** Salva la lingua (solo se accettato il consenso) */
    setSavedLanguage(language: string): void {
        this.setCookie(this.languagePreferenceKey, language, this.languagePreferenceMaxAgeSeconds);
    }

    /** Rimuove il cookie della lingua */
    clearSavedLanguage(): void {
        this.removeCookie(this.languagePreferenceKey);
    }

}
