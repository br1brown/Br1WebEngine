import { DOCUMENT } from '@angular/common';
import { inject, Injectable, REQUEST, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CookieConsentService } from './cookie-consent.service';
import { ContestoSito } from '../../site';

type TranslationDictionary = Record<string, string>;

/**
 * TRANSLATE SERVICE
 *
 * Gestisce lingue, caricamento JSON e formattazione stringhe.
 * È anche il punto canonico per le utility BCP-47 (normalizeBcp47, isValidBcp47).
 *
 * Per aggiungere una lingua:
 *   1. Aggiungere il codice ad `availableLanguages` in site.ts
 *   2. Creare /assets/i18n/basic.{lang}.json e addon.{lang}.json
 *
 * Al bootstrap il service verifica quali file esistono davvero:
 * le lingue i cui file mancano vengono escluse automaticamente.
 */
@Injectable({ providedIn: 'root' })
export class TranslateService {
    private readonly document = inject(DOCUMENT);
    private readonly consent = inject(CookieConsentService);
    private readonly http = inject(HttpClient);
    private readonly request = inject(REQUEST, { optional: true });

    private hasInitializedLanguage = false;

    readonly currentLang = signal<string>(ContestoSito.config.defaultLang);
    private translations = signal<TranslationDictionary>({});

    /**
     * Signal reattivo delle lingue disponibili.
     * Parte da `ContestoSito.config.availableLanguages` (dichiarate in site.ts),
     * poi viene ridotto a sole le lingue i cui file JSON esistono davvero (probeLanguages).
     * Usarlo nei template/computed garantisce reattività automatica.
     */
    readonly availableLangs = signal<readonly string[]>(ContestoSito.config.availableLanguages);

    /**
     * Cache dei file basic.{lang}.json scaricati durante probeLanguages.
     * fetchCatalogs li riutilizza evitando una seconda richiesta HTTP.
     */
    private readonly basicCache = new Map<string, TranslationDictionary>();

    // ─── BCP-47 ───────────────────────────────────────────────────────────

    /** Normalizza un tag lingua BCP-47 in lowercase. Ritorna null se malformato. */
    static normalizeBcp47(tag: string | null | undefined): string | null {
        if (typeof tag !== 'string' || !tag.trim()) return null;
        try {
            const [canonical] = Intl.getCanonicalLocales(tag.trim());
            return canonical?.toLowerCase() ?? null;
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
            return ContestoSito.config.defaultLang;
        }
        return this.resolveLanguage(this.consent.getSavedLanguage());
    }

    async loadTranslations(lang: string): Promise<void> {
        const resolved = this.resolveLanguage(lang);
        const catalogs =
            await this.fetchCatalogs(resolved)
            ?? await this.fetchCatalogs(ContestoSito.config.defaultLang)
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

    /** Chiamato una volta al bootstrap: verifica i file, poi carica la lingua iniziale. */
    async setInitialLanguage(): Promise<void> {
        await this.probeLanguages();
        await this.setLanguage(this.getInitialLanguage());
    }

    /**
     * Cerca la chiave nelle traduzioni e sostituisce i segnaposto posizionali.
     * Es: translate("saluto", "Mario") → "Ciao {0}" diventa "Ciao Mario"
     */
    translate(key: string, ...args: unknown[]): string {
        const template = this.translations()[key];
        if (!template) return key;
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

    /**
     * Verifica in parallelo quali lingue candidate hanno i file JSON.
     * Imposta _availableLangs con sole le lingue funzionanti.
     * Garantisce sempre che defaultLang sia inclusa (fallback di sicurezza).
     */
    private async probeLanguages(): Promise<void> {
        const results = await Promise.allSettled(
            ContestoSito.config.availableLanguages.map(async lang => {
                /* Scarica e parsa il file — la risposta viene messa in cache per fetchCatalogs,
                   così basic.{lang}.json non viene richiesto una seconda volta. */
                const basic = await firstValueFrom(
                    this.http.get<TranslationDictionary>(this.assetUrl(`/assets/i18n/basic.${lang}.json`))
                );
                this.basicCache.set(lang, basic);
                return lang;
            })
        );

        const valid = results
            .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
            .map(r => r.value);

        // defaultLang deve essere sempre disponibile anche se il file manca
        if (!valid.includes(ContestoSito.config.defaultLang)) {
            valid.unshift(ContestoSito.config.defaultLang);
        }

        this.availableLangs.set(valid);
    }

    private async fetchCatalogs(lang: string): Promise<TranslationDictionary[] | undefined> {
        if (!this.isSupportedLanguage(lang)) return undefined;
        try {
            const [basic, addon] = await Promise.all([
                // Riutilizza il file già scaricato durante probeLanguages se disponibile
                this.basicCache.has(lang)
                    ? Promise.resolve(this.basicCache.get(lang)!)
                    : firstValueFrom(this.http.get<TranslationDictionary>(this.assetUrl(`/assets/i18n/basic.${lang}.json`))),
                firstValueFrom(this.http.get<TranslationDictionary>(this.assetUrl(`/assets/i18n/addon.${lang}.json`))),
            ]);
            return [basic, addon];
        } catch {
            /**
             * @warning probeLanguages verifica solo `basic.{lang}.json`, ma qui servono entrambi.
             * Se `addon.{lang}.json` manca, la lingua appare nel selettore ma non si carica mai
             * e l'app torna silenziosamente al `defaultLang`.
             *
             * Quando aggiungi una nuova lingua ricorda di creare SEMPRE:
             * - `basic.{lang}.json`
             * - `addon.{lang}.json`
             *
             * in `/assets/i18n/`.
             */
            console.warn(`[TranslateService] Impossibile caricare i cataloghi per la lingua "${lang}". Verifica che esistano basic.${lang}.json e addon.${lang}.json in /assets/i18n/.`);
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
            : ContestoSito.config.defaultLang;
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
