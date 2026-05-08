// Import dei decorator e helper di Angular necessari per l'injection
import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ThemeService } from './theme.service';

/**
 * Opzioni per la generazione dell'immagine.
 */
export interface ImgBuildOptions {
    /** Colore di sfondo */
    bgColor?: string;
    /** Colore del testo */
    textColor?: string;
    /** Dimensione del font in pixel */
    fontSize?: number;
    /** Famiglia del font */
    fontFamily?: string;
    /** Rapporto d'aspetto (es. '1:1', '16:9') */
    ratio?: '4:3' | '16:9' | '1:1' | '9:16';
    /** Larghezza massima di sicurezza */
    maxWidth?: number;
    /** Interlinea (default 1.4) */
    lineHeight?: number;
    /** Se false, il wrap automatico è disabilitato e rispetta solo i \n */
    wordWrap?: boolean;
}

/**
 * ImgBuilderService
 * Gestisce la creazione di immagini dinamiche su Canvas partendo da testo.
 */
@Injectable({ providedIn: 'root' })
export class ImgBuilderService {
    private readonly theme = inject(ThemeService);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    private readonly GLOBAL_MAX_DIMENSION = 8000;
    private readonly GLOBAL_MIN_DIMENSION = 125;

    private readonly fonts: Record<string, string> = {
        'Arial': 'Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
        'Georgia': 'Georgia, "Apple Color Emoji", "Segoe UI Emoji", serif',
        'Courier New': '"Courier New", "Apple Color Emoji", "Segoe UI Emoji", monospace',
        'Verdana': 'Verdana, "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
        'Times': '"Times New Roman", "Apple Color Emoji", "Segoe UI Emoji", serif',
    };

    /**
     * Converte il canvas generato in un Blob PNG (utile per download o upload)
     * - restituisce Promise<Blob|null>
     */
    async buildBlob(text: string, options?: ImgBuildOptions): Promise<Blob | null> {
        // Genero il canvas con la funzione principale
        const canvas = this.buildCanvas(text, options);
        // Converto in Blob usando toBlob (callback -> Promise)
        return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }

    /**
     * Converte il canvas in un File (pronto per upload)
     * - filename: nome del file risultante
     */
    async buildFile(text: string, filename = 'immagine.png', options?: ImgBuildOptions): Promise<File | null> {
        // Creo il blob e poi lo wrappo in File
        const blob = await this.buildBlob(text, options);
        return blob ? new File([blob], filename, { type: 'image/png' }) : null;
    }


