import { Component, computed, ElementRef, HostListener, inject, signal } from '@angular/core';
import { NgTemplateOutlet, UpperCasePipe } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs/operators';

import { PageType } from '../../app.routes';
import { ThemeService } from '../../core/services/theme.service';
import { TranslateService } from '../../core/services/translate.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { ContestoSito } from '../../site';
import { NavLink } from '../../siteBuilder';

/**
 * Navbar principale del sito.
 *
 * Il menu header viene letto dal modello centrale del sito.
 */
@Component({
    selector: 'app-navbar',
    imports: [NgTemplateOutlet, RouterLink, TranslatePipe, UpperCasePipe],
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
    readonly fixTop = ContestoSito.config.fixedTopHeader;
    readonly languages = computed(() => this.translate.getAvailableLanguages());
    readonly menuOpen = signal(false);
    private readonly activeRouteOptions = {
        paths: 'exact' as const,
        queryParams: 'ignored' as const,
        fragment: 'ignored' as const,
        matrixParams: 'ignored' as const
    };

    constructor() {
        this.router.events
            .pipe(filter(e => e instanceof NavigationEnd))
            .subscribe(() => this.closeNavigation());
    }

    toggleMenu(): void {
        this.menuOpen.update(open => !open);
        if (!this.menuOpen()) {
            this.closeAllDropdowns();
        }
    }

    isRouteActive(path: string): boolean {
        if (this.isExternalPath(path) || path.startsWith('#')) {
            return false;
        }

        return this.router.isActive(path, this.activeRouteOptions);
    }

    isDropdownActive(item: NavLink): boolean {
        return item.children?.some(child => this.isRouteActive(child.path)) ?? false;
    }

    isExternalPath(path: string): boolean {
        return path.startsWith('http://') || path.startsWith('https://');
    }

    onNavigationLinkClick(): void {
        this.closeNavigation();
    }

    onDisclosureToggle(event: Event): void {
        const current = event.currentTarget as HTMLDetailsElement | null;
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
