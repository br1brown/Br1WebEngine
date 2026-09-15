import { Directive, inject, output, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { TranslateService } from '../../services/translate.service';
import { AuthService } from '../../../services/auth.service';
import { LoginRequest } from '../../../dto/auth.dto';

/**
 * Base dei form di login: campi, validazione, chiamata di autenticazione ed errore inline.
 * Centralizza la logica (submit, stato di loading, mappatura dell'errore) così un progetto figlio
 * che vuole un markup diverso (es. campo username visibile invece che nascosto, layout proprio)
 * scrive solo il proprio `LoginFormComponent` concreto — stesso pattern di `BaseActionComponent`.
 */
@Directive()
export abstract class BaseLoginFormComponent {
    protected readonly auth = inject(AuthService);
    protected readonly translate = inject(TranslateService);
    private readonly fb = inject(FormBuilder);

    /** Emesso dopo un login riuscito; a questo punto il token è già memorizzato. */
    readonly loggedIn = output<void>();

    protected readonly isLoading = signal(false);
    protected readonly errorMessage = signal<string | null>(null);

    protected readonly loginForm = this.fb.group({
        username: ['', [Validators.required]],
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
