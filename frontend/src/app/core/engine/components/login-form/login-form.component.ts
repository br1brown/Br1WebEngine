import { Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { BaseLoginFormComponent } from '../base/base-login-form.component';

/**
 * Form di login riusabile (default dell'Engine): campo password (username fisso, nascosto),
 * validazione, chiamata di autenticazione ed errore inline. È un componente UI puro — non naviga
 * e non conosce le rotte. Al login riuscito emette `loggedIn`, lasciando al contenitore (la
 * pagina di login o una modale) decidere cosa fare.
 *
 * Un figlio che vuole un markup diverso (es. campo username visibile) non lo modifica qui: scrive
 * il proprio concreto in `components/shared/` estendendo `BaseLoginFormComponent`, che porta con
 * sé submit/validazione/errori — vedi la demo in `components/shared/login-form/`.
 */
@Component({
    selector: 'app-login-form',
    imports: [ReactiveFormsModule, TranslatePipe],
    templateUrl: './login-form.component.html',
})
export class LoginFormComponent extends BaseLoginFormComponent {
    constructor() {
        super();
        // Il campo username di questo default è nascosto (vedi template): la base parte da ''
        // per non imporre 'admin' a chi estende BaseLoginFormComponent con uno username visibile
        // (components/shared/login-form/) — solo QUESTO concreto ne ha bisogno, per il login demo
        // a credenziali fisse.
        this.loginForm.controls.username.setValue('admin');
    }
}
