import { Component, computed, effect, inject, makeStateKey, PLATFORM_ID, TransferState } from '@angular/core';
import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, skip } from 'rxjs';

import { ContestoSito } from './site';
import { ShellFlags, SHELL_DATA_KEY } from './core/engine/siteBuilder';
import { onNavigationEnd } from './core/engine/routing';
import { ThemeService } from './core/engine/services/theme.service';
import { FooterComponent } from './core/engine/components/footer/footer.component';
import { NavbarComponent } from './core/engine/components/navbar/navbar.component';
import { SmokeEffectComponent } from './core/engine/components/smoke-effect/smoke-effect.component';
import { BackToTopComponent } from './core/engine/components/back-to-top/back-to-top.component';
import { CookieBannerComponent } from './core/engine/components/cookie-banner/cookie-banner.component';
import { BreadcrumbComponent } from './core/engine/components/breadcrumb/breadcrumb.component';
import { PageMetaService } from './core/engine/services/page-meta.service';
import { VersionCheckService } from './core/engine/services/version-check.service';
import { WebVitalsService } from './core/engine/services/web-vitals.service';
import { TranslatePipe } from './core/engine/pipes/translate.pipe';

/**
 * Chiave TransferState dei flag di shell. L'SSR serializza i flag della rotta RISOLTA; il client
 * li rilegge come valore iniziale del signal, così il primo render combacia con l'HTML SSR
 * (no flash navbar/pannello) SENZA dipendere dal timing della prima navigazione del router.
 * Riusa la stessa stringa della chiave in `route.data`: è la stessa cosa logica, due canali diversi.
 */
const SHELL_FLAGS_STATE_KEY = makeStateKey<ShellFlags>(SHELL_DATA_KEY);

/**
 * Shell principale dell'app: non decide quali pagine esistono, consuma le route già trasformate e
 * reagisce ai flag di shell della pagina attiva (showPanel, showNav, showFooter).
 */
@Component({
    selector: 'app-root',
    imports: [RouterOutlet, NavbarComponent, FooterComponent, SmokeEffectComponent, BackToTopComponent, CookieBannerComponent, BreadcrumbComponent, TranslatePipe],
    templateUrl: './app.component.html',
    // L'altezza minima a tutto schermo è gestita nativamente su `app-root` in base.scss con
    // `min-height: 100dvh` (altezza dinamica reale su mobile, evita i problemi del 100vh fisso).
    host: { class: 'd-flex flex-column' }
})
export class AppComponent {
    private readonly platformId = inject(PLATFORM_ID);
    private readonly transferState = inject(TransferState);
    readonly theme = inject(ThemeService);
    readonly pageMeta = inject(PageMetaService);

    readonly smoke = ContestoSito.config.smoke;

    /**
     * Flag di shell della rotta attiva (`route.data[SHELL_DATA_KEY]`, scritto da routing.ts).
     * `initialValue` = flag serializzati dall'SSR (TransferState): il primo render client usa gli
     * stessi flag dell'HTML SSR → niente sfarfallio prima del primo NavigationEnd. Poi si aggiorna a
     * ogni navigazione; senza SSR → `{}` → default.
     */
    private readonly shellFlags = onNavigationEnd(
        router => (PageMetaService.getLeaf(router.routerState.snapshot).data[SHELL_DATA_KEY] ?? {}) as ShellFlags,
        this.transferState.get(SHELL_FLAGS_STATE_KEY, {} as ShellFlags)
    );

    // Subordinato al globale (come showNav/showFooter): se site.ts spegne shell.showPanel,
    // nessuna pagina può riaccenderlo col proprio layout.showPanel.
    readonly showPanel = computed(() => ContestoSito.config.showPanel && (this.shellFlags().showPanel ?? true));

    // Vista full-bleed della pagina attiva (flag layout.fitViewport): lo shell rende il
    // <main> senza container/padding e senza pannello, e .fit-viewport (base.scss) fa
    // riempire l'altezza al contenuto. Quando attivo prevale su showPanel.
    readonly fitViewport = computed(() => this.shellFlags().fitViewport ?? false);

    // I flag di pagina sono subordinati al globale (come showNav/footer in global-settings.json):
    // se globalmente off, nessuna pagina può riattivarli.
    readonly showNavbar = computed(() => ContestoSito.config.showNav && (this.shellFlags().showNav ?? true));

    readonly showFooter = computed(() => ContestoSito.config.showFooter && (this.shellFlags().showFooter ?? true));

    // Subordinato al globale (come showNav/showFooter): se site.ts spegne shell.showBreadcrumb,
    // nessuna pagina può riaccenderlo col proprio layout.showBreadcrumb. Se acceso, la pagina può
    // forzarlo esplicitamente in entrambe le direzioni; in sua assenza (`null`) il breadcrumb
    // applica da solo il proprio default intelligente (vedi BreadcrumbComponent).
    readonly breadcrumbOverride = computed(() =>
        ContestoSito.config.showBreadcrumb && (this.shellFlags().showBreadcrumb ?? null));

    // `smoke.enable` (globale) fa da gate primario.
    // Il flag di pagina `showSmoke` vince sul default (pannello sì, full-bleed no), 
    // permettendo eccezioni (es. forzare lo smoke su una rotta full-bleed).
    // Nota: prefers-reduced-motion è delegata internamente allo SmokeEffectComponent per non rompere l'idratazione.
    readonly showSmoke = computed(() =>
        this.smoke.enable &&
        (this.shellFlags().showSmoke ?? (this.showPanel() && !this.fitViewport()))
    );

    constructor() {
        // SSR: serializza i flag risolti in TransferState così il client li ha già al primo render.
        // L'effect riscrive ad ogni cambio rotta; in SSR l'ultimo valore prima della serializzazione
        // è quello della pagina richiesta. Solo server: nel browser sarebbe inutile.
        if (isPlatformServer(this.platformId)) {
            effect(() => this.transferState.set(SHELL_FLAGS_STATE_KEY, this.shellFlags()));
        }

        inject(VersionCheckService).init();
        inject(WebVitalsService).init();

        // Riapre temporaneamente in stampa i tag <details> chiusi (es. Cookie Policy) 
        // per renderne visibile l'intero contenuto.
        if (isPlatformBrowser(this.platformId)) {
            let reopenedByPrint: HTMLDetailsElement[] = [];
            window.matchMedia('print').addEventListener('change', ({ matches }) => {
                if (matches) {
                    reopenedByPrint = Array.from(document.querySelectorAll('details:not([open])'));
                    reopenedByPrint.forEach(d => { d.open = true; });
                } else {
                    reopenedByPrint.forEach(d => { d.open = false; });
                    reopenedByPrint = [];
                }
            });

            // Ripristina il focus su #main-content al cambio pagina (A11y), saltando il load iniziale.
            inject(Router).events.pipe(
                filter((e): e is NavigationEnd => e instanceof NavigationEnd),
                skip(1),
                takeUntilDestroyed()
            ).subscribe(() => {
                document.getElementById('main-content')?.focus();
            });
        }
    }
}
