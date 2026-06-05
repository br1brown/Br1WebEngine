import { Directive, computed, inject, input, signal } from '@angular/core';
import { TranslateService } from '../../../core/engine/services/translate.service';
import { NotificationService } from '../../../core/engine/services/notification.service';

/**
 * BASE ACTION COMPONENT
 *
 * Punto unico che centralizza la parte "sporca" comune a tutti i componenti
 * azione (copy, share, speech, download, pdf, mail):
 *  - input di label/showLabel/fullWidth
 *  - traduzione della label (displayLabel)
 *  - stato di loading
 *  - esecuzione protetta del lavoro asincrono con gestione errori + notifica
 *
 * Ogni componente concreto dichiara solo:
 *  - quale chiave i18n usare di default (`defaultLabelKey`)
 *  - quale servizio iniettare e cosa farci dentro `run()`
 *
 * Così chi usa il componente non inietta mai il servizio: passa al massimo una
 * funzione che produce il dato e il componente fa il resto.
 */
@Directive({
    host: {
        // inline di default; quando fullWidth, l'host diventa block a tutta
        // larghezza così che il `w-100` sull'elemento interno riempa davvero il padre.
        '[class.d-inline-block]': '!fullWidth()',
        '[class.d-block]': 'fullWidth()',
    },
})
export abstract class BaseActionComponent {
    protected readonly translate = inject(TranslateService);
    protected readonly notify = inject(NotificationService);

    /** Chiave i18n (o stringa letterale) per label e aria-label. */
    readonly label = input<string>();
    /** Mostra la label testuale accanto all'icona. */
    readonly showLabel = input(false);
    /** Occupa tutta la larghezza del contenitore (nessun padre deve bucare il CSS). */
    readonly fullWidth = input(false);

    /** Stato di caricamento per le azioni asincrone. */
    readonly loading = signal(false);

    /** Chiave i18n di default, fornita da ogni componente concreto. */
    protected abstract readonly defaultLabelKey: string;

    /** Label tradotta da mostrare/annunciare. Sovrascrivibile per stati dinamici. */
    readonly displayLabel = computed(() =>
        this.translate.translate(this.label() ?? this.defaultLabelKey)
    );

    /**
     * Esegue il lavoro specifico del componente in modo protetto:
     * gestisce il flag di loading, previene la doppia esecuzione e notifica
     * un eventuale errore. I componenti concreti passano solo la logica
     * (la chiamata al servizio), senza occuparsi del resto.
     */
    protected async run(work: () => void | Promise<void>): Promise<void> {
        if (this.loading()) return;
        this.loading.set(true);
        try {
            await work();
        } catch {
            this.notify.toast(this.translate.translate('erroreImprevisto'), 'error');
        } finally {
            this.loading.set(false);
        }
    }
}
