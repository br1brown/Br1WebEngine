// Import dei decorator e helper di Angular necessari per l'injection
import { Injectable, inject, PLATFORM_ID } from '@angular/core';
// Helper per rilevare se siamo in ambiente browser (utile per SSR)
import { isPlatformBrowser } from '@angular/common';
// Servizio tema (fornisce colori di default)
import { ThemeService } from './theme.service';

// Interfaccia pubblica per le opzioni di costruzione immagine
export interface ImgBuildOptions {
    // Colore di sfondo dell'immagine
    bgColor?: string;
    // Colore del testo
    textColor?: string;
    // Dimensione del font in pixel
    fontSize?: number;
    // Nome del font (chiave della mappa fonts o font-family valida)
    fontFamily?: string;
    // Rapporto larghezza:altezza desiderato
    ratio?: '4:3' | '16:9' | '1:1' | '9:16';
    // Massima larghezza consentita (override di sicurezza)
    maxWidth?: number;
    // Massima altezza consentita (override di sicurezza)
    maxHeight?: number;
    // Moltiplicatore per l'interlinea (default 1.4)
    lineHeight?: number;
}

/**
 * ImgBuilderService
 * Servizio che genera canvas HTML5 "content-first" con:
 * - wrapping emoji-safe
 * - misurazione avanzata (actualBoundingBox quando disponibile)
 * - gestione SSR-safe
 * - ratio e limiti di sicurezza
 */
@Injectable({ providedIn: 'root' })
export class ImgBuilderService {
    // Iniettiamo ThemeService per ottenere colori di default
    private readonly theme = inject(ThemeService);
    // Determina se l'esecuzione è in browser (false su SSR)
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    // Limite massimo globale per evitare OOM
    private readonly GLOBAL_MAX_DIMENSION = 8000;
    // Limite minimo globale per evitare canvas microscopici
    private readonly GLOBAL_MIN_DIMENSION = 125;

    // Mappa dei font con fallback per emoji (evita quadratini vuoti)
    private readonly fonts: Record<string, string> = {
        'Arial': 'Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
        'Georgia': 'Georgia, "Apple Color Emoji", "Segoe UI Emoji", serif',
        'Courier New': '"Courier New", "Apple Color Emoji", "Segoe UI Emoji", monospace',
        'Verdana': 'Verdana, "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
        'Times': '"Times New Roman", "Apple Color Emoji", "Segoe UI Emoji", serif',
    };

