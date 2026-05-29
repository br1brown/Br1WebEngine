import { InjectionToken, type Type } from '@angular/core';
import { PageType } from '../../site';
import type { PageBaseComponent } from '../../pages/page-base.component';
import { COOKIE_MAP } from '../services/cookie-registry';

// ======================================================
// MODELLI DI CONFIGURAZIONE
// ======================================================

export const SITE_CONFIG = new InjectionToken<SiteConfig>('SITE_CONFIG');

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
//   - getSitemapEntries() per la sitemap
//
// PRINCIPIO DI IDENTITA':
//   Il PageType enum e' l'identita' stabile di ogni pagina. Path, titoli e
//   componenti possono cambiare; il PageType no. Menu, footer, guard, sitemap
//   e link interni referenziano sempre il PageType, mai stringhe. Se un path
//   cambia, basta aggiornare defineSitePages: tutti i riferimenti si risolvono
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
 * - metadati SEO e social media globali
 */
export interface SiteConfig {
    /** Nome applicativo del sito. */
    appName: string;
    /** Forza l'uso esclusivo dell'immagine per le anteprime social (Open Graph) senza aggiungere scritte o favicon. */
    onlyPlainImage: boolean;
    /**
     * Versione canonica dell'applicazione (es. "1.2.0").
     * Sorgente di verità per il rilevamento aggiornamenti: a build time
     * `generate-statics.ts` la propaga nel meta `app-version`, nel
     * `manifest.webmanifest` e nei file generati da NGSW. A runtime viene
     * confrontata da `VersionCheckService` (polling + SwUpdate per la PWA).
     */
    version: string;
    /** Descrizione generale del sito o dell'applicazione. */
    description: string;
    /** Colore tema principale usato dalla UI. */
    colorTema: string;
    /** Indica se il footer deve essere visibile. */
    showFooter: boolean;
    /** Indica se il Header deve essere visibile. */
    showNav: boolean;
    /** FIssare la navBar in alto */
    fixedTopHeader?: boolean;
    /** Mostra l'icona (favIcon) accanto al nome dell'app nella navbar-brand. */
    showBrandIcon: boolean;
    /** Abilita le funzionalità PWA: Service Worker, aggiornamenti automatici e installazione offline. */
    isWebApp: boolean;
    /** Configurazione finale normalizzata dell'effetto smoke. */
    smoke: SmokeSettings;
    /**
     * Se `true`, il pannello contenuti (`.content-panel`) è sempre chiaro
     * indipendentemente dalla preferenza OS. Default: `true`.
     */
    forcedLightPanel: boolean;
    /** Pagina a cui reindirizzare l'utente se non autenticato (se null o non impostata fa redirect a /error/401) */
    pageForAuthGuard?: PageType | null;
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
    /** Versione dell'applicazione (es. "1.2.0"). Usata per rilevare aggiornamenti. */
    version?: string;
    /** Descrizione generale del sito o dell'applicazione. */
    description: string;
    /** Colore tema principale usato dalla UI. */
    colorTema: string;
    /** Visibilita del footer. */
    showFooter?: boolean;
    /** Visibilita del header.
     * @remarks `false` nasconde l'intera navbar incondizionatamente — incluso il language picker
     * per i siti multilingua. Se il sito ha più lingue e si imposta `showNav: false`,
     * il cambio lingua non sarà accessibile tramite UI. Usare con consapevolezza. */
    showNav?: boolean;
    /** FIssare la navBar in alto */
    fixedTopHeader?: boolean;
    /** Mostra l'icona (favIcon) accanto al nome dell'app nella navbar-brand. Default: `true`. */
    showBrandIcon?: boolean;
    /**
     * Abilita le funzionalità PWA: Service Worker, cache offline e aggiornamenti automatici.
     * Se `false`, il SW non viene registrato e `VersionCheckService` usa solo il polling manifest.
     * Default: `true`.
     */
    isWebApp?: boolean;
    /** Forza l'uso esclusivo dell'immagine per le anteprime social (Open Graph) senza aggiungere scritte o favicon. */
    onlyPlainImage?: boolean;
    /** Configurazione parziale dell'effetto smoke. */
    smoke?: SmokeSettingsInput;
    /**
     * Forza il pannello contenuti (`.content-panel`) sempre in modalità chiara,
     * indipendentemente dalla preferenza OS dell'utente.
     * Utile per temi scuri in cui si preferisce mantenere i contenuti testuali
     * su sfondo bianco per massima leggibilità. Default: `true`.
     */
    forcedLightPanel?: boolean;
    /** Pagina a cui reindirizzare l'utente se non autenticato (se null o non impostata fa redirect a /error/401) */
    pageForAuthGuard?: PageType | null;
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
    /** Indica se la pagina e figli devono essere inclusa nella build finale. Default: true */
    enabled?: boolean;
    /** Abilita l'accesso solo ad utenti autenticati. Forza automaticamente
     *  `renderMode: 'client'` — i bot non possono loggarsi, l'SSR è inutile. */
    requiresAuth?: boolean;
    /** Dati arbitrari aggiuntivi associati alla pagina. */
    data?: Record<string, unknown>;
};

