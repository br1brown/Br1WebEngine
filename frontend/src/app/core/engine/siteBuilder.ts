import { InjectionToken, isDevMode, type Type } from '@angular/core';
import type { PageType } from '../../site';
import type { PageBaseComponent } from './pages/page-base.component';
import { environment } from '../../../environments/environment';
import { hasCookiesConfigured } from './services/cookie/cookie-utils';
import { buildPolicySection, filterManagedLegalPages, legalSlugFor } from './legal/legal-pages';
import type { StructuredDataInput } from './services/structured-data';
import type { NavLink } from './shell-nav';

/** Default "di sistema" per le 5 pagine legali standard — dati pronti da usare con lo spread
 *  (vedi `LegalPageSpec` e `pages/policy/legal.pages.ts`), riesportati qui perché il figlio
 *  importa la superficie pubblica dell'Engine da `siteBuilder.ts`, mai da `legal/legal-pages.ts`. */
export { STANDARD_LEGAL_PAGES } from './legal/legal-pages';


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
    /** Mostra il pannello contenuti. Default (assente): mostrato, salvo `site.showPanel` globale off. */
    showPanel?: boolean;
    /** Mostra il footer. Default (assente): mostrato. */
    showFooter?: boolean;
    /** Vista full-bleed (niente pannello/container). Default (assente): off. */
    fitViewport?: boolean;
    /** Mostra l'effetto smoke su questa pagina, indipendentemente dal pannello.
     *  Default (assente): mostrato dove c'è pannello e non full-bleed;
     *  `true` lo forza anche senza pannello, `false` lo spegne. Subordinato al gate globale `site.smoke.enable`. */
    showSmoke?: boolean;
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
//   - getAuditPaths() per gli audit live, separati dalla superficie SEO
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
 * Una pagina legale: il figlio la abbina al proprio `PageType` in `site.ts` (array `legalPages`)
 * e l'Engine costruisce la rotta `policy/*`, la voce di footer e carica il Markdown. Ogni voce
 * ha lo stesso trattamento — nessuna distinzione fra "pagine di sistema" (privacy, termini,
 * note legali, accessibilità) e pagine di progetto (es. diritto di recesso): sono tutte righe
 * della stessa lista. Per le 5 pagine standard, {@link STANDARD_LEGAL_PAGES} fornisce
 * `path`/`titleKey`/`descriptionKey`/`markdownSlug` già pronti, da usare con lo spread (vedi
 * `pages/policy/legal.pages.ts`) — restano comunque solo dati, nessuna scorciatoia nascosta.
 *
 * L'unica pagina con un ruolo diverso da "testo generico" è la Cookie Policy, che infatti non
 * si identifica guardando questa lista: è il campo separato `cookiePolicy` (vedi `SiteConfig`)
 * a dire quale `PageType`, se presente fra le voci di `legalPages`, è la Cookie Policy — serve
 * al banner per il link e per il controllo "cookie usati ma nessuna Cookie Policy dichiarata".
 */
export interface LegalPageSpec {
    /** PageType del figlio a cui associare la pagina. */
    pageType: PageType;
    /** Segmento sotto `policy/` (es. 'recesso' → /policy/recesso). */
    path: string;
    /** Chiave i18n del titolo (voce di menu/footer). */
    titleKey: string;
    /** Chiave i18n della descrizione (meta/SEO). */
    descriptionKey: string;
    /** Basename del Markdown in `assets/legal` (`<slug>.<lang>.md`). */
    markdownSlug: string;
}

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
    /** Override opzionale del colore secondario. Assente = derivato da `colorTema` (muted). */
    colorSecondary?: string;
    /** Override opzionale del colore di sfondo (pagina/card/hover). Assente = derivato da `colorTema`. */
    colorBackground?: string;
    /** Override opzionale del colore del testo (corpo e headings). Assente = segue `colorBackground` (che a sua volta è `colorTema` se nemmeno quello è impostato). */
    colorText?: string;
    /** Override opzionale del colore informativo. Assente = `--bs-info*` resta gestito da Bootstrap. */
    colorInfo?: string;
    /** Indica se il footer deve essere visibile. */
    showFooter: boolean;
    /** Indica se il Header deve essere visibile. */
    showNav: boolean;
    /** Indica se il pannello contenuti (`.content-panel`) può essere visibile. Default: `true`.
     *  Fa da GATE come showNav/showFooter: se `false` nessuna pagina può riattivarlo col proprio
     *  `layout.showPanel: true`. */
    showPanel: boolean;
    /** FIssare la navBar in alto */
    fixedTopHeader?: boolean;
    /** Mostra l'icona (favIcon) accanto al nome dell'app nella navbar-brand. */
    showBrandIconInHeader: boolean;
    /** Mostra il pulsante di login nella navbar. */
    showLoginInHeader: boolean;
    /** Mostra il campanellino delle notifiche realtime (con storico). Default: false (opt-in). */
    showNotifications: boolean;
    /** Abilita le funzionalità PWA: Service Worker, aggiornamenti automatici e installazione offline.
     *  Default: `false` (opt-in) — richiede consenso tecnico opzionale e aggiunge un cookie/storage
     *  in più da far scegliere all'utente, quindi va acceso solo dove serve davvero. */
    isWebApp: boolean;
    /** Configurazione finale normalizzata dell'effetto smoke. */
    smoke: SmokeSettings;
    /**
     * Se `true`, il pannello contenuti (`.content-panel`) è sempre chiaro
     * indipendentemente dalla preferenza OS. Default: `true`.
     */
    panelForcedLight: boolean;
    /**
     * Fade-in d'ingresso pagina risolto (classe `.page-fade` sull'host, via `PageBaseComponent`).
     * Default: `true`. Fa da GATE come showNav/showFooter: se `false` nessuna pagina può riattivarlo.
     * Si somma alla crossfade del router (`withViewTransitions`); azzerato da `prefers-reduced-motion`.
     */
    pageFade: boolean;
    /** Pagina a cui reindirizzare l'utente se non autenticato (se null o non impostata fa redirect a /error/401).
     *  Risolta dallo slot d'ingresso `loginPage` (PageType nudo o `{ page, showInHeader }`); la visibilità
     *  in navbar è in `showLoginInHeader`. La pagina è `noindex` per default (fuori sitemap + `X-Robots-Tag`),
     *  salvo `otherSEO.noindex` esplicito. */
    loginPage?: PageType | null;
    /** Pagina "home" usata dal navbar per brand/logo. Se non valorizzata, il brand non è un link. */
    homePage?: PageType | null;
    /** Pagine legali dichiarate dal figlio (privacy/termini/note legali/accessibilità/altro),
     *  tutte trattate allo stesso modo. Vedi {@link LegalPageSpec}. */
    legalPages: readonly LegalPageSpec[];
    /** `PageType` della Cookie Policy fra le voci di `legalPages`, o `null` se assente/non
     *  dichiarata. Unico riferimento "con ruolo": referenziato dal cookie-banner e dal controllo
     *  obbligatorio (sito con cookie ⇒ deve avere una Cookie Policy). */
    cookiePolicy: PageType | null;
    /** Cache in-process (TTL, `SITEMAP_CACHE_TTL_MS`) dell'endpoint `/sitemap.xml` per le pagine
     *  con `dynamicParams`. Default: `true`. Vive qui (non in una env var soltanto) perché letto
     *  sia da Node sia potenzialmente da Angular, stesso `ContestoSito.config`. */
    dynamicSitemapCache: boolean;
}

