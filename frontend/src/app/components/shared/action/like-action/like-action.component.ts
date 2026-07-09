import { Component, computed, input } from '@angular/core';
import { BaseActionComponent } from '../../base/base-action.component';

/**
 * Bottone "mi piace": registra un apprezzamento tramite `action` (nessun contenuto
 * prodotto o trasformato, a differenza degli altri componenti azione). Stato piatto:
 * una volta `liked`, il click è no-op — niente "togli mi piace".
 */
@Component({
    selector: 'app-like-action',
    standalone: true,
    imports: [],
    templateUrl: './like-action.component.html',
})
export class LikeActionComponent extends BaseActionComponent {
    protected readonly defaultLabelKey = 'mettiMiPiaceAzione';

    /** Funzione che registra l'apprezzamento (sync o async). */
    readonly action = input.required<() => void | Promise<void>>();

    /** Stato iniziale "già piaciuto": se `true` il bottone è attivo e il click è no-op. */
    readonly liked = input(false);

    override readonly displayLabel = computed(() =>
        this.liked()
            ? this.translate.translate('miPiaceGia')
            : this.translate.translate(this.label() ?? this.defaultLabelKey)
    );

    protected onClick(): void {
        if (this.liked()) return;
        void this.run(async () => {
            await this.action()();
            this.notify.toast(this.translate.translate('miPiaceConferma'), 'success');
        });
    }
}
