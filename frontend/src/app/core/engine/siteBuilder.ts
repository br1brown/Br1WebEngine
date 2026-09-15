import { InjectionToken, isDevMode, type Type } from '@angular/core';
import type { PageType } from '../../site';
import type { PageBaseComponent } from './pages/page-base.component';
import { environment } from '../../../environments/environment';
import { hasCookiesConfigured } from './services/cookie/cookie-utils';
import { buildPolicySection, filterManagedLegalPages, legalSlugFor } from './legal/legal-pages';
import type { StructuredDataInput } from './services/structured-data';
import type { BreadcrumbItem, BreadcrumbContext } from './services/breadcrumb';
import type { NavLink } from './shell-nav';
import { DESIGN_SYSTEM_PRESETS, NAKED_CHROME, type DesignSystemPreset, type DesignSystemPresetName, type PageRole, type RoleChromeSpec } from './design-system-presets';

export type { PageRole } from './design-system-presets';

/** Default per le 5 pagine legali standard. */
export { STANDARD_LEGAL_PAGES } from './legal/legal-pages';

// ======================================================
// MODELLI DI CONFIGURAZIONE
// ======================================================

export const SITE_CONFIG = new InjectionToken<SiteConfig>('SITE_CONFIG');

/** Flag di layout per la shell root dell'applicazione. */
export interface ShellFlags {
    /** Mostra la navbar. */
    showNav?: boolean;
    /** Mostra il pannello contenuti. */
    showPanel?: boolean;
    /** Mostra il footer. */
    showFooter?: boolean;
    /** Vista full-bleed senza pannello/container. */
    fitViewport?: boolean;
    /** Mostra l'effetto smoke su questa pagina. */
    showSmoke?: boolean;
    /** Mostra il breadcrumb su questa pagina. */
    showBreadcrumb?: boolean;
}

/** Chiave in `route.data` riservata ai `ShellFlags`. */
export const SHELL_DATA_KEY = 'engineShell';

/** Configurazione dell'effetto smoke. */
export interface SmokeSettings {
    enable: boolean;
    color: string;
    opacity: number;
    maximumVelocity: number;
    particleRadius: number;
    density: number;
}

/** Definizione di una pagina legale (rotta `policy/*` e markdown associato). */
export interface LegalPageSpec {
    pageType: PageType;
    /** Segmento sotto `policy/`. */
    path: string;
    /** Chiave i18n del titolo. */
    titleKey: string;
    /** Chiave i18n della descrizione. */
    descriptionKey: string;
    /** Basename del Markdown in `assets/legal`. */
    markdownSlug: string;
}

/** Esposizione di contatti/dati facoltativi nel JSON-LD pubblico (nodo brand). */
export interface JsonLdContactExposure {
    email?: boolean;
    telefono?: boolean;
    indirizzo?: boolean;
    partitaIva?: boolean;
    codiceFiscale?: boolean;
}

/** Configurazione generale del sito. */
export interface SiteConfig {
    /** Nome applicativo del sito. */
    appName: string;
    /** Forza l'uso esclusivo dell'immagine per le anteprime social (Open Graph) senza overlay. */
    onlyPlainImage: boolean;
    /** Dati facoltativi di `identity` esposti nel JSON-LD del brand. */
    jsonld: JsonLdContactExposure;
    /** Versione canonica dell'applicazione (es. "1.2.0"). */
    version: string;
    /** Descrizione generale del sito per-lingua (chiavi = tag lingua). */
    description: Record<string, string>;
    /** Colore tema principale usato dalla UI. */
    colorTema: string;
    /** Override opzionale del colore secondario. */
    colorSecondary?: string;
    /** Override opzionale del colore di sfondo. */
    colorBackground?: string;
    /** Override opzionale del colore del testo. */
    colorText?: string;
    /** Override opzionale del colore informativo. */
    colorInfo?: string;
    /** Indica se il footer deve essere visibile. */
    showFooter: boolean;
    /** Indica se l'header deve essere visibile. */
    showNav: boolean;
    /** Indica se il pannello contenuti (`.content-panel`) può essere visibile. Default: `true`. */
    showPanel: boolean;
    /** Mostra il breadcrumb sulle pagine interne. Default: `false`. */
    showBreadcrumb: boolean;
    /** Fissa la navbar in alto allo scroll. */
    fixedTopHeader?: boolean;
    /** Mostra il pulsante di login nella navbar. */
    showLoginInHeader: boolean;
    /** Mostra il campanellino delle notifiche realtime. Default: false. */
    showNotifications: boolean;
    /** Abilita funzionalità PWA (Service Worker e installazione offline). Default: `false`. */
    isWebApp: boolean;
    /** Configurazione dell'effetto smoke. */
    smoke: SmokeSettings;
    /**
     * Nome del preset scelto (`shell.designSystem` in site.ts), `null` se nessuno. Un preset è un
     * bundle di default per `forceThemeTone`/`panelSurface` (e in futuro altri campi affini, vedi
     * `design-system-presets.ts`) — non è un contratto, è comodità: quei campi restano impostabili
     * singolarmente, e vincono sempre sul preset se presenti. Esposto qui solo per
     * debug/introspezione (un componente può leggere quale preset è attivo).
     */
    designSystem: DesignSystemPresetName | null;
    /**
     * Forza l'intero sito su un tono, ignorando `prefers-color-scheme`: utile per un design a
     * palette fissa (es. sempre scuro) dove un tema derivato dall'OS romperebbe il contrasto
     * studiato dal grafico. Da `shell.forceThemeTone` in site.ts (impostabile anche indirettamente
     * scegliendo un `designSystem` che lo preveda — vedi sopra). Default: assente — segue l'OS come
     * sempre (`ThemeService.themeTone`, sia in SSR sia runtime).
     * Diverso da `panelSurface` (sotto): quello forza SOLO il pannello contenuti su un tono
     * indipendente dall'OS che governa il resto; questo fissa l'intero sito. Compongono, non si
     * escludono — un pannello con tono diverso dal resto del sito, anche già fissato, è una
     * composizione valida (Radix Themes/Chakra/Ant Design/Carbon la documentano tutte come pattern
     * intenzionale, non un conflitto). Cambia solo il DEFAULT di `panelSurface`: `'auto'` (segue
     * l'ambiente, già coerente) quando questo campo è impostato, `'light'` altrimenti — un valore
     * esplicito vince sempre su entrambi i default.
     */
    forceThemeTone?: 'light' | 'dark';
    /**
     * Tono del pannello contenuti, indipendente dall'OS che governa navbar/footer/sfondo.
     * `'auto'` = segue l'ambiente come il resto del sito. Default: `'light'` (comportamento
     * storico del template) — o `'auto'` se `forceThemeTone` è impostato, vedi sopra.
     */
    panelSurface: 'light' | 'dark' | 'auto';
    /**
     * Sfondo/testo di navbar e footer. `'brand'` (default) = superficie immersiva derivata dal
     * brand, sempre diversa dallo sfondo pagina. `'body'` = navbar/footer condividono lo sfondo
     * pagina, nessuna cesura visibile — vedi `DesignSystemPreset.navSurface` per il dettaglio.
     * Impostabile anche indirettamente scegliendo un `designSystem` che lo preveda (es. `muro`).
     */
    navSurface: 'brand' | 'body';
    /** Fade-in d'ingresso pagina (`.page-fade` via `PageBaseComponent`). Default: `true`. */
    pageFade: boolean;
    /** Pagina a cui reindirizzare l'utente se non autenticato (default /error/401). */
    loginPage?: PageType | null;
    /** Pagina home usata dal logo nella navbar. */
    homePage?: PageType | null;
    /** Pagine legali dichiarate dal sito. */
    legalPages: readonly LegalPageSpec[];
    /** `PageType` della Cookie Policy fra le voci di `legalPages`. */
    cookiePolicy: PageType | null;
    /** Cache in-process per l'endpoint `/sitemap.xml` delle pagine con `dynamicParams`. */
    dynamicSitemapCache: boolean;
    /** Override del calcolo breadcrumb per-PageType. */
    resolveBreadcrumb?: (pageType: PageType, ctx: BreadcrumbContext) => BreadcrumbItem[] | null;
    /** Percorso backend per un'immagine blob dinamica dato il GUID (og:image, icona di brand...).
     *  Default: convenzione `BlobController` (`blob/{guid}?webopt=true`) — un endpoint blob
     *  diverso nel progetto figlio sovrascrive solo questo hook. */
    resolveBlobImageUrl?: (guid: string) => string;
}

