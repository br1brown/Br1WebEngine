import { Component, ElementRef, HostListener, inject, isDevMode, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UpperCasePipe } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { injectCurrentUrl } from '../../../../app.routes';
import { ThemeService } from '../../services/theme.service';
import { TranslateService } from '../../services/translate.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { NavLinkComponent } from '../nav-link/nav-link.component';
import { NavDropdownComponent } from '../nav-dropdown/nav-dropdown.component';
import { PageDirective } from '../../directives/page.directive';
import { ContestoSito, PageType } from '../../../../site';
import { NavLink } from '../../siteBuilder';
import { AssetDirective } from '../../directives/asset.directive';
import { UserNavComponent } from '../../../../components/shared/user-nav/user-nav.component';

@Component({
    selector: 'app-navbar',
    imports: [TranslatePipe, AssetDirective, UpperCasePipe, NavLinkComponent, NavDropdownComponent, PageDirective, UserNavComponent],
    templateUrl: './navbar.component.html',
    styleUrl: './navbar.component.css',
    host: { class: 'd-block' }
})
/**
 * Barra di navigazione principale del sito, configurata interamente da `site.ts`.
 *
 * Responsabilità:
 * - Renderizza il brand, le voci di menu (flat o dropdown), il selettore lingua e
 *   l'area login/logout (delegata a `UserNavComponent`).
 * - Gestisce l'apertura/chiusura del menu mobile e dei dropdown nidificati.
 * - Chiude tutto alla navigazione (RouterEvent) e ai click fuori dal componente
 *   (`@HostListener document:click`).
 *
 * Configurazione: tutto viene letto da `ContestoSito` (alias di `site.ts`).
 * Non modificare questo file — personalizza `site.ts` e `user-nav.component.ts`.
 */
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
    readonly showBrandIconInHeader = ContestoSito.config.showBrandIconInHeader;
    readonly languages = this.translate.availableLangs;
    /** True se l'area login/logout deve essere mostrata nella navbar. */
    readonly hasAuthPage = ContestoSito.config.pageForAuthGuard != null && ContestoSito.config.showLoginInHeader;
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
