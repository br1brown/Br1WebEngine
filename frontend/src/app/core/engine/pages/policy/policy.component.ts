import { Component, computed, effect, inject, signal } from '@angular/core';
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, of } from 'rxjs';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { PageBaseComponent } from '../../pages/page-base.component';
import { CookieConsentService, buildPhysicalCookieKey } from '../../services/cookie-consent.service';
import { ConsentCategory, CookieConfig, EngineCookieKey, StorageMedium } from '../../services/cookie/cookie-type';
import { COOKIE_MAP, type CookieKey } from '../../../services/cookie-registry';
import { ContestoSito } from '../../../../site';
import { resolveFooterFields } from '../../footer-content';
import { IdentityService } from '../../services/identity.service';
import type { Identity } from '../../dto/identity.dto';
import { SITE_CONFIG } from '../../siteBuilder';
import { CookieBannerComponent } from '../../components/cookie-banner/cookie-banner.component';
import { AccessibilityStatementComponent } from '../../components/accessibility-statement/accessibility-statement.component';
import { LocalizationService } from '../../services/localization.service';
import { resolveLegalLinks, type LegalContent } from '../../legal/legal-pages';
import { LEGAL_FACTS, renderNavigationData, renderNavigationSummary, type LegalFacts } from '../../legal/hosting-info';

