import { Component, computed, effect, inject, signal } from '@angular/core';
import { MarkdownPipe } from '../../core/engine/pipes/markdown.pipe';
import { PageBaseComponent } from '../../core/engine/pages/page-base.component';
import { CookieConsentService, buildPhysicalCookieKey } from '../../core/engine/services/cookie-consent.service';
import { ConsentCategory, CookieConfig, EngineCookieKey, StorageMedium } from '../../core/engine/services/cookie/cookie-type';
import { COOKIE_MAP, type CookieKey } from '../../core/services/cookie-registry';
import { legalUpdated } from '../legal.pages';
import { IdentityRenderComponent } from '../../components/shared/identity-render/identity-render.component';
import { IdentityService } from '../../core/engine/services/identity.service';
import type { Identity } from '../../core/engine/dto/identity.dto';
import { SITE_CONFIG } from '../../core/engine/siteBuilder';
import { CookieBannerComponent } from '../../core/engine/components/cookie-banner/cookie-banner.component';
import { LocalizationService } from '../../core/engine/services/localization.service';

@Component({
    selector: 'app-policy',
    imports: [MarkdownPipe, IdentityRenderComponent, CookieBannerComponent],
    templateUrl: './policy.component.html',
    // Gruppi collassabili via <details> nativo (niente JS: il progetto bundle solo il CSS di
    // Bootstrap, non il suo JS — stessa scelta del cookie-banner). Il resto dello stile è tutto
    // classi Bootstrap; qui restano solo le 3 regole che nessuna utility può esprimere su <details>:
    // togliere il marker del browser e ruotare/nascondere l'affordance in stato [open].
    styles: [`
        .cookie-group > summary { cursor: pointer; list-style: none; }
        .cookie-group > summary::-webkit-details-marker { display: none; }
        .cookie-group[open] > summary .cookie-group__caret { transform: rotate(180deg); }
        .cookie-group[open] > summary .cookie-group__hint { display: none; }
        /* Nomi cookie: token lunghi senza spazi (es. _ga_ABCDEF…) devono andare a capo,
           altrimenti sforano la riga e vengono tagliati dall'overflow-hidden della card. */
        .cookie-group code { word-break: break-all; min-width: 0; }
    `]
})
export class PolicyComponent extends PageBaseComponent<string> {
    private readonly cookieConsent = inject(CookieConsentService);
    private readonly identityService = inject(IdentityService);
    private readonly siteConfig = inject(SITE_CONFIG);
    private readonly localization = inject(LocalizationService);

    readonly ConsentCategory = ConsentCategory;

    /** True solo sulla pagina Cookie Policy (slot legale 'cookie'): abilita la sezione
     *  "come controllare i cookie", che su privacy / termini / note legali non ha senso. */
    readonly isCookiePolicy = computed(() =>
        this.siteConfig.legalPages.cookie != null && this.pageType() === this.siteConfig.legalPages.cookie
    );

    /** True quando l'utente ha già risposto al consenso: solo allora mostriamo il pannello di
     *  gestione in pagina. Pre-consenso ci pensa il banner fisso — così non ci sono due UI di
     *  consenso insieme sulla Cookie Policy. */
    readonly consentResponded = computed(() => this.cookieConsent.responded());

    /** Link alle guide ufficiali dei browser per gestire i cookie. Ogni vendor vuole il proprio
     *  formato di locale (verificato sul campo): Microsoft/Mozilla/Opera accettano la sola lingua
     *  (`it`, `en`) ed espandono/ricadono da sé; Google usa il parametro `hl`; Apple invece perde la
     *  versione localizzata con la sola lingua e pretende il locale completo `lingua-regione`
     *  (es. `it-it`) — la regione probabile la ricava `Intl` dalla lingua. IE escluso (EOL 2022). */
    readonly browserLinks = computed(() => {
        const lang = this.translate.currentLang().toLowerCase();
        let appleLocale = lang;
        try {
            const region = new Intl.Locale(lang).maximize().region;
            if (region) appleLocale = `${lang}-${region.toLowerCase()}`;
        } catch { /* locale non risolvibile: resta la sola lingua */ }
        return [
            { name: 'Microsoft Edge',  url: `https://support.microsoft.com/${lang}/edge/manage-cookies-in-microsoft-edge-view-allow-block-delete-and-use` },
            { name: 'Chrome',          url: `https://support.google.com/accounts/answer/61416?hl=${lang}` },
            { name: 'Safari',          url: `https://support.apple.com/${appleLocale}/guide/safari/sfri11471/mac` },
            { name: 'Mozilla Firefox', url: `https://support.mozilla.org/${lang}/products/firefox/protect-your-privacy` },
            { name: 'Opera',           url: `https://help.opera.com/${lang}/latest/web-preferences/` },
        ];
    });

