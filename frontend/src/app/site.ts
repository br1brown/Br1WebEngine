import { buildSite } from './core/engine/siteBuilder';

export type {
    SiteConfig,
    SitePageInput,
    SmokeSettings
} from './core/engine/siteBuilder';

// ═══════════════════════════════════════════════════════════════════════
// ENUM PageType — identita' di ogni pagina
// ═══════════════════════════════════════════════════════════════════════
//
// Ogni pagina del sito DEVE avere un valore qui.
//
// Per aggiungere una pagina: aggiungi un valore all'enum, poi usalo
// nella chiamata defineSitePages sotto. Il resto (rotte, menu, sitemap)
// si aggiorna da solo.
//
// Perche' un enum e non stringhe?
// - Se rinomini un path (es. "chi-siamo" → "about"), cambi UNA riga
//   in defineSitePages. Menu, footer, link interni continuano a
//   funzionare perche' puntano a PageType.ChiSiamo, non alla stringa.
// - Se rimuovi un valore dall'enum, TypeScript ti segnala tutti i punti
//   del codice che ancora lo usano. Con le stringhe lo scopri a runtime.
//
export enum PageType {
    //IMPORTANTI
    PrivacyPolicy,
    CookiePolicy,
    TermsOfService,
    LegalNotice,
    AccessibilityStatement,
    Home,
    //PERSONALIZZABILI
    Social,
    Impostazioni,
    Login,
}

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURAZIONE MASTER DEL SITO
// ═══════════════════════════════════════════════════════════════════════
//
// Definisce la STRUTTURA del sito: opzioni globali (loginPage, homePage, legalPages,
// shell, …), le pagine (`pages`) e le voci dei menu (`headerNav` / `footerNav`).
// Identità ed estetica (nome, versione, lingue, descrizione, tema, smoke) NON stanno
// qui: vivono in global-settings.json e arrivano via environment.ts.
//
// Il risultato (ContestoSito) è usato da tutta l'app: .config, .pages, .menuNav,
// .linkFooter, .getPath(PageType.X), .getSitemapEntries().

export const ContestoSito = buildSite({

    // Pagina di login: dove mandare gli utenti non autenticati (se omessa → /error/401).
    loginPage: PageType.Login,

    // Pagina del brand/logo nel navbar.
    homePage: PageType.Home,

    // Pagine legali: mappa gli slot dell'Engine ai tuoi PageType; il builder crea le rotte
    // /policy/*. Slot omesso = pagina assente. `cookie` obbligatoria se il sito usa cookie.
    legalPages: {
        privacy: PageType.PrivacyPolicy,
        cookie: PageType.CookiePolicy,
        tos: PageType.TermsOfService,
        legal: PageType.LegalNotice,
        accessibility: PageType.AccessibilityStatement,
    },

    // Comportamento di navbar/footer/header/pannello (default applicati per ogni flag omesso).
    shell: {
        showNav: true,
        showFooter: true,
        fixedTopHeader: true,
        showBrandIconInHeader: true,
        showLoginInHeader: true,
        forcedLightPanel: true,
        pageFade: true,
    },

    isWebApp: true,        // funzionalità PWA (Service Worker, aggiornamenti, install offline)
    onlyPlainImage: false, // anteprime social con sola immagine, senza scritte/favicon

    // ── ALBERO DELLE PAGINE ───────────────────────────────────────────────
    //
    // Tre tipi di pagina. Non serve specificare quale, si capisce da solo:
    //
    //   Ha "component"?   → pagina interna (rotta Angular, lazy loaded)
    //   Ha "children"?    → gruppo di sotto-pagine (es. /policy/privacy)
    //   Ha "externalUrl"? → link esterno (appare nei menu, non genera rotte)
    //
    // Campi comuni:
    //   path         → segmento URL (es. "chi-siamo" → /chi-siamo)
    //   title        → chiave di traduzione per il titolo pagina
    //   enabled      → false = esclusa da rotte, menu e sitemap
    //   pageType     → identita' della pagina (vedi enum sopra)
    //
    // Campi opzionali:
    //   requiresAuth → true = richiede login (JWT), altrimenti redirect
    //   layout       → { showPanel, showNav, showFooter } override per-pagina
    //   otherSEO     → { ogImage, ogType, structuredData, noindex } meta OG/Schema.org
    //   description  → chiave i18n o stringa per meta description + sitemap
    //   renderMode   → 'server' (default) | 'client' (no SSR)
    //   data         → dati custom passati al componente via route.data
    //
    // Il componente DEVE estendere PageBaseComponent.
    //
    pages: () => [
        {
            path: '',
            title: '',
            pageType: PageType.Home,
            description: 'homeDesc',
            otherSEO: { ogImage: 'img4k' },
            component: () => import('./pages/home/home.component').then(m => m.HomeComponent),
        },
        {
            path: 'social-feed',
            title: 'socialNav',
            pageType: PageType.Social,
            description: 'socialDesc',
            component: () => import('./pages/social/social.component').then(m => m.SocialComponent),
            layout: { showPanel: false },
        },
        {
            path: 'login',
            title: 'loginNav',
            pageType: PageType.Login,
            description: 'loginDesc',
            component: () => import('./pages/login/login.component').then(m => m.LoginComponent),
        },
        {
            path: 'impostazioni',
            title: 'impostazioniNav',
            requiresAuth: true,
            pageType: PageType.Impostazioni,
            description: 'settingsDesc',
            component: () => import('./pages/social/social.component').then(m => m.SocialComponent),
        },
    ],

    // ── NAVIGAZIONE (header e footer) ─────────────────────────────────────
    //
    // Tre metodi disponibili:
    //   addPage(PageType.X)              → voce singola
    //   addLink('label', '/path')        → link diretto (raro, per URL custom)
    //   addGroup('label', b => { ... })  → dropdown con sotto-voci
    //
    // I gruppi sono ANNIDABILI: dentro un addGroup puoi richiamare un altro
    // addGroup per costruire gerarchie a più livelli (utile soprattutto nel
    // footer). Su desktop i livelli ≥2 aprono un pannello laterale, su mobile
    // un accordion indentato. Limiti: livelli 1-2 liberi; dal livello 3 in poi
    // compare un avviso di usabilità in console (dev); annidare oltre il
    // livello 5 genera un errore bloccante a build/avvio.
    //
    // Le pagine disabilitate (enabled: false) vengono escluse in automatico.
    // Se un gruppo resta vuoto (tutti i figli disabilitati), scompare anche lui.
    //
    headerNav: (h) => {
        h.addPage(PageType.Impostazioni);
        h.addGroup('menuPolicy', g => {
            g.addPage(PageType.PrivacyPolicy);
            g.addPage(PageType.CookiePolicy);
            g.addPage(PageType.AccessibilityStatement);
            // Esempio di gruppo annidato nell'header: su desktop apre un pannello laterale.
            g.addGroup('menuLegale', sg => {
                sg.addPage(PageType.TermsOfService);
                sg.addPage(PageType.LegalNotice);
            });
        });
        h.addPage(PageType.Social);
    },

    footerNav: (f) => {
        f.addLink('githubDesc', 'https://github.com/br1brown/Br1WebEngine');
        f.addGroup('menuPolicy', g => {
            g.addPage(PageType.PrivacyPolicy);
            g.addPage(PageType.CookiePolicy);
            g.addPage(PageType.AccessibilityStatement);
            // Esempio di gruppo annidato: un sottogruppo dentro un gruppo.
            g.addGroup('menuLegale', sg => {
                sg.addPage(PageType.TermsOfService);
                sg.addPage(PageType.LegalNotice);
            });
        });
    },
});
