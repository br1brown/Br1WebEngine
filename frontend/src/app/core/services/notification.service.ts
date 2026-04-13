import { Injectable, inject } from '@angular/core';
import { TranslateService } from './translate.service';

/**
 * Notifiche utente via SweetAlert2.
 * Metodi: success(), error(), confirm(), toast(), handleApiError().
 * handleApiError() legge ProblemDetails (RFC 9457) dal backend o traduce il codice HTTP via i18n.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
    private translate = inject(TranslateService);
    private swalPromise?: Promise<typeof import('sweetalert2').default>;

    /**
     * Carica SweetAlert2 solo al primo utilizzo e riusa la stessa Promise.
     * Questo evita di mettere la libreria nel bundle iniziale.
     */
    private loadSwal(): Promise<typeof import('sweetalert2').default> {
        return this.swalPromise ??= import('sweetalert2').then(module => module.default);
    }

    /** Mostra un popup di successo. Se fornito, onClose viene invocato alla chiusura. */
    success(message: string, onClose?: () => void): void {
        void this.loadSwal().then(Swal =>
            Swal.fire(
                this.translate.translate('ottimo') + '!',
                message,
                'success'
            ).then(() => onClose?.())
        );
    }

    /** Mostra un popup di errore con titolo e messaggio personalizzati */
    error(title: string, message: string): void {
        void this.loadSwal().then(Swal => {
            if (Swal.isVisible()) return;
            Swal.fire(title, message, 'error');
        });
    }

    /**
     * Mostra un popup di conferma con bottoni "Si" e "Annulla".
     * Invoca onConfirm o onCancel in base alla scelta dell'utente.
     */
    confirm(title: string, text: string, callbacks: { onConfirm: () => void; onCancel?: () => void }): void {
        void this.loadSwal().then(Swal =>
            Swal.fire({
                title,
                text,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: this.translate.translate('si') || 'Si',
                cancelButtonText: this.translate.translate('annulla') || 'Annulla'
            }).then(result => result.isConfirmed ? callbacks.onConfirm() : callbacks.onCancel?.())
        );
    }

    /**
     * Mostra una notifica breve (toast) nell'angolo in alto a destra.
     * Scompare automaticamente dopo 3 secondi, senza richiedere interazione.
     * @param icon  Tipo di icona: 'success' (predefinita), 'error', 'info', 'warning'
     */
    toast(message: string, icon: 'success' | 'error' | 'info' | 'warning' = 'success'): void {
        // Manteniamo l'API sincrona per i caller: il caricamento lazy resta incapsulato qui.
        void this.showToast(message, icon);
    }

    private async showToast(message: string, icon: 'success' | 'error' | 'info' | 'warning'): Promise<void> {
        const Swal = await this.loadSwal();
        await Swal.fire({
            toast: true,
            position: 'top-end',
            icon,
            title: message,
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
        });
    }


    /**
     * Mostra un popup con un campo di testo.
     * Invoca onSubmit con il valore inserito, oppure onCancel se l'utente annulla.
     */
    prompt(title: string, inputLabel: string, callbacks: { onSubmit: (value: string) => void; onCancel?: () => void }, options?: {
        confirmText?: string;
        cancelText?: string;
    }): void {
        void this.loadSwal().then(Swal =>
            Swal.fire({
                title,
                input: 'text',
                inputLabel,
                inputPlaceholder: inputLabel,
                showCancelButton: true,
                confirmButtonText: options?.confirmText ?? this.translate.translate('si'),
                cancelButtonText: options?.cancelText ?? this.translate.translate('annulla'),
            }).then(result => {
                if (result.isConfirmed && result.value) {
                    callbacks.onSubmit(result.value as string);
                } else {
                    callbacks.onCancel?.();
                }
            })
        );
    }

    /**
     * Gestisce gli errori delle chiamate API.
     *
     * Il backend restituisce errori in formato ProblemDetails (RFC 9457):
     *   { status: 404, title: "Not Found", detail: "Risorsa non trovata", traceId: "..." }
     *
     * Il metodo:
     * 1. Se il body e' un ProblemDetails (ha "detail" o "title"), usa quei campi
     * 2. Altrimenti, traduce il codice HTTP tramite le chiavi i18n (errore404Info, errore404Desc)
     * 3. Se non trova traduzioni specifiche, usa un messaggio generico
     */
    handleApiError(httpStatus: number, responseBody?: any): void {
        const keyInfo = `errore${httpStatus}Info`;
        const keyDesc = `errore${httpStatus}Desc`;

        let errorInfo = this.translate.translate(keyInfo);
        let errorMessage = this.translate.translate(keyDesc);

        // Se la chiave non ha traduzione, il servizio restituisce la chiave stessa
        if (errorMessage === keyDesc) {
            errorMessage = this.translate.translate('erroreImprevisto');
        }

        if (errorInfo === keyInfo) {
            errorInfo = this.translate.translate('errore') + ' ' + httpStatus;
        } else {
            errorInfo = httpStatus + ': ' + errorInfo;
        }

        // Estrae informazioni dal body della risposta
        if (responseBody) {
            if (typeof responseBody === 'object') {
                // ProblemDetails (RFC 9457): { status, title, detail }
                if (responseBody.detail) {
                    errorMessage = responseBody.detail;
                }
                if (responseBody.title) {
                    errorInfo = httpStatus + ': ' + responseBody.title;
                }
            } else if (typeof responseBody === 'string') {
                try {
                    const parsed = JSON.parse(responseBody);
                    if (parsed.detail) errorMessage = parsed.detail;
                    if (parsed.title) errorInfo = httpStatus + ': ' + parsed.title;
                } catch {
                    // Risposta non-JSON: probabilmente le API non sono raggiungibili
                    if (httpStatus === 404 || httpStatus === 500) {
                        errorMessage = this.translate.translate('erroreAPINonDisponibile');
                    }
                }
            }
        } else if (httpStatus === 404 || httpStatus === 500) {
            errorMessage = this.translate.translate('erroreAPINonDisponibile');
        }

        // Non blocchiamo il flusso chiamante: il popup viene aperto appena SweetAlert2 e' pronto.
        void this.error(errorInfo, errorMessage);
    }
}
