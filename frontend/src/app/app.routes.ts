import { CanActivateFn, NavigationEnd, Route, Router, Routes } from '@angular/router';
import { inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';

export function injectCurrentUrl() {
    const router = inject(Router);
    return toSignal(
        router.events.pipe(
            filter(e => e instanceof NavigationEnd),
            map(() => router.url)
        ),
        { initialValue: router.url }
    );
}

import { ContestoSito, routeExtras } from './site';
export { PageType } from './site';
import { AuthService } from './core/services/auth.service';
import { InternalSitePage, isInternalPage, isParentPage, RouteExtrasMap } from './siteBuilder';
import { NotificationService } from './core/services/notification.service';
import { TranslateService } from './core/services/translate.service';

/**
 * Guard di autenticazione: protegge le rotte che hanno il flag `requiresAuth`.
 */
const authGuard: CanActivateFn = () => {
    const t = inject(TranslateService);
    const authService = inject(AuthService);
    const notifaction = inject(NotificationService);
    const router = inject(Router);

    if (authService.isLoggedIn()) {
        return true;
    }

    // La notifica non deve bloccare il redirect: il servizio carica SweetAlert2 in lazy mode.
    void notifaction.error(t.translate('errore401Info'), t.translate('errore401Desc'));
    return router.createUrlTree(['/error/401']);
};

/**
 * DEFINIZIONE DELLE ROTTE ANGULAR
 * Le rotte vengono generate partendo dalla configurazione dichiarativa in site.ts.
 */
export const routes: Routes = [
    // Contesto.pages contiene solo pagine interne; qui filtriamo quelle abilitate.
    ...buildRoutes(ContestoSito.pages, routeExtras),
    ...buildErrorRoutes()
];

/**
 * Trasforma ricorsivamente l'albero di pagine interne in Routes di Angular.
 */
function buildRoutes(pages: InternalSitePage[], extras: RouteExtrasMap): Routes {
    return pages
        .filter(page => page.enabled)
        .map(page => toAngularRoute(page, extras));
}

/**
 * Converte un singolo nodo della DSL (Parent o Leaf) in una Route di Angular.
 */
function toAngularRoute(page: InternalSitePage, extras: RouteExtrasMap): Route {
    const route: Route = {
        path: page.path,
        title: page.title,
        // Applica la guard solo se richiesto esplicitamente nella configurazione.
        canActivate: page.requiresAuth ? [authGuard] : [],
        data: {
            ...page.data,
            pageType: page.pageType
        }
    };

    if (isParentPage(page)) {
        // Se e' un Parent, non carichiamo un componente ma i suoi figli.
        route.children = buildRoutes(page.children.filter(isInternalPage), extras);
    } else {
        // Se e' una LeafPage, carichiamo il componente in modo lazy.
        route.loadComponent = page.component;
        route.data = {
            ...route.data,
            pageType: page.pageType,
            showPanel: page.showPanel !== undefined ? page.showPanel : true,
            pageDescription: page.description ?? null,
        };
        let pageExtras = page.pageType !== undefined ? extras[page.pageType] : undefined;

        if (!!pageExtras?.resolve)
            route.resolve = pageExtras.resolve;

        if (!!pageExtras?.runGuardsAndResolvers)
            route.runGuardsAndResolvers = pageExtras.runGuardsAndResolvers;

        if (!!pageExtras?.canDeactivate)
            route.canDeactivate = pageExtras.canDeactivate;

        if (!!pageExtras?.providers)
            route.providers = pageExtras.providers;
    }

    return route;
}

/**
 * Rotte di gestione errori (404, ecc.).
 */
function buildErrorRoutes(): Routes {

    return [
        {
            path: 'error/:errorCode',
            title: 'errore',
            loadComponent: () => import('./pages/error/error.component').then(m => m.ErrorComponent),
            // 'showPanel' rimane statico nel data, 'errorCode' arriverà dal path
            data: { showPanel: false }
        },
        {
            // Fallback se si naviga su /error senza codice
            path: 'error',
            redirectTo: 'error/500',
            pathMatch: 'full'
        },
        {
            // Qualsiasi rotta non trovata (404)
            path: '**',
            redirectTo: 'error/404'
        }
    ];
}
