import { DOCUMENT } from '@angular/common';
import { inject, Injectable, isDevMode, REQUEST, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CookieConsentService } from './cookie-consent.service';
import { LOCALE_CONFIG } from '../locale-config.token';

type TranslationDictionary = Record<string, string>;

/**
 * TRANSLATE SERVICE
 *
 * Gestisce lingue, caricamento JSON e formattazione stringhe.
 * È anche il punto canonico per le utility BCP-47 (normalizeBcp47, isValidBcp47).
 *
 * Per aggiungere una lingua:
 *   1. Aggiungere il codice a Localization.SupportedLanguages in br1engine.json
 *   2. Creare /assets/i18n/basic.{lang}.json e addon.{lang}.json
 *
 * La lista lingue disponibili viene interamente da LOCALE_CONFIG (br1engine.json).
 * Se un file JSON manca, fetchCatalogs fallisce silenziosamente e l'app usa
 * defaultLang come fallback — la lingua rimane nel selettore ma non si carica.
 */
@Injectable({ providedIn: 'root' })
export class TranslateService {
    private readonly localeConfig = inject(LOCALE_CONFIG);
    private readonly document = inject(DOCUMENT);
    private readonly consent = inject(CookieConsentService);
    private readonly http = inject(HttpClient);
    private readonly request = inject(REQUEST, { optional: true });

    private hasInitializedLanguage = false;

    readonly currentLang = signal<string>(this.localeConfig.defaultLang);
    private translations = signal<TranslationDictionary>({});

    /** Lingue disponibili, come dichiarate in br1engine.json via LOCALE_CONFIG. */
    readonly availableLangs = signal<readonly string[]>(this.localeConfig.availableLanguages);

    // ─── BCP-47 ───────────────────────────────────────────────────────────

    /**
     * Normalizza un tag lingua BCP-47 estraendo solo il sottotag lingua (ISO 639-1).
     * Ritorna null se il tag è malformato o non riconosciuto.
     * Esempi: "it-IT" → "it", "en-US" → "en", "it" → "it", "xyz" → null.
     */
    static normalizeBcp47(tag: string | null | undefined): string | null {
        if (typeof tag !== 'string' || !tag.trim()) return null;
        try {
            return new Intl.Locale(tag.trim()).language ?? null;
        } catch {
            return null;
        }
    }

    /** True se il tag è un BCP-47 well-formed. */
    static isValidBcp47(tag: string | null | undefined): boolean {
        return TranslateService.normalizeBcp47(tag) !== null;
    }

    // ─── Pubblico ─────────────────────────────────────────────────────────

    getInitialLanguage(): string {
        if (!this.hasMultipleLanguages()) {
            this.clearSavedLanguage();
            return this.localeConfig.defaultLang;
        }
        return this.resolveLanguage(this.consent.getSavedLanguage());
    }

    async loadTranslations(lang: string): Promise<void> {
        const resolved = this.resolveLanguage(lang);
        const primary = await this.fetchCatalogs(resolved);
        // Fallback al defaultLang solo se diverso da resolved — evita di scaricare
        // gli stessi file due volte quando resolved è già la lingua di default.
        const catalogs = primary
            ?? (resolved !== this.localeConfig.defaultLang
                ? await this.fetchCatalogs(this.localeConfig.defaultLang)
                : undefined)
            ?? [];
        this.translations.set(Object.assign({}, ...catalogs));
    }

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

    /** Chiamato una volta al bootstrap: carica la lingua iniziale. */
    async setInitialLanguage(): Promise<void> {
        await this.setLanguage(this.getInitialLanguage());
    }

    /**
     * Cerca la chiave nelle traduzioni e sostituisce i segnaposto posizionali.
     * Es: translate("saluto", "Mario") → "Ciao {0}" diventa "Ciao Mario"
     */
    translate(key: string, ...args: unknown[]): string {
        const template = this.translations()[key];
        if (!template) {
            if (this.availableLangs().length > 1 && isDevMode()) {
                console.warn(`Translation key "${key}" not found`);
            }
            return key;
        }
        if (args.length === 0) return template;

        let result = template;
        for (let i = 0; i < args.length; i++) {
            result = result.replaceAll(`{${i}}`, String(args[i] ?? ''));
        }
        return result;
    }

    t(key: string, ...args: unknown[]): string {
        return this.translate(key, ...args);
    }

    // ─── Privato ──────────────────────────────────────────────────────────

    private async fetchCatalogs(lang: string): Promise<TranslationDictionary[] | undefined> {
        if (!this.isSupportedLanguage(lang)) return undefined;
        try {
            const [basic, addon] = await Promise.all([
                firstValueFrom(this.http.get<TranslationDictionary>(this.assetUrl(`/assets/i18n/basic.${lang}.json`))),
                firstValueFrom(this.http.get<TranslationDictionary>(this.assetUrl(`/assets/i18n/addon.${lang}.json`))),
            ]);
            return [basic, addon];
        } catch {
            // In produzione non dovrebbe accadere: scripts/test/i18n-check.sh verifica
            // a CI time che basic.{lang}.json e addon.{lang}.json esistano per ogni lingua
            // configurata in br1engine.json. Se arriva qui, l'app ricade sul defaultLang.
            console.warn(`[TranslateService] Impossibile caricare i cataloghi per "${lang}". Eseguire scripts/test/i18n-check.sh per diagnosticare.`);
            return undefined;
        }
    }

    /** Costruisce URL assoluti in SSR (REQUEST), relativi nel browser. */
    private assetUrl(path: string): string {
        return this.request ? new URL(path, this.request.url).toString() : path;
    }

    private isSupportedLanguage(lang: string | null | undefined): lang is string {
        return typeof lang === 'string' && this.availableLangs().includes(lang);
    }

    private resolveLanguage(lang: string | null | undefined): string {
        const normalized = TranslateService.normalizeBcp47(lang);
        return normalized && this.isSupportedLanguage(normalized)
            ? normalized
            : this.localeConfig.defaultLang;
    }

    private hasMultipleLanguages(): boolean {
        return this.availableLangs().length > 1;
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
}
