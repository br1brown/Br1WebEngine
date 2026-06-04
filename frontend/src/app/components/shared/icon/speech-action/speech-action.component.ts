import { Component, computed, input, inject, OnDestroy } from '@angular/core';
import { SpeechService } from '../../../../core/engine/services/speech.service';
import { TranslateService } from '../../../../core/engine/services/translate.service';

@Component({
    selector: 'app-speech-action',
    standalone: true,
    imports: [],
    templateUrl: './speech-action.component.html',
    styleUrl: './speech-action.component.css',
    host: { class: 'd-inline-block' }
})
export class SpeechActionComponent implements OnDestroy {
    private readonly speechService = inject(SpeechService);
    private readonly translate = inject(TranslateService);

    /** Funzione che restituisce il testo da leggere (sync o async). */
    readonly action = input.required<() => string | Promise<string>>();

    /** Chiave i18n per label in stato idle. */
    readonly label = input<string>();
    /** Chiave i18n per label in stato speaking. */
    readonly labelStop = input<string>();
    readonly showLabel = input(false);

    readonly isSpeaking = this.speechService.isSpeaking;

    readonly displayLabel = computed(() =>
        this.isSpeaking()
            ? this.translate.translate(this.labelStop() ?? 'speechStop')
            : this.translate.translate(this.label() ?? 'speechPlay')
    );

    protected async onClick(): Promise<void> {
        if (this.isSpeaking()) {
            this.speechService.stop();
            return;
        }
        const text = await this.action()();
        this.speechService.speak(text);
    }

    ngOnDestroy(): void {
        this.speechService.stop();
    }
}
