import type { Type } from '@angular/core';
import type { PageType } from './site';
import type { PageBaseComponent } from './pages/page-base.component';

// ======================================================
// MODELLI DI CONFIGURAZIONE
// ======================================================
//
// ARCHITETTURA DEL DSL
//
// Il builder funziona in tre fasi:
//
// FASE 1 — DICHIARAZIONE (site.ts):
//   L'utente descrive il sito usando i tipi *Input (SiteConfigInput,
//   SitePageInput, etc.). Questi tipi hanno campi opzionali e non
//   richiedono il discriminante "kind": il builder lo deduce dalla
//   struttura dell'oggetto (ha "children"? → parent. Ha "externalUrl"?
//   → external. Ha "component"? → leaf).
//
// FASE 2 — NORMALIZZAZIONE (buildSite):
//   Il builder percorre l'albero dichiarato, aggiunge "kind" esplicito,
//   completa i default, valida la coerenza, e costruisce una mappa
//   PageType → path che diventa il registry centrale dell'identita'
//   di ogni pagina. Da questo punto in poi, qualsiasi parte del sistema
//   puo' risolvere un PageType nel suo path reale.
//
// FASE 3 — GENERAZIONE:
//   Dalla struttura normalizzata vengono prodotti:
//   - Le rotte Angular (Route[]), filtrate per escludere disabilitate ed esterne
//   - I NavLink[] per header e footer, con i PageType risolti nei path reali
//   - getPath(PageType) per lookup runtime
//   - getSitemapPaths() per la sitemap
//
// PRINCIPIO DI IDENTITA':
//   Il PageType enum e' l'identita' stabile di ogni pagina. Path, titoli e
//   componenti possono cambiare; il PageType no. Menu, footer, guard, sitemap
//   e link interni referenziano sempre il PageType, mai stringhe. Se un path
//   cambia, basta aggiornare setSitePages: tutti i riferimenti si risolvono
//   automaticamente perche' passano dalla mappa PageType → path.
//

/**
 * Configurazione dell'effetto smoke.
 *
 * Questa interfaccia descrive tutti i parametri necessari
 * per controllare l'effetto visivo:
 * - attivazione/disattivazione
 * - colore
 * - opacità
 * - velocità massima
 * - raggio particelle
 * - densità complessiva
 */
export interface SmokeSettings {
    /** Attiva o disattiva l'effetto smoke. */
    enable: boolean;
    /** Colore base delle particelle o del fumo. */
    color: string;
    /** Opacita complessiva dell'effetto. */
    opacity: number;
    /** Velocita massima di movimento delle particelle. */
    maximumVelocity: number;
    /** Raggio medio delle particelle generate. */
    particleRadius: number;
    /** Densita complessiva dell'effetto a schermo. */
    density: number;
}

/**
 * Input parziale dell'effetto smoke durante la build.
 *
 * In `site.ts` non sei obbligato a dichiarare tutto il blocco:
 * il builder completa sempre i campi mancanti con i default finali.
 */
export type SmokeSettingsInput = Partial<SmokeSettings> | null | undefined;

/**
 * Configurazione generale del sito.
 *
 * Contiene:
 * - dati identificativi dell'applicazione
 * - lingua di default e lingue disponibili
 * - metadati descrittivi
 * - opzioni di UI
 * - configurazione dell'effetto smoke
 */
export interface SiteConfig {
    /** Nome applicativo del sito. */
    appName: string;
    /** Lingua predefinita del sito. */
    defaultLang: string;
    /** Elenco delle lingue supportate dal sito. */
    availableLanguages: string[];
    /** Descrizione generale del sito o dell'applicazione. */
    description: string;
    /** Colore tema principale usato dalla UI. */
    colorTema: string;
    /** Indica se il footer deve essere visibile. */
    showFooter: boolean;
    /** Configurazione finale normalizzata dell'effetto smoke. */
    smoke: SmokeSettings;
}

/**
 * Input della configurazione sito durante la build.
 *
 * I campi realmente identitari del sito restano obbligatori,
 * mentre le parti espandibili o normalizzabili possono essere omesse.
 */
