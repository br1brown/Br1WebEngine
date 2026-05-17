import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UpperCasePipe } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { injectCurrentUrl } from '../../app.routes';
import { ThemeService } from '../../core/services/theme.service';
import { TranslateService } from '../../core/services/translate.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { NavLinkComponent } from '../../shared/components/nav-link/nav-link.component';
import { NavDropdownComponent } from '../../shared/components/nav-dropdown/nav-dropdown.component';
import { PageDirective } from '../../shared/directives/page.directive';
import { ContestoSito, PageType } from '../../site';
import { NavLink } from '../../siteBuilder';

/**
 * Navbar principale del sito.
 *
 * Il menu header viene letto dal modello centrale del sito.
 */
@Component({
    selector: 'app-navbar',
    imports: [TranslatePipe, UpperCasePipe, NavLinkComponent, NavDropdownComponent, PageDirective],
    templateUrl: './navbar.component.html',
    styleUrl: './navbar.component.css'
})
export class NavbarComponent {
    readonly theme = inject(ThemeService);
    readonly translate = inject(TranslateService);
    private readonly router = inject(Router);
    private readonly elRef = inject(ElementRef);

    readonly appName = ContestoSito.config.appName;
    readonly homePath = ContestoSito.getPath(PageType.Home) ?? '/';
    readonly menuItems = ContestoSito.menuNav;
    protected readonly PageType = PageType;
    readonly fixTop = ContestoSito.config.fixedTopHeader;
    readonly languages = this.translate.availableLangs;
    readonly menuOpen = signal(false);
    private readonly currentUrl = injectCurrentUrl();

    constructor() {
        this.router.events
            .pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed())
            .subscribe(() => this.closeNavigation());
    }

    toggleMenu(): void {
        this.menuOpen.update(open => !open);
        if (!this.menuOpen()) {
            this.closeAllDropdowns();
        }
    }

    isRouteActive(path: string): boolean {
        this.currentUrl(); // signal dependency → re-render on every navigation
        return this.router.isActive(path, { paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' });
    }

    isGroup(item: NavLink): item is NavLink & { children: NavLink[] } {
        return Array.isArray(item.children) && item.children.length > 0;
    }

    onNavigationLinkClick(): void {
        this.closeNavigation();
    }

    onDisclosureToggle(event: Event): void {
        // event.target è stabile anche dopo il re-emit via output.emit()
        // (currentTarget puo' essere null quando l'evento esce dal componente figlio)
        const current = event.target as HTMLDetailsElement | null;
        if (!current?.open) {
            return;
        }

        const dropdowns = this.elRef.nativeElement.querySelectorAll('details[open]') as NodeListOf<HTMLDetailsElement>;
        dropdowns.forEach(dropdown => {
            if (dropdown !== current) {
                dropdown.open = false;
            }
        });
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        if (!this.elRef.nativeElement.contains(event.target)) {
            this.closeAllDropdowns();
        }
    }

    setLanguage(lang: string): void {
        void this.translate.setLanguage(lang);
        this.closeNavigation();
    }

    private closeNavigation(): void {
        this.menuOpen.set(false);
        this.closeAllDropdowns();
    }

    private closeAllDropdowns(): void {
        const dropdowns = this.elRef.nativeElement.querySelectorAll('details[open]') as NodeListOf<HTMLDetailsElement>;
        dropdowns.forEach(dropdown => dropdown.removeAttribute('open'));
    }
}
