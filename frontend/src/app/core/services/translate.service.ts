import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CookieConsentService } from './cookie-consent.service';
import { ContestoSito } from '../../site';

/**
 * Traduzione i18n e gestione lingua corrente.
 * Carica basic.{lang}.json (template) e addon.{lang}.json (progetto).
 * Addon sovrascrive basic. Supporta placeholder: t('saluto', 'Mario') → "Ciao Mario".
 * Nei template: {{ 'chiave' | translate }}. Nel codice: this.translate.t('chiave').
 *
 * Unico punto di gestione della lingua: currentLang signal + setLanguage() che
 * aggiorna il signal e ricarica le traduzioni in un'unica operazione.
 *
 * Tutta la persistenza (cookie + localStorage) è delegata a CookieConsentService.
 * Questo servizio non accede MAI direttamente a document.cookie o localStorage.
 */
@Injectable({ providedIn: 'root' })
export class TranslateService {
    private readonly http = inject(HttpClient);
    private readonly consent = inject(CookieConsentService);
    private readonly cookieKey = 'lang';
    private readonly cookieMaxAgeSeconds = 60 * 60 * 24 * 365;
    private hasInitializedLanguage = false;

    /** Lingua corrente dell'app (signal reattivo) */
    readonly currentLang = signal<string>(ContestoSito.config.defaultLang);

    /** Dizionario chiave→traduzione per la lingua corrente (signal reattivo) */
    private translations = signal<Record<string, string>>({});

    /** Lingua iniziale: preferenza salvata se valida, altrimenti predefinita del template */
    getInitialLanguage(): string {
        if (!this.hasMultipleLanguages()) {
            this.clearSavedLanguage();
            return ContestoSito.config.defaultLang;
        }

        const saved = this.consent.getCookie(this.cookieKey);
        return this.isSupportedLanguage(saved) ? saved : ContestoSito.config.defaultLang;
    }

    /**
     * Carica le traduzioni per la lingua specificata.
     * Scarica basic.{lang}.json e addon.{lang}.json in parallelo,
     * poi li fonde in un unico dizionario (addon ha priorità su basic).
     */
    async loadTranslations(lang: string): Promise<void> {
        const files = ['basic', 'addon'];
        const results = await Promise.all(
            files.map(f =>
                firstValueFrom(
                    this.http.get<Record<string, string>>(`/assets/i18n/${f}.${lang}.json`)
                )
            )
        );
        this.translations.set(Object.assign({}, ...results));
    }

    /**
     * Cambia la lingua corrente e ricarica le traduzioni.
     * Unica operazione necessaria per il cambio lingua.
     */
    async setLanguage(lang: string): Promise<void> {
        const resolved = this.isSupportedLanguage(lang) ? lang : ContestoSito.config.defaultLang;
        await this.loadTranslations(resolved);
        this.currentLang.set(resolved);
        this.updateDocumentLanguage(resolved);

        if (this.hasMultipleLanguages() && this.hasInitializedLanguage) {
            this.persistLanguage(resolved);
        }

        this.hasInitializedLanguage = true;
    }

    /** Imposta la lingua iniziale */
    async setInitialLanguage(): Promise<void> {
        await this.setLanguage(this.getInitialLanguage());
    }

    /**
     * @abstract Restituisce la lista delle lingue disponibili, ordinata con la predefinita per prima.
     * @returns
     */
    getAvailableLanguages(): string[]  {
        return TranslateService.availableLanguages();
    }


    /**
     * Traduce una chiave nella lingua corrente.
     * Se la chiave non esiste, restituisce la chiave stessa (utile per debug).
     */
    translate(key: string, ...args: any[]): string {
        const translations = this.translations();
        const template = translations[key];
        if (!template) return key;

        if (args.length === 0) return template;

        let result = template;
        for (let i = 0; i < args.length; i++) {
            result = result.replace(`{${i}}`, String(args[i] ?? ''));
        }
        return result;
    }

    /** Alias breve di translate() */
    t(key: string, ...args: any[]): string {
        return this.translate(key, ...args);
    }

    // ─── Private ───────────────────────────────────────────────────────

    private isSupportedLanguage(lang: string | null | undefined): lang is string {
        return typeof lang === 'string' && TranslateService.availableLanguages().includes(lang);
    }

    private hasMultipleLanguages(): boolean {
        return TranslateService.availableLanguages().length > 1;
    }

    /** Scrive la preferenza lingua — il CookieConsentService blocca se non c'è consenso. */
    private persistLanguage(lang: string): void {
        this.consent.setCookie(this.cookieKey, lang, this.cookieMaxAgeSeconds);
    }

    /** Rimuove la preferenza salvata — la pulizia è sempre consentita. */
    private clearSavedLanguage(): void {
        this.consent.removeCookie(this.cookieKey);
    }

    private updateDocumentLanguage(lang: string): void {
        document.documentElement.lang = lang;
    }

    public static availableLanguages(): string[] {
        const configured = (ContestoSito.config.availableLanguages ?? [])
            .filter((lang): lang is string => typeof lang === 'string' && lang.trim().length > 0)
            .map(lang => lang.trim());

        const combined = [ContestoSito.config.defaultLang, ...configured];

        return [...new Set(combined)];
    }
}
