import { Injectable, inject } from '@angular/core';
import { CookieConsentService } from '../cookie-consent.service';
import { CookieCategory, CookieConfig } from './cookie-type';
import { COOKIE_MAP } from '../../../services/cookie-registry';
import { LOCALE_CONFIG } from '../../services/translate.service';
import { SITE_CONFIG } from '../../siteBuilder';

/**
 * Fornisce le strutture dati necessarie alla pagina Cookie Policy:
 * l'elenco delle categorie attive e quello dei singoli cookie presenti nel sito.
 *
 * Estratto da `CookieConsentService` per separare la logica di rendering legale
 * dalla gestione del consenso, così la policy può essere aggiornata
 * senza rischiare di alterare il comportamento del banner.
 */
@Injectable({ providedIn: 'root' })
export class PrintCookieService {
    private readonly cookieConsent = inject(CookieConsentService);
    private readonly localeConfig = inject(LOCALE_CONFIG);
    private readonly siteConfig = inject(SITE_CONFIG);

    /**
     * Restituisce le categorie dei cookie presenti nel sito in formato strutturato,
     * con le etichette già tradotte tramite la funzione passata.
     */
    getCategories(t: (key: string) => string): { key: CookieCategory; name: string; description: string }[] {
        const categories: { key: CookieCategory; name: string; description: string }[] = [];
        if (this.cookieConsent.isTechnicalNeeded()) {
            categories.push({
                key: CookieCategory.Technical,
                name: t('tecniciCategoriaCookie'),
                description: t('tecniciDescrizioneCategoriaCookie')
            });
        }
        if (this.cookieConsent.isAnalyticsNeeded()) {
            categories.push({
                key: CookieCategory.Analytics,
                name: t('analyticsCategoriaCookie'),
                description: t('analyticsDescrizioneCategoriaCookie')
            });
        }
        if (this.cookieConsent.isProfilingNeeded()) {
            categories.push({
                key: CookieCategory.Profiling,
                name: t('profilazioneCategoriaCookie'),
                description: t('profilazioneDescrizioneCategoriaCookie')
            });
        }
        return categories;
    }

    /**
     * Restituisce l'elenco dei cookie attivi nel sito in formato strutturato,
     * con etichette e descrizioni già tradotte tramite la funzione passata.
     */
    getCookies(t: (key: string) => string): { name: string; category: string; categoryKey: CookieCategory; description: string }[] {
        const allCookies: Record<string, CookieConfig> = {
            ...COOKIE_MAP,
        };

        if (this.localeConfig.availableLanguages.length > 1) {
            allCookies[CookieConsentService.LANG_KEY] = {
                category: CookieCategory.Technical,
                descriptionKey: 'linguaDescrizioneListaCookie',
            };
        }

        if (this.siteConfig.isWebApp) {
            allCookies[CookieConsentService.NGSW_WORKER] = {
                category: CookieCategory.Technical,
                descriptionKey: 'swDescrizioneListaCookie',
            };
        }

        const list: { name: string; category: string; categoryKey: CookieCategory; description: string }[] = [];
        const chiaveCategopria = (t: CookieCategory) => {
            let chiave = '';
            switch (t) {
                case CookieCategory.Analytics:
                    chiave = 'analytics';
                    break
                case CookieCategory.Profiling:
                    chiave = 'profilazione';
                    break
                case CookieCategory.Technical:
                default:
                    chiave = 'tecnici'
            }
            return chiave + "CategoriaCookie";
        };
        for (const [rawKey, config] of Object.entries(allCookies) as [string, CookieConfig][]) {

            const desc = config.descriptionKey ? t(config.descriptionKey) : '';
            const fullKey = CookieConsentService.buildKey(rawKey, config) ?? rawKey;

            list.push({
                name: fullKey,
                category: t(chiaveCategopria(config.category)),
                categoryKey: config.category,
                description: desc
            });
        }

        return list;
    }
}
