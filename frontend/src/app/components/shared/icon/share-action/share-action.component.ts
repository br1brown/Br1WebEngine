import { Component, computed, input, inject } from '@angular/core';
import { ShareService } from '../../../../core/engine/services/share.service';
import { TranslateService } from '../../../../core/engine/services/translate.service';

@Component({
    selector: 'app-share-action',
    standalone: true,
    imports: [],
    templateUrl: './share-action.component.html',
    styleUrl: './share-action.component.css',
    host: { class: 'd-inline-block' }
})
export class ShareActionComponent {
    private readonly share = inject(ShareService);
    private readonly translate = inject(TranslateService);

    /** Funzione che restituisce il testo da condividere (sync o async). */
    readonly action = input.required<() => string | Promise<string>>();

    /** Titolo passato alla Web Share API. */
    readonly title = input<string>('');

    /** Chiave i18n (o stringa letterale) per label e aria-label. */
    readonly label = input<string>();
    readonly showLabel = input(false);

    readonly displayLabel = computed(() =>
        this.translate.translate(this.label() ?? 'condividiAzione')
    );

    protected async onClick(): Promise<void> {
        const text = await this.action()();
        await this.share.shareText(this.title(), text);
    }
}
