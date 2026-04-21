import { inject, Injectable, signal, effect, Injector } from '@angular/core';
import { TranslateService } from './translate.service';

@Injectable({ providedIn: 'root' })
export class SpeechService {
    private readonly translate = inject(TranslateService);
    private readonly injector = inject(Injector); // Recuperiamo l'iniettore

    readonly isSpeaking = signal(false);
    readonly currentVoice = signal<SpeechSynthesisVoice | null>(null);

    constructor() {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = () => this.updateVoice();

            // Specifichiamo l'iniettore per evitare l'errore nel service
            effect(() => {
                this.translate.currentLang();
                this.updateVoice();
            }, { injector: this.injector });
        }
    }

    speak(text: string, options?: { rate?: number; pitch?: number }): void {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;

        this.stop();

        const utterance = new SpeechSynthesisUtterance(text);

        // Configurazione lingua e voce
        utterance.lang = this.translate.currentLang();
        const voice = this.findBestVoice(utterance.lang);
        if (voice) utterance.voice = voice;

        // Opzioni extra (velocità e tono)
        utterance.rate = options?.rate ?? 1;
        utterance.pitch = options?.pitch ?? 1;

        // Gestione Stato
        utterance.onstart = () => this.isSpeaking.set(true);
        utterance.onend = () => this.isSpeaking.set(false);
        utterance.onerror = () => this.isSpeaking.set(false);

        window.speechSynthesis.speak(utterance);
    }

    stop(): void {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            this.isSpeaking.set(false);
        }
    }

    private findBestVoice(lang: string): SpeechSynthesisVoice | null {
        const voices = window.speechSynthesis.getVoices();
        // Cerchiamo prima una corrispondenza esatta (es. it-IT), poi parziale (it)
        return voices.find(v => v.lang === lang)
            ?? voices.find(v => v.lang.startsWith(lang.split('-')[0]))
            ?? null;
    }

    private updateVoice(): void {
        this.currentVoice.set(this.findBestVoice(this.translate.currentLang()));
    }
}
