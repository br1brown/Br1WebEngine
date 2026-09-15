import { inject } from '@angular/core';
import type { SitePageInput, ContentLoader, ContentLoaderContext, ContentLoaderResult } from '../core/engine/siteBuilder';
import { ApiService } from '../core/services/api.service';
import { ApiError } from '../core/engine/services/base-api.service';

function withApi(loaderFn: (ctx: ContentLoaderContext, api: ApiService) => Promise<ContentLoaderResult>): ContentLoader {
    return (ctx) => {
        const api = inject(ApiService);
        return loaderFn(ctx, api);
    };
}

// Area "app": pagine applicative del progetto. Un file per area (demo: "app"; reali: "shop", "blog"…),
// assemblato in site.ts con uno spread. ID prefissati per area, leggibili in query string/log.
// Riferimento campi: frontend/README.md §"Pagine & rotte" e §"Opzioni Avanzate di site.ts".
export const AppPages = {
    Home: 'app.home',
    CheFaccio: 'app.chefaccio',
    Social: 'app.social',
    SocialDetail: 'app.social.detail',
    Login: 'app.login',
    Impostazioni: 'app.impostazioni',
} as const;

/** Dichiarazioni pagina di quest'area, assemblate in site.ts → pages(). */
export const appPagesDecl: SitePageInput[] = [
    {
        path: '',
        title: '',
        pageType: AppPages.Home,
        description: 'homeHeroDesc',
        otherSEO: { ogImage: { id: 'img4k' } },
        component: () => import('./home/home.component').then(m => m.HomeComponent),
    },
    {
        // Path PER-LINGUA (non solo prefissato): dimostra `BasePageInput.path` come oggetto —
        // un segmento diverso per lingua invece dello stesso sotto ogni prefisso. Una lingua
        // senza chiave propria ricade sul default (resolvePagePath in siteBuilder.ts).
        path: { it: 'che-faccio', en: 'what-i-do' },
        title: 'cheFaccioNav',
        pageType: AppPages.CheFaccio,
        description: 'homeDesc',
        otherSEO: { ogImage: { id: 'img4k' } },
        component: () => import('./che-faccio/che-faccio.component').then(m => m.CheFaccioComponent),
    },
    {
        path: 'social-feed',
        title: 'socialNav',
        pageType: AppPages.Social,
        description: 'socialDesc',
        component: () => import('./social/social.component').then(m => m.SocialComponent),
        contentLoader: withApi(async (ctx, api) => ({ content: await api.getSocial() })),
    },
    {
        // Demo di `dynamicParams`: stesso componente e stesso endpoint backend della lista sopra
        // (`getSocial()`/`/social`, nessun endpoint nuovo) — solo un secondo PageType/rotta con
        // `contentLoader` per filtrare sul singolo `:slug`. `dynamicParams` enumera i social
        // esistenti per la sitemap dinamica mappando le CHIAVI dello stesso risultato che
        // `content` già usa.
        path: 'social-feed/:slug',
        title: 'socialNav',
        pageType: AppPages.SocialDetail,
        description: 'socialDesc',
        component: () => import('./social/social.component').then(m => m.SocialComponent),
        dynamicParams: async (ctx) => {
            const all = await ctx.fetchBackendJson<Record<string, string>>('/social');
            return Object.keys(all).map(name => ({ slug: name }));
        },
        contentLoader: withApi(async (ctx, api) => {
            const slug = ctx.params['slug'];
            if (!slug) return { content: null };
            const one = await api.getSocial([slug]);
            // Il backend risponde 200 con un Record vuoto/senza quella chiave se il social non
            // esiste (non 404 HTTP): lo traduciamo qui in un vero ApiError(404), altrimenti la
            // pagina resterebbe silenziosamente vuota.
            if (!one[slug]) throw new ApiError(404, null);
            return { content: one, info: { title: slug } };
        }),
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