// Identità ed estetica (descrizione, tema, smoke) vivono in global-settings.json → site (via
// environment.ts). I flag di comportamento (shell, isWebApp, onlyPlainImage) stanno in site.ts;
// i default li applica buildSite.

// ======================================================
// MODELLI DELLE PAGINE
// ======================================================

/**
 * Proprietà comuni a tutte le tipologie di pagina — dichiarate nel file di area
 * (`pages/*.pages.ts`), non in `site.ts`, che le assembla soltanto.
 *
 * Nota:
 * `path` esiste nel modello base perché serve sia alle pagine padre
 * sia alle pagine foglia interne.
 * Le pagine esterne lo rimuovono esplicitamente con `Omit`.
 */
type BasePageInput = {
    /**
     * Segmento di path relativo della pagina interna.
     *
     * - **stringa** → stesso segmento sotto ogni prefisso lingua (`/en/chi-siamo`, non tradotto) —
     *   il default, per chi non ha bisogno di URL localizzati.
     * - **oggetto** `{ tagLingua: segmento }` → un segmento diverso per lingua (`{ it: 'chi-siamo',
     *   en: 'about-us' }` → `/chi-siamo` e `/en/about-us`). Una lingua del sito senza una propria
     *   chiave ricade sul segmento della lingua di default (mai un path assente).
     */
    path: string | Partial<Record<string, string>>;
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
 * Pagina contenitore — dichiarata nel file di area (`pages/*.pages.ts`).
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
     * Discriminante opzionale: puo' essere omesso perche'
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
 * Pagina interna reale — dichiarata nel file di area (`pages/*.pages.ts`).
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
         * Mostra o nasconde l'effetto smoke SOLO su questa pagina, in modo indipendente dal pannello.
         * Subordinato al gate globale `site.smoke.enable` (se off, nessuna pagina può accenderlo).
         * Default (assente): smoke dove c'è pannello e non è full-bleed.
         * `true` lo forza anche su pagine senza pannello (es. una home senza pannello); `false` lo spegne. */
        showSmoke?: boolean;
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
         * Esclude la pagina dall'indicizzazione. Default automatico: `false` — **tranne** la
         * pagina puntata dallo slot `loginPage`, che l'Engine porta a `true` di default (un login
         * non si indicizza né si pubblicizza; dichiararlo qui a `false` esplicito ripristina
         * l'indicizzazione, es. sito con registrazione aperta).
         * Come per `requiresAuth`, l'Engine la marca a runtime con `X-Robots-Tag: noindex,
         * nofollow` (header autoritativo, vale anche per chi ignora il meta) e la esclude dalla
         * sitemap. A differenza di `requiresAuth` NON forza il client-render: la pagina resta
         * pubblica e SSR, semplicemente non indicizzabile (es. landing duplicate, thank-you).
         */
        noindex?: boolean;
    };

    /**
     * Catalogo runtime dei valori per i `:segmenti` parametrici del `path` (es. `/prodotti/:slug`,
     * o multi-segmento `/classifica/:categoria/detail/:tipo`), recuperato da un'API — non
     * enumerabile a build time (`hasUnresolvedPathParam` esclude comunque la rotta da
     * sitemap.xml/llms.txt statici). Usato dall'endpoint di sitemap dinamica per espandere la
     * rotta in URL concreti — vedi {@link flattenDynamicParams}.
     *
     * Un path con un solo `:param` usa solo nodi foglia. Con più `:segmenti` usa la gerarchia
     * `children` per associare ogni valore solo al segmento successivo a cui appartiene davvero —
     * niente prodotto cartesiano tra elenchi indipendenti (eviterebbe combinazioni inesistenti,
     * es. una categoria "film" abbinata a un tipo che esiste solo per "serie"). Per un segmento
     * statico con poche opzioni note a priori, spesso conviene una pagina sorella letterale invece
     * di un `:param` qui: resta nel sitemap statico gratis.
     */
    dynamicParams?: (ctx: DynamicParamsContext) => Promise<SlugNode[]>;

    /** Carica il contenuto della pagina (chiamato da ContentResolver): la pagina porta la propria
     *  logica di fetch invece di un case nel resolver generico. `inject()` va chiamato PRIMA di
     *  ogni await — eseguito in injection context valido via `runInInjectionContext` (stesso
     *  motivo del ResolveFn in routing.ts). */
    contentLoader?: ContentLoader;

    /** Non consentito per una pagina interna */
    externalUrl?: never;
};

/**
 * Pagina esterna — dichiarata nel file di area (`pages/*.pages.ts`).
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
     * Discriminante opzionale: puo' essere omesso perche'
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
                showSmoke: layout?.showSmoke,
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

// Il builder di navigazione (NavItemOptions/NavSectionBuilder/addPage/addLink/addGroup) vive in
// `shell-nav.ts`: la navigazione è dato, risolto a runtime — vedi `ShellNavResolver`.

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
    /** Mostra il pannello contenuti (`.content-panel`, il box con shadow/rounded che avvolge le
     *  pagine non full-bleed). Default: true. Gate come showNav/showFooter: se `false` nessuna
     *  pagina può riattivarlo col proprio `layout.showPanel: true` — un sito che non vuole mai il
     *  pannello lo spegne qui una volta sola, invece che pagina per pagina. */
    showPanel?: boolean;
    /** Fissa la navbar in alto allo scroll. Default: false. */
    fixedTopHeader?: boolean;
    /** Mostra la favicon accanto al nome nella navbar-brand. Default: true. */
    showBrandIconInHeader?: boolean;
    /** Mostra il campanellino delle notifiche realtime, con storico. Default: false (opt-in):
     *  attivalo solo se il sito spinge davvero notizie, così non mostri un'icona mai usata
     *  né apri una connessione SSE inutile. */
    showNotifications?: boolean;
    /** Pannello contenuti sempre chiaro, indipendentemente dal tema OS. Default: true. */
    panelForcedLight?: boolean;
    /** Fade-in d'ingresso pagina (`.page-fade` via PageBaseComponent). Default: true. Gate come
     *  showNav: il globale off vince, la pagina spegne solo col proprio `layout.pageFade: false`. */
    pageFade?: boolean;
}

