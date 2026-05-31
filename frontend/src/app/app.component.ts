import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { ContestoSito } from './site';
import { ThemeService } from './core/engine/services/theme.service';
import { FooterComponent } from './core/engine/components/footer/footer.component';
import { NavbarComponent } from './core/engine/components/navbar/navbar.component';
import { SmokeEffectComponent } from './core/engine/components/smoke-effect/smoke-effect.component';
import { BackToTopComponent } from './core/engine/components/back-to-top/back-to-top.component';
import { CookieBannerComponent } from './core/engine/components/cookie-banner/cookie-banner.component';
import { PageMetaService } from './core/engine/services/page-meta.service';
import { VersionCheckService } from './core/engine/services/version-check.service';
import { TranslatePipe } from './core/engine/pipes/translate.pipe';

/**
 * Shell principale dell'app.
 *
 * Qui non si decide quali pagine esistono: il componente consuma la
 * configurazione gia' trasformata in route Angular e reagisce ai flag
 * di shell della pagina attiva (showPanel, showNav, showFooter).
 */
@Component({
    selector: 'app-root',
    imports: [RouterOutlet, NavbarComponent, FooterComponent, SmokeEffectComponent, BackToTopComponent, CookieBannerComponent, TranslatePipe],
    templateUrl: './app.component.html',
    host: { class: 'd-flex flex-column min-vh-100' }
})
export class AppComponent {
    private readonly router = inject(Router);
    readonly theme = inject(ThemeService);

    readonly smoke = ContestoSito.config.smoke;

    readonly showSmoke = computed(() =>
        (this.showPanel()) && this.smoke.enable && !this.theme.prefersReducedMotion()
    );

    // Espone la route foglia corrente come signal, cosi' il layout globale
    // puo' reagire ai flag custom e ai meta della pagina attiva.
    private readonly currentRoute = toSignal(
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd),
            map(() => PageMetaService.getLeaf(this.router.routerState.snapshot))
        ),
        { initialValue: PageMetaService.getLeaf(this.router.routerState.snapshot) }
    );

    readonly showPanel = computed(() => {
        const value: boolean = this.currentRoute().data['showPanel'] ?? true;
        return value;
    });

    readonly showNavbar = computed(() => {
        if (!ContestoSito.config.showNav) return false;
        return this.currentRoute().data['showNav'] ?? true;
    });

    readonly showFooter = computed(() => {
        if (!ContestoSito.config.showFooter) return false;
        return this.currentRoute().data['showFooter'] ?? true;
    });

    constructor() {
        inject(VersionCheckService).init();
    }
}