@Component({
    selector: 'app-policy',
    imports: [MarkdownPipe, NgComponentOutlet, NgTemplateOutlet, CookieBannerComponent, AccessibilityStatementComponent],
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
export class PolicyComponent extends PageBaseComponent<LegalContent> {
    private readonly cookieConsent = inject(CookieConsentService);
    private readonly identityService = inject(IdentityService);
    private readonly siteConfig = inject(SITE_CONFIG);
    private readonly localization = inject(LocalizationService);
    private readonly http = inject(HttpClient);

    /** Fatti per la Privacy Policy: quelli passati dall'SSR in TransferState, o — se il primo
     *  caricamento della sessione è stato una pagina senza SSR (`requiresAuth`) e TransferState
     *  non li ha mai avuti — quelli chiesti a `/internal/legal-facts` (stessa fonte, lato server). */
    private readonly legalFacts = signal(inject(LEGAL_FACTS));

    readonly ConsentCategory = ConsentCategory;

    /** True solo sulla pagina Cookie Policy (`siteConfig.cookiePolicy`): abilita la sezione
     *  "come controllare i cookie", che su privacy / termini / note legali non ha senso. */
    readonly isCookiePolicy = computed(() =>
        this.siteConfig.cookiePolicy != null && this.pageType() === this.siteConfig.cookiePolicy
    );

    /** True quando l'utente ha già risposto al consenso: solo allora mostriamo il pannello di
     *  gestione in pagina. Pre-consenso ci pensa il banner fisso — così non ci sono due UI di
     *  consenso insieme sulla Cookie Policy. */
    readonly consentResponded = computed(() => this.cookieConsent.responded());

    /** Link alle guide browser per i cookie. Ogni vendor vuole il suo formato di locale (verificato):
     *  Microsoft/Mozilla/Opera la sola lingua; Google il parametro `hl`; Apple il locale completo
     *  `lingua-regione` (es. `it-it`, regione ricavata da `Intl`). IE escluso (EOL 2022). */
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

    /** Identità del sito (risorsa condivisa dell'Engine), per la sezione in coda. */
    readonly identity = signal<Identity | null>(null);

    /** Pagina legale corrente come risolta dalla sezione `legal` di site.ts (data di aggiornamento). */
    private readonly legalPage = computed(() => ContestoSito.getLegalPage(this.pageType()));

    /** Stato di conformità reso dall'Engine (Dichiarazione di accessibilità composta), con i contenuti non
     *  accessibili dichiarati nello slot; null sulle altre pagine. */
    readonly accessibilityStatus = computed(() => {
        const page = this.legalPage();
        return page?.recipe.accessibilityStatus ? { nonAccessibili: page.nonAccessibili ?? [] } : null;
    });

    /** Etichetta tradotta della categoria di consenso. */
    private categoryLabel(category: ConsentCategory): string {
        switch (category) {
            case ConsentCategory.Analytics: return this.translate.translate('analyticsCategoriaCookie');
            case ConsentCategory.Profiling: return this.translate.translate('profilazioneCategoriaCookie');
            case ConsentCategory.Technical: return this.translate.translate('tecniciCategoriaCookie');
            case ConsentCategory.TechnicalOptional: return this.translate.translate('tecniciNonObbligatoriCategoriaCookie');
            default: return '';
        }
    }

    /** Descrizione tradotta della categoria, mostrata nell'intestazione del gruppo collassabile. */
    private categoryDescription(category: ConsentCategory): string {
        switch (category) {
            case ConsentCategory.Analytics: return this.translate.translate('analyticsDescrizioneCategoriaCookie');
            case ConsentCategory.Profiling: return this.translate.translate('profilazioneDescrizioneCategoriaCookie');
            case ConsentCategory.Technical: return this.translate.translate('tecniciDescrizioneCategoriaCookie');
            case ConsentCategory.TechnicalOptional: return this.translate.translate('tecniciNonObbligatoriDescrizioneCategoriaCookie');
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
     *  categoria presente, con conteggio. Ordine esplicito (non quello — irrilevante — di
     *  dichiarazione dell'enum): Technical subito seguita da TechnicalOptional, poi Analytics/Profiling. */
    readonly cookieGroups = computed(() => {
        const order = [ConsentCategory.Technical, ConsentCategory.TechnicalOptional, ConsentCategory.Analytics, ConsentCategory.Profiling];
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

    /** Data "ultimo aggiornamento" della pagina corrente (le date sono nella sezione `legal` di site.ts),
     *  in ISO per il `datetime` del `<time>` semantico — sorgente unica anche per
     *  og:updated_time/dateModified (PageBaseComponent), così i due non possono disallinearsi. */
    protected override pageUpdatedOn(): string | null {
        const updated = this.legalPage()?.updated;
        return updated && !isNaN(updated.getTime()) ? updated.toISOString().slice(0, 10) : null;
    }

    private policyUpdate(): { label: string; iso: string; formatted: string } | null {
        const iso = this.pageUpdatedOn();
        const updated = this.legalPage()?.updated;
        if (!iso || !updated) return null;
        return {
            label: this.translate.translate('ultimoAggiornamentoPolicy'),
            iso,
            formatted: this.localization.formatter.date(updated),
        };
    }

    /** Sezione dell'identità, ultima della pagina: titolo e campi dalla ricetta della policy. Senza dati da
     *  mostrare per quei campi la sezione non compare, titolo compreso. */
    readonly identitySection = computed(() => {
        const spec = this.legalPage()?.recipe.identity;
        if (!spec) return null;
        const items = resolveFooterFields(spec.fields, this.identity(), { translate: this.translate, localization: this.localization })
            .map(item => item.kind === 'value' ? { ...item, label: item.label ? this.translate.translate(item.label) : '' } : item);
        if (items.length === 0) return null;
        return { heading: this.translate.translate(spec.titleKey), items };
    });

    /** Elenco cookie subito dopo l'intro, se la ricetta lo prevede (Cookie Policy). */
    readonly showCookieList = computed(() => this.legalPage()?.recipe.cookieList === true);

    /** Pagina col Markdown sostitutivo del progetto: l'elenco cookie va dopo il suo testo, non dopo l'intro. */
    readonly isMarkdownPage = computed(() => this.legalPage()?.markdown != null);

    /** Riepilogo "in sintesi" della Cookie Policy: quante voci, in quali categorie, e se serve il
     *  consenso (tutte le categorie salvo Technical lo richiedono). Stessi fatti che l'elenco cookie
     *  sotto mostra per esteso — nessuna informazione in più. */
    private readonly cookieSummaryText = computed<string | null>(() => {
        const groups = this.cookieGroups();
        if (groups.length === 0) return null;
        const totale = groups.reduce((n, g) => n + g.cookies.length, 0);
        const categorie = new Intl.ListFormat(this.lang(), { type: 'conjunction' }).format(groups.map(g => g.name));
        const soloTecnici = groups.every(g => g.category === ConsentCategory.Technical);
        return [
            this.translate.translate('cookieSintesi', totale, categorie),
            this.translate.translate(soloTecnici ? 'cookieSintesiSoloTecnici' : 'cookieSintesiConsenso'),
        ].join(' ');
    });

    /** Riepilogo "in sintesi" della Dichiarazione di accessibilità: conformità piena, o parziale con
     *  il numero di eccezioni note (le stesse che la sezione sotto elenca per esteso). */
    private readonly accessibilitySummaryText = computed<string | null>(() => {
        const status = this.accessibilityStatus();
        if (!status) return null;
        const n = status.nonAccessibili.length;
        if (n === 0) return this.translate.translate('accessibilitaSintesiPiena');
        return this.translate.translate(n === 1 ? 'accessibilitaSintesiParzialeUna' : 'accessibilitaSintesiParziale', n);
    });

    /** Riepilogo "in sintesi" della pagina corrente, prima dell'intro: informativa a strati sulla stessa
     *  pagina invece che su una pagina separata. Solo per le pagine con fatti che l'Engine conosce
     *  davvero (Privacy: installazione; Cookie: COOKIE_MAP; Accessibilità: stato di conformità). Termini
     *  di servizio e Note legali sono testo del progetto da cima a fondo: l'Engine non vi aggiunge nulla
     *  che non possa verificare da sé. */
    private readonly pageSummaryText = computed<string | null>(() => {
        const recipe = this.legalPage()?.recipe;
        if (recipe?.navigationData) {
            return renderNavigationSummary(this.legalFacts(), (key, ...args) => this.translate.translate(key, ...args), this.lang());
        }
        if (recipe?.cookieList) return this.cookieSummaryText();
        if (recipe?.accessibilityStatus) return this.accessibilitySummaryText();
        return null;
    });

    /** Titolo (H1 dell'intro) separato dal corpo, così la data "ultimo aggiornamento" sta tra i due e
     *  può essere resa con un <time> semantico nel template. BOM e righe vuote iniziali non contano
     *  (`trimStart` toglie anche U+FEFF): il build (legal-check) garantisce che, tolti quelli, l'intro apra con `# `. */
    readonly parts = computed(() => {
        const content = this.pageContent();
        if (!content) return null;
        let heading: string | null = null;
        let intro = content.intro.trimStart();
        if (intro.startsWith('#')) {
            const nl = intro.indexOf('\n');
            heading = nl === -1 ? intro : intro.slice(0, nl);
            intro = nl === -1 ? '' : intro.slice(nl + 1);
        }
        // `policy:<slot>` → percorso della pagina di quello slot nella lingua della pagina corrente.
        const lang = this.lang();
        const pathOf = (slot: string) => {
            const target = this.siteConfig.legalPages.find(spec => spec.slot === slot);
            return target ? ContestoSito.getPath(target.page, lang) : null;
        };
        const links = (md: string) => resolveLegalLinks(md, pathOf);
        // Privacy Policy: ambito e "Dati di navigazione" li scrive l'Engine da installazione e configurazione.
        const navigation = this.legalPage()?.recipe.navigationData
            ? renderNavigationData(this.legalFacts(), (key, ...args) => this.translate.translate(key, ...args), lang)
            : null;
        const summaryText = this.pageSummaryText();
        return {
            heading, update: this.policyUpdate(), summary: summaryText ? `> ${summaryText}` : null,
            intro: links(intro), navigation,
            sections: content.sections.map(links), outro: content.outro === null ? null : links(content.outro),
        };
    });

    /** Un solo tentativo per istanza: un fetch fallito (`null`) non deve far ripartire la richiesta
     *  a ogni ricalcolo dell'effect sotto (che legge `legalFacts()`, e la rimetterebbe a `null`). */
    private fetchedFactsFallback = false;

    constructor() {
        super();
        // L'identità arriva dalla risorsa condivisa dell'engine (già fetchata dal footer): qui la
        // si rispecchia nel signal locale, senza un fetch dedicato. Null finché non risolta/assente.
        effect(() => this.identity.set(this.identityService.identity()));

        // Fallback una tantum, solo sulla Privacy (l'unica pagina che li usa): null qui significa
        // che questa sessione non è mai passata da un render server (vedi commento su `legalFacts`
        // sopra). Un errore di rete lascia null, cioè il testo generico — mai un errore in pagina.
        effect(() => {
            if (!this.legalPage()?.recipe.navigationData || this.legalFacts() !== null || this.fetchedFactsFallback) return;
            this.fetchedFactsFallback = true;
            firstValueFrom(this.http.get<LegalFacts>('/internal/legal-facts').pipe(catchError(() => of(null))))
                .then(facts => this.legalFacts.set(facts));
        });
    }


}