/**
 * Slot `loginPage` in forma estesa: la pagina di login **più** se esporla in navbar.
 * `showInHeader` sta qui, non nello `shell`, perché non è una scelta grafica come `showNav`:
 * cambia la *natura* del login — nascosto = login per addetti che conoscono l'URL, esposto =
 * login per tutti — ed è privo di senso senza una pagina di login. Default `false`: configurare
 * `loginPage` serve prima di tutto al redirect delle pagine `requiresAuth`, mostrarlo è opt-in.
 */
export interface LoginPageConfig {
    /** La pagina di login (target del redirect auth e, se `showInHeader`, del link in navbar). */
    page: PageType;
    /** Espone il link di login in navbar. Default `false` (login "di servizio"); il logout, da
     *  loggato, compare comunque. Un sito a registrazione aperta lo mette a `true`. */
    showInHeader?: boolean;
}

/**
 * Struttura e comportamento del sito passati a `buildSite`. Identità ed estetica
 * (nome, versione, lingue, descrizione, tema, smoke) stanno in global-settings.json.
 */
export interface SiteDefinition {
    /** Pagina a cui reindirizzare l'utente non autenticato (se null/assente → /error/401).
     *  `PageType` nudo = login solo per il redirect, **fuori** dall'header e `noindex`; per esporlo
     *  in navbar usa la forma `{ page, showInHeader: true }` (vedi {@link LoginPageConfig}). */
    loginPage?: PageType | LoginPageConfig | null;
    /** Pagina "home" usata dal navbar per brand/logo. Se non valorizzata, il brand non è un link. */
    homePage?: PageType | null;
    /** Pagine legali del sito (privacy, termini, note legali, accessibilità, o qualunque altra
     *  policy di progetto): un elemento per pagina, tutte con lo stesso trattamento automatico
     *  (rotta `policy/*`, markdown, footer). Omessa/vuota → nessuna pagina legale creata.
     *  Vedi {@link LegalPageSpec} e {@link STANDARD_LEGAL_PAGES} per i default delle 5 standard. */
    legalPages?: readonly LegalPageSpec[];
    /** `PageType` della Cookie Policy fra le voci di `legalPages` (se presente). Va dichiarato a
     *  parte perché è l'unica pagina legale con un ruolo a runtime (link dal cookie-banner,
     *  obbligatoria se il sito usa cookie) — ogni altra voce di `legalPages` è testo generico. */
    cookiePolicy?: PageType | null;
    /** Comportamento della shell (navbar/footer/header/pannello). Default sensati per ogni flag omesso. */
    shell?: SiteShellConfig;
    /** Abilita le funzionalità PWA (Service Worker, aggiornamenti, install offline). Default:
     *  `false` (opt-in) — attivala solo per un sito che vuole davvero essere installabile. */
    isWebApp?: boolean;
    /**
     * Cache in-process (TTL, `SITEMAP_CACHE_TTL_MS`) dell'endpoint `/sitemap.xml` per le pagine
     * con `dynamicParams`. Default: `true` — disattivala solo se serve sempre il dato più fresco
     * (costo: una chiamata a `dynamicParams`/backend per ogni richiesta, non solo a TTL scaduto).
     */
    dynamicSitemapCache?: boolean;
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
    /** `true` se questa ISTANZA di pagina va esclusa dall'indicizzazione: valore di base dal flag
     *  statico (`otherSEO.noindex`), un `contentLoader` può alzarlo per una singola richiesta (es.
     *  una vista "recuperata" via slug/query di un contenuto altrimenti generico — la pagina resta
     *  SSR/pubblica, solo non indicizzabile). Reso come `<meta name="robots">` da PageMetaService:
     *  complementare, non sostitutivo, dell'`X-Robots-Tag` statico via header (vedi
     *  `ServerRenderEntry.noindex` in server.ts) — quello resta l'unico segnale per le pagine
     *  protette (shell client-rendered, niente body SSR dove mettere un meta tag utile). */
    noindex?: boolean;
};

