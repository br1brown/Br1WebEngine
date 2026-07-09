import type { SitePageInput } from '../core/engine/siteBuilder';

// ═══════════════════════════════════════════════════════════════════════
// AREA "app" — pagine applicative del progetto
// ═══════════════════════════════════════════════════════════════════════
//
// Un file per area tematica (qui la demo: "app"; un progetto reale aggiunge
// le proprie — es. "shop", "blog"), assemblato in site.ts (vedi il
// commento "PageType — identita' di ogni pagina" lì). Ogni ID è una
// stringa prefissata per area — leggibile in query string/log, univoca
// per costruzione anche sommando più aree.
//
export const AppPages = {
    Home: 'app.home',
    Social: 'app.social',
    Login: 'app.login',
    Impostazioni: 'app.impostazioni',
} as const;

/** Dichiarazioni pagina di quest'area, assemblate in site.ts → pages(). */
export const appPagesDecl: SitePageInput[] = [
    {
        path: '',
        title: '',
        pageType: AppPages.Home,
        description: 'homeDesc',
        otherSEO: { ogImage: 'img4k' },
        component: () => import('./home/home.component').then(m => m.HomeComponent),
    },
    {
        path: 'social-feed',
        title: 'socialNav',
        pageType: AppPages.Social,
        description: 'socialDesc',
        component: () => import('./social/social.component').then(m => m.SocialComponent),
        layout: { showPanel: false },
    },
    {
        path: 'login',
        title: 'loginNav',
        pageType: AppPages.Login,
        description: 'loginDesc',
        component: () => import('./login/login.component').then(m => m.LoginComponent),
    },
    {
        path: 'impostazioni',
        title: 'impostazioniNav',
        requiresAuth: true,
        pageType: AppPages.Impostazioni,
        description: 'settingsDesc',
        component: () => import('./social/social.component').then(m => m.SocialComponent),
    },
];
