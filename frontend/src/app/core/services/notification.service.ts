import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { TranslateService } from './translate.service';

/**
 * Notifiche utente via SweetAlert2.
 * Metodi: success(), error(), loading(), close(), confirm(), prompt(), toast(), validationErrors(), handleApiError().
 * handleApiError() legge ProblemDetails (RFC 9457) dal backend o traduce il codice HTTP via i18n.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
    private translate = inject(TranslateService);
    private platformId = inject(PLATFORM_ID);
    private swalPromise?: Promise<typeof import('sweetalert2').default>;

    private loadSwal(): Promise<typeof import('sweetalert2').default> | null {
        if (!isPlatformBrowser(this.platformId)) return null;
        return this.swalPromise ??= import('sweetalert2').then(module => module.default);
    }

    // --- FEEDBACK STANDARD ---

    success(message: string, onClose?: () => void): void {
        const swal = this.loadSwal();
        if (swal) {
            void swal.then(Swal =>
                Swal.fire(this.translate.translate('ottimo') + '!', message, 'success').then(() => onClose?.())
            );
        } else if (isPlatformBrowser(this.platformId)) {
            window.alert(message);
            onClose?.();
        }
    }

    error(title: string, message: string): void {
        const swal = this.loadSwal();
        if (swal) {
            void swal.then(Swal => {
                if (Swal.isVisible()) return;
                Swal.fire(title, message, 'error');
            });
        } else if (isPlatformBrowser(this.platformId)) {
            window.alert(`${title}\n${message}`);
        }
    }

    // --- LOADING ---

    loading(message?: string): void {
        void this.loadSwal()?.then(Swal =>
            Swal.fire({
                title: message ?? this.translate.translate('caricamento'),
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            })
        );
    }

    close(): void {
        void this.loadSwal()?.then(Swal => Swal.close());
    }

    // --- INTERAZIONE ---

    confirm(title: string, text: string, options?: {
        confirmText?: string;
        cancelText?: string;
        icon?: 'question' | 'info' | 'warning';
        allowOutsideClick?: boolean;
    }): Promise<boolean> {
        const swal = this.loadSwal();
        if (!swal) return Promise.resolve(false);

        return swal.then(Swal =>
            Swal.fire({
                title,
                text,
                icon: options?.icon ?? 'question',
                showCancelButton: true,
                confirmButtonText: options?.confirmText ?? this.translate.translate('si'),
                cancelButtonText: options?.cancelText ?? this.translate.translate('annulla'),
                allowOutsideClick: options?.allowOutsideClick ?? true,
            }).then(result => result.isConfirmed)
        );
    }

    prompt(title: string, inputLabel: string, options?: {
        confirmText?: string;
        cancelText?: string;
    }): Promise<string | null> {
        const swal = this.loadSwal();
        if (!swal) return Promise.resolve(null);

        return swal.then(Swal =>
            Swal.fire({
                title,
                input: 'text',
                inputLabel,
                inputPlaceholder: inputLabel,
                showCancelButton: true,
                confirmButtonText: options?.confirmText ?? this.translate.translate('si'),
                cancelButtonText: options?.cancelText ?? this.translate.translate('annulla'),
            }).then(result => result.isConfirmed && result.value ? result.value as string : null)
        );
    }

    // --- TOAST ---

    toast(message: string, icon: 'success' | 'error' | 'info' | 'warning' = 'success'): void {
        void this.loadSwal()?.then(Swal => {
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true,
                didOpen: (toast) => {
                    toast.addEventListener('mouseenter', Swal.stopTimer);
                    toast.addEventListener('mouseleave', Swal.resumeTimer);
                }
            });
            void Toast.fire({ icon, title: message });
        });
    }

    // --- VALIDAZIONE ---

    validationErrors(title: string, errors: string[] | Record<string, string[]>): void {
        const items = Array.isArray(errors)
            ? errors
            : Object.values(errors).flat();

        const swal = this.loadSwal();
        if (swal) {
            void swal.then(Swal => {
                const ul = document.createElement('ul');
                ul.style.cssText = 'text-align:left;font-size:0.9em;margin:0;';
                items.forEach(msg => {
                    const li = document.createElement('li');
                    li.textContent = msg;
                    ul.appendChild(li);
                });
                return Swal.fire({
                    title,
                    html: ul,
                    icon: 'warning',
                    confirmButtonText: this.translate.translate('chiudi'),
                });
            });
        } else if (isPlatformBrowser(this.platformId)) {
            window.alert(`${title}\n${items.join('\n')}`);
        }
    }

    // --- ERRORI API ---

    handleApiError(httpStatus: number, responseBody?: unknown): void {
        if (httpStatus === 400 && typeof responseBody === 'object' && responseBody !== null && 'errors' in responseBody) {
            this.validationErrors(
                this.translate.translate('errore400Info'),
                (responseBody as { errors: string[] | Record<string, string[]> }).errors
            );
            return;
        }

        const keyInfo = `errore${httpStatus}Info`;
        const keyDesc = `errore${httpStatus}Desc`;

        let errorInfo = this.translate.translate(keyInfo);
        let errorMessage = this.translate.translate(keyDesc);

        if (errorMessage === keyDesc) errorMessage = this.translate.translate('erroreImprevisto');
        if (errorInfo === keyInfo) {
            errorInfo = this.translate.translate('errore') + ' ' + httpStatus;
        } else {
            errorInfo = httpStatus + ': ' + errorInfo;
        }

        if (responseBody) {
            if (typeof responseBody === 'object') {
                const body = responseBody as Record<string, unknown>;
                if (typeof body['detail'] === 'string') errorMessage = body['detail'];
                if (typeof body['title'] === 'string') errorInfo = httpStatus + ': ' + body['title'];
            } else if (typeof responseBody === 'string') {
                try {
                    const parsed = JSON.parse(responseBody) as { detail?: string; title?: string };
                    if (parsed.detail) errorMessage = parsed.detail;
                    if (parsed.title) errorInfo = httpStatus + ': ' + parsed.title;
                } catch {
                    if (httpStatus === 404 || httpStatus === 500) {
                        errorMessage = this.translate.translate('erroreAPINonDisponibile');
                    }
                }
            }
        } else if (httpStatus === 404 || httpStatus === 500) {
            errorMessage = this.translate.translate('erroreAPINonDisponibile');
        }

        this.error(errorInfo, errorMessage);
    }
}