export interface BuiltSite {
    /** Configurazione finale del sito, gia normalizzata. */
    config: SiteConfig;
    /** Pagine interne esponibili ad Angular Router (albero canonico, non prefissato: la
     *  moltiplicazione per lingua avviene in `routing.ts`, non qui). */
    pages: InternalSitePage[];
    /**
     * Link alle pagine legali configurate (`config.legalPages`), per lingua, in ordine fisso
     * (privacy, cookie, tos, legal, accessibility) — pensati per la fascia "small prints" a
     * chiusura del footer (pattern PA/Designers Italia), non per il menu footer generico (quello
     * vive in `ShellNavResolver.footer`, vedi shell-nav.ts). Auto-derivati dagli slot: nessuna
     * dichiarazione manuale nel figlio, e uno slot rimosso (pagina cancellata da `pages`)
     * sparisce da qui da solo, senza bisogno di toccare `site.ts`.
     */
    getLegalFooterLinks: (lang?: string) => NavLink[];
    /** Piano di rendering server-only derivato dalle pagine foglia interne valide, per ogni lingua. */
    serverRenderEntries: ServerRenderEntry[];
    /**
     * Restituisce il path associato a un `PageType` nella lingua data (default: lingua di
     * default del sito), oppure `null` se la pagina è disabilitata o non registrata.
     * Controlla sempre il valore prima di usarlo in un link — `null` non finisce mai
     * silenziosamente in un href.
     * @param type Tipo pagina da risolvere.
     * @param lang Lingua del path desiderato. Default: lingua di default del sito.
     */
    getPath: (type: PageType, lang?: string) => string | null;
    /**
     * Restituisce i metadati completi (title, path, description, ogImage) associati
     * a un PageType nella lingua data. Usato dal ContentResolver per impostare i meta tag SEO.
     * Ritorna `null` se la pagina non è registrata o è disabilitata.
     */
    getPageInfo: (type: PageType, lang?: string) => PageInfo | null;
    /**
     * Se `type` è uno dei `PageType` valorizzati negli slot legali (`config.legalPages`),
     * restituisce lo slug del relativo Markdown (`assets/legal/<slug>.<lang>.md`);
     * altrimenti `null`. Permette al ContentResolver di gestire tutte le pagine legali
     * con un solo controllo generico, senza un `case` per ogni `PageType` legale.
     */
    getLegalSlug: (type: PageType) => string | null;
    /** Restituisce le voci della sitemap (path + metadati + lingua), una per pagina per lingua. */
    getSitemapEntries: () => SitemapEntry[];
    /**
     * Restituisce i percorsi pubblici SSR per gli audit live. Include le pagine `noindex`
     * (ad esempio le policy legali), ma non rotte protette o parametriche senza URL concreta.
     */
    getAuditPaths: () => string[];
    /** Restituisce le pagine con `dynamicParams` dichiarato — una entry per PAGINA (non per
     *  lingua): il catalogo di slug è dato di dominio, non cambia per lingua, solo il template
     *  dell'URL cambia (`pathByLang`). Consumata dall'endpoint di sitemap dinamica. */
    getDynamicPages: () => DynamicPageEntry[];
    /** Restituisce il `contentLoader` dichiarato dalla pagina, o `null` se non ne ha uno (es. pagine
     *  legali, gestite genericamente via `getLegalSlug`). Consumata da ContentResolver. */
    getContentLoader: (type: PageType) => ContentLoader | null;
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
    /** Lingua di questa variante dell'URL (es. "it", "en"). */
    lang: string;
    /** Identità stabile della pagina logica attraverso le lingue — chiave di raggruppamento per
     *  l'hreflang incrociato in sitemap (generate-statics.ts), non il path: con URL localizzati
     *  due varianti-lingua della stessa pagina possono avere segmenti letteralmente diversi. */
    pageType: PageType;
    /**
     * Data (YYYY-MM-DD) di ultima modifica DELL'ENTITÀ, propagata da `SlugNode.lastModified` —
     * solo le entry dinamiche la valorizzano. Assente per ogni entry statica, o `null` per un
     * nodo dinamico senza data: in entrambi i casi `<lastmod>` è OMESSO, mai un fallback sulla
     * data generica del sito (vedi `services/sitemap-xml.ts`).
     */
    lastmod?: string | null;
    /**
     * Chiave di raggruppamento hreflang AGGIUNTIVA rispetto a `pageType` — serve quando un solo
     * `pageType` produce PIÙ entità concrete (es. le N pagine di una rotta parametrica), altrimenti
     * le lingue di entità diverse si mischierebbero nello stesso blocco hreflang. Assente → si
     * raggruppa per solo `pageType`, sufficiente per le pagine statiche (un `pageType` = una
     * pagina). Per le dinamiche, una rappresentazione stabile dei parametri (es.
     * `JSON.stringify(params)`) identifica la stessa entità attraverso le lingue.
     */
    groupKey?: string;
};

// ======================================================
// MODELLI INTERNI DELLA NAVIGAZIONE
// ======================================================

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

/**
 * Risolve `BasePageInput.path` (letterale o per-lingua) sulla lingua richiesta. A differenza di
 * `pickLocaleText` (testo: "qualcosa è meglio di niente", fallback fino al primo valore disponibile)
 * qui il fallback si ferma alla lingua di default: un path è un'identità di rotta, non prosa — se
 * manca anche lì è una svista di chi ha scritto il sito, da segnalare, non da coprire pescando a
 * caso tra le lingue configurate (produrrebbe un URL diverso a ogni riordino delle chiavi).
 */
export function resolvePagePath(path: string | Partial<Record<string, string>>, lang: string, defaultLang: string): string {
    if (typeof path === 'string') return path;
    const resolved = path[lang] ?? path[defaultLang];
    if (resolved === undefined && isDevMode()) {
        console.warn(`[SiteBuilder] path per-lingua senza segmento per "${lang}" né fallback su "${defaultLang}": ${JSON.stringify(path)} — path vuoto, la pagina rischia di collassare sul genitore.`);
    }
    return resolved ?? '';
}

/**
 * true se il path (già risolto sulla lingua) ha un segmento `:xxx` — rotta parametrica, il cui
 * catalogo arriva da un'API a runtime e non è enumerabile a build time. Usata per ESCLUDERE
 * queste pagine da sitemap/llms.txt: un `<loc>` con `:xxx` letterale non è un URL vero, sarebbe
 * un link rotto per qualunque crawler che lo seguisse.
 */
function hasUnresolvedPathParam(path: string): boolean {
    return path.split('/').some(segment => segment.startsWith(':'));
}

/**
 * Prefisso di path per una lingua — l'UNICA regola da cui derivano tutti gli URL localizzati:
 * lingua default → stringa vuota (URL non prefissato, es. `/pagina`)
 * lingua aggiuntiva → `/lang` (es. `/en/pagina`)
 * Usata sia qui sotto (`processPages`, path assoluti) sia in `routing.ts` (`buildRoutes`, route
 * annidate) — stessa regola, applicata in due modi diversi per due strutture dati diverse.
 */
export function resolveLangPrefix(lang: string, defaultLang: string): string {
    return lang === defaultLang ? '' : `/${lang}`;
}

/**
 * Inverso di `resolveLangPrefix`: da un path (es. `Router.url`) risale alla lingua. Serve SOLO
 * dove non esiste un `route.data.lang` da leggere — oggi solo `ErrorComponent`, perché il wildcard
 * `**`/`error/:errorCode` sono registrati una volta sola (non una copia per lingua come le pagine
 * vere), quindi non hanno un `data.lang` proprio: la lingua va dedotta dall'URL a runtime.
 */
export function detectLangFromPath(path: string, availableLanguages: readonly string[], defaultLang: string): string {
    const firstSegment = path.split('/').filter(Boolean)[0]; // es. "/en/pagina" → "en"; "/pagina" → "pagina".
    return firstSegment && availableLanguages.includes(firstSegment) ? firstSegment : defaultLang; // segmento non è un codice lingua noto → default.
}

/**
 * Chiave `pageMap` per la coppia (PageType, lingua). Lingua default → `PageType` nudo, ESATTAMENTE
 * come oggi in un sito mono-lingua: qualunque lookup diretto già esistente (`validatePageRefs`,
 * `assertSlotResolved`) continua a funzionare senza modifiche. Lingua aggiuntiva → chiave composita
 * `"type::lang"`, per non collidere con la entry della lingua default nella stessa Map.
 */
