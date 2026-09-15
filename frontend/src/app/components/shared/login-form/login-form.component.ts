import { Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../core/engine/pipes/translate.pipe';
import { BaseLoginFormComponent } from '../../../core/engine/components/base/base-login-form.component';

/**
 * Esempio di Dominio: lo stesso login dell'Engine (`app-login-form`), ma con lo username
 * visibile e digitabile invece che fisso a 'admin' e nascosto — il caso concreto per cui un
 * progetto figlio vuole un markup diverso senza duplicare submit/validazione/errori.
 * Estende `BaseLoginFormComponent` (Engine) e dichiara solo il proprio template: stesso
 * selector `app-login-form` dell'originale, così sostituirlo nella pagina di login è un cambio
 * di import, non di markup consumer.
 */
@Component({
    selector: 'app-login-form',
    imports: [ReactiveFormsModule, TranslatePipe],
    templateUrl: './login-form.component.html',
})
export class LoginFormComponent extends BaseLoginFormComponent {}
