import { CanActivateFn, NavigationEnd, Route, Router, Routes } from '@angular/router';
import { inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { ContestoSito } from './site';
import { AuthService } from './core/services/auth.service';
import { contentLoaderResolver } from './pages/content.resolver';
import { InternalSitePage, isInternalPage, isParentPage } from './core/engine/siteBuilder';
import { NotificationService } from './core/engine/services/notification.service';
import { TranslateService } from './core/engine/services/translate.service';

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

/**
 * Guard di autenticazione: protegge le rotte che hanno il flag `requiresAuth`.
 */
const authGuard: CanActivateFn = (route) => {
    const authService = inject(AuthService);
    const router = inject(Router);
    const notification = inject(NotificationService);
    const translate = inject(TranslateService);

    if (authService.isLoggedIn()) {
        return true;
    }

    // Utente non autenticato: lo mandiamo alla pagina di login passando il motivo come query
    // param (`reason=auth`), così la pagina mostra un avviso inline invece di una modale.
    // Conserviamo anche il pageType di partenza per tornarci automaticamente dopo il login.
    const redirectPage = ContestoSito.config.pageForAuthGuard;
    if (redirectPage != null) {
        const path = ContestoSito.getPath(redirectPage);
        if (path) {
            // Redirigiamo alla pagina di login indicata, passando il vecchio pageType
            return router.createUrlTree([path], {
                queryParams: { returnPageType: route.data['pageType'], reason: 'auth' }
            });
        }
    }

    // Se redirectPage è nullo: non abbiamo una pagina di login dove mandare l'utente,
    // quindi restiamo sulla pagina corrente e segnaliamo l'accesso negato con una modale.
    notification.error(
        translate.translate('errore401Titolo'),
        translate.translate('errore401Descrizione')
    );
    return false;
};

/**
 * DEFINIZIONE DELLE ROTTE ANGULAR
 * Le rotte vengono generate partendo dalla configurazione dichiarativa in site.ts.
 */
export const routes: Routes = [
    // Contesto.pages contiene solo pagine interne; qui filtriamo quelle abilitate.
    ...buildRoutes(ContestoSito.pages),
    ...buildErrorRoutes()
];

/**
 * Trasforma ricorsivamente l'albero di pagine interne in Routes di Angular.
 */
function buildRoutes(pages: InternalSitePage[]): Routes {
    return pages
        .filter(page => page.enabled)
        .map(page => toAngularRoute(page));
}

/**
 * Converte un singolo nodo della DSL (Parent o Leaf) in una Route di Angular.
 */
function toAngularRoute(page: InternalSitePage): Route {
    const route: Route = {
        path: page.path,
        // Applica la guard solo se richiesto esplicitamente nella configurazione.
        canActivate: page.requiresAuth ? [authGuard] : [],
        data: {
            ...page.data,
            pageType: page.pageType
        }
    };

    if (isParentPage(page)) {
        // Se e' un Parent, non carichiamo un componente ma i suoi figli.
        route.children = buildRoutes(page.children.filter(isInternalPage));
    } else {
        // Se e' una LeafPage, carichiamo il componente in modo lazy.
        route.loadComponent = page.component;
        route.data = {
            ...route.data,
            pageType: page.pageType,
            showPanel: page.showPanel ?? true,
            showNav: page.showNav,
            showFooter: page.showFooter,
            pageDescription: page.description ?? null,
            ogImage: page.ogImage ?? null,
        };

        route.resolve = { contentByResolve: contentLoaderResolver(page.pageType) };

    }

    return route;
}

/**
 * Rotte di gestione errori (404, ecc.).
 */
function buildErrorRoutes(): Routes {
    const routes: Routes = [];
    const authPage = ContestoSito.config.pageForAuthGuard;
    const authPath = authPage != null ? ContestoSito.getPath(authPage) : null;

    if (authPath) {
        routes.push({
            path: 'error/401',
            redirectTo: authPath,
            pathMatch: 'full'
        });
    }

    routes.push(
        {
            path: 'error/:errorCode',
            title: 'genericoErrore',
            loadComponent: () => import('./pages/error/error.component').then(m => m.ErrorComponent),
            data: { showPanel: false }
        },
        {
            path: 'error',
            redirectTo: 'error/500',
            pathMatch: 'full'
        },
        {
            // Qualsiasi rotta non trovata (404)
            path: '**',
            redirectTo: 'error/404'
        }
    );

    return routes;
}
