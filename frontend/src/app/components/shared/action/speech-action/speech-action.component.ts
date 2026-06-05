import { Component, computed, input, inject, OnDestroy } from '@angular/core';
import { BaseActionComponent } from '../../base/base-action.component';
import { SpeechService } from '../../../../core/engine/services/speech.service';

@Component({
    selector: 'app-speech-action',
    standalone: true,
    imports: [],
    templateUrl: './speech-action.component.html',
})
export class SpeechActionComponent extends BaseActionComponent implements OnDestroy {
    private readonly speech = inject(SpeechService);

    protected readonly defaultLabelKey = 'speechPlay';

    /** Funzione che restituisce il testo da leggere (sync o async). */
    readonly action = input.required<() => string | Promise<string>>();

    /** Chiave i18n per la label in stato "in riproduzione". */
    readonly labelStop = input<string>();

    readonly isSpeaking = this.speech.isSpeaking;

    override readonly displayLabel = computed(() =>
        this.isSpeaking()
            ? this.translate.translate(this.labelStop() ?? 'speechStop')
            : this.translate.translate(this.label() ?? this.defaultLabelKey)
    );

    protected onClick(): void {
        if (this.isSpeaking()) {
            this.speech.stop();
            return;
        }
        void this.run(async () => {
            const text = await this.action()();
            this.speech.speak(text);
        });
    }

    ngOnDestroy(): void {
        this.speech.stop();
    }
}