// ======================================================
// MODELLI DELLE PAGINE
// ======================================================

/** Proprietà comuni a tutte le tipologie di pagina. */
type BasePageInput = {
    /** Segmento di path relativo (stringa singola o record per-lingua). */
    path: string | Partial<Record<string, string>>;
    /** Titolo o chiave di traduzione associata alla pagina. */
    title: string;
    /** Inclusione della pagina nella build finale. Default: true */
    enabled?: boolean;
    /** Richiede autenticazione per l'accesso (forza `renderMode: 'client'`). */
    requiresAuth?: boolean;
    /** Dati arbitrari aggiuntivi associati alla pagina. */
    data?: Record<string, unknown>;
};

/** Discriminante esplicito delle varianti di pagina supportate dalla DSL. */
export type SitePageKind = 'parent' | 'leaf' | 'external';

/** Strategia di rendering dichiarativa associabile a una pagina interna. */
export type SiteRenderMode = 'client' | 'server';

/** Pagina contenitore per raggruppare altre pagine nell'albero. */
export type ParentPageInput = BasePageInput & {
    kind?: 'parent';
    /** Figli annidati della pagina contenitore. */
    children: SitePageInput[];
    pageType?: never;
    component?: never;
    externalUrl?: never;
    layout?: never;
    renderMode?: never;
};

/** Immagine di anteprima social: `id` = asset statico (mapping.json); `blobGuid` = immagine
 *  caricata nel backend, risolta a runtime. Entrambi valorizzati → vince `blobGuid`. */
export type OgImageRef = { id?: string; blobGuid?: string };

/** Pagina interna con componente lazy e rotta Angular. */
export type LeafPageInput = BasePageInput & {
    kind?: 'leaf';
    /** Tipo logico della pagina interna. */
    pageType: PageType;
    /** Loader lazy del componente Angular associato alla pagina. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: () => Promise<Type<PageBaseComponent<any>>>;
    children?: never;
    /** Override per-pagina dei flag di layout/shell. */
    layout?: {
        /** Ruolo della pagina (vedi `PageRole` in `design-system-presets.ts`): governa insieme
         *  nav/footer/pannello. Default: `'default'`. Non esiste più uno scostamento per-pagina su
         *  questi tre flag: è una decisione del design system attivo (`DesignSystemPreset.roleChrome`),
         *  non della pagina — la pagina dichiara CHE COSA è (il ruolo), non COME va renderizzata.
         *  `'naked'` è l'unico ruolo forzato: nessun design system può farlo apparire con nav/footer/
         *  pannello. */
        role?: PageRole;
        /** Vista full-bleed senza pannello/container. */
        fitViewport?: boolean;
        /** Mostra o nasconde l'effetto smoke per questa pagina. */
        showSmoke?: boolean;
        /** Mostra o nasconde il breadcrumb per questa pagina. */
        showBreadcrumb?: boolean;
        /** Override per-pagina del fade-in d'ingresso. */
        pageFade?: boolean;
    };
    /** Strategia di rendering della pagina ('server' o 'client'). */
    renderMode?: SiteRenderMode;
    /** Descrizione della pagina per social sharing (og:description). */
    description?: string;
    /** Metadati SEO/social per la pagina. */
    otherSEO?: {
        /** Immagine di anteprima (vedi {@link OgImageRef}). `false` disabilita l'immagine,
         *  `undefined` genera una preview solo testuale. */
        ogImage?: OgImageRef | false;
        /** Tipo Open Graph (default 'website'). */
        ogType?: string;
        /** Dati strutturati (JSON-LD) per la pagina. */
        structuredData?: StructuredDataInput;
        /** Esclude la pagina dall'indicizzazione dei motori di ricerca. */
        noindex?: boolean;
    };
    /** Catalogo runtime di valori per i parametri di rotta `:param`. */
    dynamicParams?: (ctx: DynamicParamsContext) => Promise<SlugNode[]>;
    /** Carica il contenuto della pagina prima del rendering. */
    contentLoader?: ContentLoader;
    externalUrl?: never;
};