function pageMapKey(type: PageType, lang: string, defaultLang: string): string {
    return lang === defaultLang ? type : `${type}::${lang}`; // es. pageMapKey('app.home','en','it') → 'app.home::en'.
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
 * Scioglie lo slot `loginPage` (PageType nudo o {@link LoginPageConfig}) nella coppia risolta
 * pagina + visibilità in navbar. `showInHeader` default `false`: un `PageType` nudo significa
 * "login per il redirect auth, non in navbar" — l'esposizione è opt-in via forma estesa.
 * Il discriminante è il tipo: un `PageType` è una stringa, la forma estesa un oggetto.
 */
function normalizeLoginPage(input: SiteDefinition['loginPage']): { page: PageType | null; showInHeader: boolean } {
    if (input == null) return { page: null, showInHeader: false };
    if (typeof input === 'object') return { page: input.page, showInHeader: input.showInHeader ?? false };
    return { page: input, showInHeader: false };
}

// #RGB o #RRGGBB, stesso pattern di global-settings.schema.json. Quello schema però vale solo
// per chi edita global-settings.json in un editor che lo legge (VS Code) — chiunque altro (un
// valore incollato con canale alpha da un design tool, un editor diverso, un valore generato)
// arriverebbe altrimenti a ThemeService.normalizeHex(), che tronca qualunque stringa a 6 cifre
// esadecimali in silenzio, nessun avviso. Validato qui una sola volta, a monte di ogni consumer.
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Valida i campi colore opzionali di `site` (global-settings.json): un valore fuori da
 *  #RGB/#RRGGBB blocca il build con un errore esplicito invece di essere troncato in silenzio. */
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

/**
 * SiteConfig finale: identità ed estetica da `environment.ts` (global-settings.json),
 * struttura e comportamento da `site.ts` (`definition`). I default li applica qui.
 */
function buildFinalConfig(definition: SiteDefinition): SiteConfig {
    const cfg = environment.config;
    validateColorFields(cfg);
    const shell = definition.shell ?? {};
    const login = normalizeLoginPage(definition.loginPage);
    return {
        appName: environment.appName,
        version: normalizeVersion(environment.version) || '1.0.0',
        description: cfg.description ?? {},
        colorTema: cfg.colorTema ?? '#888888',
        colorSecondary: cfg.colorSecondary,
        colorBackground: cfg.colorBackground,
        colorText: cfg.colorText,
        colorInfo: cfg.colorInfo,
        showFooter: shell.showFooter ?? true,
        showNav: shell.showNav ?? true,
        showPanel: shell.showPanel ?? true,
        fixedTopHeader: shell.fixedTopHeader ?? false,
        showBrandIconInHeader: shell.showBrandIconInHeader ?? true,
        showLoginInHeader: login.showInHeader,
        showNotifications: shell.showNotifications ?? false,
        isWebApp: definition.isWebApp ?? false,
        onlyPlainImage: definition.onlyPlainImage ?? false,
        dynamicSitemapCache: definition.dynamicSitemapCache ?? true,
        panelForcedLight: shell.panelForcedLight ?? true,
        pageFade: shell.pageFade ?? true,
        smoke: { ...DEFAULT_SMOKE, ...(cfg.smoke ?? {}) },
        loginPage: login.page,
        homePage: definition.homePage ?? null,
        legalPages: definition.legalPages ?? [],
        cookiePolicy: definition.cookiePolicy ?? null,
    };
}

/**
 * Percorre l'albero pagine e popola `pageMap` (PageType[+lingua] → info) e `serverRenderEntries`
 * (path → render mode); ritorna le voci sitemap. Esclude le pagine disabilitate, registra
 * le esterne solo in mappa ed esclude dalla sitemap quelle protette (`requiresAuth`).
 *
 * Chiamata una volta per ogni lingua disponibile (vedi `buildSite`): l'albero dichiarato è
 * lo stesso, cambia solo `lang` e quindi il prefisso di path e la chiave `pageMap`
 * (`pageMapKey`) — così `pageMap` accumula, alla fine di tutte le chiamate, tutte le varianti
 * lingua di ogni pagina.
 *
 * La pagina puntata dallo slot `loginPage` è `noindex` per default (l'Engine sa che è il
 * login: non ha senso indicizzarlo su un sito a pochi account/admin, e non va pubblicizzato).
 * Resta un default, non un vincolo: un figlio che vuole indicizzarla — es. un sito con
 * registrazione aperta — dichiara `otherSEO: { noindex: false }` esplicito e vince (tri-stato:
 * non dichiarato ⇒ default dell'Engine; dichiarato ⇒ comanda il figlio).
 *
 * @throws Se due pagine condividono lo stesso PageType (nella stessa lingua) o lo stesso path interno.
 */
function processPages(
    pages: SitePage[],
    pageMap: Map<string, PageInfo>,
    serverRenderEntries: ServerRenderEntry[],
    dynamicPages: Map<PageType, DynamicPageEntry>,
    contentLoaders: Map<PageType, ContentLoader>,
    auditPaths: string[],
    loginPageType: PageType | null,
    lang: string,        // lingua di QUESTA chiamata — buildSite() chiama processPages() una volta per lingua.
    defaultLang: string, // serve a pageMapKey()/resolveLangPrefix() per sapere quando NON prefissare/comporre.
): SitemapEntry[] {
    const seenInternalPaths = new Set<string>(); // dedup path PER QUESTA chiamata: /en/pagina e /pagina sono stringhe diverse, niente da condividere fra lingue.

    const walk = (nodes: SitePage[], parent: string): SitemapEntry[] =>
        nodes.flatMap((page) => {
            if (!page.enabled) return []; // pagina disabilitata: fuori da pageMap/sitemap/route, in ogni lingua.

            if (isExternalPage(page)) {
                const key = pageMapKey(page.pageType, lang, defaultLang); // 'app.contatti' (it) o 'app.contatti::en'.
                if (pageMap.has(key)) {
                    throw new Error(`[SiteBuilder] PageType duplicato rilevato: "${String(page.pageType)}" (lingua "${lang}"). Ogni pagina deve avere un pageType unico.`);
                }
                pageMap.set(key, { title: page.title, path: page.externalUrl, isExternal: true }); // link esterno: stesso URL in ogni lingua, solo il title cambia (chiave i18n).
                return [];
            }

            // Path completo: parent (già prefissato dalla lingua, vedi chiamata a walk() in fondo alla
            // funzione) + segmento della pagina (risolto sulla lingua corrente — letterale o per-lingua,
            // vedi resolvePagePath), con gli slash doppi collassati in uno solo.
            const resolvedSegment = resolvePagePath(page.path, lang, defaultLang);
            const fullPath = `/${[parent, resolvedSegment].filter(Boolean).join('/')}`.replace(/\/+/g, '/');

            if (isParentPage(page)) return walk(page.children, fullPath); // contenitore: nessuna entry propria, solo ricorsione sui figli.

            // Foglia interna (una pagina vera).
            if (seenInternalPaths.has(fullPath)) {
                throw new Error(`[SiteBuilder] Path interno duplicato rilevato: "${fullPath}".`);
            }
            const key = pageMapKey(page.pageType, lang, defaultLang);
            if (pageMap.has(key)) {
                throw new Error(`[SiteBuilder] PageType duplicato rilevato: "${String(page.pageType)}" (lingua "${lang}"). Ogni pagina deve avere un pageType unico.`);
            }
            seenInternalPaths.add(fullPath);
            // La pagina di login (slot `loginPage`) è noindex per default; qualunque altra pagina
            // segue il proprio flag (undefined ⇒ false). Un `noindex: false` esplicito sul login vince.
            const noindex = page.pageType === loginPageType ? (page.noindex ?? true) : !!page.noindex;
            pageMap.set(key, {
                title: page.title,             // chiave i18n del titolo — NON tradotta qui, solo salvata.
                path: fullPath,                 // il path GIÀ nella lingua corretta (prefisso incluso).
                isExternal: false,
                description: page.description,
                ogImage: page.ogImage,
                ogType: page.ogType ?? 'website',
                structuredData: page.structuredData,
                noindex,                        // valore statico di base: un contentLoader può alzarlo per una singola richiesta (vedi PageInfo.noindex).
            });
            // Vale per QUALSIASI foglia, non solo le rotte parametriche sotto: una pagina normale
            // (es. una lista) può avere un `content` senza avere `dynamicParams`.
            if (page.contentLoader) contentLoaders.set(page.pageType, page.contentLoader);

            // requiresAuth → 'client' (i bot non loggano, l'SSR è inutile); altrimenti renderMode esplicito o 'server'.
            // noindex NON forza il client-render: la pagina resta SSR/pubblica, solo non indicizzabile.
            // Una entry per QUESTA variante-lingua: con N lingue, N entry per la stessa pagina logica.
            const renderMode = page.requiresAuth ? 'client' : (page.renderMode ?? 'server');
            serverRenderEntries.push({ path: fullPath, renderMode, requiresAuth: !!page.requiresAuth, noindex });

            // Endpoint pubblico raggiungibile da auditare live in CI (Pa11y/Lighthouse, vedi
            // getAuditPaths()) — non necessariamente in sitemap: una policy noindex resta pubblica
            // e va verificata comunque, solo esclusa dai motori di ricerca (scopo distinto dalla
            // sitemap/SEO, che invece copre tutte le lingue per l'hreflang). I path parametrici non
            // hanno ancora un URL visitabile, quindi restano fuori. Solo defaultLang: le
            // varianti-lingua di una stessa pagina condividono template, markup e componenti — cambia
            // solo il testo tradotto — quindi un audit di accessibilità o performance darebbe lo
            // stesso esito in ogni lingua; includerle tutte moltiplicherebbe solo il tempo di CI
            // (N pagine × M lingue) senza aggiungere segnale.
            const isLiveAuditEndpoint = !page.requiresAuth && renderMode === 'server' && !hasUnresolvedPathParam(fullPath) && lang === defaultLang;
            if (isLiveAuditEndpoint) {
                auditPaths.push(fullPath);
            }

            // Fuori dalla sitemap le pagine protette, quelle noindex e le rotte parametriche (un
            // `<loc>` con `:xxx` letterale non sarebbe un URL vero — vedi hasUnresolvedPathParam).
            // `lang` serve a raggruppare le varianti-lingua per l'hreflang; `pageType` è la chiave
            // di quel raggruppamento (non il path, che con URL localizzati può differire per lingua).
            if (page.requiresAuth || noindex) return [];
            if (hasUnresolvedPathParam(fullPath)) {
                // Rotta parametrica, mai enumerabile a build time: con `dynamicParams` la
                // raccogliamo per la sitemap dinamica, una entry PER PAGINA non per lingua
                // (il catalogo di slug non cambia per lingua, solo il template dell'URL).
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
                    console.warn(`[SiteBuilder] "${fullPath}" è una rotta parametrica: esclusa da sitemap/llms.txt (il catalogo concreto arriva da un'API a runtime, non enumerabile a build time). Aggiungi \`dynamicParams\` alla pagina per includerla nella sitemap dinamica.`);
                }
                return [];
            }
            return [{ path: fullPath, description: page.description, lang, pageType: page.pageType }];
        });

    // Punto d'ingresso del cammino: parte già dal prefisso della lingua corrente (stringa vuota per
    // il default, "/en" per le altre) — da qui in poi fullPath eredita il prefisso a cascata.
    return walk(pages, resolveLangPrefix(lang, defaultLang));
}