    /** Etichette della sezione "come controllare i cookie". */
    readonly manageCookiesTitle = computed(() => this.translate.translate('titoloGestioneCookie'));
    readonly manageCookiesIntro = computed(() => this.translate.translate('introGestioneCookie'));
    readonly manageCookiesBrowsers = computed(() => this.translate.translate('browserGestioneCookie'));

    /** Identità per l'IdentityRenderComponent (dalla risorsa condivisa dell'engine). */
    readonly identity = signal<Identity | null>(null);

    readonly cookieCategories = computed(() => {
        const categories: { key: ConsentCategory; name: string; description: string }[] = [];
        if (this.cookieConsent.isTechnicalNeeded()) {
            categories.push({
                key: ConsentCategory.Technical,
                name: this.translate.translate('tecniciCategoriaCookie'),
                description: this.translate.translate('tecniciDescrizioneCategoriaCookie')
            });
        }
        if (this.cookieConsent.isAnalyticsNeeded()) {
            categories.push({
                key: ConsentCategory.Analytics,
                name: this.translate.translate('analyticsCategoriaCookie'),
                description: this.translate.translate('analyticsDescrizioneCategoriaCookie')
            });
        }
        if (this.cookieConsent.isProfilingNeeded()) {
            categories.push({
                key: ConsentCategory.Profiling,
                name: this.translate.translate('profilazioneCategoriaCookie'),
                description: this.translate.translate('profilazioneDescrizioneCategoriaCookie')
            });
        }
        return categories;
    });

    /** Etichetta tradotta della categoria di consenso. */
    private categoryLabel(category: ConsentCategory): string {
        switch (category) {
            case ConsentCategory.Analytics: return this.translate.translate('analyticsCategoriaCookie');
            case ConsentCategory.Profiling: return this.translate.translate('profilazioneCategoriaCookie');
            case ConsentCategory.Technical: return this.translate.translate('tecniciCategoriaCookie');
            default: return '';
        }
    }

    /** Descrizione tradotta della categoria (la stessa dei quadrati, ora fusa nell'header del gruppo). */
    private categoryDescription(category: ConsentCategory): string {
        switch (category) {
            case ConsentCategory.Analytics: return this.translate.translate('analyticsDescrizioneCategoriaCookie');
            case ConsentCategory.Profiling: return this.translate.translate('profilazioneDescrizioneCategoriaCookie');
            case ConsentCategory.Technical: return this.translate.translate('tecniciDescrizioneCategoriaCookie');
            default: return '';
        }
    }

    /** Etichetta tradotta del mezzo di archiviazione (cookie / local / session). */
    private mediumLabel(medium: StorageMedium): string {
        switch (medium) {
            case 'local': return this.translate.translate('mezzoLocalStorageListaCookie');
            case 'session': return this.translate.translate('mezzoSessionStorageListaCookie');
            default: return this.translate.translate('mezzoCookieListaCookie');
        }
    }

    /** Provider della voce: il nome dichiarato in config, o "Prima parte" (questo sito) se assente. */
    private providerLabel(config: CookieConfig): string {
        return config.provider ?? this.translate.translate('primaParteListaCookie');
    }

    /** Durata dichiarata: derivata dal mezzo per il Web Storage (sessione / persistente), dalla
     *  `durationKey` per i cookie che la specificano, altrimenti il default "1 anno" (Max-Age di set()). */
    private durationLabel(config: CookieConfig, medium: StorageMedium): string {
        if (medium === 'session') return this.translate.translate('durataSessioneListaCookie');
        if (medium === 'local') return this.translate.translate('durataPersistenteListaCookie');
        return this.translate.translate(config.durationKey ?? 'durataAnnoListaCookie');
    }

    readonly cookieList = computed(() => {
        // Mappa UNICA: built-in del motore attivi + voci del progetto. Il mezzo (cookie / local /
        // session) lo decide `config.storage`; il nome fisico è namespaced per i cookie, raw per lo storage.
        const all: Record<string, CookieConfig> = {
            ...this.cookieConsent.activeEngine(),
            ...COOKIE_MAP,
        };

        const list: { name: string; category: ConsentCategory; categoryName: string; description: string; medium: StorageMedium; mediumLabel: string; provider: string; providerUrl?: string; duration: string }[] = [];

        for (const [rawKey, config] of Object.entries(all) as [string, CookieConfig][]) {
            const medium = config.storage ?? 'cookie';
            list.push({
                name: medium === 'cookie'
                    ? buildPhysicalCookieKey(rawKey as CookieKey | EngineCookieKey, config) ?? rawKey
                    : rawKey,
                category: config.category,
                categoryName: this.categoryLabel(config.category),
                description: config.descriptionKey ? this.translate.translate(config.descriptionKey) : '',
                medium,
                mediumLabel: this.mediumLabel(medium),
                provider: this.providerLabel(config),
                // Link solo per le terze parti che lo dichiarano (il nome provider diventa cliccabile).
                providerUrl: config.provider ? config.providerUrl : undefined,
                duration: this.durationLabel(config, medium),
            });
        }
        return list;
    });