    /**
     * Costruisce e ritorna un canvas con il testo renderizzato.
     * - text: stringa di input (può contenere newline ed emoji)
     * - options: personalizzazioni (colori, font, ratio, limiti)
     */
    buildCanvas(text: string, options: ImgBuildOptions = {}): HTMLCanvasElement {
        // Verifica SSR: il canvas non è disponibile lato server
        if (!this.isBrowser) throw new Error('Canvas non disponibile in SSR');

        // Estraggo le opzioni con valori di default
        const {
            fontSize = 40, // dimensione font di default
            fontFamily = Object.keys(this.fonts)[0], // primo font della mappa
            bgColor = this.theme.colorPrimary(), // colore di sfondo dal tema
            textColor = this.theme.colorPrimaryText(), // colore testo dal tema
            ratio = '4:3', // ratio di default
            maxWidth, // limite opzionale utente
            maxHeight, // limite opzionale utente
            lineHeight = 1.4 // line-height di default
        } = options;

        // Calcolo i limiti effettivi applicando eventuali override utente
        const MAX_DIMENSION = Math.min(this.GLOBAL_MAX_DIMENSION, maxWidth ?? this.GLOBAL_MAX_DIMENSION);
        const MIN_DIMENSION = this.GLOBAL_MIN_DIMENSION;

        // Creo un canvas di misura off-screen (usato prima del resize del canvas finale)
        const measureCanvas = document.createElement('canvas');
        // Ottengo il contesto 2D per misurazioni
        const measureCtx = measureCanvas.getContext('2d')!;
        // Risolvo la font-stack (fallback emoji incluso)
        const fontStack = this.fonts[fontFamily] || fontFamily;

        // Configuro il contesto di misura (font, colore, baseline)
        this.configureContext(measureCtx, fontSize, fontStack, textColor);

        // Normalizzo i whitespace: CRLF->LF, riduco spazi multipli, trim per riga
        const normalizedText = this.normalizeWhitespace(text);

        // Determino un maxWidth "di misura" molto grande per non forzare wrap in questa fase
        const effectiveMaxWidthForInitialSplit = maxWidth ?? 5000;
        // Divido il testo in righe (rispettando newline reali) con split emoji-safe
        const lines = this.splitTextIntoLines(
            measureCtx,
            normalizedText,
            effectiveMaxWidthForInitialSplit
        );

        // Misuro ogni riga con la funzione riutilizzabile measureTextMetrics
        // measureTextMetrics restituisce { width, actualHeight } usando actualBoundingBox quando possibile
        const lineMetrics = lines.map(line => {
            // Misuro la riga
            const metrics = this.measureTextMetrics(measureCtx, line);
            // Larghezza reale della riga
            const width = metrics.width;
            // Altezza reale stimata o misurata della riga
            const height = metrics.actualHeight;
            // Stimo ascent/descent come frazioni dell'altezza (fallback utile se non ho bounding box)
            const ascent = height * 0.8;
            const descent = height * 0.2;
            // Ritorno le metriche utili per il posizionamento
            return { line, width, ascent, descent, height };
        });

        // Calcolo la larghezza massima tra le righe (con protezione MIN_DIMENSION)
        const maxLineWidth = lineMetrics.length > 0
            ? Math.max(...lineMetrics.map(m => Math.max(m.width, MIN_DIMENSION)))
            : MIN_DIMENSION;

        // Calcolo lo spazio verticale totale occupato dal blocco testo
        // lineGap è lo spazio aggiuntivo derivato dal lineHeight (es. 1.4 -> gap = 0.4 * fontSize)
        const lineGap = fontSize * (lineHeight - 1);
        // Sommo le altezze reali di ogni riga e aggiungo i gap tra righe
        const totalTextHeight = lineMetrics.reduce((acc, m) => acc + m.height, 0)
            + Math.max(0, (lines.length - 1)) * lineGap;

        // Padding estetico intorno al blocco testo (pari alla dimensione del font)
        const padding = fontSize;
        // Dimensioni del "content box" (testo + padding)
        const contentWidth = maxLineWidth + padding * 2;
        const contentHeight = totalTextHeight + padding * 2;

        // Converto la ratio stringa in valore numerico (es. '4:3' -> 4/3)
        const targetRatio = this.parseRatio(ratio);
        // Inizializzo le dimensioni finali con il content box
        let finalWidth = contentWidth;
        let finalHeight = contentHeight;

        // Adatto le dimensioni per rispettare la ratio target
        if (contentWidth / contentHeight > targetRatio) {
            // Contenuto troppo largo: aumento l'altezza per rispettare la ratio
            finalHeight = contentWidth / targetRatio;
        } else {
            // Contenuto troppo alto/stretto: aumento la larghezza per rispettare la ratio
            finalWidth = contentHeight * targetRatio;
        }

        // Applico eventuali limiti forniti dall'utente (non superare maxWidth/maxHeight)
        if (maxWidth) finalWidth = Math.min(finalWidth, maxWidth);
        if (maxHeight) finalHeight = Math.min(finalHeight, maxHeight);

        // Controlli di sicurezza: non superare i limiti globali e non scendere sotto il minimo
        if (finalWidth > MAX_DIMENSION || finalHeight > MAX_DIMENSION) {
            throw new Error("Il testo è troppo lungo per la dimensione del carattere scelta.");
        }
        if (finalWidth < MIN_DIMENSION) finalWidth = MIN_DIMENSION;
        if (finalHeight < MIN_DIMENSION) finalHeight = MIN_DIMENSION;

        // Creo il canvas finale con le dimensioni calcolate (arrotondo per eccesso)
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(finalWidth);
        canvas.height = Math.ceil(finalHeight);
        // Ottengo il contesto 2D del canvas finale
        const ctx = canvas.getContext('2d')!;

        // Disegno il rettangolo di sfondo con il colore scelto
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Dopo il resize il contesto viene resettato: ri-configuro font e fillStyle
        this.configureContext(ctx, fontSize, fontStack, textColor);
        // Allineo il testo orizzontalmente al centro
        ctx.textAlign = 'center';
        // Uso la baseline 'alphabetic' per posizionare la baseline in modo coerente con ascent/descent
        ctx.textBaseline = 'alphabetic';

        // Calcolo la Y iniziale per centrare verticalmente il blocco testo usando le metriche reali
        const startY = (canvas.height - totalTextHeight) / 2;

        // Disegno riga per riga: posiziono la baseline di ogni riga a startY + offset + ascent
        let offsetY = 0;
        for (let i = 0; i < lineMetrics.length; i++) {
            // Prendo le metriche della riga corrente
            const m = lineMetrics[i];
            // Uso ascent stimato (o reale se disponibile)
            const ascent = m.ascent;
            // Calcolo la Y della baseline per questa riga
            const baselineY = startY + offsetY + ascent;
            // Disegno la riga centrata orizzontalmente
            ctx.fillText(m.line, canvas.width / 2, baselineY);
            // Avanzo l'offset verticale di una riga + gap
            offsetY += m.height + lineGap;
        }

        // Ritorno il canvas pronto per essere convertito in blob/file o mostrato
        return canvas;
    }

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

