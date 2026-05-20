import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { ContestoSito } from './site';
import { ThemeService } from './core/services/theme.service';
import { FooterComponent } from './layout/footer/footer.component';
import { NavbarComponent } from './layout/navbar/navbar.component';
import { SmokeEffectComponent } from './layout/smoke-effect/smoke-effect.component';
import { BackToTopComponent } from './shared/components/back-to-top/back-to-top.component';
import { CookieBannerComponent } from './shared/components/cookie-banner/cookie-banner.component';
import { PageMetaService } from './core/services/page-meta.service';
import { VersionCheckService } from './core/services/version-check.service';
import { TranslatePipe } from './shared/pipes/translate.pipe';

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
    styleUrl: './app.component.css'
})
export class AppComponent {
    private readonly router = inject(Router);
    readonly theme = inject(ThemeService);

    readonly smoke = ContestoSito.config.smoke;

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