/** Pagina esterna con reindirizzamento o link fuori dal sito. */
export type ExternalPageInput = Omit<BasePageInput, 'path'> & {
    kind?: 'external';
    /** Tipo logico della pagina esterna. */
    pageType: PageType;
    /** URL di destinazione esterna. */
    externalUrl: string;
    path?: never;
    component?: never;
    children?: never;
    layout?: never;
    renderMode?: never;
    /** Un link esterno non passa da `routing.ts` (nessun `canActivate`): "richiedi login" non ha
     *  un effetto da applicare. Per nasconderlo a chi non è loggato usa `authOnly` su `addLink`. */
    requiresAuth?: never;
};

/**
 * Un elemento dell'albero pagine — dichiarato nel file di area (`pages/*.pages.ts`),
 * non in `site.ts`: `site.ts` assembla gli array di più aree con uno spread
 * (`pages: () => [...appPagesDecl, ...]`), non dichiara pagine direttamente.
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
    ogImage?: OgImageRef | false;
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

// Navigazione (header/footer): tipi e risoluzione vivono in `shell-nav.ts`, non qui — dato
// risolvibile a runtime, non struttura del sito. `getLegalFooterLinks` sotto ne resta un
// consumer (la fascia "small prints" DERIVA da `legalPages`, quella sì build-time) e importa
// `NavLink` da lì.

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
    context: string,
    preset: DesignSystemPreset | undefined
): SitePage => {
    if (isParentPageInput(page)) {
        assertDeclaredKind(page, 'parent', context);

        return {
            ...page,
            enabled: page.enabled ?? true,
            kind: 'parent',
            children: page.children.map((child, index) =>
                normalizeSitePage(child, `${context}.children[${index}]`, preset)
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
        const role: PageRole = layout?.role ?? 'default';
        const roleChrome = resolveRoleChrome(role, preset);
        const naked = role === 'naked';
        return {
            ...rest,
            enabled: page.enabled ?? true,
            kind: 'leaf',
            // Flag di layout per route.data. Nav/footer/pannello non sono più uno scostamento
            // della pagina: li decide solo il ruolo, tramite il design system attivo. Ordine di
            // priorità: 'naked' (fisso) > fitViewport (fisso: full-bleed, niente footer a
            // prescindere dal ruolo — stesso spazio conteso di pannello/smoke, già esclusi
            // strutturalmente) > default del ruolo dato dal design system (roleChrome) > default
            // globale di sito (applicato più a valle, in app.component.ts).
            shell: {
                showNav: naked ? false : roleChrome.showNav,
                showPanel: naked ? false : roleChrome.showPanel,
                showFooter: (naked || layout?.fitViewport) ? false : roleChrome.showFooter,
                fitViewport: layout?.fitViewport,
                showSmoke: layout?.showSmoke,
                showBreadcrumb: layout?.showBreadcrumb,
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

/** Normalizza l'intero albero pagine dichiarato, secondo come il design system attivo (`preset`,
 *  `undefined` se nessuno) interpreta il ruolo di ciascuna pagina. */
const normalizeSitePages = (pages: SitePageInput[], preset: DesignSystemPreset | undefined): SitePage[] =>
    pages.map((page, index) => normalizeSitePage(page, `sitePages[${index}]`, preset));

/** Raccoglie i `PageType` dichiarati dal figlio nell'albero `pages`. */
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

/** Sottoinsieme della configurazione esposto alla factory di `defineSitePages`. */
export type SitePageContext = {
    readonly isWebApp: boolean;
    readonly showLoginInHeader: boolean;
};

/** Comportamento della shell (navbar/footer/header/pannello contenuti).
 *  L'icona di brand in navbar non è più qui: è dato risolvibile a runtime (può dipendere da
 *  un'API, cambiare per pagina...), non struttura fissa del sito — vedi
 *  `ShellNavResolver.brandIcon` in `shell-nav.ts`, risolto insieme a header/footer. */