    // ───────────────────────────────────────────────────────────────
    // UTILITY PRIVATE (metodi di supporto, riutilizzabili)
    // ───────────────────────────────────────────────────────────────

    /**
     * Converte una stringa ratio "W:H" in numero (W/H).
     * - se il formato non è valido ritorna 4/3 come fallback sicuro.
     */
    private parseRatio(r: string): number {
        const match = /^(\d+):(\d+)$/.exec(r);
        if (!match) return 4 / 3;
        const w = Number(match[1]);
        const h = Number(match[2]);
        return h === 0 ? 4 / 3 : w / h;
    }

    /**
     * Configura il contesto canvas con font, colore e baseline.
     * - chiamare sempre dopo ogni resize del canvas (il resize resetta lo stato)
     */
    private configureContext(ctx: CanvasRenderingContext2D, size: number, family: string, textColor: string) {
        // Imposto la proprietà font (es. "40px Arial, ...")
        ctx.font = `${size}px ${family}`;
        // Imposto il colore di riempimento (usato per il testo)
        ctx.fillStyle = textColor;
        // Imposto la baseline di default a 'top' per le misurazioni; per il disegno finale usiamo 'alphabetic'
        ctx.textBaseline = 'top';
        // Nota: non impostiamo textAlign qui perché può variare (left/center/right)
    }


    /**
     * Misurazione avanzata del testo (riutilizzabile).
     * - usa actualBoundingBoxAscent/Descent quando disponibili
     * - fallback a heuristics basate su font-size se non disponibili
     * - se il testo è stringa vuota, ritorna width=0 e actualHeight = fontSize * lineHeightFallback
     *
     * Ritorna: { width, actualHeight }
     */
    private measureTextMetrics(ctx: CanvasRenderingContext2D, text: string, lineHeightFallbackMultiplier = 1.2): { width: number; actualHeight: number } {
        // Misuro con l'API nativa
        const m = ctx.measureText(text);
        const width = m.width;

        // Se la stringa è vuota, evito di restituire 0 height che annullerebbe i blank lines visivi.
        // Uso una stima basata sul font impostato nel contesto.
        const fontMatch = /(\d+)px/.exec(ctx.font);
        const fontSize = fontMatch ? Number(fontMatch[1]) : 16;

        // Provo a leggere ascent/descent reali (browser moderni)
        const ascent = (m as any).actualBoundingBoxAscent ?? 0;
        const descent = (m as any).actualBoundingBoxDescent ?? 0;

        if (ascent || descent) {
            // Se disponibili, uso la somma per l'altezza reale
            return { width, actualHeight: ascent + descent };
        }

        // Fallback: se la stringa è vuota o non ho bounding box, uso una stima basata su fontSize
        // lineHeightFallbackMultiplier permette di regolare l'altezza stimata (es. 1.2 o 1.4)
        return { width, actualHeight: fontSize * lineHeightFallbackMultiplier };
    }


