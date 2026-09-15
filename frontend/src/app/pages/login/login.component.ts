import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '../../core/engine/pipes/translate.pipe';
import { PageBaseComponent } from '../../core/engine/pages/page-base.component';
import { LoginFormComponent } from '../../components/shared/login-form/login-form.component';
import { ContestoSito, PageType } from '../../site';

@Component({
    selector: 'app-login',
    imports: [TranslatePipe, LoginFormComponent],
    templateUrl: './login.component.html',
})
/**
 * Pagina di login: contiene `LoginFormComponent` e gestisce il ritorno — dopo il login riapre la
 * pagina indicata da `returnPageType` in querystring (settata dall'authGuard al redirect).
 */
export class LoginComponent extends PageBaseComponent<void> {
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);

    // Avviso informativo (non un errore) mostrato quando l'authGuard ha rediretto qui.
    // `computed()`, non un signal statico: al primo render la lingua può ancora essere quella del
    // bootstrap (l'effect di PageBaseComponent che la allinea da route.data.lang gira dopo, non
    // sincrono nel costruttore) — reattivo, si aggiorna da solo appena i cataloghi sono quelli giusti.
    protected readonly infoMessage = computed(() =>
        this.route.snapshot.queryParamMap.get('reason') === 'auth'
            ? this.translate.translate('loginRichiestoMotivo')
            : null
    );

    /** Login riuscito: torna alla pagina richiesta (`returnPageType`) o alla home. */
    protected async onLoggedIn(): Promise<void> {
        const returnPageType = this.getReturnPageType();
        const path = returnPageType != null
            // currentLang() qui è sicuro (a differenza del resolver/guard): scatta dopo un login
            // riuscito, cioè dopo un'interazione utente reale — la lingua è già sincronizzata da un pezzo.
            ? ContestoSito.getPath(returnPageType, this.translate.currentLang())
            : null;
        await this.router.navigateByUrl(path ?? '/'); // '/' = home (lingua default) se non c'è un returnPageType valido.
    }

    /** Legge il `returnPageType` dalla querystring e lo valida come `PageType` registrato. */
    private getReturnPageType(): PageType | null {
        const raw = this.route.snapshot.queryParamMap.get('returnPageType');
        if (raw == null) return null;
        return (Object.values(PageType) as string[]).includes(raw) ? (raw as PageType) : null;
    }
}
