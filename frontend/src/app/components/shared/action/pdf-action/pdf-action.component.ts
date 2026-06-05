import { Component, computed, inject, input } from '@angular/core';
import { BaseActionComponent } from '../../base/base-action.component';
import { ShareService } from '../../../../core/engine/services/share.service';

export interface PdfActionConfig {
    url: string;
    openInTab: boolean;
}

/**
 * PDF ACTION — ibrido fra le due nature:
 *  - openInTab=true  → comportamento di NAVIGAZIONE: apre il PDF in una scheda.
 *  - openInTab=false → comportamento d'AZIONE: forza davvero il download
 *    scaricando il file come Blob (riusa ShareService.downloadBlob, come la
 *    famiglia download). `<a download>` non basterebbe: i browser lo ignorano
 *    per i file cross-origin e si limitano ad aprirli.
 */
@Component({
    selector: 'app-pdf-action',
    standalone: true,
    imports: [],
    templateUrl: './pdf-action.component.html',
})
export class PdfActionComponent extends BaseActionComponent {
    private readonly share = inject(ShareService);

    readonly config = input.required<PdfActionConfig>();

    protected readonly defaultLabelKey = 'apriPdfAzione';

    override readonly displayLabel = computed(() =>
        this.translate.translate(
            this.label() ?? (this.config().openInTab ? 'apriPdfAzione' : 'scaricaPdfAzione')
        )
    );

    protected onClick(): void {
        const { url, openInTab } = this.config();
        if (openInTab) {
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
        }
        void this.run(async () => {
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                this.share.downloadBlob(await res.blob(), this.fileName(url));
            } catch {
                // Cross-origin senza CORS (o rete KO): degrada aprendo il file,
                // così l'utente lo ottiene comunque. Nessun errore: è un fallback riuscito.
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        });
    }

    private fileName(url: string): string {
        return url.split('/').pop()?.split(/[?#]/)[0] || 'document.pdf';
    }
}
