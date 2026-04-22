import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet, RouterStateSnapshot } from '@angular/router';
import { filter, map } from 'rxjs';

import { ContestoSito } from './site';
import { AppTitleStrategy } from './core/services/app-title.strategy';
import { ThemeService } from './core/services/theme.service';
import { TranslateService } from './core/services/translate.service';
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
 * configurazione gia' trasformata in route Angular e reagisce ai metadati
 * delle pagine custom (showPanel, menu disponibili, ecc.).
 */
@Component({
    selector: 'app-root',
    imports: [RouterOutlet, NavbarComponent, FooterComponent, SmokeEffectComponent, BackToTopComponent, CookieBannerComponent, TranslatePipe],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
    private readonly router = inject(Router);
    private readonly translate = inject(TranslateService);
    private readonly titleStrategy = inject(AppTitleStrategy);
    readonly theme = inject(ThemeService);


    readonly smoke = ContestoSito.config.smoke;
    readonly showFooter = ContestoSito.config.showFooter;
    readonly menuItems = ContestoSito.menuNav;
    readonly showNavbar = computed(() => ContestoSito.config.showHeader ||
        this.menuItems.length > 0 || this.translate.getAvailableLanguages().length > 1
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

    // Ogni pagina puo' decidere se mostrare il pannello globale passando `showPanel`
    // dentro `route.data` quando la route viene costruita.
    readonly showPanel = computed(() => {
        const value: boolean = this.currentRoute().data['showPanel'] ?? true;
        return value;
    });

    constructor() {
        inject(VersionCheckService).init();

        effect(() => {
            // Traccia il cambio lingua: riesegue title e meta senza navigazione.
            this.translate.currentLang();
            this.titleStrategy.refresh(this.router.routerState.snapshot);
        });
    }
}

