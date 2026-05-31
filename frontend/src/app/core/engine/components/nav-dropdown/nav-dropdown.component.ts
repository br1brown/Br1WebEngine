import { Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { injectCurrentUrl } from '../../../../app.routes';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { NavLinkComponent } from '../nav-link/nav-link.component';
import { NavLink } from '../../siteBuilder';

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
    readonly open = input(false);

    readonly toggle = output<void>();
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