    /**
     * Split in righe senza spezzare parole o emoji, preservando paragrafi vuoti:
     * - ctx: contesto di misura (deve avere font già impostato)
     * - maxWidth: larghezza massima consentita per una riga
     * - lineHeight: moltiplicatore per l'altezza della riga
     * - minWidth: larghezza minima da considerare per evitare righe troppo strette
     *
     * Nota: se un paragrafo è vuoto (''), restituisce una singola riga vuota ['']
     *       Questo mantiene esattamente il numero di righe vuote passate in input.
     */
    private splitTextIntoLines(
        ctx: CanvasRenderingContext2D,
        testo: string,
        maxWidth: number
    ): string[] {
        // Sostituisco CRLF con LF (già fatto in normalizeWhitespace ma lo ripeto per sicurezza)
        return testo
            .replace(/\r\n/g, '\n')
            .split('\n')
            .flatMap(paragrafo => {
                // Se il paragrafo è vuoto (es. riga vuota), restituisco una riga vuota per preservare il blank line
                if (paragrafo.length === 0) return [''];

                const righe: string[] = [];
                // Ottengo token emoji-safe (parole ed emoji), escludendo token di whitespace
                const parole = this.splitIntoEmojiSafeWords(paragrafo);

                let rigaCorrente = '';

                for (const parola of parole) {
                    // parola qui non contiene spazi iniziali/trailing (vedi splitIntoEmojiSafeWords)
                    const candidato = rigaCorrente ? `${rigaCorrente} ${parola}` : parola;
                    const misura = ctx.measureText(candidato).width;

                    if (misura <= maxWidth) {
                        // Se rientra, lo accetto nella riga corrente
                        rigaCorrente = candidato;
                    } else {
                        // Altrimenti chiudo la riga corrente (se esiste) e parto con la parola
                        if (rigaCorrente) righe.push(rigaCorrente);

                        // Se la singola parola è più larga del maxWidth, la lascio così (no hyphenation)
                        if (ctx.measureText(parola).width > maxWidth) {
                            righe.push(parola);
                            rigaCorrente = '';
                        } else {
                            rigaCorrente = parola;
                        }
                    }
                }

                // Se rimane una riga parziale, la aggiungo
                if (rigaCorrente) righe.push(rigaCorrente);

                return righe;
            });
    }

    /**
     * Split emoji-safe migliorato:
     * - cattura emoji composte usando \p{Extended_Pictographic}
     * - restituisce solo token utili (emoji o parole), escludendo spazi
     */
    private splitIntoEmojiSafeWords(text: string): string[] {
        // Regex che cattura sequenze emoji composte o sequenze di non-whitespace
        const matches = Array.from(text.matchAll(/(\p{Extended_Pictographic}(?:\p{Extended_Pictographic}|\uFE0F|\u200D)*)|([^\s]+)/gu));
        // Mappo i match al token testuale
        return matches.map(m => m[0]);
    }

    /**
     * Normalizza i whitespace preservando le righe vuote:
     * - converte CRLF in LF
     * - per ogni riga: se la riga è vuota (solo whitespace) la mantiene vuota
     * - altrimenti riduce sequenze di whitespace a singolo spazio e fa trim
     */
    private normalizeWhitespace(text: string): string {
        // 1) Normalizzo CRLF -> LF
        const lf = text.replace(/\r\n/g, '\n');

        // 2) Splitto per newline e processo ogni riga singolarmente
        return lf
            .split('\n')
            .map(line => {
                // Se la riga è composta solo da whitespace, la mantengo vuota (preserva righe multiple)
                if (/^\s*$/.test(line)) return '';
                // Altrimenti riduco sequenze di whitespace a singolo spazio e rimuovo spazi esterni
                return line.replace(/\s+/g, ' ').trim();
            })
            .join('\n'); // ricompongo con lo stesso numero di newline (preserva righe vuote consecutive)
    }

}
