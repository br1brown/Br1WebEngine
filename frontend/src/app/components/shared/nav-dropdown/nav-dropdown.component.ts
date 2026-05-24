import { Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { injectCurrentUrl } from '../../../app.routes';
import { TranslatePipe } from '../../../core/engine/pipes/translate.pipe';
import { NavLinkComponent } from '../nav-link/nav-link.component';
import { NavLink } from '../../../core/engine/siteBuilder';

/**
 * NAV DROPDOWN COMPONENT
 *
 * Atomo per il gruppo di navigazione tipo "dropdown" della navbar:
 * <details><summary> con label + caret e <ul> con i figli renderizzati
 * via <app-nav-link>.
 *
 * Si occupa internamente di calcolare l'`isActive` (true se uno dei
 * figli interni coincide con la rotta corrente) e di marcare la summary
 * con `aria-current="location"`.
 *
 * Espone due output:
 *   - `toggle` per consentire al contenitore (navbar) di coordinare la
 *     chiusura degli altri dropdown aperti
 *   - `linkClick` propagato dai figli per chiudere il menu mobile
 *
 * Estratto a parte per testarlo in isolamento (active-state, render dei
 * figli, propagazione eventi) senza dover montare l'intera navbar.
 */
@Component({
    selector: 'app-nav-dropdown',
    standalone: true,
    imports: [TranslatePipe, NavLinkComponent],
    templateUrl: './nav-dropdown.component.html',
})
export class NavDropdownComponent {
    private readonly router = inject(Router);
    private readonly currentUrl = injectCurrentUrl();

    readonly item = input.required<NavLink & { children: NavLink[] }>();

    readonly toggle = output<Event>();
    readonly linkClick = output<void>();

    readonly isActive = computed(() => {
        this.currentUrl(); // dipendenza signal: re-eval ad ogni navigazione
        return this.item().children.some(child =>
            !child.isExternal && this.router.isActive(child.path, {
                paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored',
            }),
        );
    });
}