    /**
     * Genera un HTMLCanvasElement basato sul testo e le opzioni fornite.
     * Coordina il calcolo delle dimensioni e il rendering finale.
     */
    buildCanvas(text: string, options: ImgBuildOptions = {}): HTMLCanvasElement {
        if (!this.isBrowser) throw new Error('Canvas non disponibile in SSR');

        const {
            fontSize = 40,
            fontFamily = Object.keys(this.fonts)[0],
            bgColor = this.theme.colorTema(),
            textColor = this.theme.colorTemaText(),
            ratio = '4:3',
            maxWidth = 1200,
            lineHeight = 1.4,
            wordWrap = true
        } = options;

        // Configurazione iniziale del contesto di misura
        const measureCanvas = document.createElement('canvas');
        const measureCtx = measureCanvas.getContext('2d')!;
        const fontStack = this.fonts[fontFamily] || fontFamily;
        this.configureContext(measureCtx, fontSize, fontStack, textColor);

        const normalizedText = this.normalizeWhitespace(text);
        const targetRatio = this.parseRatio(ratio);
        const padding = fontSize * 2; // Margine interno di sicurezza

        let finalWidth: number;
        let finalHeight: number;
        let lines: string[];

        // --- GESTIONE LOGICA DIMENSIONALE ---

        if (!wordWrap) {
            // IL TESTO COMANDA: Calcolo ingombro basato sulle righe originali
            lines = normalizedText.split('\n').map(l => l.trim() || ' ');
            const maxTextWidth = Math.max(...lines.map(l => measureCtx.measureText(l).width));

            const contentWidth = maxTextWidth + (padding * 2);
            const contentHeight = (lines.length * (fontSize * lineHeight)) + (padding * 2);

            // Espansione per rispettare il ratio scelto
            if (contentWidth / contentHeight > targetRatio) {
                finalWidth = contentWidth;
                finalHeight = contentWidth / targetRatio;
            } else {
                finalHeight = contentHeight;
                finalWidth = contentHeight * targetRatio;
            }
        } else {
            // IL CANVAS COMANDA: Il testo deve adattarsi a uno spazio predefinito
            const availableWidth = maxWidth - (padding * 2);
            lines = this.splitTextIntoLines(measureCtx, normalizedText, availableWidth, true);

            const maxTextWidth = Math.max(...lines.map(l => measureCtx.measureText(l).width));
            const totalTextHeight = lines.length * (fontSize * lineHeight);

            finalWidth = maxTextWidth + (padding * 2);
            finalHeight = totalTextHeight + (padding * 2);

            // Bilanciamento ratio basato sul blocco generato
            if (finalWidth / finalHeight > targetRatio) {
                finalHeight = finalWidth / targetRatio;
            } else {
                finalWidth = finalHeight * targetRatio;
            }
        }

        // --- RENDERING FINALE ---

        // Applicazione limiti di sicurezza globali
        finalWidth = Math.min(Math.max(finalWidth, this.GLOBAL_MIN_DIMENSION), this.GLOBAL_MAX_DIMENSION);
        finalHeight = Math.min(Math.max(finalHeight, this.GLOBAL_MIN_DIMENSION), this.GLOBAL_MAX_DIMENSION);

        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(finalWidth);
        canvas.height = Math.ceil(finalHeight);
        const ctx = canvas.getContext('2d')!;

        // Disegno dello sfondo
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Disegno del testo centrato
        this.configureContext(ctx, fontSize, fontStack, textColor);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const totalHeight = lines.length * (fontSize * lineHeight);
        let startY = (canvas.height - totalHeight) / 2 + (fontSize * lineHeight) / 2;

        lines.forEach((line, i) => {
            ctx.fillText(line, canvas.width / 2, startY + (i * fontSize * lineHeight));
        });

        return canvas;
    }

    /**
     * Imposta le proprietà base del contesto Canvas.
     */
    private configureContext(ctx: CanvasRenderingContext2D, size: number, family: string, textColor: string): void {
        ctx.font = `${size}px ${family}`;
        ctx.fillStyle = textColor;
    }

    /**
     * Trasforma la stringa ratio (es. "4:3") in valore numerico.
     */
    private parseRatio(r: string): number {
        const match = /^(\d+):(\d+)$/.exec(r);
        if (!match) return 4 / 3;
        const w = Number(match[1]);
        const h = Number(match[2]);
        return h === 0 ? 4 / 3 : w / h;
    }

    /**
     * Gestisce la divisione del testo in righe con supporto Emoji-Safe.
     */
    private splitTextIntoLines(ctx: CanvasRenderingContext2D, testo: string, maxWidth: number, wordWrap: boolean): string[] {
        if (!wordWrap) return testo.split('\n');

        return testo.split('\n').flatMap(paragrafo => {
            const p = paragrafo.trim();
            if (!p) return [' '];

            // Regex per isolare parole ed emoji senza rompere i caratteri speciali
            const matches = Array.from(p.matchAll(/(\p{Extended_Pictographic}(?:\p{Extended_Pictographic}|\uFE0F|\u200D)*)|([^\s]+)/gu));
            const parole = matches.map(m => m[0]);

            let righe: string[] = [];
            let rigaCorrente = '';

            parole.forEach(parola => {
                const candidato = rigaCorrente ? `${rigaCorrente} ${parola}` : parola;
                if (ctx.measureText(candidato).width <= maxWidth) {
                    rigaCorrente = candidato;
                } else {
                    if (rigaCorrente) righe.push(rigaCorrente);
                    rigaCorrente = parola;
                }
            });

            if (rigaCorrente) righe.push(rigaCorrente);
            return righe;
        });
    }

    /**
     * Pulisce il testo da spazi multipli e normalizza i newline.
     */
    private normalizeWhitespace(text: string): string {
        return text.replace(/\r\n/g, '\n')
            .split('\n')
            .map(line => line.replace(/\s+/g, ' ').trim())
            .join('\n');
    }
}