/** Discriminante esplicito delle varianti di pagina supportate dalla DSL. */
export type SitePageKind = 'parent' | 'leaf' | 'external';

/**
 * Strategia di rendering dichiarativa associabile a una pagina interna.
 *
 * Usato da `siteBuilder.ts` per determinare la strategia di rendering SSR di ogni pagina
 * e passarla ad Angular tramite `provideServerRouting` in `app.config.server.ts`.
 */
export type SiteRenderMode = 'client' | 'server';

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
     * Discriminante opzionale: in `site.ts` puo' essere omesso perche'
     * il builder deduce il tipo dalla presenza di `children`.
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
    layout?: never;
    /** Non consentito per una pagina contenitore. */
    renderMode?: never;
};

/**
 * Pagina interna reale dichiarabile in `site.ts`.
 *
 * Questa è una route Angular vera e propria:
 * - ha un `pageType`
 * - ha un componente lazy da caricare
 * - non può avere figli
 * - può sovrascrivere i flag di shell (`layout`)
 * - non può essere un link esterno
 */
export type LeafPageInput = BasePageInput & {
    /** Discriminante opzionale */
    kind?: 'leaf';

    /** Tipo logico della pagina interna */
    pageType: PageType;

    /** Loader lazy del componente Angular associato alla pagina */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: () => Promise<Type<PageBaseComponent<any>>>;

    /** Non consentito per una pagina foglia interna */
    children?: never;

    /**
     * Override per-pagina dei flag di layout/shell.
     * Tutti subordinati al globale in `setSiteConfiguration`: se globalmente
     * disabilitato, il flag di pagina non può riattivarlo.
     */
    layout?: {
        /** Mostra o nasconde il pannello contenuto. Default: true. */
        showPanel?: boolean;
        /** Nasconde la navbar solo su questa pagina. Non influenza le altre pagine né il language picker globale.
         * @remarks Se `SiteConfigInput.showNav` è `false`, la navbar è sempre nascosta
         * indipendentemente da questo valore — la configurazione globale ha sempre la precedenza. */
        showNav?: boolean;
        /** Nasconde il footer su questa pagina. */
        showFooter?: boolean;
    };

    /**
     * Strategia di rendering della pagina.
     *
     * - `'server'` — HTML generato a ogni richiesta (default): dati freschi + bot-friendly
     * - `'client'` — nessun SSR, solo browser: forzato automaticamente se `requiresAuth: true`
     *
     * Se omesso e `requiresAuth` è false, il builder usa `'server'` in automatico.
     */
    renderMode?: SiteRenderMode;

    /**
     * Descrizione della pagina per social sharing (og:description, twitter:description).
     * Può essere una chiave i18n o una stringa letterale.
     * Se omessa, viene usata la descrizione globale del sito come fallback.
     */
    description?: string;

    /**
     * Metadati SEO/social per la pagina. Tutti i campi sono opzionali e hanno
     * default sensati nel builder; raggrupparli evita di appiattire i tag OG
     * e Schema.org al top-level della dichiarazione.
     */
    otherSEO?: {
        /**
         * Immagine di anteprima per og:image e twitter:image.
         *
         * - `string`    → ID asset da usare come immagine statica
         * - `false`     → nessuna immagine (i tag og:image e twitter:image non vengono emessi)
         * - `undefined` → genera automaticamente la preview dinamica via /cdn-cgi/preview
         */
        ogImage?: string | false;
        /** Tipo Open Graph (og:type). Default automatico: 'website'. */
        ogType?: string;
        /** Tipo Schema.org per i structured data JSON-LD (@type). Default automatico: 'WebPage'. */
        structuredDataType?: string;
    };

    /** Non consentito per una pagina interna */
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
     * Discriminante opzionale: in `site.ts` puo' essere omesso perche'
     * il builder deduce il tipo dalla presenza di `externalUrl`.
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
    layout?: never;
    /** Non consentito per una pagina esterna. */
    renderMode?: never;
};

