import { buildSite } from './siteBuilder';

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
// nel blocco setSitePages sotto. Il resto (rotte, menu, sitemap) si
// aggiorna da solo.
//
// Perche' un enum e non stringhe?
// - Se rinomini un path (es. "chi-siamo" → "about"), cambi UNA riga
//   sotto in setSitePages. Menu, footer, link interni continuano a
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
//   3. configureSiteNavigation → cosa appare in header e footer
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
//   ContestoSito.getSitemapPaths()   → tutti i path per la sitemap
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
    siteFondamentaBuilder.setSiteConfiguration(siteConfigurationSectionBuilder =>
        siteConfigurationSectionBuilder.setSiteConfiguration({
            appName: 'Template',
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
        }));

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
    siteFondamentaBuilder.defineSitePages(sitePagesSectionBuilder =>
        sitePagesSectionBuilder.setSitePages([
            {
                path: '',
                title: 'home',
                enabled: true,
                pageType: PageType.Home,
                component: () => import('./pages/home/home.component').then(m => m.HomeComponent),
            },
            {
                path: 'social-feed',
                title: 'social',
                enabled: true,
                pageType: PageType.Social,
                component: () => import('./pages/social/social.component').then(m => m.SocialComponent),
                showPanel: false
            },
            {
                path: 'legale',
                title: 'policies',
                enabled: true,
                children: [
                    {
                        path: 'privacy',
                        title: 'privacypolicy',
                        enabled: true,
                        pageType: PageType.PrivacyPolicy,
                        component: () => import('./pages/policy/policy.component').then(m => m.PolicyComponent),
                    },
                    {
                        path: 'termini',
                        title: 'termsofservice',
                        enabled: true,
                        pageType: PageType.TermsOfService,
                        component: () => import('./pages/policy/policy.component').then(m => m.PolicyComponent),
                    },
                    {
                        path: 'cookie',
                        title: 'cookiepolicy',
                        enabled: true,
                        pageType: PageType.CookiePolicy,
                        component: () => import('./pages/policy/policy.component').then(m => m.PolicyComponent),
                    },
                    {
                        path: 'legal',
                        title: 'legalnotice',
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
                component: () => import('./pages/social/social.component').then(m => m.SocialComponent),
            }
        ]));

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
    siteFondamentaBuilder.configureSiteNavigation(siteNavigationSectionsBuilder => {
        siteNavigationSectionsBuilder.configureHeaderNavigation(headerNavigationBuilder => {
            headerNavigationBuilder.addPage(PageType.Impostazioni);

            headerNavigationBuilder.addGroup('policies', policyGroupNavigationBuilder => {
                policyGroupNavigationBuilder.addPage(PageType.PrivacyPolicy);
                policyGroupNavigationBuilder.addPage(PageType.CookiePolicy);
                policyGroupNavigationBuilder.addPage(PageType.TermsOfService);
                policyGroupNavigationBuilder.addPage(PageType.LegalNotice);
            });

            headerNavigationBuilder.addPage(PageType.Social);
        });

        siteNavigationSectionsBuilder.configureFooterNavigation(footerNavigationBuilder => {
            footerNavigationBuilder.addPage(PageType.GitHub);
            footerNavigationBuilder.addGroup('policies', policyGroupNavigationBuilder => {
                policyGroupNavigationBuilder.addPage(PageType.PrivacyPolicy);
                policyGroupNavigationBuilder.addPage(PageType.CookiePolicy);
                policyGroupNavigationBuilder.addPage(PageType.TermsOfService);
                policyGroupNavigationBuilder.addPage(PageType.LegalNotice);
            });
        });
    });
});
