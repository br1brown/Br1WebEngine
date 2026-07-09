import { InjectionToken, isDevMode, type Type } from '@angular/core';
import type { PageType } from '../../site';
import type { PageBaseComponent } from './pages/page-base.component';
import { environment } from '../../../environments/environment';
import { hasCookiesConfigured } from './services/cookie/cookie-utils';
import { buildPolicySection, legalSlugFor } from './legal/legal-pages';
import type { StructuredDataInput } from './services/structured-data';


// ======================================================
// MODELLI DI CONFIGURAZIONE
// ======================================================

export const SITE_CONFIG = new InjectionToken<SiteConfig>('SITE_CONFIG');

/**
 * Flag di layout consumati dalla SHELL (root `app-root`, FUORI dal `<router-outlet>`).
 * Essendo fuori dall'outlet, la shell non può riceverli come input di rotta né via DI di
 * rotta: li legge dallo snapshot del router. Viaggiano quindi in `route.data`, ma raggruppati
 * sotto `SHELL_DATA_KEY` — separati dai `data` liberi del figlio (che restano flat → input del
 * componente) e tipati end-to-end (`routing.ts` li scrive, `app.component.ts` li legge).
 */
export interface ShellFlags {
    /** Mostra la navbar. Default (assente): mostrata, salvo `site.showNav` globale off. */
    showNav?: boolean;
    /** Mostra il pannello contenuti. Default (assente): mostrato. */
    showPanel?: boolean;
    /** Mostra il footer. Default (assente): mostrato. */
    showFooter?: boolean;
    /** Vista full-bleed (niente pannello/container). Default (assente): off. */
    fitViewport?: boolean;
}

/** Chiave RISERVATA in `route.data` sotto cui l'Engine mette i `ShellFlags`. Non usarla nei `data`
 *  liberi del figlio in `site.ts`: è lo slot del motore per la shell. */
export const SHELL_DATA_KEY = 'engineShell';

//
// ARCHITETTURA DEL DSL
//
// Il builder funziona in tre fasi:
//
// FASE 1 — DICHIARAZIONE (site.ts):
//   L'utente descrive la STRUTTURA del sito (pagine, menu) con i tipi *Input
//   (SitePageInput, etc.). Questi tipi hanno campi opzionali e non
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
//   PageType e' l'identita' stabile di ogni pagina (un oggetto letterale nel
//   Dominio — la forma esatta non riguarda l'Engine, che lo consuma solo per
//   tipo). Path, titoli e componenti possono cambiare; il PageType no. Menu,
//   footer, guard, sitemap e link interni referenziano sempre il PageType,
//   mai path o stringhe grezze. Se un path cambia, basta aggiornare
//   defineSitePages: tutti i riferimenti si risolvono automaticamente
//   perche' passano dalla mappa PageType → path.
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
 * Slot delle pagine legali: il figlio li mappa ai propri `PageType` in `site.ts` e l'Engine
 * costruisce le rotte `policy/*`. Le chiavi combaciano col basename del Markdown servito
 * (`assets/legal/<slot>.<lang>.md`, eccetto `tos`→`TOS.md`); slot omesso = pagina non creata.
 */
export interface LegalPagesConfig {
    /** Pagina Privacy Policy. Contenuto: `assets/legal/privacy.<lang>.md`. */
    privacy?: PageType | null;
    /** Pagina Cookie Policy (referenziata anche dal cookie-banner). Contenuto: `cookie.<lang>.md`. */
    cookie?: PageType | null;
    /** Pagina Termini di Servizio. Contenuto: `TOS.<lang>.md`. */
    tos?: PageType | null;
    /** Pagina Note Legali. Contenuto: `legal.<lang>.md`. */
    legal?: PageType | null;
    /** Pagina Dichiarazione di Accessibilità. Contenuto: `accessibility.<lang>.md`. */
    accessibility?: PageType | null;
}

