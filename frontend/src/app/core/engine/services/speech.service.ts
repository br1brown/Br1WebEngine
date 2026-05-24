import { inject, Injectable, signal, effect, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateService } from './translate.service';

/**
 * SPEECH SERVICE
 * Gestisce la sintesi vocale (Text-to-Speech) integrando il supporto multilingua.
 * Utilizza le API native del browser per leggere testi ad alta voce.
 */
@Injectable({ providedIn: 'root' })
export class SpeechService {
    private readonly translate = inject(TranslateService);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    /** Signal: indica se il browser sta riproducendo audio in questo momento */
    readonly isSpeaking = signal(false);

    /** Signal: la voce di sistema attualmente selezionata in base alla lingua */
    readonly currentVoice = signal<SpeechSynthesisVoice | null>(null);

    constructor() {
        // La sintesi vocale è disponibile solo nel browser, non in SSR (Server)
        if (this.isBrowser && window.speechSynthesis) {

            // L'evento 'voiceschanged' scatta quando il sistema finisce di caricare le voci disponibili
            window.speechSynthesis.addEventListener('voiceschanged', () => this.updateVoice());

            // aggiorna la voce automaticamente ad ogni cambio lingua (effect reagisce al signal)
            effect(() => {
                this.translate.currentLang(); // Registra la dipendenza dal signal della lingua
                this.updateVoice();           // Aggiorna la voce corrispondente
            });
        }
    }

    /**
     * Legge un testo usando la sintesi vocale.
     * @param text Il testo da convertire in audio.
     * @param options Opzioni per velocità (rate) e tono (pitch).
     */
    speak(text: string, options?: { rate?: number; pitch?: number }): void {
        if (!this.isBrowser || !window.speechSynthesis) return;

        // Interrompe eventuali letture precedenti per evitare sovrapposizioni
        this.stop();

        // Crea l'oggetto "frase" (Utterance)
        const utterance = new SpeechSynthesisUtterance(text);

        // Sincronizza la lingua con quella dell'app
        utterance.lang = this.translate.currentLang();

        // Tenta di assegnare la voce migliore disponibile per quella lingua
        const voice = this.findBestVoice(utterance.lang);
        if (voice) utterance.voice = voice;

        // Configura parametri opzionali (default: 1)
        utterance.rate = options?.rate ?? 1;   // Velocità (0.1 a 10)
        utterance.pitch = options?.pitch ?? 1; // Tono (0 a 2)

        // Gestione dello Stato tramite Signal
        utterance.onstart = () => this.isSpeaking.set(true);
        utterance.onend = () => this.isSpeaking.set(false);
        utterance.onerror = () => this.isSpeaking.set(false);

        // Avvia la riproduzione
        window.speechSynthesis.speak(utterance);
    }

    /** Interrompe immediatamente la sintesi vocale e resetta lo stato. */
    stop(): void {
        if (this.isBrowser && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            this.isSpeaking.set(false);
        }
    }

    /**
     * Cerca tra le voci installate nel sistema quella più adatta alla lingua richiesta.
     */
    private findBestVoice(lang: string): SpeechSynthesisVoice | null {
        const voices = window.speechSynthesis.getVoices();

        // Strategia di ricerca:
        // Cerca corrispondenza esatta (es. 'it-IT')
        // Se non la trova, cerca per prefisso (es. 'it')
        // Altrimenti ritorna null (il browser userà la voce di default)
        return voices.find(v => v.lang === lang)
            ?? voices.find(v => v.lang.startsWith(lang.split('-')[0]))
            ?? null;
    }

    /** Aggiorna il Signal della voce corrente chiamando la ricerca. */
    private updateVoice(): void {
        this.currentVoice.set(this.findBestVoice(this.translate.currentLang()));
    }
}