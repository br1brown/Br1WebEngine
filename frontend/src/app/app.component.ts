import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet, RouterStateSnapshot } from '@angular/router';
import { filter, map } from 'rxjs';

import { ContestoSito } from './site';
import { ThemeService } from './core/services/theme.service';
import { TranslateService } from './core/services/translate.service';
import { FooterComponent } from './layout/footer/footer.component';
import { NavbarComponent } from './layout/navbar/navbar.component';
import { SmokeEffectComponent } from './layout/smoke-effect/smoke-effect.component';
import { BackToTopComponent } from './shared/components/back-to-top/back-to-top.component';
import { CookieBannerComponent } from './shared/components/cookie-banner/cookie-banner.component';
import { TranslatePipe } from './shared/pipes/translate.pipe';

/**
 * Shell principale dell'app.
 *
 * Qui non si decide quali pagine esistono: il componente consuma la
 * configurazione gia' trasformata in route Angular e reagisce ai metadati
 * delle pagine custom (showPanel, menu disponibili, ecc.).
 */
@Component({
    selector: 'app-root',
    imports: [RouterOutlet, NavbarComponent, FooterComponent, SmokeEffectComponent, BackToTopComponent, CookieBannerComponent, TranslatePipe],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
})
export class AppComponent {
    private readonly meta = inject(Meta);
    private readonly title = inject(Title);
    private readonly router = inject(Router);
    private readonly translate = inject(TranslateService);
    readonly theme = inject(ThemeService);

    readonly smoke = ContestoSito.config.smoke;
    readonly showFooter = ContestoSito.config.showFooter;
    // L'header menu non e' definito qui: arriva dalla configurazione custom del sito.
    readonly menuItems = ContestoSito.menuNav;
    // La navbar viene mostrata se abbiamo voci di menu oppure il selettore lingua.
    readonly showNavbar = computed(() => ContestoSito.config.showHeader || 
        this.menuItems.length > 0 || this.translate.getAvailableLanguages().length > 1
    );

    // Espone la route foglia corrente come signal, cosi' il layout globale
    // puo' reagire ai flag custom e ai meta della pagina attiva.
    private readonly currentRoute = toSignal(
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd),
            // Si scende sempre fino alla foglia: i parent annidati servono a organizzare
            // l'URL, ma la pagina "vera" e' l'ultimo nodo.
            map(() => getLeaf(this.router.routerState.snapshot))
        ),
        { initialValue: getLeaf(this.router.routerState.snapshot) }
    );

    // Ogni pagina puo' decidere se mostrare il pannello globale passando `showPanel`
    // dentro `route.data` quando la route viene costruita.
    readonly showPanel = computed(() => {
        const value: boolean = this.currentRoute().data['showPanel'] ?? true;
        return value;
    });

    constructor() {
        effect(() => {
            const route = this.currentRoute();

            // Le descrizioni di pagina possono dipendere dalla lingua corrente
            // senza che ci sia una nuova navigazione.
            this.translate.currentLang();

            const titleKey = route.routeConfig?.title;
            const descriptionKey = route.data['pageDescription'];
            this.updateDocumentTitle(typeof titleKey === 'string' ? titleKey : null);
            const description = this.resolvePageDescription(descriptionKey);
            this.updateSocialMeta(description);
        });
    }

    private updateDocumentTitle(titleKey: string | null): void {
        if (!titleKey) {
            this.title.setTitle(ContestoSito.config.appName);
            return;
        }

        const pageTitle = this.translate.t(titleKey).trim();
        if (!pageTitle || pageTitle === ContestoSito.config.appName) {
            this.title.setTitle(ContestoSito.config.appName);
            return;
        }

        this.title.setTitle(`${pageTitle} | ${ContestoSito.config.appName}`);
    }

    private resolvePageDescription(descriptionKey: unknown): string {
        if (typeof descriptionKey !== 'string' || descriptionKey.trim().length === 0) {
            return ContestoSito.config.description;
        }

        const description = this.translate.t(descriptionKey).trim();
        return description || ContestoSito.config.description;
    }

    private updateSocialMeta(description: string): void {
        this.meta.updateTag({ name: 'description', content: description });
        this.meta.updateTag({ property: 'og:description', content: description });
        this.meta.updateTag({ name: 'twitter:description', content: description });
    }
}

// Helper condiviso per trovare sempre la route finale, sia partendo dallo snapshot
// del router completo sia da uno snapshot di ActivatedRoute.
const getLeaf = (route: ActivatedRouteSnapshot | RouterStateSnapshot) => {
    let leaf = route instanceof RouterStateSnapshot ? route.root : route;
    while (leaf.firstChild) leaf = leaf.firstChild;
    return leaf;
};