/**
 * Un elemento dell'albero pagine dichiarato in `site.ts`.
 *
 * L'utente non è obbligato a esplicitare `kind`: il builder lo ricava
 * automaticamente dalla forma dell'oggetto.
 */
export type SitePageInput = ParentPageInput | LeafPageInput | ExternalPageInput;

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

/**
 * Versione interna normalizzata della pagina foglia.
 *
 * I sotto-oggetti `layout` e `otherSEO` vengono appiattiti al top-level:
 * il resto del motore (router, app shell, ContentResolver) li consuma
 * direttamente senza dover navigare i sotto-oggetti.
 */
export type LeafPage = Omit<LeafPageInput, 'kind' | 'layout' | 'otherSEO'> & {
    kind: 'leaf';
    showPanel?: boolean;
    showNav?: boolean;
    showFooter?: boolean;
    ogImage?: string | false;
    ogType?: string;
    structuredDataType?: string;
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
    /** true se il link punta a una risorsa esterna al sito (externalUrl o link diretto http/https). */
    isExternal: boolean;
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
 *
 * @param page - La pagina da verificare
 * @returns true se la pagina è un nodo contenitore
 */
export const isParentPage = (page: SitePage): page is ParentPage =>
    page.kind === 'parent';

/**
 * Verifica se una pagina è una pagina esterna.
 *
 * Il discriminante `kind` rende il controllo esplicito e stabile,
 * senza dover inferire il tipo dalla presenza di altre proprietà.
 *
 * @param page - La pagina da verificare
 * @returns true se la pagina è una pagina esterna
 */
export const isExternalPage = (page: SitePage): page is ExternalPage =>
    page.kind === 'external';

/**
 * Verifica se una pagina è interna al sito.
 *
 * È semplicemente il complemento di `isExternalPage`.
 * Questo type guard è utile soprattutto nel return finale,
 * per filtrare solo le pagine valide per Angular Router.
 *
 * @param page - La pagina da verificare
 * @returns true se la pagina è interna (parent o leaf)
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
 *
 * @param page - La pagina da validare
 * @param inferredKind - Il tipo di pagina dedotto dalla struttura
 * @param context - Contesto per il messaggio di errore (es. "sitePages[0]")
 * @throws Se il `kind` esplicito non coincide con il tipo dedotto
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
 *
 * @param page - La pagina grezza da normalizzare
 * @param context - Contesto per il messaggio di errore (es. "sitePages[0]")
 * @returns La pagina normalizzata con `kind` esplicito e figli processati
 * @throws Se la pagina non specifica `children`, `component` o `externalUrl`
 */
const normalizeSitePage = (
    page: SitePageInput,
    context: string
): SitePage => {
    if (isParentPageInput(page)) {
        assertDeclaredKind(page, 'parent', context);

        return {
            ...page,
            enabled: page.enabled ?? true,
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
            enabled: page.enabled ?? true,
            kind: 'external'
        };
    }

    if (isLeafPageInput(page)) {
        assertDeclaredKind(page, 'leaf', context);

        const { layout, otherSEO, ...rest } = page;
        return {
            ...rest,
            enabled: page.enabled ?? true,
            kind: 'leaf',
            showPanel: layout?.showPanel,
            showNav: layout?.showNav,
            showFooter: layout?.showFooter,
            ogImage: otherSEO?.ogImage,
            ogType: otherSEO?.ogType,
            structuredDataType: otherSEO?.structuredDataType,
        };
    }

    throw new Error(
        `[SiteBuilder] Pagina non valida in ${context}: specificare una delle proprietà "children", "component" o "externalUrl".`
    );
};

/**
 * Normalizza tutto l'albero pagine dichiarato dall'utente.
 *
 * @param pages - L'array di pagine grezze da normalizzare
 * @returns L'array di pagine normalizzate con `kind` espliciti
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

/**
 * Builder principale del sito.
 *
 * Tiene separate quattro aree semanticamente diverse:
 * - config globale
 * - albero delle pagine
 * - navigazione header
 * - navigazione footer
 */
export interface SiteBuilder {
    /**
     * Configura i metadati e le opzioni globali del sito.
     * @param config Configurazione grezza del sito da normalizzare.
     */
    setSiteConfiguration: (config: SiteConfigInput) => void;
    /**
     * Definisce l'albero delle pagine del sito.
     * @param pages Pagine dichiarate dall'utente.
     */
    defineSitePages: (pages: SitePageInput[]) => void;
    /**
     * Configura i link della navigazione principale (header).
     * @param buildItems Callback che popola le voci tramite addPage / addGroup / addLink.
     */
    configureHeaderNavigation: (
        buildItems: (builder: SiteNavigationSectionBuilder) => void
    ) => void;
    /**
     * Configura i link del footer.
     * @param buildItems Callback che popola le voci tramite addPage / addGroup / addLink.
     */
    configureFooterNavigation: (
        buildItems: (builder: SiteNavigationSectionBuilder) => void
    ) => void;
}

export type ServerRenderEntry = {
    /** Path completo normalizzato della pagina interna foglia. */
    path: string;
    /** Strategia di rendering finale da esporre al layer server. */
    renderMode: SiteRenderMode;
};

/**
 * Metadati di una singola pagina esposti pubblicamente da ContestoSito.
 * Usati dal ContentResolver per impostare titolo, descrizione e og:image
 * restituiti dal ContentResolver e usati da PageBaseComponent per aggiornare i meta tag via effect().
 */
export type PageInfo = {
    /** Chiave i18n (o testo statico) del titolo della pagina. */
    title: string;
    /** Path Angular interno o URL esterno. */
    path: string;
    /** true se il link punta a una risorsa esterna. */
    isExternal: boolean;
    /** Chiave i18n (o testo statico) della descrizione SEO. Undefined se non dichiarata. */
    description?: string;
    /** ID asset immagine di anteprima. false = nessuna immagine. Undefined = preview dinamica. */
    ogImage?: string | false;
    /** Tipo Open Graph della pagina (og:type). Se assente il default è 'website'. */
    ogType?: string;
    /** Tipo Schema.org per i structured data JSON-LD (@type). Se assente il default è 'WebPage'. */
    structuredDataType?: string;
};

export interface BuiltSite {
    /** Configurazione finale del sito, gia normalizzata. */
    config: SiteConfig;
    /** Pagine interne esponibili ad Angular Router. */
    pages: InternalSitePage[];
    /** Navigazione finale dell'header. */
    menuNav: NavLink[];
    /** Navigazione finale del footer. */
    linkFooter: NavLink[];
    /** Piano di rendering server-only derivato dalle pagine foglia interne valide. */
    serverRenderEntries: ServerRenderEntry[];
    /**
     * Restituisce il path associato a un `PageType`, oppure `null` se la pagina
     * è disabilitata o non registrata. Controlla sempre il valore prima di usarlo
     * in un link — `null` non finisce mai silenziosamente in un href.
     * @param type Tipo pagina da risolvere.
     */
    getPath: (type: PageType) => string | null;
    /**
     * Restituisce i metadati completi (title, path, description, ogImage) associati
     * a un PageType. Usato dal ContentResolver per impostare i meta tag SEO.
     * Ritorna `null` se la pagina non è registrata o è disabilitata.
     */
    getPageInfo: (type: PageType) => PageInfo | null;
    /** Restituisce le voci della sitemap (path + metadati). */
    getSitemapEntries: () => SitemapEntry[];
}

/**
 * Voce arricchita per la generazione della sitemap.
 * Usata da `generate-sitemap.ts` e da eventuali script di prerendering.
 *
 * Note:
 * - `description` è la stringa dichiarata in `site.ts` (chiave i18n o testo statico).
 *   Non finisce nel `<description>` dell'XML (campo non standard), ma è disponibile
 *   per script che ne hanno bisogno (es. prerendering, sitemap JSON, feed).
 * - Le pagine `requiresAuth: true` sono escluse automaticamente.
 */
export type SitemapEntry = {
    path: string;
    description?: string;
};

// ======================================================
// MODELLI INTERNI DELLA NAVIGAZIONE
// ======================================================

/**
 * Rappresentazione interna "grezza" della navigazione.
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
 * Raccoglie config, pagine e navigation tramite builder, normalizza la configurazione,
 * percorre l'albero delle pagine per costruire la mappa PageType → path e la sitemap,
 * quindi risolve menu e footer in NavLink finali.
 *
 * @param defineSiteStructure - Callback che configura il builder (config, pagine, navigazione)
 * @returns Struttura completa del sito normalizzata e pronta per Angular Router e SSR
 * @throws Se la configurazione mancante o se ci sono PageType/path duplicati o incoerenze
 */
export function buildSite(
    defineSiteStructure: (siteDefinitionBuilder: SiteBuilder) => void
): BuiltSite {
    let siteConfig: SiteConfig | null = null;

    /**
     * Albero completo delle pagine definito dall'utente.
     */
    let sitePages: SitePage[] = [];

    /**
     * Contenitori raw delle sezioni di navigazione.
     *
     * Qui accumuliamo la struttura dichiarata in `configureHeaderNavigation` /
     * `configureFooterNavigation` prima di risolverla nei `NavLink` finali.
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
     * - `setSiteConfiguration(...)`      -> valorizza `siteConfig`
     * - `defineSitePages(...)`           -> valorizza `sitePages`
     * - `configureHeaderNavigation(...)` -> valorizza `rawHeader`
     * - `configureFooterNavigation(...)` -> valorizza `rawFooter`
     */
    defineSiteStructure({
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

            const normalizeVersion = (v?: string) =>
                // trim() rimuove spazi iniziali/finali accidentali
                // replace() elimina qualsiasi carattere che non sia alfanumerico, punto, trattino o underscore
                // → evita che stringhe arbitrarie finiscano in header HTTP o manifest PWA
                typeof v === 'string' ? v.trim().replace(/[^a-zA-Z0-9.\-_]/g, '') : '';

            siteConfig = {
                appName: siteConfigurationInput.appName,
                version: normalizeVersion(siteConfigurationInput.version) || '1.0.0',
                description: siteConfigurationInput.description,
                colorTema: siteConfigurationInput.colorTema,
                showFooter: siteConfigurationInput.showFooter ?? true,
                showNav: siteConfigurationInput.showNav ?? true,
                fixedTopHeader: siteConfigurationInput.fixedTopHeader ?? false,
                showBrandIcon: siteConfigurationInput.showBrandIcon ?? true,
                isWebApp: siteConfigurationInput.isWebApp ?? true,
                onlyPlainImage: siteConfigurationInput.onlyPlainImage ?? false,
                forcedLightPanel: siteConfigurationInput.forcedLightPanel ?? true,
                smoke: { ...defaultSmoke, ...(siteConfigurationInput.smoke ?? {}) },
                pageForAuthGuard: siteConfigurationInput.pageForAuthGuard ?? null
            };
        },

        defineSitePages: (definedSitePages) => {
            sitePages = normalizeSitePages(definedSitePages);
        },

        configureHeaderNavigation: (buildItems) => {
            buildItems(createNavigationSectionBuilder(rawHeader));
        },

        configureFooterNavigation: (buildItems) => {
            buildItems(createNavigationSectionBuilder(rawFooter));
        }
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
     * PageType.Home -> { title: 'Home', path: '/' }
     *
     * Questa mappa viene popolata durante l'elaborazione dell'albero pagine.
     */
    const pageMap = new Map<PageType, PageInfo>();

    /**
     * Traccia i path interni già visti per rilevare duplicati di path.
     */
    const seenInternalPaths = new Set<string>();

    /**
     * Accumula i path foglia interni con il loro render mode,
     * da esporre al layer server tramite `serverRouting`.
     */
    const serverRenderEntries: ServerRenderEntry[] = [];

    /**
     * Percorre ricorsivamente l'albero delle pagine e costruisce la sitemap e la mappa PageType → path.
     *
     * - Esclude le pagine disabilitate
     * - Registra pagine esterne nella mappa (non nella sitemap)
     * - Scende ricorsivamente nei figli dei nodi padre
     * - Per foglie interne: salva path completo, aggiunge a sitemap e serverRenderEntries
     * - Esclude dalla sitemap le pagine autenticate (requiresAuth: true)
     *
     * @param pages - Array di pagine da elaborare
     * @param parent - Path del nodo padre (usato per costruire il path completo)
     * @returns Array di voci sitemap (path + metadati)
     * @throws Se PageType o path sono duplicati, o se c'è incoerenza nella struttura
     */
    const processPages = (pages: SitePage[], parent = ''): SitemapEntry[] => {
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
             * La registriamo comunque nella mappa per poterla usare.
             */
            if (isExternalPage(page)) {
                if (pageMap.has(page.pageType)) {
                    throw new Error(
                        `[SiteBuilder] PageType duplicato rilevato: "${String(page.pageType)}". Ogni pagina deve avere un pageType unico.`
                    );
                }
                pageMap.set(page.pageType, {
                    title: page.title,
                    path: page.externalUrl,
                    isExternal: true
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
            // Costruisce il path completo combinando parent e segmento corrente:
            // 1. [parent, page.path] → es. ['admin', 'users']
            // 2. .filter(Boolean)    → rimuove stringhe vuote (es. parent='' alla radice)
            // 3. .join('/')          → 'admin/users'
            // 4. `/${...}`           → '/admin/users'
            // 5. .replace(/\/+/g, '/') → collassa eventuali slash doppi ('//' → '/')
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


            if (seenInternalPaths.has(fullPath)) {
                throw new Error(
                    `[SiteBuilder] Path interno duplicato rilevato: "${fullPath}".`
                );
            }
            if (pageMap.has(page.pageType)) {
                throw new Error(
                    `[SiteBuilder] PageType duplicato rilevato: "${String(page.pageType)}". Ogni pagina deve avere un pageType unico.`
                );
            }

            seenInternalPaths.add(fullPath);
            pageMap.set(page.pageType, {
                title: page.title,
                path: fullPath,
                isExternal: false,
                description: page.description,
                ogImage: page.ogImage,
                ogType: page.ogType ?? 'website',
                structuredDataType: page.structuredDataType ?? 'WebPage',
            });
            // Regola di default sul render mode:
            //   - requiresAuth → forzato 'client': i bot non possono loggarsi, l'SSR è inutile
            //   - renderMode esplicito → rispettato così com'è
            //   - nessun renderMode → 'server': dati sempre freschi + HTML completo per i bot
            serverRenderEntries.push({
                path: fullPath,
                renderMode: page.requiresAuth ? 'client' : (page.renderMode ?? 'server')
            });

            /**
             * Le pagine che richiedono autenticazione non devono essere indicizzate:
             * un crawler non potrebbe mai accedervi, e il loro URL non porta valore SEO.
             */
            if (page.requiresAuth) {
                return [];
            }

            return [{ path: fullPath, description: page.description }];
        });
    };

    /**
     * Elenco finale delle voci sitemap (path + metadati).
     * Le pagine con requiresAuth e le pagine esterne sono già escluse.
     */
    const sitemap = processPages(sitePages);

    /**
     * Se la pagina indicata per il redirect dell'AuthGuard è disabilitata (o inesistente),
     * viene scartata da processPages e non finisce nella pageMap.
     * In questo caso, resettiamo la configurazione a null per evitare redirect verso 404.
     */
    const finalConfig = siteConfig as SiteConfig;
    if (finalConfig.pageForAuthGuard && !pageMap.has(finalConfig.pageForAuthGuard)) {
        finalConfig.pageForAuthGuard = null;
    }

    /**
     * Risolve una lista di item raw di navigazione in NavLink[] finali.
     *
     * - Riferimenti a pagine (PageType): risolve il path dalla mappa pageMap
     * - Gruppi: risolve ricorsivamente i figli, mantiene il gruppo solo se ha almeno un figlio valido
     * - Link diretti: usa direttamente label/path dichiarato
     * - Filtra i gruppi vuoti e i riferimenti non risolti (pagine disabilitate o non trovate)
     *
     * @param items - Array di item raw (page, link, group)
     * @returns Array di NavLink finali pronti per header/footer
     */
    const resolveNavigation = (items: RawNavItem[]): NavLink[] =>
        items
            .map((item) => {
                /**
                 * Riferimento a una pagina tramite PageType.
                 * Se non esiste nella mappa, torna null e verrà filtrato via.
                 */
                if (item.kind === 'page') {
                    const entry = pageMap.get(item.type);
                    if (!entry) return null;
                    return { label: entry.title, path: entry.path, isExternal: entry.isExternal };
                }

                /**
                 * Gruppo di navigazione:
                 * risolviamo prima i figli, poi teniamo il gruppo
                 * solo se contiene almeno un elemento valido.
                 */
                if (isRawGroup(item)) {
                    // Risolve prima i figli in modo ricorsivo.
                    // Se nessun figlio è valido (tutti disabilitati o non trovati),
                    // il gruppo non viene incluso nella navigazione finale.
                    const children = resolveNavigation(item.children);

                    return children.length > 0
                        ? {
                            label: item.label,
                            // Il path '#group:...' è un sentinel sintetico, mai navigabile.
                            // Il componente navbar lo riconosce e lo tratta come dropdown:
                            // non ci naviga, ma espande i figli quando cliccato.
                            path: `#group:${item.label}`,
                            isExternal: false,
                            children
                        }
                        : null;
                }

                /**
                 * Link diretto già completo.
                 */
                return {
                    label: item.label,
                    path: item.path,
                    // Considera esterno qualsiasi link che inizia con http:// o https://.
                    // Il componente navbar usa isExternal per aggiungere target="_blank" rel="noopener".
                    isExternal: item.path.startsWith('http://') || item.path.startsWith('https://')
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
         * Collezione server-only dei path foglia validi con il rispettivo render mode.
         */
        serverRenderEntries,

        /**
         * Restituisce il path associato a un PageType,
         * se presente nella mappa.
         */
        getPath: (type: PageType) => pageMap.get(type)?.path ?? null,

        /**
         * Restituisce le info  associato a un PageType,
         * se presente nella mappa.
         */
        getPageInfo: (type: PageType) => pageMap.get(type) ?? null,

        getSitemapEntries: () => sitemap
    };
}