export interface SiteShellConfig {
    /**
     * Nome di un preset di design system (`design-system-presets.ts`): un default comodo per
     * l'intero bundle di leve granulari sotto (`forceThemeTone`, `panelSurface`, `navSurface`,
     * `roleChrome`, `fixedTopHeader`, `pageFade`, `showBreadcrumb`, override colore), invece di
     * impostarle una per una. Un campo impostato esplicitamente qui sotto (o nel JSON per i colori)
     * vince sempre sul preset. I nomi non sono un contratto fisso — possono cambiare, non fanno
     * danno a un figlio che non li usa.
     */
    designSystem?: DesignSystemPresetName;
    /**
     * Asse "aderenza al tema del browser": assente = **auto**, segue `prefers-color-scheme` come
     * sempre; `'light'`/`'dark'` = **strict**, fissa l'intero sito su quel tono ignorando l'OS —
     * utile per un design a palette fissa dove un tema derivato dall'OS romperebbe il contrasto
     * studiato dal grafico. Un solo campo per entrambi i fatti (se è strict, e quale tono): non può
     * rappresentare uno stato invalido ("strict ma senza dire quale tono"). Impostabile anche
     * indirettamente scegliendo un `designSystem` che lo preveda (vedi sopra).
     */
    forceThemeTone?: 'light' | 'dark';
    /** Mostra la navbar. Default: true. */
    showNav?: boolean;
    /** Mostra il footer. Default: true. */
    showFooter?: boolean;
    /** Mostra il pannello contenuti (`.content-panel`). Default: true. */
    showPanel?: boolean;
    /** Mostra il breadcrumb sulle pagine interne. Default: `false` — o il default del `designSystem`
     *  attivo se lo mappa. Un valore esplicito qui vince sempre sul preset. */
    showBreadcrumb?: boolean;
    /** Fissa la navbar in alto allo scroll. Default: false — o il default del `designSystem` attivo
     *  se lo mappa (un'esperienza immersiva/istituzionale può volerla sempre fissa o sempre statica
     *  come parte della propria identità). Un valore esplicito qui vince sempre sul preset. */
    fixedTopHeader?: boolean;
    /** Mostra il campanellino delle notifiche realtime. Default: false. */
    showNotifications?: boolean;
    /**
     * Tono del pannello contenuti (`.content-panel`), indipendente dall'OS. `'auto'` = segue
     * l'ambiente come navbar/footer. Default: `'light'` — o `'auto'` se `forceThemeTone` (qui
     * sopra) è impostato, per un sito uniforme senza doverlo dichiarare a mano. Un valore
     * esplicito qui vince sempre su entrambi i default: un pannello su un tono
     * diverso dal resto del sito, anche già fissato, è una composizione valida (pattern comune —
     * Radix Themes/Chakra/Ant Design/Carbon lo documentano tutti), non un conflitto.
     */
    panelSurface?: 'light' | 'dark' | 'auto';
    /**
     * Sfondo/testo di navbar e footer. `'brand'` (default) = superficie immersiva derivata dal
     * brand. `'body'` = navbar/footer condividono lo sfondo pagina, nessuna cesura visibile —
     * vedi `DesignSystemPreset.navSurface`. Impostabile anche indirettamente scegliendo un
     * `designSystem` che lo preveda (es. `muro`); un valore esplicito qui vince sempre sul preset.
     */
    navSurface?: 'brand' | 'body';
    /** Fade-in d'ingresso pagina. Default: true — o il default del `designSystem` attivo se lo
     *  mappa. Un valore esplicito qui vince sempre sul preset. */
    pageFade?: boolean;
}

/** Configurazione della pagina di login e della sua visibilità in navbar. */
export interface LoginPageConfig {
    /** La pagina di login target del redirect auth. */
    page: PageType;
    /** Espone il link di login in navbar. Default `false`. */
    showInHeader?: boolean;
}

/** Struttura e comportamento del sito passati a `buildSite`. */
export interface SiteDefinition {
    /** Pagina di login (target redirect e navbar opzionale). */
    loginPage?: PageType | LoginPageConfig | null;
    /** Pagina home per brand/logo. */
    homePage?: PageType | null;
    /** Pagine legali del sito. */
    legalPages?: readonly LegalPageSpec[];
    /** `PageType` della Cookie Policy fra le voci di `legalPages`. */
    cookiePolicy?: PageType | null;
    /** Comportamento della shell. */
    shell?: SiteShellConfig;
    /** Abilita funzionalità PWA. Default: `false`. */
    isWebApp?: boolean;
    /** Cache in-process per l'endpoint `/sitemap.xml` delle pagine con `dynamicParams`. */
    dynamicSitemapCache?: boolean;
    /** Override per-`PageType` del calcolo breadcrumb. */
    resolveBreadcrumb?: (pageType: PageType, ctx: BreadcrumbContext) => BreadcrumbItem[] | null;
    /** Anteprime social con sola immagine senza scritte/favicon sovrapposte. */
    onlyPlainImage?: boolean;
    /** Override del percorso backend per un'immagine blob dinamica (og:image). Vedi {@link SiteConfig.resolveBlobImageUrl}. */
    resolveBlobImageUrl?: (guid: string) => string;
    /** Esposizione dati di `identity` nel JSON-LD del brand. */
    jsonld?: JsonLdContactExposure;
    /** Factory dell'albero pagine. */
    pages: (ctx: SitePageContext) => SitePageInput[];
}

export type ServerRenderEntry = {
    /** Path completo normalizzato della pagina interna foglia. */
    path: string;
    /** Strategia di rendering finale da esporre al layer server. */
    renderMode: SiteRenderMode;
    /** Richiede login (`requiresAuth`). */
    requiresAuth: boolean;
    /** Esclusa dall'indicizzazione via `otherSEO.noindex`. */
    noindex: boolean;
};

/** Metadati di una singola pagina esposti da ContestoSito. */
export type PageInfo = {
    /** Chiave i18n o testo del titolo. */
    title: string;
    /** Path Angular interno o URL esterno. */
    path: string;
    /** Link verso una risorsa esterna. */
    isExternal: boolean;
    /** Descrizione SEO (chiave i18n o testo statico). */
    description?: string;
    /** Immagine di anteprima (vedi {@link OgImageRef}), o false per disabilitarla. */
    ogImage?: OgImageRef | false;
    /** Tipo Open Graph della pagina. */
    ogType?: string;
    /** Dati strutturati statici (JSON-LD). */
    structuredData?: StructuredDataInput;
    /** Esclusione dall'indicizzazione. */
    noindex?: boolean;
};