export interface SiteConfigInput {
    /** Nome applicativo del sito. */
    appName: string;
    /** Lingua predefinita del sito. */
    defaultLang: string;
    /** Lingue dichiarate dall'utente, prima della normalizzazione. */
    availableLanguages?: string[] | null;
    /** Descrizione generale del sito o dell'applicazione. */
    description: string;
    /** Colore tema principale usato dalla UI. */
    colorTema: string;
    /** Consente di forzare la visibilita del footer. */
    showFooter?: boolean;
    /** Configurazione parziale dell'effetto smoke. */
    smoke?: SmokeSettingsInput;
}

// ======================================================
// MODELLI DELLE PAGINE
// ======================================================

/**
 * Proprietà comuni a tutte le tipologie di pagina dichiarabili in `site.ts`.
 *
 * Nota:
 * `path` esiste nel modello base perché serve sia alle pagine padre
 * sia alle pagine foglia interne.
 * Le pagine esterne lo rimuovono esplicitamente con `Omit`.
 */
type BasePageInput = {
    /** Segmento di path relativo della pagina interna. */
    path: string;
    /** Titolo o chiave di traduzione associata alla pagina. */
    title: string;
    /** Indica se la pagina e figli devono essere inclusa nella build finale. */
    enabled: boolean;
    /** Abilita l'accesso solo ad utenti autenticati. */
    requiresAuth?: boolean;
    /** Dati arbitrari aggiuntivi associati alla pagina. */
    data?: Record<string, any>;
};

/** Discriminante esplicito delle varianti di pagina supportate dalla DSL. */
export type SitePageKind = 'parent' | 'leaf' | 'external';

/**
 * Pagina contenitore dichiarabile in `site.ts`.
 *
 * Non rappresenta una route finale renderizzabile, ma un nodo
 * dell'albero che serve a raggruppare altre pagine.
 *
 * Per coerenza del modello:
 * - ha `children`
 * - non può avere `pageType`
 * - non può avere `component`
 * - non può avere `externalUrl`
 */
export type ParentPageInput = BasePageInput & {
    /**
     * Discriminante opzionale.
     *
     * In `site.ts` non serve più scriverlo: il builder deduce il tipo
     * dalla presenza di `children`.
     */
    kind?: 'parent';
    /** Figli annidati della pagina contenitore. */
    children: SitePageInput[];
    /** Non consentito per una pagina contenitore. */
    pageType?: never;
    /** Non consentito per una pagina contenitore. */
    component?: never;
    /** Non consentito per una pagina contenitore. */
    externalUrl?: never;
    /** Non consentito per una pagina contenitore. */
    showPanel?: never;
};

/**
 * Pagina interna reale dichiarabile in `site.ts`.
 *
 * Questa è una route Angular vera e propria:
 * - ha un `pageType`
 * - ha un componente lazy da caricare
 * - non può avere figli
 * - può opzionalmente nascondere il pannello
 * - non può essere un link esterno
 */
export type LeafPageInput = BasePageInput & {
    /**
     * Discriminante opzionale.
     *
     * In `site.ts` non serve più scriverlo: il builder deduce il tipo
     * dalla presenza di `component`.
     */
    kind?: 'leaf';
    /** Tipo logico della pagina interna. */
    pageType: PageType;
    /** Loader lazy del componente Angular associato alla pagina. */
    component: () => Promise<Type<PageBaseComponent>>;
    /** Non consentito per una pagina foglia interna. */
    children?: never;
    /** Consente di mostrare o nascondere il pannello associato. */
    showPanel?: boolean;
    /** Non consentito per una pagina interna. */
    externalUrl?: never;
};

/**
 * Pagina esterna dichiarabile in `site.ts`.
 *
 * Serve quando vuoi mappare un `PageType` su un URL esterno
 * invece che su una route Angular interna.
 *
 * Caratteristiche:
 * - non ha `path` interno Angular
 * - non ha `component`
 * - non ha `children`
 * - espone un `externalUrl`
 *
 * In questo modo puoi continuare a usare `PageType` anche per voci
 * di menu/footer che portano fuori dal sito.
 */
export type ExternalPageInput = Omit<BasePageInput, 'path'> & {
    /**
     * Discriminante opzionale.
     *
     * In `site.ts` non serve più scriverlo: il builder deduce il tipo
     * dalla presenza di `externalUrl`.
     */
    kind?: 'external';
    /** Tipo logico della pagina esterna. */
    pageType: PageType;
    /** URL assoluto o relativo verso una destinazione esterna. */
    externalUrl: string;
    /** Non consentito per una pagina esterna. */
    path?: never;
    /** Non consentito per una pagina esterna. */
    component?: never;
    /** Non consentito per una pagina esterna. */
    children?: never;
    /** Non consentito per una pagina esterna. */
    showPanel?: never;
};

