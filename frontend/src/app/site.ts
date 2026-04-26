import { inject } from '@angular/core';
import { buildSite } from './siteBuilder';
import { ApiService } from './core/services/api.service';

export type {
    SiteConfig,
    SiteConfigInput,
    SitePageInput,
    SmokeSettings,
    SmokeSettingsInput
} from './siteBuilder';

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
    Home,
    Social,
    PrivacyPolicy,
    CookiePolicy,
    TermsOfService,
    LegalNotice,
    Impostazioni,
    GitHub,
}

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURAZIONE MASTER DEL SITO
// ═══════════════════════════════════════════════════════════════════════
//
// Questo e' l'unico file da toccare per configurare il sito.
// Ha tre sezioni, tutte qui sotto:
//
//   1. setSiteConfiguration  → nome, lingue, colore tema, effetto smoke
//   2. defineSitePages       → elenco pagine con path, componente, opzioni
//   3. configureHeaderNavigation / configureFooterNavigation → cosa appare nei menu
//
// Modificare qualcosa qui aggiorna automaticamente rotte, menu e sitemap.
// Non serve toccare nessun altro file.
//
// Il risultato (ContestoSito) viene usato da tutto il resto dell'app:
//   ContestoSito.config       → configurazione globale
//   ContestoSito.pages        → pagine per il router Angular
//   ContestoSito.menuNav      → voci del menu header
//   ContestoSito.linkFooter   → voci del footer
//   ContestoSito.getPath(PageType.X) → path di una pagina per link interni
//   ContestoSito.getSitemapEntries() → voci per la sitemap (path + metadati)
//
export const ContestoSito = buildSite(siteFondamentaBuilder => {
    // ── CONFIGURAZIONE GLOBALE ────────────────────────────────────────
    //
    // appName            → nome mostrato in navbar, titolo pagina, PWA manifest
    // defaultLang        → lingua di fallback (anche se il cookie non c'e')
    // availableLanguages → lingue tra cui l'utente puo' scegliere
    // description        → meta description per SEO
    // colorTema          → colore principale del sito (hex). Determina automaticamente
    //                       il tono del testo (chiaro/scuro) e la CSS var --colorTema
    // showFooter         → mostra/nascondi il footer
    // smoke              → effetto particellare di sfondo (omettilo per disabilitarlo)
    //
    siteFondamentaBuilder.setSiteConfiguration({
        appName: 'Template',
        version: '1.0.0',
        defaultLang: 'it',
        availableLanguages: ['it', 'en'],
        description: 'Template di base che serve per fare vedere le funzionalità base',
        colorTema: '#131e24',
        showFooter: true,
        fixedTopHeader: true,
        smoke: {
            enable: true,
            color: '#b5d9ff',
            opacity: 0.7,
            maximumVelocity: 120,
            particleRadius: 350,
            density: 18
        }
    });

    // ── ALBERO DELLE PAGINE ────────────────────────────────────────────
    //
    // Tre tipi di pagina. Non serve specificare quale, si capisce da solo:
    //
    //   Ha "component"?   → pagina interna (rotta Angular, lazy loaded)
    //   Ha "children"?    → gruppo di sotto-pagine (es. /legale/privacy)
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
    //   showPanel    → false = pagina a tutto schermo (utile per landing)
    //   data         → dati custom passati al componente via route.data
    //
    // Il componente DEVE estendere PageBaseComponent (fornisce translate,
    // api, asset, notify gia' pronti senza ripetere inject).
    //

    siteFondamentaBuilder.defineSitePages([
        {
            path: '',
            title: 'home',
            enabled: true,
            pageType: PageType.Home,
            description: 'homeDesc',
            component: () => import('./pages/home/home.component').then(m => m.HomeComponent),
        },
        {
            path: 'social-feed',
            title: 'social',
            enabled: true,
            pageType: PageType.Social,
            description: 'socialDesc',
            renderMode: 'server',
            component: () => import('./pages/social/social.component').then(m => m.SocialComponent),
            showPanel: false,
            resolve: {
                social: () => inject(ApiService).getSocial(),
            },
        },
        {
            path: 'legale',
            title: 'policies',
            enabled: true,
            children: [
                {
                    path: 'privacy',
                    title: 'privacypolicy',
                    description: 'privacyPolicyDesc',
                    enabled: true,
                    pageType: PageType.PrivacyPolicy,
                    component: () => import('./pages/policy/policy.component').then(m => m.PolicyComponent),
                },
                {
                    path: 'termini',
                    title: 'termsofservice',
                    description: 'termsOfServiceDesc',
                    enabled: true,
                    pageType: PageType.TermsOfService,
                    component: () => import('./pages/policy/policy.component').then(m => m.PolicyComponent),
                },
                {
                    path: 'cookie',
                    title: 'cookiepolicy',
                    description: 'cookiePolicyDesc',
                    enabled: true,
                    pageType: PageType.CookiePolicy,
                    component: () => import('./pages/policy/policy.component').then(m => m.PolicyComponent),
                },
                {
                    path: 'legal',
                    title: 'legalnotice',
                    description: 'legalNoticeDesc',
                    enabled: false,
                    pageType: PageType.LegalNotice,
                    component: () => import('./pages/policy/policy.component').then(m => m.PolicyComponent),
                }
            ]
        },
        {
            title: 'projectSources',
            enabled: true,
            pageType: PageType.GitHub,
            externalUrl: 'https://github.com/br1brown/Br1WebEngine'
        },
        {
            path: 'impostazioni',
            title: 'settings',
            enabled: true,
            requiresAuth: true,
            pageType: PageType.Impostazioni,
            description: 'settingsDesc',
            component: () => import('./pages/social/social.component').then(m => m.SocialComponent),
        }
    ]);

    // ── NAVIGAZIONE (header e footer) ───────────────────────────────────
    //
    // Qui si definisce cosa appare nei menu. Non serve scrivere path:
    // basta passare il PageType e il link si costruisce da solo.
    //
    // Tre metodi disponibili:
    //   addPage(PageType.X)              → voce singola
    //   addLink('label', '/path')        → link diretto (raro, per URL custom)
    //   addGroup('label', b => { ... })  → dropdown con sotto-voci
    //
    // Le pagine disabilitate (enabled: false) vengono escluse in automatico.
    // Se un gruppo resta vuoto (tutti i figli disabilitati), scompare anche lui.
    //
    siteFondamentaBuilder.configureHeaderNavigation(h => {
        h.addPage(PageType.Impostazioni);

        h.addGroup('policies', g => {
            g.addPage(PageType.PrivacyPolicy);
            g.addPage(PageType.CookiePolicy);
            g.addPage(PageType.TermsOfService);
            g.addPage(PageType.LegalNotice);
        });

        h.addPage(PageType.Social);
    });

    siteFondamentaBuilder.configureFooterNavigation(f => {
        f.addPage(PageType.GitHub);
        f.addGroup('policies', g => {
            g.addPage(PageType.PrivacyPolicy);
            g.addPage(PageType.CookiePolicy);
            g.addPage(PageType.TermsOfService);
            g.addPage(PageType.LegalNotice);
        });
    });
});