/** Lancia se uno slot valorizzato punta a un `PageType` non registrato — mai dichiarato in `pages`,
 *  oppure disabilitato via `enabled: false`. Fail-fast coerente con PageType/path duplicati e cookie
 *  policy mancante: uno slot rotto non deve degradare in silenzio (men che meno muto in produzione,
 *  dove un `console.warn` non si vedrebbe). Un `loginPage` azzerato, ad esempio, manderebbe ogni
 *  pagina `requiresAuth` a `/error/401` col login irraggiungibile — meglio fermare build/avvio. */
function assertSlotResolved(slotName: string, type: PageType, pageMap: Map<string, PageInfo>): void {
    if (!pageMap.has(type)) {
        throw new Error(
            `[SiteBuilder] Slot "${slotName}" punta a "${String(type)}", non registrato: ` +
            `dichiaralo in "pages" (e verifica che non sia "enabled: false"), oppure rimuovi lo slot.`
        );
    }
}

/** Valida gli slot di ruolo pagina (`loginPage`, `homePage`, `cookiePolicy`, `legalPages`): ognuno,
 *  se valorizzato, deve puntare a una pagina realmente registrata. Lancia al primo slot rotto.
 *  `cookiePolicy` è un puntatore SEPARATO da `legalPages` (può puntare a una delle sue voci, ma è
 *  un campo a sé — vedi site.ts) ed è quindi controllato qui esplicitamente: senza questo, rimuovere
 *  la pagina Cookie Policy da `legalPages` senza aggiornare/svuotare `cookiePolicy` passerebbe il
 *  build senza errori, lasciando il banner cookie con un link morto (`getPath` torna `null` in
 *  silenzio) — l'unico slot che degraderebbe così invece di fermare subito il build. */