/**
 * Un elemento dell'albero pagine dichiarato in `site.ts`.
 *
 * L'utente non è obbligato a esplicitare `kind`: il builder lo ricava
 * automaticamente dalla forma dell'oggetto.
 */
export type SitePageInput = ParentPageInput | LeafPageInput | ExternalPageInput;

/**
 * Proprietà comuni a tutte le tipologie di pagina normalizzate.
 */
type BasePage = BasePageInput;

/**
 * Versione interna normalizzata della pagina contenitore.
 *
 * Da questo punto in poi `kind` è sempre presente e affidabile,
 * così il resto del motore può continuare a usare una union discriminata.
 */
export type ParentPage = Omit<ParentPageInput, 'children' | 'kind'> & {
    kind: 'parent';
    children: SitePage[];
};

/** Versione interna normalizzata della pagina foglia. */
export type LeafPage = Omit<LeafPageInput, 'kind'> & {
    kind: 'leaf';
};

/** Versione interna normalizzata della pagina esterna. */
export type ExternalPage = Omit<ExternalPageInput, 'kind'> & {
    kind: 'external';
};

/**
 * Un elemento dell'albero pagine interno è una discriminated union e può essere:
 * - un nodo contenitore
 * - una pagina interna
 * - una pagina esterna
 */
export type SitePage = ParentPage | LeafPage | ExternalPage;
export type InternalSitePage = ParentPage | LeafPage;

/**
 * Struttura finale usata dal menu e dal footer.
 *
 * Dopo la fase di build, la navigazione viene esposta in questa forma:
 * - label visibile
 * - path finale risolto
 * - eventuali figli se è un gruppo
 */
export type NavLink = {
    /** Etichetta visibile del link. */
    label: string;
    /** Path o URL finale del link. */
    path: string;
    /** Eventuali link figli se l'elemento rappresenta un gruppo. */
    children?: NavLink[];
};

// ======================================================
// TYPE GUARDS
// ======================================================

/**
 * Verifica se una pagina è un nodo contenitore.
 *
 * La logica di discriminazione viene tenuta confinata qui,
 * così il resto del codice non deve spargere controlli strutturali.
 */
export const isParentPage = (page: SitePage): page is ParentPage =>
    page.kind === 'parent';

/**
 * Verifica se una pagina è una pagina esterna.
 *
 * Il discriminante `kind` rende il controllo esplicito e stabile,
 * senza dover inferire il tipo dalla presenza di altre proprietà.
 */
export const isExternalPage = (page: SitePage): page is ExternalPage =>
    page.kind === 'external';

/**
 * Verifica se una pagina è interna al sito.
 *
 * È semplicemente il complemento di `isExternalPage`.
 * Questo type guard è utile soprattutto nel return finale,
 * per filtrare solo le pagine valide per Angular Router.
 */
export const isInternalPage = (page: SitePage): page is InternalSitePage =>
    page.kind === 'parent' || page.kind === 'leaf';

/**
 * Verifica se un item raw di navigazione è un gruppo.
 *
 * Serve nella fase di risoluzione finale della navigazione.
 */
const isRawGroup = (
    item: RawNavItem
): item is { kind: 'group'; label: string; children: RawNavItem[] } =>
    item.kind === 'group';

/**
 * Verifica se l'input dichiarato rappresenta una pagina contenitore.
 *
 * Qui usiamo un controllo strutturale per permettere a `site.ts`
 * di restare privo del discriminante esplicito.
 */
const isParentPageInput = (page: SitePageInput): page is ParentPageInput =>
    'children' in page;

/**
 * Verifica se l'input dichiarato rappresenta una pagina esterna.
 */
const isExternalPageInput = (page: SitePageInput): page is ExternalPageInput =>
    'externalUrl' in page;

/**
 * Verifica se l'input dichiarato rappresenta una pagina foglia interna.
 */
const isLeafPageInput = (page: SitePageInput): page is LeafPageInput =>
    'component' in page;