    /** Etichette dei campi standard mostrati per ogni voce (Provider / Durata). */
    readonly providerFieldLabel = computed(() => this.translate.translate('providerListaCookie'));
    readonly durationFieldLabel = computed(() => this.translate.translate('durataListaCookie'));

    /** Voci raggruppate per categoria (riepilogo-first): un pannello collassabile per
     *  categoria presente, con conteggio. L'ordine segue l'enum ConsentCategory. */
    readonly cookieGroups = computed(() => {
        const order = [ConsentCategory.Technical, ConsentCategory.Analytics, ConsentCategory.Profiling];
        const list = this.cookieList();
        return order
            .map(category => {
                const cookies = list.filter(c => c.category === category);
                const noun = this.translate.translate(cookies.length === 1 ? 'voceListaCookie' : 'vociListaCookie');
                return {
                    category,
                    name: this.categoryLabel(category),
                    description: this.categoryDescription(category),
                    countLabel: `${cookies.length} ${noun}`,
                    cookies,
                };
            })
            .filter(g => g.cookies.length > 0);
    });

    /** Etichetta dell'affordance "mostra elenco" (nascosta quando il pannello è aperto). */
    readonly showListLabel = computed(() => this.translate.translate('mostraElencoListaCookie'));

    /** Info per la riga "ultimo aggiornamento" della pagina corrente (o null se non c'è data).
     *  Le date sono in `pages/legal.pages.ts` (vicino agli ID delle pagine legali che rappresentano).
     *  La data la formatta il servizio (culture-aware e reattivo, nessun `Intl` qui);
     *  l'attributo `datetime` porta l'ISO per un <time> semantico. */
    private policyUpdate(): { label: string; iso: string; formatted: string } | null {
        const date = legalUpdated[this.pageType() as keyof typeof legalUpdated];
        if (!date || isNaN(date.getTime())) return null;
        return {
            label: this.translate.translate('ultimoAggiornamentoPolicy'),
            iso: date.toISOString().slice(0, 10),
            formatted: this.localization.formatter.date(date),
        };
    }

    readonly segments = computed(() => {
        const identity = this.identity();
        let content = this.pageContent() ?? '';
        if (!content) return [];

        if (identity) {
            const fields: (keyof Identity)[] = ['ragioneSociale', 'partitaIva', 'codiceFiscale'];
            for (const field of fields) {
                const val = identity[field];
                if (typeof val === 'string') {
                    content = content.replaceAll(`{{${field}}}`, val);
                }
            }
        }

        // Titolo (H1) separato dal corpo, così la data "ultimo aggiornamento" sta tra i due
        // (titolo → data → testo) e può essere resa con un <time> semantico nel template.
        let heading: string | null = null;
        if (content.startsWith('#')) {
            const nl = content.indexOf('\n');
            heading = nl === -1 ? content : content.slice(0, nl);
            content = nl === -1 ? '' : content.slice(nl + 1);
        }

        type Seg =
            | { type: 'markdown'; content: string }
            | { type: 'categories' }
            | { type: 'cookieList' }
            | { type: 'profile' }
            | { type: 'updateDate'; label: string; iso: string; formatted: string };

        const result: Seg[] = [];
        if (heading) result.push({ type: 'markdown', content: heading });
        const update = this.policyUpdate();
        if (update) result.push({ type: 'updateDate', ...update });

        const tokens = content.split(/(\{\{(?:cookieCategories|cookieList|companyProfile)\}\})/g);
        for (const token of tokens) {
            if (!token) continue;
            if (token === '{{cookieCategories}}') result.push({ type: 'categories' });
            else if (token === '{{cookieList}}') result.push({ type: 'cookieList' });
            else if (token === '{{companyProfile}}') result.push({ type: 'profile' });
            else result.push({ type: 'markdown', content: token });
        }

        return result;
    });

    constructor() {
        super();
        // L'identità arriva dalla risorsa condivisa dell'engine (già fetchata dal footer): qui la
        // si rispecchia nel signal locale, senza un fetch dedicato. Null finché non risolta/assente.
        effect(() => this.identity.set(this.identityService.identity()));
    }


}