export interface BuiltSite {
    /** Configurazione finale del sito normalizzata. */
    config: SiteConfig;
    /** Pagine interne per Angular Router. */
    pages: InternalSitePage[];
    /** Link alle pagine legali configurate (`config.legalPages`) per lingua. */
    getLegalFooterLinks: (lang?: string) => NavLink[];
    /** Piano di rendering server-only per ogni lingua. */
    serverRenderEntries: ServerRenderEntry[];
    /** Risolve il path associato a un `PageType` nella lingua richiesta. */
    getPath: (type: PageType, lang?: string) => string | null;
    /** Restituisce i metadati completi associati a un PageType nella lingua richiesta. */
    getPageInfo: (type: PageType, lang?: string) => PageInfo | null;
    /** Restituisce lo slug del relativo Markdown per una pagina legale, o null. */
    getLegalSlug: (type: PageType) => string | null;
    /** Voci della sitemap per ogni pagina e lingua. */
    getSitemapEntries: () => SitemapEntry[];
    /** Percorsi pubblici SSR per gli audit live. */
    getAuditPaths: () => string[];
    /** Pagine con `dynamicParams` dichiarato per la sitemap dinamica. */
    getDynamicPages: () => DynamicPageEntry[];
    /** Content loader dichiarato dalla pagina, o null. */
    getContentLoader: (type: PageType) => ContentLoader | null;
}

/** Voce arricchita per la generazione della sitemap. */
export type SitemapEntry = {
    path: string;
    description?: string;
    /** Lingua della variante URL. */
    lang: string;
    /** Identità stabile della pagina logica attraverso le lingue. */
    pageType: PageType;
    /** Data (YYYY-MM-DD) di ultima modifica dell'entità. */
    lastmod?: string | null;
    /** Chiave di raggruppamento hreflang aggiuntiva. */
    groupKey?: string;
};

// ======================================================
// ENGINE PRINCIPALE
// ======================================================

/** Risolve un testo per-lingua con fallback a cascata. */
export function pickLocaleText(map: Record<string, string> | undefined, lang: string): string {
    if (!map) return '';
    return map[lang] ?? map[environment.defaultLang] ?? Object.values(map)[0] ?? '';
}

/** Risolve il path (stringa singola o record per-lingua) sulla lingua richiesta. */
export function resolvePagePath(path: string | Partial<Record<string, string>>, lang: string, defaultLang: string): string {
    if (typeof path === 'string') return path;
    const resolved = path[lang] ?? path[defaultLang];
    if (resolved === undefined && isDevMode()) {
        console.warn(`[SiteBuilder] path per-lingua senza segmento per "${lang}" né fallback su "${defaultLang}": ${JSON.stringify(path)} — path vuoto, la pagina rischia di collassare sul genitore.`);
    }
    return resolved ?? '';
}

/** Verifica se il path contiene segmenti parametrici `:param`. */
function hasUnresolvedPathParam(path: string): boolean {
    return path.split('/').some(segment => segment.startsWith(':'));
}

/** Restituisce il prefisso di rotta per la lingua ('/en' o stringa vuota per default). */
export function resolveLangPrefix(lang: string, defaultLang: string): string {
    return lang === defaultLang ? '' : `/${lang}`;
}

/** Ricava il tag lingua dal primo segmento dell'URL o usa la lingua di default. */
export function detectLangFromPath(path: string, availableLanguages: readonly string[], defaultLang: string): string {
    const firstSegment = path.split('/').filter(Boolean)[0];
    return firstSegment && availableLanguages.includes(firstSegment) ? firstSegment : defaultLang;
}

