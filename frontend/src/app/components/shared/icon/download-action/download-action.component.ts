import { Component, computed, input, inject, signal } from '@angular/core';
import { ShareService } from '../../../../core/engine/services/share.service';
import { TranslateService } from '../../../../core/engine/services/translate.service';

@Component({
    selector: 'app-download-action',
    standalone: true,
    imports: [],
    templateUrl: './download-action.component.html',
    styleUrl: './download-action.component.css',
    host: { class: 'd-inline-block' }
})
export class DownloadActionComponent {
    private readonly shareService = inject(ShareService);
    private readonly translate = inject(TranslateService);

    /** Funzione che restituisce il Blob da scaricare (sync o async). */
    readonly action = input.required<() => Blob | Promise<Blob>>();

    /** Nome del file scaricato. */
    readonly filename = input.required<string>();

    /** Chiave i18n (o stringa letterale) per label e aria-label. */
    readonly label = input<string>();
    readonly showLabel = input(false);

    readonly loading = signal(false);

    readonly displayLabel = computed(() =>
        this.translate.translate(this.label() ?? 'scaricaAzione')
    );

    protected async onClick(): Promise<void> {
        if (this.loading()) return;
        this.loading.set(true);
        try {
            const blob = await this.action()();
            this.shareService.downloadBlob(blob, this.filename());
        } finally {
            this.loading.set(false);
        }
    }
}