/**
 * Garantisce che un eventuale `kind` scritto manualmente sia coerente
 * con la forma reale dell'oggetto.
 */
const assertDeclaredKind = (
    page: SitePageInput,
    inferredKind: SitePageKind,
    context: string
): void => {
    if (page.kind && page.kind !== inferredKind) {
        throw new Error(
            `[SiteBuilder] Pagina non valida in ${context}: kind="${page.kind}" non coincide con il tipo dedotto "${inferredKind}".`
        );
    }
};

/**
 * Normalizza una pagina dichiarata dall'utente aggiungendo il `kind`
 * interno e ricorsivamente tutti i figli.
 */
const normalizeSitePage = (
    page: SitePageInput,
    context: string
): SitePage => {
    if (isParentPageInput(page)) {
        assertDeclaredKind(page, 'parent', context);

        return {
            ...page,
            kind: 'parent',
            children: page.children.map((child, index) =>
                normalizeSitePage(child, `${context}.children[${index}]`)
            )
        };
    }

    if (isExternalPageInput(page)) {
        assertDeclaredKind(page, 'external', context);

        return {
            ...page,
            kind: 'external'
        };
    }

    if (isLeafPageInput(page)) {
        assertDeclaredKind(page, 'leaf', context);

        return {
            ...page,
            kind: 'leaf'
        };
    }

    throw new Error(
        `[SiteBuilder] Pagina non valida in ${context}: specificare una delle proprietà "children", "component" o "externalUrl".`
    );
};

/**
 * Normalizza tutto l'albero pagine dichiarato dall'utente.
 */
const normalizeSitePages = (pages: SitePageInput[]): SitePage[] =>
    pages.map((page, index) => normalizeSitePage(page, `sitePages[${index}]`));

// ======================================================
// BUILDER PUBBLICI
// ======================================================

/**
 * Builder usato all'interno delle sezioni di navigazione.
 *
 * Espone tre azioni:
 * - `addPage(...)`  -> aggiunge un riferimento a una pagina tramite PageType
 * - `addLink(...)`  -> aggiunge un link diretto
 * - `addGroup(...)` -> crea un gruppo annidato con una callback
 */
export interface SiteNavigationSectionBuilder {
    /**
     * Aggiunge un riferimento a una pagina del sito tramite `PageType`.
     * @param pageType Tipo pagina da risolvere in fase finale.
     */
    addPage: (pageType: PageType) => void;
    /**
     * Aggiunge un link diretto alla navigazione.
     * @param labelTranslationKey Chiave di traduzione o etichetta del link.
     * @param destinationPath Path o URL di destinazione.
     */
    addLink: (labelTranslationKey: string, destinationPath: string) => void;
    /**
     * Crea un gruppo annidato nella navigazione.
     * @param groupLabelTranslationKey Chiave di traduzione o etichetta del gruppo.
     * @param configureGroupItems Callback che definisce gli elementi del gruppo.
     */
    addGroup: (
        groupLabelTranslationKey: string,
        configureGroupItems: (groupItemsBuilder: SiteNavigationSectionBuilder) => void
    ) => void;
}

export interface SiteConfigurationSectionBuilder {
    /**
     * Imposta la configurazione del sito.
     * @param siteConfigurationInput Configurazione raw da normalizzare.
     */
    setSiteConfiguration: (siteConfigurationInput: SiteConfigInput) => void;
}

export interface SitePagesSectionBuilder {
    /**
     * Imposta l'albero completo delle pagine del sito.
     * @param sitePages Pagine dichiarate dall'utente.
     */
    setSitePages: (sitePages: SitePageInput[]) => void;
}

export interface SiteNavigationSectionsBuilder {
    /**
     * Configura la navigazione dell'header.
     * @param buildHeaderNavigationItems Callback che popola i link dell'header.
     */
    configureHeaderNavigation: (
        buildHeaderNavigationItems: (headerNavigationBuilder: SiteNavigationSectionBuilder) => void
    ) => void;
    /**
     * Configura la navigazione del footer.
     * @param buildFooterNavigationItems Callback che popola i link del footer.
     */
    configureFooterNavigation: (
        buildFooterNavigationItems: (footerNavigationBuilder: SiteNavigationSectionBuilder) => void
    ) => void;
}

