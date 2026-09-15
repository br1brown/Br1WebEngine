import { Component, computed, inject, output } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/engine/services/notification.service';
import { TranslateService } from '../../../core/engine/services/translate.service';
import { TranslatePipe } from '../../../core/engine/pipes/translate.pipe';
import { NavLinkComponent } from '../../../core/engine/components/nav-link/nav-link.component';
import { ContestoSito } from '../../../site';
import { NavLink } from '../../../core/engine/shell-nav';

/**
 * Area login/logout della navbar: dopo il logout ricarica la route per rivalutare l'authGuard.
 * Login e logout su assi indipendenti; nulla se `loginPage` è null. Dettagli: README §"Autenticazione".
 *
 * Dominio a contratto fisso: `navbar.component.ts` (Engine) importa questo file per path e nome
 * — cambi liberamente corpo e template, ma non path/nome-classe/selettore, altrimenti l'Engine
 * non compila. Vedi README radice §"Dominio a contratto fisso".
 */
@Component({
    selector: 'app-user-nav',
    imports: [TranslatePipe, NavLinkComponent],
    templateUrl: './user-nav.component.html',
    styleUrl: './user-nav.component.scss',
    host: { class: 'contents' }
})
export class UserNavComponent {
    private readonly router = inject(Router);
    private readonly auth = inject(AuthService);
    private readonly notification = inject(NotificationService);
    private readonly translate = inject(TranslateService);

    /** Stato di sessione reattivo: decide se mostrare Login (sloggato) o Logout (loggato). */
    readonly isLoggedIn = this.auth.isLoggedIn;

    /** True se il sito ha un concetto di login (`config.loginPage` valorizzato): gate del logout,
     *  indipendente da `showLoginInHeader`. Se `false`, nessuna area auth viene renderizzata. */
    readonly hasLoginPage = ContestoSito.config.loginPage != null;

    /**
     * Voce di login per lo stato SLOGGATO, derivata dall'unica sorgente di verità `config.loginPage`.
     * Rispetta `showLoginInHeader`: se il flag è `false` (login nascosto ai visitatori) resta `null`.
     * `null` anche senza `loginPage`. Il logout (stato loggato) NON dipende da questo — vedi template.
     */
    readonly loginLink = computed<NavLink | null>(() => {
        if (!ContestoSito.config.showLoginInHeader) return null;
        const loginPageType = ContestoSito.config.loginPage;
        if (!loginPageType) return null;
        const info = ContestoSito.getPageInfo(loginPageType, this.translate.currentLang());
        return info ? { label: info.title, path: info.path, isExternal: info.isExternal } : null;
    });

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
