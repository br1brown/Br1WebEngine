import { Component, computed, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { injectCurrentUrl } from '../../../../app.routes';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { NavLink } from '../../siteBuilder';

/**
 * NAV LINK COMPONENT
 *
 * Atomo presentazionale per il singolo link di navigazione, con i tre rami:
 *   - esterno  → <a href target="_blank" rel="noopener noreferrer">
 *   - rotta corrente → <span aria-current="page"> (non cliccabile, classe attiva)
 *   - interno  → <a [routerLink]>
 *
 * Centralizza l'a11y (aria-current, rel) e la marcatura "rotta attiva" — cosi'
 * i contenitori (footer-nav, navbar, future sidebar) si concentrano solo sul
 * proprio layout. Estratto a parte per consentire test unitari mirati sui
 * tre rami invece di re-testarli in ogni contenitore.
 *
 * `cssClass` è la classe base applicata sempre; `activeCssClass` (opzionale)
 * viene appesa solo quando la rotta corrisponde — utile per i contesti
 * (navbar) che vogliono uno stile aggiuntivo sulla voce corrente.
 */
@Component({
    selector: 'app-nav-link',
    standalone: true,
    imports: [RouterLink, TranslatePipe],
    templateUrl: './nav-link.component.html',
})
export class NavLinkComponent {
    private readonly router = inject(Router);
    private readonly currentUrl = injectCurrentUrl();

    readonly link = input.required<NavLink>();
    readonly cssClass = input<string>('');
    readonly activeCssClass = input<string>('');

    /** Notifica il click su un elemento navigabile (esterno/interno). Lo span attivo non emette. */
    readonly linkClick = output<void>();

    readonly isActive = computed(() => {
        this.currentUrl(); // dipendenza signal: re-eval ad ogni navigazione
        return this.router.isActive(this.link().path, {
            paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored',
        });
    });

    readonly resolvedClass = computed(() => {
        const base = this.cssClass();
        const active = this.activeCssClass();
        return this.isActive() && active ? `${base} ${active}`.trim() : base;
    });

    onClick(): void {
        this.linkClick.emit();
    }
}
