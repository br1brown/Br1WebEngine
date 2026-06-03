import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '../../core/engine/pipes/translate.pipe';
import { PageBaseComponent } from '../page-base.component';
import { LoginFormComponent } from '../../components/shared/login-form/login-form.component';
import { ContestoSito, PageType } from '../../site';

@Component({
    selector: 'app-login',
    imports: [TranslatePipe, LoginFormComponent],
    templateUrl: './login.component.html',
})
/**
 * Pagina di login del progetto.
 *
 * Contiene `LoginFormComponent` (form riusabile) e gestisce la navigazione
 * al ritorno: se l'utente è arrivato qui rediretto dall'authGuard, il
 * parametro `returnPageType` in querystring indica la pagina da riaprire
 * dopo il login riuscito.
 */
export class LoginComponent extends PageBaseComponent<void> {
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);

    // Avviso informativo (non un errore) mostrato quando l'authGuard ha rediretto qui.
    // Letto da ActivatedRoute (SSR-safe) così è disponibile già al primo render server-side.
    protected readonly infoMessage = signal<string | null>(
        this.route.snapshot.queryParamMap.get('reason') === 'auth'
            ? this.translate.translate('loginRichiestoMotivo')
            : null
    );

    /** Login riuscito: torna alla pagina richiesta (`returnPageType`) o alla home. */
    protected async onLoggedIn(): Promise<void> {
        const returnPageType = this.getReturnPageType();
        const path = returnPageType != null
            ? ContestoSito.getPath(returnPageType)
            : null;
        await this.router.navigateByUrl(path ?? '/');
    }

    /**
     * Legge il `returnPageType` dalla querystring e lo interpreta come `PageType`.
     * Accetta sia il valore numerico (`"0"`) sia il nome enum (`"Home"`).
     */
    private getReturnPageType(): PageType | null {
        const raw = this.route.snapshot.queryParamMap.get('returnPageType');
        if (raw == null) return null;

        const asNumber = Number(raw);
        if (!isNaN(asNumber) && asNumber in PageType) return asNumber;

        const asName = (PageType as Record<string, unknown>)[raw];
        return typeof asName === 'number' ? asName : null;
    }
}