/** Versione risolta di `LegalPagesConfig`: ogni slot è sempre presente (PageType o null). */
export type ResolvedLegalPages = { [K in keyof LegalPagesConfig]-?: PageType | null };

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
    /**
     * Descrizione generale del sito, per-lingua: chiavi = tag lingua (come
     * `Localization.SupportedLanguages`), valori = testo. Risolvila per la lingua
     * corrente con `pickLocaleText`. Vive in `global-settings.json → site.description`.
     */
    description: Record<string, string>;
    /** Colore tema principale usato dalla UI. */
    colorTema: string;
    /** Indica se il footer deve essere visibile. */
    showFooter: boolean;
    /** Indica se il Header deve essere visibile. */
    showNav: boolean;
    /** FIssare la navBar in alto */
    fixedTopHeader?: boolean;
    /** Mostra l'icona (favIcon) accanto al nome dell'app nella navbar-brand. */
    showBrandIconInHeader: boolean;
    /** Mostra il pulsante di login nella navbar. */
    showLoginInHeader: boolean;
    /** Mostra il campanellino delle notifiche realtime (con storico). Default: false (opt-in). */
    showNotifications: boolean;
    /** Abilita le funzionalità PWA: Service Worker, aggiornamenti automatici e installazione offline. */
    isWebApp: boolean;
    /** Configurazione finale normalizzata dell'effetto smoke. */
    smoke: SmokeSettings;
    /**
     * Se `true`, il pannello contenuti (`.content-panel`) è sempre chiaro
     * indipendentemente dalla preferenza OS. Default: `true`.
     */
    forcedLightPanel: boolean;
    /**
     * Fade-in d'ingresso pagina risolto (classe `.page-fade` sull'host, via `PageBaseComponent`).
     * Default: `true`. Fa da GATE come showNav/showFooter: se `false` nessuna pagina può riattivarlo.
     * Si somma alla crossfade del router (`withViewTransitions`); azzerato da `prefers-reduced-motion`.
     */
    pageFade: boolean;
    /** Pagina a cui reindirizzare l'utente se non autenticato (se null o non impostata fa redirect a /error/401) */
    loginPage?: PageType | null;
    /** Pagina "home" usata dal navbar per brand/logo. Se non valorizzata, il brand non è un link. */
    homePage?: PageType | null;
    /** Slot delle pagine legali risolti (PageType valorizzato dal figlio, o `null`). */
    legalPages: ResolvedLegalPages;
}

