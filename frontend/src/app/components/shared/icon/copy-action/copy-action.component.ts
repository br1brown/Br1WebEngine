import { Component, computed, input, inject } from '@angular/core';
import { ShareService } from '../../../../core/engine/services/share.service';
import { TranslateService } from '../../../../core/engine/services/translate.service';

@Component({
    selector: 'app-copy-action',
    standalone: true,
    imports: [],
    templateUrl: './copy-action.component.html',
    styleUrl: './copy-action.component.css',
    host: { class: 'd-inline-block' }
})
export class CopyActionComponent {
    private readonly share = inject(ShareService);
    private readonly translate = inject(TranslateService);

    /** Funzione che restituisce il testo da copiare (sync o async). */
    readonly action = input.required<() => string | Promise<string>>();

    /** Chiave i18n (o stringa letterale) per label e aria-label. */
    readonly label = input<string>();
    readonly showLabel = input(false);

    readonly displayLabel = computed(() =>
        this.translate.translate(this.label() ?? 'copiaAzione')
    );

    protected async onClick(): Promise<void> {
        const text = await this.action()();
        await this.share.copyText(text);
    }
}
