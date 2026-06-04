import { Component, computed, input, inject } from '@angular/core';
import { TranslateService } from '../../../../core/engine/services/translate.service';

export interface PdfActionConfig {
    url: string;
    openInTab: boolean;
}

@Component({
    selector: 'app-pdf-action',
    standalone: true,
    imports: [],
    templateUrl: './pdf-action.component.html',
    styleUrl: './pdf-action.component.css',
    host: { class: 'd-inline-block' }
})
export class PdfActionComponent {
    private readonly translate = inject(TranslateService);

    readonly config = input.required<PdfActionConfig>();
    readonly label = input<string>();
    readonly showLabel = input(false);

    readonly displayLabel = computed(() =>
        this.translate.translate(
            this.label() ?? (this.config().openInTab ? 'apriPdfAzione' : 'scaricaPdfAzione')
        )
    );

    protected onClick(): void {
        const { url, openInTab } = this.config();
        if (openInTab) {
            window.open(url, '_blank', 'noopener,noreferrer');
        } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = url.split('/').pop() ?? 'document.pdf';
            a.click();
        }
    }
}