// Identità ed estetica (descrizione, tema, smoke) vivono in global-settings.json → site (via
// environment.ts). I flag di comportamento (shell, isWebApp, onlyPlainImage) stanno in site.ts;
// i default li applica buildSite.

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
     * Tutti subordinati ai flag globali in `global-settings.json` (sezione `site`):
     * se globalmente disabilitato, il flag di pagina non può riattivarlo.
     */
    layout?: {
        /** Mostra o nasconde il pannello contenuto. Default: true. */
        showPanel?: boolean;
        /** Nasconde la navbar solo su questa pagina. Non influenza le altre pagine né il language picker globale.
         * @remarks Se `site.showNav` (global-settings.json) è `false`, la navbar è sempre nascosta
         * indipendentemente da questo valore — la configurazione globale ha sempre la precedenza. */
        showNav?: boolean;
        /** Nasconde il footer su questa pagina. Default: mostrato — tranne in full-bleed
         *  (`fitViewport`), dove è nascosto salvo riattivarlo qui con `showFooter: true`. */
        showFooter?: boolean;
        /**
         * Vista a tutto schermo (full-bleed): la pagina riempie il viewport sotto la navbar,
         * senza padding/gutter dello shell né pannello contenuti, e senza scroll di pagina se
         * il contenuto ci sta. Per mappe, giochi, dashboard. Default: false.
         * @remarks A differenza degli altri flag, è puramente per-pagina (nessun gate globale).
         * Quando attivo prevale sul pannello (`showPanel` viene ignorato) e nasconde il footer di
         * default — vista immersiva senza decorazioni che le rubano spazio; riattivalo con
         * `showFooter: true` se lo vuoi comunque. La navbar resta (via d'uscita). Il root del componente
         * di pagina deve crescere per riempire l'altezza: aggiungi `flex-grow-1` (o `h-100`) sul
         * suo elemento radice e non mettere utility di display `d-*` sull'host del componente
         * (batterebbero il flex del full-bleed — vedi la regola `.fit-viewport` in base.scss). */
        fitViewport?: boolean;
        /**
         * Override per-pagina del fade-in d'ingresso, SUBORDINATO al globale `shell.pageFade`
         * (come showNav/showFooter): se il globale è off nessuna pagina può riattivarlo; se è on,
         * qui puoi solo spegnerlo (`pageFade: false`) su una singola pagina pesante. Default: eredita il globale. */
        pageFade?: boolean;
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
        /**
         * Dati strutturati (JSON-LD) per la pagina. Tre forme, anche combinabili in una lista:
         * - **stringa** → solo il `@type` Schema.org della pagina (es. 'AboutPage'); default 'WebPage';
         * - **oggetto** `{ kind, … }` → entità ricca con campi parlanti, senza conoscere schema.org,
         *   tradotta dall'Engine (`structured-data.ts`) con default a cascata;
         * - **array** → più entità sulla stessa pagina (es. un Article + una FAQ + un `raw`).
         * Per dati statici (es. una FAQ fissa). Quelli derivati dal contenuto si impostano nel
         * `ContentResolver`, che ha la precedenza.
         */
        structuredData?: StructuredDataInput;
        /**
         * Esclude la pagina dall'indicizzazione. Default automatico: `false`.
         * Come per `requiresAuth`, l'Engine la marca a runtime con `X-Robots-Tag: noindex,
         * nofollow` (header autoritativo, vale anche per chi ignora il meta) e la esclude dalla
         * sitemap. A differenza di `requiresAuth` NON forza il client-render: la pagina resta
         * pubblica e SSR, semplicemente non indicizzabile (es. landing duplicate, thank-you).
         */
        noindex?: boolean;
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
 * `otherSEO` è appiattito al top-level; le levette di layout sono RAGGRUPPATE nell'oggetto
 * `shell` (ShellFlags), che viaggia coerente fino a `route.data[SHELL_DATA_KEY]` senza essere
 * appiattito e poi riraggruppato. `pageFade` resta a parte: passa flat in `route.data` e diventa
 * input di PageBaseComponent.
 */
export type LeafPage = Omit<LeafPageInput, 'kind' | 'layout' | 'otherSEO'> & {
    kind: 'leaf';
    /** Levette di shell raggruppate, lette dal root via `route.data[SHELL_DATA_KEY]`. */
    shell: ShellFlags;
    pageFade?: boolean;
    ogImage?: string | false;
    ogType?: string;
    structuredData?: StructuredDataInput;
    noindex?: boolean;
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

/** Verifica se un `NavLink` è un gruppo (ha figli): usato da navbar, dropdown, submenu e footer per il render ricorsivo. */
export const isNavGroup = (item: NavLink): item is NavLink & { children: NavLink[] } =>
    Array.isArray(item.children) && item.children.length > 0;

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
            // Levette di shell raggruppate in un oggetto ShellFlags: UNICO punto di traduzione
            // DSL → trasporto, poi viaggia intatto fino a route.data (routing.ts non riraggruppa).
            // Default contestuale: full-bleed (fitViewport) nasconde il footer salvo override
            // esplicito; il default universale "mostrato" resta nella shell (app.component).
            shell: {
                showNav: layout?.showNav,
                showPanel: layout?.showPanel,
                showFooter: layout?.showFooter ?? (layout?.fitViewport ? false : undefined),
                fitViewport: layout?.fitViewport,
            } satisfies ShellFlags,
            pageFade: layout?.pageFade,
            ogImage: otherSEO?.ogImage,
            ogType: otherSEO?.ogType,
            structuredData: otherSEO?.structuredData,
            noindex: otherSEO?.noindex,
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

/** Raccoglie i `PageType` dichiarati dal figlio nell'albero `pages` (per l'override delle policy). */
const collectDeclaredPageTypes = (pages: SitePageInput[], acc: Set<PageType>): Set<PageType> => {
    for (const page of pages) {
        if (isParentPageInput(page)) {
            collectDeclaredPageTypes(page.children, acc);
        } else if (page.pageType != null) {
            acc.add(page.pageType);
        }
    }
    return acc;
};

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
 * Sottoinsieme della configurazione sito esposto alla factory di `defineSitePages`.
 *
 * Contiene solo le proprietà rilevanti per decidere quali pagine abilitare o
 * come configurarle — estratto come valore immutabile dalla config normalizzata,
 * senza esporre il riferimento interno completo.
 */
export type SitePageContext = {
    /** Indica se il sito è una PWA con Service Worker attivo. */
    readonly isWebApp: boolean;
    /** Indica se il pulsante login è visibile nella navbar. */
    readonly showLoginInHeader: boolean;
};

/** Comportamento della shell (navbar/footer/header/pannello contenuti). */
export interface SiteShellConfig {
    /** Mostra la navbar. Default: true. ⚠️ false nasconde anche il language picker. */
    showNav?: boolean;
    /** Mostra il footer. Default: true. */
    showFooter?: boolean;
    /** Fissa la navbar in alto allo scroll. Default: false. */
    fixedTopHeader?: boolean;
    /** Mostra la favicon accanto al nome nella navbar-brand. Default: true. */
    showBrandIconInHeader?: boolean;
    /** Mostra il pulsante di login nella navbar. Default: true. */
    showLoginInHeader?: boolean;
    /** Mostra il campanellino delle notifiche realtime, con storico. Default: false (opt-in):
     *  attivalo solo se il sito spinge davvero notizie, così non mostri un'icona mai usata
     *  né apri una connessione SSE inutile. */
    showNotifications?: boolean;
    /** Pannello contenuti sempre chiaro, indipendentemente dal tema OS. Default: true. */
    forcedLightPanel?: boolean;
    /** Fade-in d'ingresso pagina (`.page-fade` via PageBaseComponent). Default: true. Gate come
     *  showNav: il globale off vince, la pagina spegne solo col proprio `layout.pageFade: false`. */
    pageFade?: boolean;
}

/**
 * Struttura e comportamento del sito passati a `buildSite`. Identità ed estetica
 * (nome, versione, lingue, descrizione, tema, smoke) stanno in global-settings.json.
 */
export interface SiteDefinition {
    /** Pagina a cui reindirizzare l'utente non autenticato (se null/assente → /error/401). */
    loginPage?: PageType | null;
    /** Pagina "home" usata dal navbar per brand/logo. Se non valorizzata, il brand non è un link. */
    homePage?: PageType | null;
    /** Mappa gli slot legali (privacy, cookie, tos, legal) ai `PageType` del figlio. Slot omesso = pagina non creata. */
    legalPages?: LegalPagesConfig;
    /** Comportamento della shell (navbar/footer/header/pannello). Default sensati per ogni flag omesso. */
    shell?: SiteShellConfig;
    /** Abilita le funzionalità PWA (Service Worker, aggiornamenti, install offline). Default: true. */
    isWebApp?: boolean;
    /**
     * Anteprime social con sola immagine, senza scritte/favicon sovrapposte. È un
     * comportamento di rendering della preview (non branding) → vive qui. Default: false.
     */
    onlyPlainImage?: boolean;
    /**
     * Factory dell'albero pagine.
     * Riceve un sottoinsieme della configurazione normalizzata (`SitePageContext`)
     * per permettere di condizionare pagine in base a flag come `isWebApp`.
     */
    pages: (ctx: SitePageContext) => SitePageInput[];
    /** Popola le voci della navigazione header tramite addPage / addGroup / addLink. */
    headerNav?: (nav: SiteNavigationSectionBuilder) => void;
    /** Popola le voci della navigazione footer tramite addPage / addGroup / addLink. */
    footerNav?: (nav: SiteNavigationSectionBuilder) => void;
}

export type ServerRenderEntry = {
    /** Path completo normalizzato della pagina interna foglia. */
    path: string;
    /** Strategia di rendering finale da esporre al layer server. */
    renderMode: SiteRenderMode;
    /** `true` se la pagina richiede login (`requiresAuth`). Il layer server la marca
     *  `noindex` (header `X-Robots-Tag`): così le pagine protette non finiscono nell'indice
     *  senza doverle elencare in `robots.txt` (che ne rivelerebbe i path pubblicamente). */
    requiresAuth: boolean;
    /** `true` se la pagina è esclusa dall'indicizzazione via `otherSEO.noindex`. Il layer server
     *  emette `X-Robots-Tag: noindex, nofollow` come per le pagine protette (vedi `requiresAuth`). */
    noindex: boolean;
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
    /** Dati strutturati statici (da `otherSEO.structuredData`): stringa (@type), oggetto o lista.
     *  Quelli dinamici arrivano dal `ContentResolver` via `ResolvedPage.structuredData` (precedenza). */
    structuredData?: StructuredDataInput;
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
    /**
     * Se `type` è uno dei `PageType` valorizzati negli slot legali (`config.legalPages`),
     * restituisce lo slug del relativo Markdown (`assets/legal/<slug>.<lang>.md`);
     * altrimenti `null`. Permette al ContentResolver di gestire tutte le pagine legali
     * con un solo controllo generico, senza un `case` per ogni `PageType` legale.
     */
    getLegalSlug: (type: PageType) => string | null;
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
 * Risolve un testo per-lingua (es. `config.description`) sulla lingua richiesta.
 * Fallback a cascata: lingua richiesta → lingua default dell'app → primo valore
 * disponibile → stringa vuota. Robusto a mappe parziali o assenti.
 *
 * @param map  Mappa `{ tagLingua: testo }` (o undefined).
 * @param lang Tag lingua corrente (es. da `TranslateService.currentLang()`).
 */
export function pickLocaleText(map: Record<string, string> | undefined, lang: string): string {
    if (!map) return '';
    return map[lang] ?? map[environment.defaultLang] ?? Object.values(map)[0] ?? '';
}

/** Default dell'effetto smoke, mergeati con quanto arriva da global-settings.json. */
const DEFAULT_SMOKE: SmokeSettings = {
    enable: false, color: '#ffffff', opacity: 0.5,
    maximumVelocity: 0.5, particleRadius: 2, density: 10,
};

/** Tiene solo `[a-zA-Z0-9.\-_]`: evita che stringhe arbitrarie finiscano in header HTTP o manifest PWA. */
function normalizeVersion(v?: string): string {
    return typeof v === 'string' ? v.trim().replace(/[^a-zA-Z0-9.\-_]/g, '') : '';
}

/**
 * SiteConfig finale: identità ed estetica da `environment.ts` (global-settings.json),
 * struttura e comportamento da `site.ts` (`definition`). I default li applica qui.
 */
function buildFinalConfig(definition: SiteDefinition): SiteConfig {
    const cfg = environment.config;
    const shell = definition.shell ?? {};
    return {
        appName: environment.appName,
        version: normalizeVersion(environment.version) || '1.0.0',
        description: cfg.description ?? {},
        colorTema: cfg.colorTema ?? '#888888',
        showFooter: shell.showFooter ?? true,
        showNav: shell.showNav ?? true,
        fixedTopHeader: shell.fixedTopHeader ?? false,
        showBrandIconInHeader: shell.showBrandIconInHeader ?? true,
        showLoginInHeader: shell.showLoginInHeader ?? true,
        showNotifications: shell.showNotifications ?? false,
        isWebApp: definition.isWebApp ?? true,
        onlyPlainImage: definition.onlyPlainImage ?? false,
        forcedLightPanel: shell.forcedLightPanel ?? true,
        pageFade: shell.pageFade ?? true,
        smoke: { ...DEFAULT_SMOKE, ...(cfg.smoke ?? {}) },
        loginPage: definition.loginPage ?? null,
        homePage: definition.homePage ?? null,
        legalPages: {
            privacy: definition.legalPages?.privacy ?? null,
            cookie: definition.legalPages?.cookie ?? null,
            tos: definition.legalPages?.tos ?? null,
            legal: definition.legalPages?.legal ?? null,
            accessibility: definition.legalPages?.accessibility ?? null,
        },
    };
}

/** Slot legali gestiti dall'Engine: valorizzati E non già dichiarati dal figlio (override). */
function resolveEngineLegalPages(legalPages: ResolvedLegalPages, declared: ReadonlySet<PageType>): ResolvedLegalPages {
    const managed = (ref: PageType | null): PageType | null => (ref != null && !declared.has(ref) ? ref : null);
    return {
        privacy: managed(legalPages.privacy),
        cookie: managed(legalPages.cookie),
        tos: managed(legalPages.tos),
        legal: managed(legalPages.legal),
        accessibility: managed(legalPages.accessibility),
    };
}

/** Strumenti per popolare una sezione di navigazione (header/footer): addPage / addLink / addGroup. */
function createNavigationSectionBuilder(target: RawNavItem[]): SiteNavigationSectionBuilder {
    return {
        addPage: (pageType) => { target.push({ kind: 'page', type: pageType }); },
        addLink: (label, path) => { target.push({ kind: 'link', label, path }); },
        addGroup: (label, configure) => {
            const children: RawNavItem[] = [];
            configure(createNavigationSectionBuilder(children));
            target.push({ kind: 'group', label, children });
        },
    };
}

/** Esegue le callback headerNav/footerNav del figlio e raccoglie gli item di navigazione grezzi. */
function collectNavigation(definition: SiteDefinition): { rawHeader: RawNavItem[]; rawFooter: RawNavItem[] } {
    const rawHeader: RawNavItem[] = [];
    const rawFooter: RawNavItem[] = [];
    definition.headerNav?.(createNavigationSectionBuilder(rawHeader));
    definition.footerNav?.(createNavigationSectionBuilder(rawFooter));
    return { rawHeader, rawFooter };
}

/**
 * Percorre l'albero pagine e popola `pageMap` (PageType → info) e `serverRenderEntries`
 * (path → render mode); ritorna le voci sitemap. Esclude le pagine disabilitate, registra
 * le esterne solo in mappa ed esclude dalla sitemap quelle protette (`requiresAuth`).
 *
 * @throws Se due pagine condividono lo stesso PageType o lo stesso path interno.
 */
function processPages(
    pages: SitePage[],
    pageMap: Map<PageType, PageInfo>,
    serverRenderEntries: ServerRenderEntry[],
): SitemapEntry[] {
    const seenInternalPaths = new Set<string>();

    const walk = (nodes: SitePage[], parent: string): SitemapEntry[] =>
        nodes.flatMap((page) => {
            if (!page.enabled) return [];

            if (isExternalPage(page)) {
                if (pageMap.has(page.pageType)) {
                    throw new Error(`[SiteBuilder] PageType duplicato rilevato: "${String(page.pageType)}". Ogni pagina deve avere un pageType unico.`);
                }
                pageMap.set(page.pageType, { title: page.title, path: page.externalUrl, isExternal: true });
                return [];
            }

            // Path completo: parent + segmento, con gli slash doppi collassati.
            const fullPath = `/${[parent, page.path].filter(Boolean).join('/')}`.replace(/\/+/g, '/');

            if (isParentPage(page)) return walk(page.children, fullPath);

            // Foglia interna.
            if (seenInternalPaths.has(fullPath)) {
                throw new Error(`[SiteBuilder] Path interno duplicato rilevato: "${fullPath}".`);
            }
            if (pageMap.has(page.pageType)) {
                throw new Error(`[SiteBuilder] PageType duplicato rilevato: "${String(page.pageType)}". Ogni pagina deve avere un pageType unico.`);
            }
            seenInternalPaths.add(fullPath);
            pageMap.set(page.pageType, {
                title: page.title,
                path: fullPath,
                isExternal: false,
                description: page.description,
                ogImage: page.ogImage,
                ogType: page.ogType ?? 'website',
                structuredData: page.structuredData,
            });
            // requiresAuth → 'client' (i bot non loggano, l'SSR è inutile); altrimenti renderMode esplicito o 'server'.
            // noindex NON forza il client-render: la pagina resta SSR/pubblica, solo non indicizzabile.
            serverRenderEntries.push({ path: fullPath, renderMode: page.requiresAuth ? 'client' : (page.renderMode ?? 'server'), requiresAuth: !!page.requiresAuth, noindex: !!page.noindex });

            // Fuori dalla sitemap le pagine protette (crawler non accede) e quelle noindex (non indicizzabili).
            return page.requiresAuth || page.noindex ? [] : [{ path: fullPath, description: page.description }];
        });

    return walk(pages, '');
}

/** Avvisa (solo in dev) che uno slot puntava a un PageType non registrato ed è stato azzerato:
 *  altrimenti l'effetto (login/brand/pagina legale che smette di funzionare) è silenzioso. */
function warnUnresolvedSlot(slotName: string, type: PageType): void {
    if (isDevMode()) {
        console.warn(`[SiteBuilder] Slot "${slotName}" punta a "${String(type)}", non registrato (disabilitato o mai dichiarato in pages). Slot azzerato.`);
    }
}

/** Azzera gli slot (`loginPage`, `homePage`, `legalPages`) che puntano a pagine non registrate. */
function sanitizePageRefs(config: SiteConfig, pageMap: Map<PageType, PageInfo>): void {
    if (config.loginPage && !pageMap.has(config.loginPage)) {
        warnUnresolvedSlot('loginPage', config.loginPage);
        config.loginPage = null;
    }
    if (config.homePage && !pageMap.has(config.homePage)) {
        warnUnresolvedSlot('homePage', config.homePage);
        config.homePage = null;
    }
    for (const slot of Object.keys(config.legalPages) as (keyof ResolvedLegalPages)[]) {
        const ref = config.legalPages[slot];
        if (ref != null && !pageMap.has(ref)) {
            warnUnresolvedSlot(`legalPages.${slot}`, ref);
            config.legalPages[slot] = null;
        }
    }
}

/**
 * Limiti di profondità della navigazione (header e footer condividono la stessa struttura).
 * Livello 1 = voci di primo livello; ogni discesa in `children` aggiunge un livello.
 */
const NAV_DEPTH_WARN = 4; // da questo livello in poi: avviso di usabilità (dev). 3 livelli (voce → dropdown → sottomenu) è la profondità dimostrata dal template ed è ok.
const NAV_DEPTH_MAX = 5;  // livelli oltre questo: errore bloccante a build/avvio

/**
 * Valida la profondità di una sezione di navigazione risolta: lancia se si annida oltre
 * `NAV_DEPTH_MAX` livelli, avvisa (solo in dev) se si raggiunge `NAV_DEPTH_WARN`.
 *
 * @throws Se un gruppo genera figli oltre il quinto livello di profondità.
 */
function validateNavDepth(items: NavLink[], section: 'header' | 'footer'): void {
    // Profondità massima effettivamente raggiunta, per decidere l'avviso una sola volta.
    let maxDepth = 0;

    const walk = (nodes: NavLink[], depth: number): void => {
        if (depth > maxDepth) maxDepth = depth;
        for (const node of nodes) {
            if (isNavGroup(node)) {
                // I figli di questo gruppo stanno a depth+1: oltre il quinto livello è bloccante.
                if (depth + 1 > NAV_DEPTH_MAX) {
                    throw new Error(
                        `[SiteBuilder] Navigazione ${section}: superato il limite di ${NAV_DEPTH_MAX} livelli di ` +
                        `profondità sul gruppo "${node.label}". Annidare oltre il quinto livello non è consentito: ` +
                        `riduci la gerarchia.`
                    );
                }
                walk(node.children, depth + 1);
            }
        }
    };

    walk(items, 1);

    if (isDevMode() && maxDepth >= NAV_DEPTH_WARN) {
        console.warn(
            `[SiteBuilder] Navigazione ${section}: profondità ${maxDepth} livelli (max consigliato: ${NAV_DEPTH_WARN - 1}). ` +
            `Aumentare la profondità della navigazione peggiora usabilità, accessibilità, facilità di navigazione e ` +
            `comprensione della struttura informativa. Valuta di appiattire la gerarchia.`
        );
    }
}

/**
 * Risolve gli item grezzi di navigazione in `NavLink` finali: i riferimenti `PageType`
 * passano dalla `pageMap`; i gruppi vuoti e i riferimenti non risolti vengono scartati.
 */
function resolveNavigation(items: RawNavItem[], pageMap: Map<PageType, PageInfo>): NavLink[] {
    return items
        .map((item): NavLink | null => {
            if (item.kind === 'page') {
                const entry = pageMap.get(item.type);
                if (!entry && isDevMode()) {
                    console.warn(`[SiteBuilder] addPage("${String(item.type)}") non risolve a nessuna pagina registrata (disabilitata o mai dichiarata in pages): voce di navigazione esclusa.`);
                }
                return entry ? { label: entry.title, path: entry.path, isExternal: entry.isExternal } : null;
            }
            if (isRawGroup(item)) {
                const children = resolveNavigation(item.children, pageMap);
                // '#group:...' è un sentinel: la navbar lo tratta come dropdown, non ci naviga.
                return children.length > 0
                    ? { label: item.label, path: `#group:${item.label}`, isExternal: false, children }
                    : null;
            }
            // Link diretto; esterno se inizia con http(s) → la navbar aggiunge target/rel.
            return { label: item.label, path: item.path, isExternal: item.path.startsWith('http://') || item.path.startsWith('https://') };
        })
        .filter((item): item is NavLink => item !== null);
}

/**
 * Orchestratore: assembla il `ContestoSito` dalla definizione in `site.ts`.
 * Config finale → pagine (con override legale + sezione policy iniettata) → mappa
 * PageType/sitemap/render-mode → sanitizzazione slot → navigazione risolta.
 *
 * @throws Se ci sono PageType/path duplicati, o se servono cookie senza Cookie Policy.
 */
export function buildSite(definition: SiteDefinition): BuiltSite {

    const finalConfig = buildFinalConfig(definition);
    const cookiesEnabled = hasCookiesConfigured(finalConfig.isWebApp);

    const ctx: SitePageContext = {
        isWebApp: finalConfig.isWebApp,
        showLoginInHeader: finalConfig.showLoginInHeader,
    };
    const declaredPages = definition.pages(ctx);

    // Override: una pagina legale dichiarata dal figlio vince sull'auto-creazione (stesso PageType).
    const declaredPageTypes = collectDeclaredPageTypes(declaredPages, new Set<PageType>());
    const engineLegalPages = resolveEngineLegalPages(finalConfig.legalPages, declaredPageTypes);

    const policySection = buildPolicySection(engineLegalPages);
    const sitePages = normalizeSitePages(policySection ? [...declaredPages, policySection] : declaredPages);

    const { rawHeader, rawFooter } = collectNavigation(definition);

    const pageMap = new Map<PageType, PageInfo>();
    const serverRenderEntries: ServerRenderEntry[] = [];
    const sitemap = processPages(sitePages, pageMap, serverRenderEntries);

    // Slot che puntano a pagine non registrate → null; poi la conformità cookie.
    sanitizePageRefs(finalConfig, pageMap);
    if (cookiesEnabled && finalConfig.legalPages.cookie == null) {
        throw new Error(
            '[SiteBuilder] Il sito usa cookie (multilingua, PWA o cookie di progetto) ma ' +
            '`legalPages.cookie` non è valorizzato in site.ts. La pagina Cookie Policy è ' +
            'obbligatoria: mappa lo slot `cookie` a un PageType.'
        );
    }

    // Navigazione risolta + validazione profondità condivisa (header e footer).
    const menuNav = resolveNavigation(rawHeader, pageMap);
    const linkFooter = resolveNavigation(rawFooter, pageMap);
    validateNavDepth(menuNav, 'header');
    validateNavDepth(linkFooter, 'footer');

    return {
        config: finalConfig,
        pages: sitePages.filter(isInternalPage),
        menuNav,
        linkFooter,
        serverRenderEntries,
        getPath: (type: PageType) => pageMap.get(type)?.path ?? null,
        getPageInfo: (type: PageType) => pageMap.get(type) ?? null,
        getLegalSlug: (type: PageType) => legalSlugFor(engineLegalPages, type),
        getSitemapEntries: () => sitemap,
    };
}
