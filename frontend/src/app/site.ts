import { buildSite } from './core/engine/siteBuilder';
import { AppPages, appPagesDecl } from './pages/app.pages';
import { LegalPages, legalSlots } from './pages/legal.pages';

export type {
    SiteConfig,
    SitePageInput,
    SmokeSettings
} from './core/engine/siteBuilder';

// ═══════════════════════════════════════════════════════════════════════
// PageType — identita' di ogni pagina
// ═══════════════════════════════════════════════════════════════════════
//
// Ogni pagina del sito DEVE avere un valore qui. PageType è assemblato in
// quest'unico oggetto a partire da più file — uno per area tematica sotto
// pages/ (qui: pages/app.pages.ts, pages/legal.pages.ts, ...): ogni area
// resta un file breve e indipendente, che si apre e si mantiene da solo
// senza scorrere le altre.
//
// Per aggiungere una pagina in un'area esistente: aggiungi un ID
// all'oggetto dell'area (es. AppPages), poi usalo nella sua dichiarazione.
// Il resto (rotte, menu, sitemap) si aggiorna da solo.
//
// Per aggiungere un'area nuova: crea `pages/<area>.pages.ts` con lo
// stesso pattern (oggetto `as const` di ID stringa + array di
// dichiarazioni), poi aggiungilo qui sotto negli spread.
//
// Perche' PageType e non il path grezzo?
// - Se rinomini un path (es. "chi-siamo" → "about"), cambi UNA riga
//   nella dichiarazione della pagina. Menu, footer, link interni
//   continuano a funzionare perche' puntano a PageType.ChiSiamo, non
//   alla stringa del path. Se rimuovi un valore, TypeScript segnala
//   tutti i punti del codice che ancora lo usano.
// - Gli ID sono stringhe stabili e leggibili (es. "app.home") anche
//   fuori da TypeScript — in query string (?returnPageType=...), log,
//   messaggi d'errore del builder.
// - Ogni area vive nel proprio file, con ID prefissati (es. "legal.",
//   "app.") unici per costruzione anche sommando più aree.
//
export const PageType = {
    ...LegalPages,
    ...AppPages,
} as const;
export type PageType = (typeof PageType)[keyof typeof PageType];

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
    // Tutto il resto del legale (ID, date di aggiornamento) vive in pages/legal.pages.ts.
    legalPages: legalSlots,

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
    //   pageType     → identita' della pagina (vedi PageType sopra)
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
    // Le dichiarazioni vivono nel file della loro area (pages/app.pages.ts qui sotto);
    // aggiungi un'area nuova con uno spread in più.
    pages: () => [
        ...appPagesDecl,
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