function validatePageRefs(config: SiteConfig, legalPages: readonly LegalPageSpec[], pageMap: Map<string, PageInfo>): void {
    if (config.loginPage) assertSlotResolved('loginPage', config.loginPage, pageMap);
    if (config.homePage) assertSlotResolved('homePage', config.homePage, pageMap);
    if (config.cookiePolicy) assertSlotResolved('cookiePolicy', config.cookiePolicy, pageMap);
    for (const spec of legalPages) {
        assertSlotResolved(`legalPages["${spec.path}"]`, spec.pageType, pageMap);
    }
}

/**
 * Nodo di un catalogo di slug dinamici per una rotta parametrica (vedi `LeafPageInput.dynamicParams`):
 * un valore accettato per il `:segmento` alla sua profondità, con `children` opzionali per il
 * segmento successivo (assenti sul caso più comune, un solo `:param`). La gerarchia stessa evita
 * combinazioni ambigue: un figlio esiste solo sotto il genitore a cui appartiene davvero.
 */
export interface SlugNode {
    /** Valore concreto del segmento a questa profondità (es. lo slug di una categoria, o dell'elemento finale). */
    slug: string;
    /** Nodi del `:segmento` successivo della stessa rotta, se ce n'è un altro sotto questo. */
    children?: SlugNode[];
    /**
     * Data (YYYY-MM-DD) di ultima modifica DELL'ENTITÀ (dato del backend, non del sito) — ha senso
     * solo sul nodo FOGLIA, quello che identifica l'entità popolata in pagina (vedi
     * `flattenDynamicParams`); su un nodo intermedio è ignorata. Assente → `<lastmod>` OMESSO per
     * quella URL, mai un fallback sulla data generica del sito.
     */
    lastModified?: string;
}

/** Contesto passato a `LeafPageInput.dynamicParams` per recuperare il catalogo dal backend dell'app. */
export interface DynamicParamsContext {
    /** Chiama il backend dell'app (stesso host/baseUrl usato a runtime) e ne restituisce il JSON. */
    fetchBackendJson: <T>(path: string) => Promise<T>;
}

/** Contesto passato a `LeafPageInput.contentLoader`: lingua risolta e i valori di tutti i
 *  `:segmenti` della rotta corrente, come chiavi di `ActivatedRoute.paramMap` — una rotta
 *  `/classifica/:categoria/detail/:tipo` porta entrambe le chiavi. Vuoto (`{}`) sulle pagine
 *  senza segmenti parametrici. */
export interface ContentLoaderContext {
    lang: string;
    params: Record<string, string>;
}

/** Esito di `LeafPageInput.contentLoader`. */
export interface ContentLoaderResult {
    content: unknown;
    /** Fuso sopra il `PageInfo` statico di site.ts per QUESTA richiesta (es. titolo/descrizione
     *  presi dal contenuto appena caricato, come il nome di un articolo o di una generazione). */
    info?: Partial<PageInfo>;
    structuredData?: StructuredDataInput | null;
}

export type ContentLoader = (ctx: ContentLoaderContext) => Promise<ContentLoaderResult>;

/**
 * Una pagina con `dynamicParams`, raccolta da `processPages()` — una entry per PAGINA non per
 * lingua: `dynamicParams` va invocato una sola volta, `pathByLang` porta il template già risolto
 * per ogni lingua (`:param` ancora letterale), pronto per `flattenDynamicParams`/`applyPathParams`.
 */
export interface DynamicPageEntry {
    pageType: PageType;
    description?: string;
    pathByLang: Record<string, string>;
    dynamicParams: (ctx: DynamicParamsContext) => Promise<SlugNode[]>;
}

/** Risultato di `flattenDynamicParams` per un percorso radice→foglia dell'albero `SlugNode`:
 *  i valori concreti dei `:segmenti` PIÙ la data di modifica dell'entità, se il nodo foglia
 *  (quello che identifica l'entità popolata — vedi `SlugNode.lastModified`) la porta. */
export interface FlattenedDynamicParams {
    params: Record<string, string>;
    /** `SlugNode.lastModified` del nodo foglia di questo ramo — `undefined` se il nodo non
     *  la porta (il chiamante lo traduce in `SitemapEntry.lastmod: null`, mai un fallback
     *  silenzioso sulla data generica del sito). */
    lastModified?: string;
}

/** Tetto di sicurezza su UNA chiamata a `flattenDynamicParams`: un provider `dynamicParams` che
 *  degenera non deve far crescere la memoria senza limite, qui DURANTE l'espansione (diverso dal
 *  warning sui limiti di protocollo in `services/sitemap-xml.ts`, che vede solo l'XML finale).
 *  Stesso valore per coincidenza, non accoppiamento: questa funzione non sa di sitemap. */
const MAX_FLATTENED_ENTRIES = 50_000;

/**
 * Espande l'albero di {@link SlugNode} in combinazioni concrete di parametri (una per percorso
 * radice→foglia), associando la profondità di ogni nodo al `:segmento` di `path` nello stesso
 * ordine (i letterali in mezzo, es. `/detail/`, restano intatti — vedi `applyPathParams`). Un
 * ramo con profondità sbagliata viene scartato (warning in dev). Oltre
 * {@link MAX_FLATTENED_ENTRIES} combinazioni, l'espansione si ferma con un warning sempre emesso
 * (segnale operativo, non di dichiarazione).
 */
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
                // Il nodo FOGLIA (questo) identifica l'entità: è l'unico il cui `lastModified`
                // conta — quello di un nodo intermedio (es. una categoria) non produce mai una
                // entry propria, quindi non ha un `<lastmod>` a cui applicarsi.
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

/**
 * Sostituisce nel path i segmenti `:xxx` coi valori di `params` (es. `/generatori/:slug` +
 * `{ slug: 'incel' }` → `/generatori/incel`) — per collegare in menu/link una voce concreta di
 * una rotta parametrica. Un segmento senza valore resta invariato (warning in dev); chiavi senza
 * un segmento corrispondente sono ignorate.
 */
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
 * Orchestratore: assembla il `ContestoSito` dalla definizione in `site.ts`.
 * Config finale → pagine (con override legale + sezione policy iniettata) → mappa
 * PageType/sitemap/render-mode → validazione slot → navigazione risolta.
 *
 * @throws Se ci sono PageType/path duplicati, se uno slot (`loginPage`/`homePage`/`legalPages`)
 *   punta a una pagina non registrata, o se servono cookie senza Cookie Policy.
 */
