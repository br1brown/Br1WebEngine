import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { ThemeService } from './theme.service';
import { TranslateService } from './translate.service';
import type { ProblemDetails } from './base-api.service';

type SwalType = typeof import('sweetalert2').default;

export interface ValidationResult {
    isValid: boolean;
    errors?: string[];
}


export interface InteractContext {
    popup: HTMLElement;
    $: <T extends HTMLElement = HTMLElement>(selector: string) => T;
    byId: <T extends HTMLElement = HTMLElement>(id: string) => T;
}

export interface InteractConfig<T> {
    title: string;
    html: string | HTMLElement;
    confirmText?: string;
    cancelText?: string;
    showLoaderOnConfirm?: boolean;
    validation?: (ctx: InteractContext) => ValidationResult;
    mapResult?: (ctx: InteractContext) => T;
}

/**
 * Notifiche utente via SweetAlert2.
 * Metodi: success(), error(), loading(), close(), confirm(), prompt(), toast(), validationErrors(), handleApiError().
 * handleApiError() legge ProblemDetails (RFC 9457) dal backend o traduce il codice HTTP via i18n.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
    private translate = inject(TranslateService);
    private theme = inject(ThemeService);
    private platformId = inject(PLATFORM_ID);
    private swalPromise?: Promise<SwalType>;

    private loadSwal(): Promise<SwalType> | null {
        if (!isPlatformBrowser(this.platformId)) return null;
        return this.swalPromise ??= import('sweetalert2').then(module => module.default);
    }

    /**
     * SwAl pre-configurato col tema del template:
     *  - theme 'bootstrap-5-light' o '-dark' a seconda di themeTone, così che il
     *    popup segua sempre lo schema chiaro/scuro corrente (richiede l'import di
     *    'sweetalert2/themes/bootstrap-5.css' in styles.css);
     *  - confirmButton: btn-success (verde universale, segnale positivo)
     *  - cancelButton:  btn-outline-secondary (neutro adattivo via --colorSecondary)
     *  - denyButton:    btn-danger (rosso per azioni distruttive)
     * `buttonsStyling: false` disabilita lo styling default di Swal così che le
     * classi Bootstrap prevalgano. Il mixin viene ricreato ad ogni call per
     * essere reattivo a cambi di themeTone a runtime.
     */
    private loadThemedSwal(): Promise<SwalType> | null {
        const base = this.loadSwal();
        if (!base) return null;
        const themeVariant = this.theme.themeTone() === 'dark'
            ? 'bootstrap-5-dark'
            : 'bootstrap-5-light';
        return base.then(Swal => Swal.mixin({
            theme: themeVariant,
            buttonsStyling: false,
            customClass: {
                confirmButton: 'btn btn-success',
                cancelButton:  'btn btn-outline-secondary ms-2',
                denyButton:    'btn btn-danger ms-2',
            },
        }));
    }

    // --- FEEDBACK STANDARD ---

    success(message: string, onClose?: () => void): void {
        const swal = this.loadThemedSwal();
        if (swal) {
            void swal.then(Swal =>
                Swal.fire(this.translate.translate('ottimoStato') + '!', message, 'success').then(() => onClose?.())
            );
        } else if (isPlatformBrowser(this.platformId)) {
            window.alert(message);
            onClose?.();
        }
    }

    error(title: string, message: string): void {
        const swal = this.loadThemedSwal();
        if (swal) {
            void swal.then(Swal => {
                Swal.close();
                void Swal.fire(title, message, 'error');
            });
        } else if (isPlatformBrowser(this.platformId)) {
            window.alert(`${title}\n${message}`);
        }
    }

    // --- LOADING ---

    openLoading(message?: string): void {
        void this.loadThemedSwal()?.then(Swal =>
            Swal.fire({
                title: message ?? this.translate.translate('caricamentoStato'),
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            })
        );
    }

    closeLoading(): void {
        void this.loadThemedSwal()?.then(Swal => Swal.close());
    }

    // --- INTERAZIONE ---

    async confirm(title: string, text: string, options?: {
        confirmText?: string;
        cancelText?: string;
        icon?: 'question' | 'info' | 'warning';
        allowOutsideClick?: boolean;
    }): Promise<boolean> {
        const swal = this.loadThemedSwal();
        if (!swal) return false;

        const Swal = await swal;
        const result = await Swal.fire({
            title,
            text,
            icon: options?.icon ?? 'question',
            showCancelButton: true,
            confirmButtonText: options?.confirmText ?? this.translate.translate('siAzione'),
            cancelButtonText: options?.cancelText ?? this.translate.translate('annullaAzione'),
            allowOutsideClick: options?.allowOutsideClick ?? true,
        });
        return result.isConfirmed;
    }

    async prompt(title: string, inputLabel: string,
        confirmText?: string,
        cancelText?: string,
        defaultValue?: string,
        validator?: (value: string) => ValidationResult
    ): Promise<string | null> {
        const swal = this.loadThemedSwal();
        if (!swal) {
            if (isPlatformBrowser(this.platformId)) {
                return window.prompt(`${title}\n${inputLabel}`, defaultValue ?? '') ?? null;
            }
            return null;
        }

        const Swal = await swal;
        const result = await Swal.fire({
            title,
            input: 'text',
            inputLabel,
            inputPlaceholder: inputLabel,
            inputValue: defaultValue ?? '',
            showCancelButton: true,
            confirmButtonText: confirmText ?? this.translate.translate('siAzione'),
            cancelButtonText: cancelText ?? this.translate.translate('annullaAzione'),
            inputValidator: (value: string) => {
                if (validator) {
                    const res = validator(value);
                    return !res.isValid ? this.formatErrors(res.errors) : null;
                }
                if (!value) {
                    return this.translate.translate('campoObbligatorioErrore');
                }
                return null;
            }
        });
        return result.isConfirmed ? (result.value as string) : null;
    }

    async interact<T = unknown>(config: InteractConfig<T>): Promise<T | null> {
        const swal = this.loadThemedSwal();
        if (!swal) return null;

        const Swal = await swal;

        try {
            const result = await Swal.fire({
                title: config.title,
                html: config.html,
                showCancelButton: true,
                confirmButtonText: config.confirmText ?? this.translate.translate('siAzione'),
                cancelButtonText: config.cancelText ?? this.translate.translate('annullaAzione'),
                showLoaderOnConfirm: config.showLoaderOnConfirm ?? false,
                preConfirm: () => {
                    const popup = Swal.getPopup();
                    if (!popup) {
                        Swal.showValidationMessage(this.translate.translate('fallbackErrore'));
                        return false;
                    }

                    const ctx = this.createContext(popup);

                    if (config.validation) {
                        const res = config.validation(ctx);
                        if (!res.isValid) {
                            Swal.showValidationMessage(this.formatErrors(res.errors, true));
                            return false;
                        }
                    }

                    return config.mapResult ? config.mapResult(ctx) : true;
                }
            });

            return result.isConfirmed ? (result.value as T) : null;
        } catch (err) {
            console.error('[NotificationService] Errore in interact:', err);
            return null;
        }
    }

    private createContext(popup: HTMLElement): InteractContext {
        const cache = new Map<string, HTMLElement>();

        const resolve = <T extends HTMLElement>(selector: string, errorMsg: string): T => {
            if (!cache.has(selector)) {
                const el = popup.querySelector<T>(selector);
                if (!el) throw new Error(errorMsg);
                cache.set(selector, el);
            }
            return cache.get(selector) as T;
        };

        return {
            popup,
            $: <T extends HTMLElement = HTMLElement>(selector: string): T =>
                resolve<T>(selector, `Elemento non trovato: ${selector}`),
            byId: <T extends HTMLElement = HTMLElement>(id: string): T =>
                resolve<T>(`#${id}`, `Elemento con id "${id}" non trovato`),
        };
    }

    private formatErrors(errors?: string[], html = false): string {
        if (!errors?.length) return this.translate.translate('fallbackErrore');
        return html ? errors.join('<br>') : errors.join('\n');
    }

    // --- TOAST ---

    toast(message: string, icon: 'success' | 'error' | 'info' | 'warning' = 'success'): void {
        void this.loadThemedSwal()?.then(Swal => {
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true,
                didOpen: (toast) => {
                    toast.addEventListener('mouseenter', Swal.stopTimer);
                    toast.addEventListener('mouseleave', Swal.resumeTimer);
                    toast.addEventListener('focus', Swal.stopTimer);
                    toast.addEventListener('blur', Swal.resumeTimer);
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

        const swal = this.loadThemedSwal();
        if (swal) {
            void swal.then(Swal => {
                const ul = document.createElement('ul');
                ul.className = 'text-start small mb-0 mt-2';
                items.forEach(msg => {
                    const li = document.createElement('li');
                    li.textContent = msg;
                    ul.appendChild(li);
                });
                return Swal.fire({
                    title,
                    html: ul,
                    icon: 'warning',
                    confirmButtonText: this.translate.translate('chiudiAzione'),
                });
            });
        } else if (isPlatformBrowser(this.platformId)) {
            window.alert(`${title}\n${items.join('\n')}`);
        }
    }

    // --- ERRORI API ---

    handleApiError(
        httpStatus: number, 
        problem: ProblemDetails | null, 
        overrideKeys?: { titleKey?: string, descKey?: string }
    ): void {
        // Gestione standard 400 Bad Request con errori di validazione
        if (httpStatus === 400 && problem?.errors) {
            this.validationErrors(
                this.translate.translate('errore400Titolo'),
                problem.errors
            );
            return;
        }

        const keyInfo = overrideKeys?.titleKey ?? `errore${httpStatus}Titolo`;
        const keyDesc = overrideKeys?.descKey ?? `errore${httpStatus}Descrizione`;

        let errorInfo = this.translate.translate(keyInfo);
        let errorMessage = this.translate.translate(keyDesc);

        // Se `translate` restituisce esattamente la chiave in ingresso (es. "errore418Titolo"),
        // significa che non esiste una traduzione definita nei file JSON per quello status code.
        const hasSpecificTitle = errorInfo !== keyInfo;
        const hasSpecificDesc = errorMessage !== keyDesc;

        // Se non abbiamo una descrizione tradotta per questo status, usiamo quella di fallback
        if (!hasSpecificDesc) errorMessage = this.translate.translate('erroreImprevisto');
        
        // Se non abbiamo un titolo tradotto, usiamo "Errore 418"
        // Altrimenti, componiamo il titolo "404: Pagina non trovata"
        if (!hasSpecificTitle) {
            errorInfo = this.translate.translate('erroreGenerico') + ' ' + httpStatus;
        } else {
            errorInfo = httpStatus + ': ' + errorInfo;
        }

        // Se il backend ha inviato un ProblemDetails valido, lo uniamo ai nostri fallback
        if (problem) {
            // Il dettaglio del backend vince se presente (solitamente è più specifico)
            if (problem.detail) {
                errorMessage = problem.detail;
            }
            
            // Il titolo del backend viene usato solo se non abbiamo una traduzione specifica
            if (problem.title) {
                if (!hasSpecificTitle) {
                    errorInfo = httpStatus + ': ' + problem.title;
                } else {
                    console.info(`[API Info] Ignorato titolo dal backend "${problem.title}" per HTTP ${httpStatus}. Usata traduzione locale.`);
                }
            }
        } else if (httpStatus === 404 || httpStatus === 500) {
            // Se non c'è body valido, i 404/500 hanno spesso bisogno di dire "API irraggiungibile"
            errorMessage = this.translate.translate('apiNonRaggiungibileErrore');
        }

        this.error(errorInfo, errorMessage);
    }
}