/**
 * Builder principale del sito.
 *
 * Tiene separate tre aree semanticamente diverse:
 * - config
 * - routes
 * - navigation
 *
 * Questa separazione è utile perché:
 * - la configurazione è una cosa
 * - la definizione delle pagine è un'altra
 * - la costruzione del menu/footer è un'altra ancora
 */
export interface SiteBuilder {
    /**
     * Configura i metadati e le opzioni globali del sito.
     * @param buildSiteConfiguration Callback che riceve il builder della configurazione.
     */
    setSiteConfiguration: (
        buildSiteConfiguration: (
            siteConfigurationSectionBuilder: SiteConfigurationSectionBuilder
        ) => void
    ) => void;
    /**
     * Definisce l'albero delle pagine del sito.
     * @param buildSitePages Callback che riceve il builder delle pagine.
     */
    defineSitePages: (
        buildSitePages: (sitePagesSectionBuilder: SitePagesSectionBuilder) => void
    ) => void;
    /**
     * Configura le sezioni di navigazione pubbliche del sito.
     * @param buildSiteNavigation Callback che riceve il builder di header e footer.
     */
    configureSiteNavigation: (
        buildSiteNavigation: (
            siteNavigationSectionsBuilder: SiteNavigationSectionsBuilder
        ) => void
    ) => void;
}

export interface BuiltSite {
    /** Configurazione finale del sito, gia normalizzata. */
    config: SiteConfig;
    /** Pagine interne esponibili ad Angular Router. */
    pages: InternalSitePage[];
    /** Navigazione finale dell'header. */
    menuNav: NavLink[];
    /** Navigazione finale del footer. */
    linkFooter: NavLink[];
    /**
     * Restituisce il path associato a un `PageType`.
     * @param type Tipo pagina da risolvere.
     */
    getPath: (type: PageType) => string | undefined;
    /** Restituisce tutti i path interni raccolti per la sitemap. */
    getSitemapPaths: () => string[];
}

// ======================================================
// MODELLI INTERNI DELLA NAVIGAZIONE
// ======================================================

/**
 * Rappresentazione interna “grezza” della navigazione.
 *
 * Durante la build non risolviamo subito i link finali,
 * ma accumuliamo una struttura intermedia composta da:
 * - riferimenti a pagine (`kind: 'page'`)
 * - link diretti (`kind: 'link'`)
 * - gruppi (`kind: 'group'`)
 *
 * Solo alla fine questa struttura viene trasformata in `NavLink[]`.
 */
type RawNavItem =
    | { kind: 'page'; type: PageType }
    | { kind: 'link'; label: string; path: string }
    | { kind: 'group'; label: string; children: RawNavItem[] };

// ======================================================
// ENGINE PRINCIPALE
// ======================================================

/**
 * Costruisce la struttura completa del sito.
 *
 * Raccoglie config, pagine e navigation tramite builder
 * Normalizza la configurazione
 * Percorre l'albero delle pagine
 * Costruisce:
 * - la mappa PageType -> path
 * - la sitemap
 * Risolve menu e footer in NavLink finali
 *
 * Il risultato finale contiene:
 * - Config pronta
 * - Pagine interne per Angular Router
 * - Menu header risolto
 * - Footer risolto
 * - Helper per path e sitemap
 */