export function buildSite(definition: SiteDefinition): BuiltSite {

    const finalConfig = buildFinalConfig(definition);
    const cookiesEnabled = hasCookiesConfigured(finalConfig.isWebApp);

    const ctx: SitePageContext = {
        isWebApp: finalConfig.isWebApp,
        showLoginInHeader: finalConfig.showLoginInHeader,
    };
    const declaredPages = definition.pages(ctx);

    // `finalConfig.legalPages` è già la lista completa (nessuna distinzione fra pagine "di
    // sistema" e di progetto). `managedLegalPages` esclude l'override (una pagina legale
    // dichiarata a mano dal figlio in `pages` vince sull'auto-creazione, stesso PageType);
    // `allLegalPages` resta completa per footer/validazione, dove una pagina overridden va
    // comunque mostrata/validata — l'ha creata il figlio, non l'Engine, ma esiste.
    const declaredPageTypes = collectDeclaredPageTypes(declaredPages, new Set<PageType>());
    const allLegalPages = finalConfig.legalPages;
    const managedLegalPages = filterManagedLegalPages(allLegalPages, declaredPageTypes);

    const policySection = buildPolicySection(managedLegalPages);
    const sitePages = normalizeSitePages(policySection ? [...declaredPages, policySection] : declaredPages);

    // pageMap/serverRenderEntries/sitemap accumulano le varianti di TUTTE le lingue: dichiarati UNA
    // VOLTA fuori dal loop, cosicché ogni giro di processPages() aggiunga la propria lingua alle
    // stesse strutture invece di sovrascriverle.
    const pageMap = new Map<string, PageInfo>();
    const serverRenderEntries: ServerRenderEntry[] = [];
    const dynamicPages = new Map<PageType, DynamicPageEntry>();
    const contentLoaders = new Map<PageType, ContentLoader>();
    const auditPaths: string[] = [];
    const defaultLang = environment.defaultLang; // letto una volta, riusato in tutto il resto della funzione.
    let sitemap: SitemapEntry[] = [];
    // Un giro per lingua configurata (environment.availableLanguages, da global-settings.json via
    // generate-statics.ts). Con una sola lingua: un giro solo, prefisso vuoto — comportamento
    // identico a un sito mono-lingua "classico", zero route/entry in più.
    for (const lang of environment.availableLanguages) {
        sitemap = sitemap.concat(
            // processPages POPOLA pageMap/serverRenderEntries/dynamicPages per riferimento
            // (side-effect) e RITORNA solo le voci sitemap di questa lingua — da qui il concat
            // invece di un'assegnazione.
            processPages(sitePages, pageMap, serverRenderEntries, dynamicPages, contentLoaders, auditPaths, finalConfig.loginPage ?? null, lang, defaultLang)
        );
    }

    // Slot che puntano a pagine non registrate → errore bloccante; poi la conformità cookie.
    // Controlla la sola variante default-lang: se esiste lì, esiste per costruzione in ogni lingua
    // (stesso identico albero attraversato a ogni iterazione del loop sopra).
    validatePageRefs(finalConfig, allLegalPages, pageMap);
    // `cookiePolicy` è obbligatoria SOLO se il sito usa davvero cookie (PWA o cookie di progetto):
    // senza nulla da far scegliere non c'è nulla da dichiarare, quindi un sito nato senza cookie può
    // legittimamente non averla mai. Se però il progetto la dichiara comunque (in `legalPages`, con
    // `cookiePolicy` valorizzato) pur non avendo al momento cookie attivi — es. la tiene pronta in
    // vista di un cookie futuro — la pagina resta costruita e raggiungibile, ma `footerLegalPages`
    // qui sotto la toglie dai link automatici finché non torna a servire davvero.
    if (cookiesEnabled && finalConfig.cookiePolicy == null) {
        throw new Error(
            '[SiteBuilder] Il sito usa cookie (PWA o cookie di progetto) ma ' +
            '`cookiePolicy` non è valorizzato in site.ts. La pagina Cookie Policy è ' +
            'obbligatoria: valorizza `cookiePolicy` con il PageType della relativa voce in `legalPages`.'
        );
    }

    // Fascia "small prints" del footer: se la Cookie Policy è dichiarata ma il progetto non ha
    // (più, o ancora) nulla da far scegliere (`!cookiesEnabled`), la si toglie dai link automatici —
    // altrimenti mostrerebbe una voce che dichiara solo l'esenzione tecnica, spuria in footer. La
    // pagina resta comunque raggiungibile via URL diretto: non è tolta dal routing, solo dai link.
    const footerLegalPages = cookiesEnabled
        ? allLegalPages
        : allLegalPages.filter(spec => spec.pageType !== finalConfig.cookiePolicy);

    // Stesso schema del loop sopra, ma per la fascia legale del footer: una Map<lingua, NavLink[]>.
    const legalFooterLinksByLang = new Map<string, NavLink[]>();
    for (const lang of environment.availableLanguages) {
        legalFooterLinksByLang.set(lang, resolveLegalFooterLinks(footerLegalPages, pageMap, lang, defaultLang));
    }

    return {
        config: finalConfig,
        pages: sitePages.filter(isInternalPage), // albero canonico, UNA sola volta, non prefissato: routing.ts lo moltiplica per lingua per conto suo.
        // lang omesso → defaultLang; lingua sconosciuta → ripiega comunque su defaultLang (mai `undefined`).
        getLegalFooterLinks: (lang = defaultLang) => legalFooterLinksByLang.get(lang) ?? legalFooterLinksByLang.get(defaultLang) ?? [],
        serverRenderEntries, // già con tutte le varianti-lingua dentro, grazie al loop sopra — nessun'altra moltiplicazione da fare a valle (app.config.server.ts, server.ts).
        getPath: (type: PageType, lang = defaultLang) => pageMap.get(pageMapKey(type, lang, defaultLang))?.path ?? null,
        getPageInfo: (type: PageType, lang = defaultLang) => pageMap.get(pageMapKey(type, lang, defaultLang)) ?? null,
        getLegalSlug: (type: PageType) => legalSlugFor(managedLegalPages, type),
        getSitemapEntries: () => sitemap, // già con lang per entry — generate-statics.ts la usa per raggruppare le varianti e generare hreflang.
        getAuditPaths: () => auditPaths,
        getDynamicPages: () => Array.from(dynamicPages.values()),
        getContentLoader: (type: PageType) => contentLoaders.get(type) ?? null,
    };
}
