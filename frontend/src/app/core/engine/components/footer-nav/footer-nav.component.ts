import { Component, input } from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { NavLinkComponent } from '../nav-link/nav-link.component';
import { NavLink } from '../../siteBuilder';

/**
 * FOOTER NAV COMPONENT
 *
 * Render della griglia di link cablati da ContestoSito.linkFooter:
 * gruppi con titolo + figli e link singoli. Il render del singolo link
 * è delegato a <app-nav-link>, che gestisce esterno / rotta-corrente /
 * interno + a11y.
 *
 * Estratto dal footer per evitare che un refactor del layout esterno
 * porti via la composizione.
 */
@Component({
    selector: 'app-footer-nav',
    standalone: true,
    imports: [TranslatePipe, NavLinkComponent],
    templateUrl: './footer-nav.component.html',
})
export class FooterNavComponent {
    readonly links = input.required<NavLink[]>();

    isGroup(item: NavLink): item is NavLink & { children: NavLink[] } {
        return Array.isArray(item.children) && item.children.length > 0;
    }
}