export function buildSite(
    defineSiteStructure: (siteDefinitionBuilder: SiteBuilder) => void
): BuiltSite {
    /**
     * Configurazione finale del sito.
     */
    let siteConfig: SiteConfig | null = null;

    /**
     * Albero completo delle pagine definito dall'utente.
     */
    let sitePages: SitePage[] = [];

    /**
     * Contenitori raw delle sezioni di navigazione.
     *
     * Qui accumuliamo la struttura dichiarata in `configureSiteNavigation(...)`
     * prima di risolverla nei `NavLink` finali.
     */
    const rawHeader: RawNavItem[] = [];
    const rawFooter: RawNavItem[] = [];

    /**
     * Crea gli strumenti di build per una sezione di navigazione sia per l'header sia per il footer.
     */
    const createNavigationSectionBuilder = (
        targetNavigationItems: RawNavItem[]
    ): SiteNavigationSectionBuilder => ({
        /**
         * Aggiunge un riferimento a una pagina del sito tramite PageType.
         * La risoluzione del path reale avverrà più avanti.
         */
        addPage: (pageType) => {
            targetNavigationItems.push({ kind: 'page', type: pageType });
        },

        /**
         * Aggiunge un link diretto già completo.
         */
        addLink: (labelTranslationKey, destinationPath) => {
            targetNavigationItems.push({
                kind: 'link',
                label: labelTranslationKey,
                path: destinationPath
            });
        },

        /**
         * Aggiunge un gruppo annidato.
         *
         * Viene creato un sotto-array locale `children`,
         * popolato dalla callback, e poi inserito nel target.
         */
        addGroup: (groupLabelTranslationKey, configureGroupItems) => {
            const childNavigationItems: RawNavItem[] = [];
            configureGroupItems(
                createNavigationSectionBuilder(childNavigationItems)
            );
            targetNavigationItems.push({
                kind: 'group',
                label: groupLabelTranslationKey,
                children: childNavigationItems
            });
        }
    });

    /**
     * Esegue la configurazione del sito passando un builder unico.
     *
 * Ogni sezione scrive dentro le variabili locali:
 * - `configureSiteConfiguration(...)` -> valorizza `siteConfig`
 * - `defineSitePages(...)`            -> valorizza `sitePages`
 * - `configureSiteNavigation(...)`    -> valorizza `rawHeader` / `rawFooter`
     */
    defineSiteStructure({
        setSiteConfiguration: (buildSiteConfiguration) =>
            buildSiteConfiguration({
                setSiteConfiguration: (siteConfigurationInput) => {
                    /**
                     * Default dell'effetto smoke.
                     * Vengono usati per completare eventuali campi mancanti.
                     */
                    const defaultSmoke: SmokeSettings = {
                        enable: false,
                        color: '#ffffff',
                        opacity: 0.5,
                        maximumVelocity: 0.5,
                        particleRadius: 2,
                        density: 10
                    };

                    /**
                     * Normalizzazione della config:
                     * - garantisce che la lingua di default sia inclusa
                     * - rimuove eventuali duplicati nelle lingue
                     * - merge dei default smoke con i valori custom
                     */
                    const normalizeLang = (l?: string) =>
                        typeof l === 'string' ? l.trim().toLowerCase() : '';

                    const rawLangs = [
                        siteConfigurationInput.defaultLang,
                        ...(siteConfigurationInput.availableLanguages ?? [])
                    ];

                    const availableLanguages = Array.from(
                        new Set(rawLangs.map(normalizeLang).filter(Boolean))
                    );

                    siteConfig = {
                        appName: siteConfigurationInput.appName,
                        defaultLang: normalizeLang(siteConfigurationInput.defaultLang) || siteConfigurationInput.defaultLang,
                        availableLanguages,
                        description: siteConfigurationInput.description,
                        colorTema: siteConfigurationInput.colorTema,
                        showFooter: siteConfigurationInput.showFooter ?? true,
                        smoke: { ...defaultSmoke, ...(siteConfigurationInput.smoke ?? {}) }
                    };
                }
            }),

        defineSitePages: (buildSitePages) =>
            buildSitePages({
                /**
                 * Salva l'albero delle pagine così come definito dall'utente.
                 */
                setSitePages: (definedSitePages) => {
                    sitePages = normalizeSitePages(definedSitePages);
                }
            }),

        configureSiteNavigation: (buildSiteNavigation) =>
            buildSiteNavigation({
                /**
                 * Costruisce la sezione header usando un builder dedicato.
                 */
                configureHeaderNavigation: (buildHeaderNavigationItems) => {
                    buildHeaderNavigationItems(
                        createNavigationSectionBuilder(rawHeader)
                    );
                },

                /**
                 * Costruisce la sezione footer usando un builder dedicato.
                 */
                configureFooterNavigation: (buildFooterNavigationItems) => {
                    buildFooterNavigationItems(
                        createNavigationSectionBuilder(rawFooter)
                    );
                }
            })
    });

    /**
     * La config è obbligatoria.
     * Se manca, il builder non è stato usato correttamente.
     */
    if (!siteConfig) {
        throw new Error(
            '[SiteBuilder] Configurazione mancante. Chiamare site.configureSiteConfiguration(...) prima del build.'
        );
    }

    /**
     * Mappa interna usata per risolvere i riferimenti `PageType`.
     *
     * Esempio:
     * PageType.Home -> { label: 'Home', path: '/home' }
     *
     * Questa mappa viene popolata durante l'elaborazione dell'albero pagine.
     */
    const pageMap = new Map<PageType, { label: string; path: string }>();

    /**
     * Percorre ricorsivamente l'albero delle pagine e costruisce:
     * - la sitemap locale
     * - la mappa PageType -> path
     *
     * Regole:
     * - se la pagina è disabilitata, viene ignorata
     * - se è esterna, finisce nella `pageMap` ma non nella sitemap locale
     * - se è padre, si scende ricorsivamente nei figli
     * - se è foglia interna, si salva il path completo
     */
    const processPages = (pages: SitePage[], parent = ''): string[] => {
        return pages.flatMap((page) => {
            /**
             * Le pagine disabilitate vengono completamente escluse
             * sia dalla sitemap sia dalla mappa di risoluzione.
             */
            if (!page.enabled) {
                return [];
            }

            /**
             * Una pagina esterna non ha un path Angular locale.
             * La registriamo comunque nella mappa per poterla usare
             */
            if (isExternalPage(page)) {
                pageMap.set(page.pageType, {
                    label: page.title,
                    path: page.externalUrl
                });

                return [];
            }

            /**
             * Costruzione del path completo della pagina interna.
             *
             * Esempio:
             * parent = '/admin'
             * page.path = 'users'
             * risultato = '/admin/users'
             *
             * Il replace finale elimina eventuali slash doppi.
             */
            const fullPath = `/${[parent, page.path]
                .filter(Boolean)
                .join('/')}`.replace(/\/+/g, '/');

            /**
             * Se è una pagina contenitore, non la registriamo come foglia,
             * ma continuiamo sui figli usando il path corrente come parent.
             */
            if (isParentPage(page)) {
                return processPages(page.children, fullPath);
            }

            /**
             * Se arriviamo qui, siamo su una pagina foglia interna.
             * La registriamo nella mappa e la aggiungiamo alla sitemap.
             */
            pageMap.set(page.pageType, {
                label: page.title,
                path: fullPath
            });

            return [fullPath];
        });
    };

    /**
     * Elenco finale dei path interni del sito.
     */
    const sitemap = processPages(sitePages);

    /**
     * Risolve una lista di item raw di navigazione in `NavLink[]`.
     *
     * Regole:
     * - `page`  -> cerca il path nella mappa `pageMap`
     * - `group` -> risolve ricorsivamente i figli
     * - `link`  -> usa direttamente label/path
     *
     * I gruppi vuoti o i riferimenti non risolti vengono scartati.
     */
    const resolveNavigation = (items: RawNavItem[]): NavLink[] =>
        items
            .map((item) => {
                /**
                 * Riferimento a una pagina tramite PageType.
                 * Se non esiste nella mappa, torna null e verrà filtrato via.
                 */
                if (item.kind === 'page') {
                    return pageMap.get(item.type) ?? null;
                }

                /**
                 * Gruppo di navigazione:
                 * risolviamo prima i figli, poi teniamo il gruppo
                 * solo se contiene almeno un elemento valido.
                 */
                if (isRawGroup(item)) {
                    const children = resolveNavigation(item.children);

                    return children.length > 0
                        ? {
                            label: item.label,
                            path: `#group:${item.label}`,
                            children
                        }
                        : null;
                }

                /**
                 * Link diretto già completo.
                 */
                return {
                    label: item.label,
                    path: item.path
                };
            })
            .filter((item): item is NavLink => item !== null);

    /**
     * Valore finale esposto dal builder.
     */
    return {
        /**
         * Configurazione finale già normalizzata.
         */
        config: siteConfig,

        /**
         * Solo le pagine interne al sito.
         *
         * Questo è utile perché Angular Router non deve vedere
         * le pagine esterne.
         */
        pages: sitePages.filter(isInternalPage),

        /**
         * Navigazione header risolta.
         */
        menuNav: resolveNavigation(rawHeader),

        /**
         * Navigazione footer risolta.
         */
        linkFooter: resolveNavigation(rawFooter),

        /**
         * Restituisce il path associato a un PageType,
         * se presente nella mappa.
         */
        getPath: (type: PageType) => pageMap.get(type)?.path,

        /**
         * Restituisce tutti i path interni del sito
         * raccolti durante la build.
         */
        getSitemapPaths: () => sitemap
    };
}
