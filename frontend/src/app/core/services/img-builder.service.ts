/**
 * Servizio di generazione immagini su canvas.
 *
 * API pubblica: un solo metodo `build(text, opts?)` che crea il canvas
 * internamente e restituisce un Blob PNG pronto per download o condivisione.
 * Tutte le opzioni sono facoltative — se omesse vengono applicati i default
 * (colori dal tema corrente, font Arial 48px, larghezza 800px).
 */
import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ThemeService } from './theme.service';

export interface ImgBuildOptions {
    /** Colore di sfondo; default: colore primario del tema */
    bgColor?: string;
    /** Colore del testo; default: testo su colore primario del tema */
    textColor?: string;
    /** Dimensione font in px; default: 48 */
    fontSize?: number;
    /** Larghezza canvas in px; default: 800 */
    width?: number;
    /** Nome font (web-safe); default: 'Arial' */
    fontFamily?: string;
    /** Padding interno in px; default: 24 */
    margin?: number;
}

@Injectable({ providedIn: 'root' })
export class ImgBuilderService {
    private readonly theme = inject(ThemeService);
    private readonly platformId = inject(PLATFORM_ID);

    /** Font web-safe affidabili per rendering coerente su Windows, macOS e Linux. */
    private readonly fonts: Record<string, string> = {
        'Arial': 'Arial, sans-serif',
        'Georgia': 'Georgia, serif',
        'Courier New': '"Courier New", monospace',
        'Verdana': 'Verdana, sans-serif',
        'Times': '"Times New Roman", serif',
    };

    /**
     * Genera un'immagine con il testo fornito e restituisce un Blob PNG.
     * Il canvas viene creato e distrutto internamente — nessun elemento DOM da gestire.
     */
    build(text: string, opts?: ImgBuildOptions): Promise<Blob> {
        if (!isPlatformBrowser(this.platformId)) {
            return Promise.reject(new Error('Canvas non disponibile in SSR'));
        }
        const canvas = document.createElement('canvas');
        this.renderToCanvas(canvas, {
            text,
            bgColor: opts?.bgColor ?? this.theme.colorPrimary(),
            textColor: opts?.textColor ?? this.theme.colorPrimaryText(),
            fontSize: opts?.fontSize ?? 48,
            canvasWidth: opts?.width ?? 800,
            fontFamily: opts?.fontFamily ?? 'Arial',
            margin: opts?.margin ?? 24,
        });
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                blob => blob ? resolve(blob) : reject(new Error('Rendering canvas fallito')),
                'image/png'
            );
        });
    }

    /** Disegna sfondo e testo sul canvas con le impostazioni fornite. */
    private renderToCanvas(canvas: HTMLCanvasElement, opts: {
        text: string;
        bgColor: string;
        textColor: string;
        fontSize: number;
        canvasWidth: number;
        fontFamily: string;
        margin: number;
    }): void {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { text, bgColor, textColor, fontSize, canvasWidth: width, fontFamily, margin } = opts;
        const fontCss = `${fontSize}px ${this.fonts[fontFamily] ?? fontFamily}`;
        ctx.font = fontCss;

        const righe = this.splitTextIntoLines(ctx, text, width - margin * 2);

        // Altezza dinamica: contiene tutto il testo, minimo aspect ratio 4:3
        const height = Math.max(
            righe.length * fontSize * 1.4 + margin * 2,
            Math.ceil(width * 3 / 4)
        );

        canvas.width = width;
        canvas.height = height;

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);

        // Ri-applicato dopo il resize del canvas che resetta il contesto
        ctx.font = fontCss;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const lineHeight = fontSize * 1.4;
        const startY = (height - righe.length * lineHeight) / 2;

        for (let i = 0; i < righe.length; i++) {
            ctx.fillText(righe[i], width / 2, startY + i * lineHeight);
        }
    }

    /** Gestisce i newline manuali (\n) e poi fa il wrapping automatico per ogni paragrafo. */
    private splitTextIntoLines(ctx: CanvasRenderingContext2D, testo: string, maxWidth: number): string[] {
        return testo
            .replace(/\r\n/g, '\n')
            .split('\n')
            .flatMap(paragrafo => this.splitParagraphIntoLines(ctx, paragrafo, maxWidth));
    }

    /** Spezza un paragrafo in righe che rispettano la larghezza massima del canvas. */
    private splitParagraphIntoLines(ctx: CanvasRenderingContext2D, testo: string, maxWidth: number): string[] {
        const parole = testo.trim().split(/\s+/).filter(Boolean);
        if (!parole.length) return [''];

        const righe: string[] = [];
        let rigaCorrente = '';

        for (const parola of parole) {
            const candidato = rigaCorrente ? `${rigaCorrente} ${parola}` : parola;
            if (ctx.measureText(candidato).width <= maxWidth) {
                rigaCorrente = candidato;
            } else {
                if (rigaCorrente) righe.push(rigaCorrente);
                // Caso limite: singola parola più larga del canvas (es. URL lunghissimo)
                if (ctx.measureText(parola).width > maxWidth) {
                    let chunk = '';
                    for (const char of parola) {
                        if (ctx.measureText(chunk + char).width <= maxWidth) {
                            chunk += char;
                        } else {
                            if (chunk) righe.push(chunk);
                            chunk = char;
                        }
                    }
                    rigaCorrente = chunk;
                } else {
                    rigaCorrente = parola;
                }
            }
        }
        if (rigaCorrente) righe.push(rigaCorrente);
        return righe;
    }
}
