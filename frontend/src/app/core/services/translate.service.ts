import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';
import { CookieConsentService } from './cookie-consent.service';
import { hasTranslationCatalogs, loadTranslationCatalogs } from '../i18n/translation-catalogs';
import { ContestoSito } from '../../site';

/**
 * Traduzione i18n e gestione lingua corrente.
 *
 * Unico punto di gestione della lingua: currentLang signal + setLanguage() che
 * aggiorna il signal e ricarica le traduzioni in un'unica operazione.
 *
 */
@Injectable({ providedIn: 'root' })
export class TranslateService {
    private readonly document = inject(DOCUMENT);
    private readonly consent = inject(CookieConsentService);
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

        const saved = this.consent.getSavedLanguage();
        return this.resolveLanguage(saved);
    }

    /**
     * Carica le traduzioni per la lingua specificata.
     * Scarica basic.{lang}.json e addon.{lang}.json in parallelo,
     * poi li fonde in un unico dizionario (addon ha priorità su basic).
     */
    async loadTranslations(lang: string): Promise<void> {
        const resolved = this.resolveLanguage(lang);

        const catalogs =
            await loadTranslationCatalogs(resolved)
            ?? await loadTranslationCatalogs(ContestoSito.config.defaultLang)
            ?? [];

        this.translations.set(Object.assign({}, ...catalogs));
    }

    /**
     * Cambia la lingua corrente e ricarica le traduzioni.
     * Unica operazione necessaria per il cambio lingua.
     */
    async setLanguage(lang: string): Promise<void> {
        const resolved = this.resolveLanguage(lang);
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

    /** Restituisce la lista delle lingue disponibili, ordinata con la predefinita per prima. */
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
            result = result.replaceAll(`{${i}}`, String(args[i] ?? ''));
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

    private resolveLanguage(lang: string | null | undefined): string {
        if (this.isSupportedLanguage(lang) && hasTranslationCatalogs(lang)) {
            return lang;
        }

        return ContestoSito.config.defaultLang;
    }

    private hasMultipleLanguages(): boolean {
        return TranslateService.availableLanguages().length > 1;
    }

    /** Scrive la preferenza lingua — il CookieConsentService blocca se non c'è consenso. */
    private persistLanguage(lang: string): void {
        this.consent.setSavedLanguage(lang);
    }

    /** Rimuove la preferenza salvata — la pulizia è sempre consentita. */
    private clearSavedLanguage(): void {
        this.consent.clearSavedLanguage();
    }

    private updateDocumentLanguage(lang: string): void {
        this.document.documentElement?.setAttribute('lang', lang);
    }

    public static availableLanguages(): string[] {
        // buildSite() normalizza già la lista: deduplicata, lowercased, defaultLang inclusa.
        return ContestoSito.config.availableLanguages;
    }
}