/** Chiave di lookup in `pageMap`: PageType per lingua default, `type::lang` per altre lingue. */
function pageMapKey(type: PageType, lang: string, defaultLang: string): string {
    return lang === defaultLang ? type : `${type}::${lang}`;
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

/** Risolve lo slot `loginPage` in coppia (PageType, showInHeader). */
function normalizeLoginPage(input: SiteDefinition['loginPage']): { page: PageType | null; showInHeader: boolean } {
    if (input == null) return { page: null, showInHeader: false };
    if (typeof input === 'object') return { page: input.page, showInHeader: input.showInHeader ?? false };
    return { page: input, showInHeader: false };
}

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Valida che i campi colore opzionali siano codici esadecimali validi (#RGB o #RRGGBB). */
function validateColorFields(cfg: { colorTema?: string; colorSecondary?: string; colorBackground?: string; colorText?: string; colorInfo?: string }): void {
    const fields: readonly (readonly [string, string | undefined])[] = [
        ['colorTema', cfg.colorTema],
        ['colorSecondary', cfg.colorSecondary],
        ['colorBackground', cfg.colorBackground],
        ['colorText', cfg.colorText],
        ['colorInfo', cfg.colorInfo],
    ];
    for (const [name, value] of fields) {
        if (value != null && !HEX_COLOR_PATTERN.test(value)) {
            throw new Error(
                `[SiteBuilder] site.${name}="${value}" non è un colore hex valido (atteso #RGB o ` +
                `#RRGGBB, es. "#131e55" — niente canale alpha) in global-settings.json.`
            );
        }
    }
}

/** Risolve `shell.designSystem` (nome) nel bundle di default — `undefined` se non impostato. */
function resolveDesignSystemPreset(name: string | undefined): DesignSystemPreset | undefined {
    if (name == null) return undefined;
    const preset = (DESIGN_SYSTEM_PRESETS as Record<string, DesignSystemPreset>)[name];
    if (!preset) {
        throw new Error(
            `[SiteBuilder] shell.designSystem="${name}" non esiste. Preset validi: ` +
            `${Object.keys(DESIGN_SYSTEM_PRESETS).join(', ')} (site.ts).`
        );
    }
    return preset;
}

/** Risolve il ruolo di una pagina (`layout.role`) nella chrome (nav/footer/pannello) dettata dal
 *  design system attivo. `'naked'` è fisso (vedi `NAKED_CHROME`): design system e preset non
 *  c'entrano, nessuno dei due può scostarsene. */
function resolveRoleChrome(role: PageRole, preset: DesignSystemPreset | undefined): RoleChromeSpec {
    if (role === 'naked') return NAKED_CHROME;
    return preset?.roleChrome?.[role] ?? {};
}

/** Assembla e normalizza la SiteConfig finale combinando environment e definition. Espone anche il
 *  preset risolto (`undefined` se nessuno): serve a `normalizeSitePages` per interpretare i ruoli
 *  di pagina — evita di rifare due volte il lookup di `shell.designSystem`. */
function buildFinalConfig(definition: SiteDefinition): { config: SiteConfig; preset: DesignSystemPreset | undefined } {
    const cfg = environment.config;
    const shell = definition.shell ?? {};
    const preset = resolveDesignSystemPreset(shell.designSystem);
    // Un campo esplicito (shell.* in site.ts, o il JSON per i colori) vince sempre sul preset — il
    // preset dà solo il default, non sovrascrive mai una scelta fatta a mano (stesso principio di
    // addon.json che sovrascrive basic.json, non il contrario).
    const forceThemeTone = shell.forceThemeTone ?? preset?.forceThemeTone;
    const colorSecondary = cfg.colorSecondary ?? preset?.colorSecondary;
    const colorBackground = cfg.colorBackground ?? preset?.colorBackground;
    const colorText = cfg.colorText ?? preset?.colorText;
    const colorInfo = cfg.colorInfo ?? preset?.colorInfo;
    // Validato sui valori RISOLTI (JSON o preset, non solo JSON): un preset con un hex malformato
    // deve fallire nello stesso identico modo di un JSON malformato, non silenziosamente più avanti
    // in ThemeService.
    validateColorFields({ colorTema: cfg.colorTema, colorSecondary, colorBackground, colorText, colorInfo });
    const login = normalizeLoginPage(definition.loginPage);
    const config: SiteConfig = {
        appName: environment.appName,
        version: normalizeVersion(environment.version) || '1.0.0',
        description: cfg.description ?? {},
        colorTema: cfg.colorTema ?? '#888888',
        colorSecondary,
        colorBackground,
        colorText,
        colorInfo,
        designSystem: shell.designSystem ?? null,
        forceThemeTone,
        showFooter: shell.showFooter ?? true,
        showNav: shell.showNav ?? true,
        showPanel: shell.showPanel ?? true,
        showBreadcrumb: shell.showBreadcrumb ?? preset?.showBreadcrumb ?? false,
        fixedTopHeader: shell.fixedTopHeader ?? preset?.fixedTopHeader ?? false,
        showLoginInHeader: login.showInHeader,
        showNotifications: shell.showNotifications ?? false,
        isWebApp: definition.isWebApp ?? false,
        onlyPlainImage: definition.onlyPlainImage ?? false,
        jsonld: {
            email: definition.jsonld?.email ?? false,
            telefono: definition.jsonld?.telefono ?? false,
            indirizzo: definition.jsonld?.indirizzo ?? false,
            partitaIva: definition.jsonld?.partitaIva ?? true,
            codiceFiscale: definition.jsonld?.codiceFiscale ?? false,
        },
        dynamicSitemapCache: definition.dynamicSitemapCache ?? true,
        resolveBreadcrumb: definition.resolveBreadcrumb,
        resolveBlobImageUrl: definition.resolveBlobImageUrl,
        // Default sensibile al contesto: 'light' (storico) quando il sito segue l'OS, 'auto' quando
        // è già fissato su un tono (forceThemeTone) — un sito uniforme di default, non una card
        // chiara che spunta senza che nessuno l'abbia chiesta. Un valore esplicito vince sempre:
        // un pannello con tono diverso dal resto del sito è una composizione valida (Radix/Chakra/
        // Ant Design/Carbon la documentano tutti), non un conflitto da disabilitare.
        panelSurface: shell.panelSurface ?? preset?.panelSurface ?? (forceThemeTone ? 'auto' : 'light'),
        navSurface: shell.navSurface ?? preset?.navSurface ?? 'brand',
        pageFade: shell.pageFade ?? preset?.pageFade ?? true,
        smoke: { ...DEFAULT_SMOKE, ...(cfg.smoke ?? {}) },
        loginPage: login.page,
        homePage: definition.homePage ?? null,
        legalPages: definition.legalPages ?? [],
        cookiePolicy: definition.cookiePolicy ?? null,
    };
    return { config, preset };
}

/**
 * Percorre l'albero pagine e popola mappe di lookup, configurazione SSR e sitemap per la lingua data.
 * @throws Se rileva PageType duplicati o path interni duplicati.
 */
function processPages(
    pages: SitePage[],
    pageMap: Map<string, PageInfo>,
    serverRenderEntries: ServerRenderEntry[],
    dynamicPages: Map<PageType, DynamicPageEntry>,
    contentLoaders: Map<PageType, ContentLoader>,
    auditPaths: string[],
    loginPageType: PageType | null,
    lang: string,
    defaultLang: string,
): SitemapEntry[] {
    const seenInternalPaths = new Set<string>();

    const walk = (nodes: SitePage[], parent: string): SitemapEntry[] =>
        nodes.flatMap((page) => {
            if (!page.enabled) return [];

            if (isExternalPage(page)) {
                const key = pageMapKey(page.pageType, lang, defaultLang);
                if (pageMap.has(key)) {
                    throw new Error(`[SiteBuilder] PageType duplicato rilevato: "${String(page.pageType)}" (lingua "${lang}"). Ogni pagina deve avere un pageType unico.`);
                }
                pageMap.set(key, { title: page.title, path: page.externalUrl, isExternal: true });
                return [];
            }

            const resolvedSegment = resolvePagePath(page.path, lang, defaultLang);
            const fullPath = `/${[parent, resolvedSegment].filter(Boolean).join('/')}`.replace(/\/+/g, '/');

            if (isParentPage(page)) return walk(page.children, fullPath);

            if (seenInternalPaths.has(fullPath)) {
                throw new Error(`[SiteBuilder] Path interno duplicato rilevato: "${fullPath}".`);
            }
            const key = pageMapKey(page.pageType, lang, defaultLang);
            if (pageMap.has(key)) {
                throw new Error(`[SiteBuilder] PageType duplicato rilevato: "${String(page.pageType)}" (lingua "${lang}"). Ogni pagina deve avere un pageType unico.`);
            }
            seenInternalPaths.add(fullPath);
            const noindex = page.pageType === loginPageType ? (page.noindex ?? true) : !!page.noindex;
            pageMap.set(key, {
                title: page.title,
                path: fullPath,
                isExternal: false,
                description: page.description,
                ogImage: page.ogImage,
                ogType: page.ogType ?? 'website',
                structuredData: page.structuredData,
                noindex,
            });
            if (page.contentLoader) contentLoaders.set(page.pageType, page.contentLoader);

            const renderMode = page.requiresAuth ? 'client' : (page.renderMode ?? 'server');
            serverRenderEntries.push({ path: fullPath, renderMode, requiresAuth: !!page.requiresAuth, noindex });

            const isLiveAuditEndpoint = !page.requiresAuth && renderMode === 'server' && !hasUnresolvedPathParam(fullPath) && lang === defaultLang;
            if (isLiveAuditEndpoint) {
                auditPaths.push(fullPath);
            }

            if (page.requiresAuth || noindex) return [];
            if (hasUnresolvedPathParam(fullPath)) {
                if (page.dynamicParams) {
                    const existing = dynamicPages.get(page.pageType);
                    if (existing) {
                        existing.pathByLang[lang] = fullPath;
                    } else {
                        dynamicPages.set(page.pageType, {
                            pageType: page.pageType,
                            description: page.description,
                            pathByLang: { [lang]: fullPath },
                            dynamicParams: page.dynamicParams,
                        });
                    }
                } else if (isDevMode()) {
                    console.warn(`[SiteBuilder] "${fullPath}" è una rotta parametrica: esclusa da sitemap/llms.txt statici (il catalogo concreto arriva da un'API a runtime, non enumerabile a build time). Aggiungi \`dynamicParams\` alla pagina per includerla in sitemap.xml e llms.txt dinamici.`);
                }
                return [];
            }
            return [{ path: fullPath, description: page.description, lang, pageType: page.pageType }];
        });

    return walk(pages, resolveLangPrefix(lang, defaultLang));
}

/** Lancia errore se lo slot punta a un PageType non registrato o disabilitato. */
function assertSlotResolved(slotName: string, type: PageType, pageMap: Map<string, PageInfo>): void {
    if (!pageMap.has(type)) {
        throw new Error(
            `[SiteBuilder] Slot "${slotName}" punta a "${String(type)}", non registrato: ` +
            `dichiaralo in "pages" (e verifica che non sia "enabled: false"), oppure rimuovi lo slot.`
        );
    }
}

/** Valida che tutti gli slot di ruolo pagina puntino a pagine registrate. */
function validatePageRefs(config: SiteConfig, legalPages: readonly LegalPageSpec[], pageMap: Map<string, PageInfo>): void {
    if (config.loginPage) assertSlotResolved('loginPage', config.loginPage, pageMap);
    if (config.homePage) assertSlotResolved('homePage', config.homePage, pageMap);
    if (config.cookiePolicy) assertSlotResolved('cookiePolicy', config.cookiePolicy, pageMap);
    for (const spec of legalPages) {
        assertSlotResolved(`legalPages["${spec.path}"]`, spec.pageType, pageMap);
    }
}

/** Nodo dell'albero di parametri dinamici per rotte parametriche. */
export interface SlugNode {
    /** Valore concreto del segmento di rotta. */
    slug: string;
    /** Nodi per i parametri successivi della rotta. */
    children?: SlugNode[];
    /** Data di ultima modifica (YYYY-MM-DD) per la sitemap. */
    lastModified?: string;
}

/** Contesto passato a `LeafPageInput.dynamicParams`. */
export interface DynamicParamsContext {
    fetchBackendJson: <T>(path: string) => Promise<T>;
}

/** Contesto passato a `LeafPageInput.contentLoader`. */
export interface ContentLoaderContext {
    lang: string;
    params: Record<string, string>;
}

/** Esito di `LeafPageInput.contentLoader`. */
export interface ContentLoaderResult {
    content: unknown;
    info?: Partial<PageInfo>;
    structuredData?: StructuredDataInput | null;
}

export type ContentLoader = (ctx: ContentLoaderContext) => Promise<ContentLoaderResult>;

/** Pagina con parametri dinamici per la sitemap. */
export interface DynamicPageEntry {
    pageType: PageType;
    description?: string;
    pathByLang: Record<string, string>;
    dynamicParams: (ctx: DynamicParamsContext) => Promise<SlugNode[]>;
}

/** Risultato di `flattenDynamicParams` per un percorso radice-foglia. */
export interface FlattenedDynamicParams {
    params: Record<string, string>;
    lastModified?: string;
}

const MAX_FLATTENED_ENTRIES = 50_000;

/** Espande l'albero di SlugNode in combinazioni concrete di parametri rotta. */
export function flattenDynamicParams(path: string, nodes: SlugNode[]): FlattenedDynamicParams[] {
    const paramNames = path.split('/').filter(segment => segment.startsWith(':')).map(segment => segment.slice(1));
    if (paramNames.length === 0) return [];

    const results: FlattenedDynamicParams[] = [];
    let truncated = false;
    const walk = (level: SlugNode[], depth: number, acc: Record<string, string>): void => {
        for (const node of level) {
            if (results.length >= MAX_FLATTENED_ENTRIES) { truncated = true; return; }
            const next = { ...acc, [paramNames[depth]]: node.slug };
            const isLastParam = depth === paramNames.length - 1;
            if (isLastParam) {
                if (node.children?.length && isDevMode()) {
                    console.warn(`[SiteBuilder] dynamicParams per "${path}": il nodo "${node.slug}" ha children oltre l'ultimo parametro della rotta (ne servono ${paramNames.length}) — ignorati.`);
                }
                results.push({ params: next, lastModified: node.lastModified });
            } else if (node.children?.length) {
                walk(node.children, depth + 1, next);
            } else if (isDevMode()) {
                console.warn(`[SiteBuilder] dynamicParams per "${path}": il nodo "${node.slug}" si ferma al livello ${depth + 1} ma la rotta ha ${paramNames.length} parametri — combinazione incompleta, scartata.`);
            }
        }
    };
    walk(nodes, 0, {});
    if (truncated) {
        console.warn(`[SiteBuilder] dynamicParams per "${path}": espansione troncata a ${MAX_FLATTENED_ENTRIES} combinazioni (limite di sicurezza) — il provider sta restituendo più elementi di quanti questa funzione ne accumuli.`);
    }
    return results;
}

/** Sostituisce nel path i segmenti `:param` coi valori di `params`. */
export function applyPathParams(path: string, params: Record<string, string> | undefined, devContext: string): string {
    if (!params) return path;
    return path
        .split('/')
        .map(segment => {
            if (!segment.startsWith(':')) return segment;
            const key = segment.slice(1);
            const value = params[key];
            if (value === undefined) {
                if (isDevMode()) {
                    console.warn(`[SiteBuilder] ${devContext}: manca il valore per il parametro ":${key}" nel path "${path}" — il link resta rotto.`);
                }
                return segment;
            }
            return encodeURIComponent(value);
        })
        .join('/');
}

/**
 * Risolve `legalPages` (NON filtrata dall'override: una pagina overridden resta comunque nel
 * footer) in `NavLink[]` per la fascia "small prints", nello stesso ordine della lista. Una voce
 * che non risolve in `pageMap` (mai configurata, o rimossa insieme alla pagina che referenziava)
 * è semplicemente assente dal risultato — stessa logica "silente" di `resolveNavItems`
 * (shell-nav.ts) per un `addPage` non risolto.
 */
function resolveLegalFooterLinks(
    legalPages: readonly LegalPageSpec[],
    pageMap: Map<string, PageInfo>,
    lang: string,
    defaultLang: string,
): NavLink[] {
    return legalPages
        .map((spec): NavLink | null => {
            const entry = pageMap.get(pageMapKey(spec.pageType, lang, defaultLang));
            return entry ? { label: entry.title, path: entry.path, isExternal: entry.isExternal } : null;
        })
        .filter((item): item is NavLink => item !== null);
}

/**
 * Costruisce e valida il ContestoSito completo a partire dalla SiteDefinition.
 * @throws Se ci sono duplicati, slot non risolti o policy mancanti per i cookie configurati.
 */
export function buildSite(definition: SiteDefinition): BuiltSite {

    const { config: finalConfig, preset } = buildFinalConfig(definition);
    const cookiesEnabled = hasCookiesConfigured(finalConfig.isWebApp);

    const ctx: SitePageContext = {
        isWebApp: finalConfig.isWebApp,
        showLoginInHeader: finalConfig.showLoginInHeader,
    };
    const declaredPages = definition.pages(ctx);

    const declaredPageTypes = collectDeclaredPageTypes(declaredPages, new Set<PageType>());
    const allLegalPages = finalConfig.legalPages;
    const managedLegalPages = filterManagedLegalPages(allLegalPages, declaredPageTypes);

    const policySection = buildPolicySection(managedLegalPages);
    const sitePages = normalizeSitePages(policySection ? [...declaredPages, policySection] : declaredPages, preset);

    const pageMap = new Map<string, PageInfo>();
    const serverRenderEntries: ServerRenderEntry[] = [];
    const dynamicPages = new Map<PageType, DynamicPageEntry>();
    const contentLoaders = new Map<PageType, ContentLoader>();
    const auditPaths: string[] = [];
    const defaultLang = environment.defaultLang;
    let sitemap: SitemapEntry[] = [];

    for (const lang of environment.availableLanguages) {
        sitemap = sitemap.concat(
            processPages(sitePages, pageMap, serverRenderEntries, dynamicPages, contentLoaders, auditPaths, finalConfig.loginPage ?? null, lang, defaultLang)
        );
    }

    validatePageRefs(finalConfig, allLegalPages, pageMap);

    if (cookiesEnabled && finalConfig.cookiePolicy == null) {
        throw new Error(
            '[SiteBuilder] Il sito usa cookie (PWA o cookie di progetto) ma ' +
            '`cookiePolicy` non è valorizzato in site.ts. La pagina Cookie Policy è ' +
            'obbligatoria: valorizza `cookiePolicy` con il PageType della relativa voce in `legalPages`.'
        );
    }

    const footerLegalPages = cookiesEnabled
        ? allLegalPages
        : allLegalPages.filter(spec => spec.pageType !== finalConfig.cookiePolicy);

    const legalFooterLinksByLang = new Map<string, NavLink[]>();
    for (const lang of environment.availableLanguages) {
        legalFooterLinksByLang.set(lang, resolveLegalFooterLinks(footerLegalPages, pageMap, lang, defaultLang));
    }

    return {
        config: finalConfig,
        pages: sitePages.filter(isInternalPage),
        getLegalFooterLinks: (lang = defaultLang) => legalFooterLinksByLang.get(lang) ?? legalFooterLinksByLang.get(defaultLang) ?? [],
        serverRenderEntries,
        getPath: (type: PageType, lang = defaultLang) => pageMap.get(pageMapKey(type, lang, defaultLang))?.path ?? null,
        getPageInfo: (type: PageType, lang = defaultLang) => pageMap.get(pageMapKey(type, lang, defaultLang)) ?? null,
        getLegalSlug: (type: PageType) => legalSlugFor(managedLegalPages, type),
        getSitemapEntries: () => sitemap,
        getAuditPaths: () => auditPaths,
        getDynamicPages: () => Array.from(dynamicPages.values()),
        getContentLoader: (type: PageType) => contentLoaders.get(type) ?? null,
    };
}
