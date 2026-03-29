import { Component, computed, inject } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet, RouterStateSnapshot } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

import { ContestoSito } from './site';
import { ThemeService } from './core/services/theme.service';
import { TranslateService } from './core/services/translate.service';
import { FooterComponent } from './layout/footer/footer.component';
import { NavbarComponent } from './layout/navbar/navbar.component';
import { SmokeEffectComponent } from './layout/smoke-effect/smoke-effect.component';
import { CookieBannerComponent } from './shared/components/cookie-banner/cookie-banner.component';
import { BackToTopComponent } from './shared/components/back-to-top/back-to-top.component';
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
    private readonly router = inject(Router);
    private readonly translate = inject(TranslateService);
    readonly theme = inject(ThemeService);

    readonly smoke = ContestoSito.config.smoke;
    readonly showFooter = ContestoSito.config.showFooter;
    // L'header menu non e' definito qui: arriva dalla configurazione custom del sito.
    readonly menuItems = ContestoSito.menuNav;
    // La navbar viene mostrata se abbiamo voci di menu oppure il selettore lingua.
    readonly showNavbar = computed(() =>
        this.menuItems.length > 0 || this.translate.getAvailableLanguages().length > 1
    );
    // Ogni pagina puo' decidere se mostrare il pannello globale passando `showPanel`
    // dentro `route.data` quando la route viene costruita.
    readonly showPanel = computed(() => {
        const value: boolean = this.routeData()['showPanel'] ?? true;
        return value;
    });

    // Espone i `data` della route corrente come signal, cosi' il layout globale
    // puo' reagire ai flag custom definiti per ogni pagina.
    private readonly routeData = toSignal(
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd),
            // Si scende sempre fino alla foglia: i parent annidati servono a organizzare
            // l'URL, ma la pagina "vera" e' l'ultimo nodo.
            map(() => getLeaf(this.router.routerState.snapshot).data)
        ),
        { initialValue: getLeaf(this.router.routerState.snapshot).data }
    );
}

// Helper condiviso per trovare sempre la route finale, sia partendo dallo snapshot
// del router completo sia da uno snapshot di ActivatedRoute.
const getLeaf = (route: ActivatedRouteSnapshot | RouterStateSnapshot) => {
    let leaf = route instanceof RouterStateSnapshot ? route.root : route;
    while (leaf.firstChild) leaf = leaf.firstChild;
    return leaf;
};
