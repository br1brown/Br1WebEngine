import { Component, input, inject } from '@angular/core';
import { BaseActionComponent } from '../../base/base-action.component';
import { ShareService } from '../../../../core/engine/services/share.service';

@Component({
    selector: 'app-download-action',
    standalone: true,
    imports: [],
    templateUrl: './download-action.component.html',
})
export class DownloadActionComponent extends BaseActionComponent {
    private readonly share = inject(ShareService);

    protected readonly defaultLabelKey = 'scaricaAzione';

    /** Funzione che restituisce il Blob da scaricare (sync o async). */
    readonly action = input.required<() => Blob | Promise<Blob>>();

    /** Nome del file scaricato. */
    readonly filename = input.required<string>();

    protected onClick(): void {
        void this.run(async () => {
            const blob = await this.action()();
            this.share.downloadBlob(blob, this.filename());
        });
    }
}
