import { Component, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '../../../core/engine/pipes/translate.pipe';
import { TranslateService } from '../../../core/engine/services/translate.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoginRequest } from '../../../core/dto/auth.dto';

/**
 * Form di login riusabile: campi, validazione, chiamata di autenticazione ed errore inline.
 * È un componente UI puro — non naviga e non conosce le rotte. Al login riuscito emette
 * `loggedIn`, lasciando al contenitore (la pagina di login o una modale) decidere cosa fare.
 */
@Component({
    selector: 'app-login-form',
    imports: [ReactiveFormsModule, TranslatePipe],
    templateUrl: './login-form.component.html',
})
export class LoginFormComponent {
    private readonly auth = inject(AuthService);
    private readonly translate = inject(TranslateService);
    private readonly fb = inject(FormBuilder);

    /** Emesso dopo un login riuscito; a questo punto il token è già memorizzato. */
    readonly loggedIn = output<void>();

    protected readonly isLoading = signal(false);
    protected readonly errorMessage = signal<string | null>(null);

    protected readonly loginForm = this.fb.group({
        username: ['admin', [Validators.required]],
        password: ['', [Validators.required, Validators.minLength(8)]],
    });

    protected async onSubmit(): Promise<void> {
        if (this.loginForm.invalid) return;

        this.isLoading.set(true);
        this.errorMessage.set(null);

        const { username, password } = this.loginForm.getRawValue();
        const request: LoginRequest = { username: username!, pwd: password! };

        // auth.login risolve con { valid, error }: l'errore è già tradotto e lo mostriamo inline.
        const result = await this.auth.login(request);
        this.isLoading.set(false);

        if (result.valid) {
            this.loggedIn.emit();
        } else {
            this.errorMessage.set(result.error ?? this.translate.translate('loginErroreGenerico'));
        }
    }
}
