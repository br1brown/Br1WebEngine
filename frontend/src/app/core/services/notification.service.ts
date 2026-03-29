import { Injectable, inject } from '@angular/core';
import { TranslateService } from './translate.service';
import Swal from 'sweetalert2';

/**
 * Notifiche utente via SweetAlert2.
 * Metodi: success(), error(), confirm(), toast(), handleApiError().
 * handleApiError() legge ProblemDetails (RFC 9457) dal backend o traduce il codice HTTP via i18n.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
    private translate = inject(TranslateService);

    /** Mostra un popup di successo con il messaggio specificato */
    success(message: string): Promise<any> {
        return Swal.fire(
            this.translate.t('ottimo') + '!',
            message,
            'success'
        );
    }

    /** Mostra un popup di errore con titolo e messaggio personalizzati */
    error(title: string, message: string): Promise<any> {
        return Swal.fire(title, message, 'error');
    }

    /**
     * Mostra un popup di conferma con bottoni "Si" e "Annulla".
     * @returns true se l'utente ha cliccato "Si", false se ha annullato
     */
    confirm(title: string, text: string): Promise<boolean> {
        return Swal.fire({
            title,
            text,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: this.translate.t('si') || 'Sì',
            cancelButtonText: this.translate.t('annulla') || 'Annulla'
        }).then(result => result.isConfirmed);
    }

    /**
     * Mostra una notifica breve (toast) nell'angolo in alto a destra.
     * Scompare automaticamente dopo 3 secondi, senza richiedere interazione.
     * @param icon  Tipo di icona: 'success' (predefinita), 'error', 'info', 'warning'
     */
    toast(message: string, icon: 'success' | 'error' | 'info' | 'warning' = 'success'): void {
        Swal.fire({
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

        let errorInfo = this.translate.t(keyInfo);
        let errorMessage = this.translate.t(keyDesc);

        // Se la chiave non ha traduzione, il servizio restituisce la chiave stessa
        if (errorMessage === keyDesc) {
            errorMessage = this.translate.t('erroreImprevisto');
        }

        if (errorInfo === keyInfo) {
            errorInfo = this.translate.t('errore') + ' ' + httpStatus;
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
                        errorMessage = this.translate.t('erroreAPINonDisponibile');
                    }
                }
            }
        } else if (httpStatus === 404 || httpStatus === 500) {
            errorMessage = this.translate.t('erroreAPINonDisponibile');
        }

        this.error(errorInfo, errorMessage);
    }


}
