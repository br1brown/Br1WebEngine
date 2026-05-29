import { Component, ElementRef, HostListener, inject, isDevMode, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UpperCasePipe } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { injectCurrentUrl } from '../../../app.routes';
import { ThemeService } from '../../../core/engine/services/theme.service';
import { TranslateService } from '../../../core/engine/services/translate.service';
import { TranslatePipe } from '../../../core/engine/pipes/translate.pipe';
import { NavLinkComponent } from '../../shared/nav-link/nav-link.component';
import { NavDropdownComponent } from '../../shared/nav-dropdown/nav-dropdown.component';
import { PageDirective } from '../../../core/engine/directives/page.directive';
import { ContestoSito, PageType } from '../../../site';
import { NavLink } from '../../../core/engine/siteBuilder';
import { AssetDirective } from '../../../core/engine/directives/asset.directive';

@Component({
    selector: 'app-navbar',
    imports: [TranslatePipe, AssetDirective, UpperCasePipe, NavLinkComponent, NavDropdownComponent, PageDirective],
    templateUrl: './navbar.component.html',
    styleUrl: './navbar.component.css',
    host: { class: 'd-block' }
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
    readonly showBrandIcon = ContestoSito.config.showBrandIcon;
    readonly languages = this.translate.availableLangs;
    readonly menuOpen = signal(false);
    protected readonly openDropdownIndex = signal(-1);
    protected readonly langOpen = signal(false);
    private readonly currentUrl = injectCurrentUrl();

    constructor() {
        if (isDevMode() && this.menuItems.length > 6) {
            console.warn(
                `[Navbar] ${this.menuItems.length} voci di primo livello nel menu (max consigliato: 6). ` +
                `Su desktop rischiano di andare a capo; su mobile richiedono scroll. ` +
                `Raggruppa le voci in dropdown per ridurre il numero di item orizzontali.`
            );
        }
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

    isNavDropdownOpen(i: number): boolean {
        return this.openDropdownIndex() === i;
    }

    onNavDropdownToggle(i: number): void {
        this.langOpen.set(false);
        this.openDropdownIndex.update(cur => cur === i ? -1 : i);
    }

    toggleLang(): void {
        this.openDropdownIndex.set(-1);
        this.langOpen.update(v => !v);
    }

    onNavigationLinkClick(): void {
        this.closeNavigation();
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

    getFlagClass(_lang: string): string {
        return 'fa-solid fa-globe';
    }

    private closeNavigation(): void {
        this.menuOpen.set(false);
        this.closeAllDropdowns();
    }

    private closeAllDropdowns(): void {
        this.openDropdownIndex.set(-1);
        this.langOpen.set(false);
    }
}
