import { Component, input, inject } from '@angular/core';
import { BaseActionComponent } from '../../base/base-action.component';
import { ShareService } from '../../../../core/engine/services/share.service';

@Component({
    selector: 'app-copy-action',
    standalone: true,
    imports: [],
    templateUrl: './copy-action.component.html',
})
export class CopyActionComponent extends BaseActionComponent {
    private readonly share = inject(ShareService);

    protected readonly defaultLabelKey = 'copiaAzione';

    /** Funzione che restituisce il testo da copiare (sync o async). */
    readonly action = input.required<() => string | Promise<string>>();

    protected onClick(): void {
        void this.run(async () => {
            const text = await this.action()();
            await this.share.copyText(text);
        });
    }
}
