import { Component, inject, output } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/engine/services/notification.service';
import { TranslateService } from '../../../core/engine/services/translate.service';
import { TranslatePipe } from '../../../core/engine/pipes/translate.pipe';
import { NavLinkComponent } from '../../../core/engine/components/nav-link/nav-link.component';
import { ContestoSito } from '../../../site';
import { NavLink } from '../../../core/engine/siteBuilder';

/**
 * USER NAV COMPONENT
 *
 * Componente shared che gestisce l'area login/logout della navbar.
 * Estratto dall'engine per consentire ai progetti figli di personalizzare
 * la navigazione senza modificare i file interni dell'engine.
 *
 * Responsabilità:
 *  - Mostra il link di login (quando sloggato) o il bottone di logout (quando loggato).
 *  - Gestisce la conferma di logout via NotificationService.
 *  - Dopo il logout, ricarica la route corrente per forzare la ri-valutazione
 *    dell'authGuard: se la pagina è protetta, l'utente viene rediretto.
 *
 * Non renderizza nulla se nessuna pagina di login è configurata in site.ts
 * (pageForAuthGuard è null).
 */
@Component({
    selector: 'user-nav',
    imports: [TranslatePipe, NavLinkComponent],
    templateUrl: './user-nav.component.html',
    styleUrl: './user-nav.component.css',
    host: { class: 'contents' }
})
export class UserNavComponent {
    private readonly router = inject(Router);
    private readonly auth = inject(AuthService);
    private readonly notification = inject(NotificationService);
    private readonly translate = inject(TranslateService);

    /** Stato di sessione reattivo: decide se mostrare Login (sloggato) o Logout (loggato). */
    readonly isLoggedIn = this.auth.isLoggedIn;

    /**
     * Voce di login derivata dall'unica sorgente di verità: `config.pageForAuthGuard`.
     * `null` se nessuna pagina di login è configurata → l'intera area auth non viene renderizzata.
     */
    readonly loginLink: NavLink | null = (() => {
        if (!ContestoSito.config.showLoginInHeader) return null;
        const loginPageType = ContestoSito.config.pageForAuthGuard;
        if (!loginPageType) return null;
        const info = ContestoSito.getPageInfo(loginPageType);
        return info ? { label: info.title, path: info.path, isExternal: info.isExternal } : null;
    })();

    /** Notifica il click su un elemento navigabile, così la navbar può chiudere il menu mobile. */
    readonly navigationClick = output<void>();

    /** Gestisce il click sul link di login. */
    onNavigationClick(): void {
        this.navigationClick.emit();
    }

    /**
     * Gestisce il logout con conferma e route reload.
     * Dopo la conferma, pulisce la sessione e ricarica la route corrente
     * così che l'authGuard possa rieseguire la validazione.
     */
    async onLogout(): Promise<void> {
        // Notifica alla navbar di chiudere il menu mobile prima della modale.
        this.navigationClick.emit();

        const confirmed = await this.notification.confirm(
            this.translate.translate('logoutConfermaTitolo'),
            this.translate.translate('logoutConfermaTesto'),
            { icon: 'warning' }
        );
        if (!confirmed) return;

        this.auth.logout();

        // Ricarica la route corrente per forzare la ri-valutazione dei guard.
        // Se la pagina è protetta da authGuard, l'utente viene rediretto alla
        // pagina di login con reason=auth. Se non è protetta, resta sulla stessa pagina.
        const currentUrl = this.router.url;
        await this.router.navigateByUrl('/', { skipLocationChange: true });
        await this.router.navigateByUrl(currentUrl);
    }
}
