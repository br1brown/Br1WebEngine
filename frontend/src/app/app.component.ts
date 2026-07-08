import { Component, computed, effect, inject, makeStateKey, PLATFORM_ID, TransferState } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { RouterOutlet } from '@angular/router';

import { ContestoSito } from './site';
import { ShellFlags, SHELL_DATA_KEY } from './core/engine/siteBuilder';
import { onNavigationEnd } from './core/engine/routing';
import { ThemeService } from './core/engine/services/theme.service';
import { FooterComponent } from './components/shared/footer/footer.component';
import { NavbarComponent } from './core/engine/components/navbar/navbar.component';
import { SmokeEffectComponent } from './core/engine/components/smoke-effect/smoke-effect.component';
import { BackToTopComponent } from './core/engine/components/back-to-top/back-to-top.component';
import { CookieBannerComponent } from './core/engine/components/cookie-banner/cookie-banner.component';
import { PrintActionComponent } from './components/shared/action/print-action/print-action.component';
import { PageMetaService } from './core/engine/services/page-meta.service';
import { VersionCheckService } from './core/engine/services/version-check.service';
import { TranslatePipe } from './core/engine/pipes/translate.pipe';

/**
 * Chiave TransferState dei flag di shell. L'SSR serializza i flag della rotta RISOLTA; il client
 * li rilegge come valore iniziale del signal, così il primo render combacia con l'HTML SSR
 * (no flash navbar/pannello) SENZA dipendere dal timing della prima navigazione del router.
 * Riusa la stessa stringa della chiave in `route.data`: è la stessa cosa logica, due canali diversi.
 */
const SHELL_FLAGS_STATE_KEY = makeStateKey<ShellFlags>(SHELL_DATA_KEY);

/**
 * Shell principale dell'app.
 *
 * Qui non si decide quali pagine esistono: il componente consuma la
 * configurazione gia' trasformata in route Angular e reagisce ai flag
 * di shell della pagina attiva (showPanel, showNav, showFooter).
 */
@Component({
    selector: 'app-root',
    imports: [RouterOutlet, NavbarComponent, FooterComponent, SmokeEffectComponent, BackToTopComponent, CookieBannerComponent, PrintActionComponent, TranslatePipe],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
    // L'altezza minima (viewport) NON è più l'utility .min-vh-100: Bootstrap la fissa a 100vh
    // (= large viewport, barre ritratte), che su mobile spinge le viste full-bleed sotto la
    // chrome del browser. Ora la dà base.scss su `app-root` con `min-height: 100dvh` (+ fallback
    // 100vh), che segue l'altezza visibile dinamica. Vedi base.scss (regola `app-root`).
    host: { class: 'd-flex flex-column' }
})
export class AppComponent {
    private readonly platformId = inject(PLATFORM_ID);
    private readonly transferState = inject(TransferState);
    readonly theme = inject(ThemeService);

    readonly smoke = ContestoSito.config.smoke;

    /**
     * Flag di shell della rotta attiva (slice tipato `route.data[SHELL_DATA_KEY]`, scritto da
     * routing.ts). `initialValue` = flag serializzati dall'SSR (TransferState): sul client il PRIMO
     * render usa esattamente i flag con cui l'SSR ha generato l'HTML, quindi nessuno sfarfallio
     * (navbar/pannello che appaiono e spariscono) prima del primo NavigationEnd. Poi il signal si
     * aggiorna ad ogni navigazione dalla rotta dal vivo. Senza SSR la chiave non c'è → `{}` → default.
     */
    private readonly shellFlags = onNavigationEnd(
        router => (PageMetaService.getLeaf(router.routerState.snapshot).data[SHELL_DATA_KEY] ?? {}) as ShellFlags,
        this.transferState.get(SHELL_FLAGS_STATE_KEY, {} as ShellFlags)
    );

    readonly showPanel = computed(() => this.shellFlags().showPanel ?? true);

    // Vista full-bleed della pagina attiva (flag layout.fitViewport): lo shell rende il
    // <main> senza container/padding e senza pannello, e .fit-viewport (base.scss) fa
    // riempire l'altezza al contenuto. Quando attivo prevale su showPanel.
    readonly fitViewport = computed(() => this.shellFlags().fitViewport ?? false);

    // I flag di pagina sono subordinati al globale (come showNav/footer in global-settings.json):
    // se globalmente off, nessuna pagina può riattivarli.
    readonly showNavbar = computed(() => ContestoSito.config.showNav && (this.shellFlags().showNav ?? true));

    readonly showFooter = computed(() => ContestoSito.config.showFooter && (this.shellFlags().showFooter ?? true));

    // Bottone di stampa globale (FAB): puramente per-pagina, nessun gate globale — come fitViewport.
    readonly printable = computed(() => this.shellFlags().printable ?? true);

    // Nota: `prefers-reduced-motion` NON entra qui — sarebbe un signal client-only (matchMedia) che
    // il server non legge, causando un mismatch di idratazione (SSR rende lo smoke, il client lo toglie).
    // Il rispetto del reduced-motion vive dentro SmokeEffectComponent (non anima, canvas vuoto), così
    // l'`@if` dipende solo da config/layout — identico in SSR e client.
    readonly showSmoke = computed(() =>
        this.showPanel() && !this.fitViewport() && this.smoke.enable
    );

    constructor() {
        // SSR: serializza i flag risolti in TransferState così il client li ha già al primo render.
        // L'effect riscrive ad ogni cambio rotta; in SSR l'ultimo valore prima della serializzazione
        // è quello della pagina richiesta. Solo server: nel browser sarebbe inutile.
        if (isPlatformServer(this.platformId)) {
            effect(() => this.transferState.set(SHELL_FLAGS_STATE_KEY, this.shellFlags()));
        }

        inject(VersionCheckService).init();
    }
}
