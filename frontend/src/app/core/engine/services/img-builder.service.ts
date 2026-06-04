import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ThemeService } from './theme.service';
import { FontConfig } from '../../../../styles/font-config';

/**
 * IMG BUILDER SERVICE
 *
 * Genera immagini PNG a partire da testo:
 *   - nel browser produce un HTMLCanvasElement (async, perché SVG→canvas richiede Image.onload)
 *   - lato server (Node/SSR) si usa solo la parte statica `buildSvg`, che non tocca DOM
 *
 * Architettura a due livelli:
 *   1. Metodi ISTANZA  (buildCanvas, buildBlob, buildFile)
 *      → accettano opzioni parziali, completano i default dai Signal del tema Angular
 *   2. Metodo STATICO  (buildSvg)
 *      → riceve tutti i parametri obbligatori; zero Angular, zero DOM, chiamabile da Node
 *
 * Questo disegno garantisce che browser e server usino esattamente la stessa logica
 * di layout e rendering — un solo posto dove cambiare se si vuole modificare l'aspetto.
 */

// ─── Tipi pubblici ────────────────────────────────────────────────────────────

/**
 * Controlla come vengono calcolate le dimensioni dell'immagine in relazione al testo.
 *
 *  'exactInLine' → nessun wrap automatico: si rispettano solo i \n espliciti e il canvas
 *                  si ridimensiona attorno al testo. Utile per titoli brevi e tag.
 *  'wrap'        → (default) larghezza fissa a maxWidth, wrap automatico, altezza segue il
 *                  contenuto. Il ratio aggiunge solo spazio verticale minimo.
 *  'fixedRatio'  → il ratio comanda: la larghezza si espande se necessario, i margini
 *                  diventano dinamici (5% della larghezza) e il testo viene ri-wrappato.
 *                  Utile quando il formato dell'immagine è più importante della lunghezza.
 */
export type ImgRenderMode = 'exactInLine' | 'wrap' | 'fixedRatio';

/**
 * Opzioni per i metodi istanza: tutti i campi sono facoltativi perché i default
 * vengono letti in autonomia dai Signal del tema (colore, font, ecc.).
 * Da usare nei componenti Angular, non nel layer server.
 */
export interface ImgBuildOptions {
    /** Colore di sfondo esadecimale (es. '#3a86ff'). Default: colorTema del sito. */
    bgColor?: string;
    /** Colore del testo esadecimale. Default: calcolato per massimo contrasto WCAG sul bgColor. */
    textColor?: string;
    /** Dimensione del font in pixel. Default: 40. */
    fontSize?: number;
    /** Chiave del font (es. 'Arial', 'Georgia'). Default: FontConfig.DEFAULT_WEB_FONT. */
    fontFamily?: keyof typeof FontConfig.WEB_FONTS;
    /** Rapporto d'aspetto dell'immagine finale. Default: '4:3'. */
    ratio?: '4:3' | '16:9' | '1:1' | '9:16';
    /** Larghezza massima in pixel. Default: 1200. */
    maxWidth?: number;
    /** Moltiplicatore di interlinea rispetto al fontSize. Default: 1.4. */
    lineHeight?: number;
    /** Modalità di layout. Default: 'wrap'. */
    renderMode?: ImgRenderMode;
}

/**
 * Versione con tutti i campi obbligatori: prodotta da resolveOptions() e
 * consumata da buildSvg(). Garantisce che nessun parametro sia undefined
 * quando si entra nella logica di layout.
 */
export interface ImgBuildResolved {
    bgColor: string;
    textColor: string;
    fontSize: number;
    /** Stack font completo pronto per CSS/SVG, es. 'Arial, "Apple Color Emoji", sans-serif'. */
    fontFamily: string;
    ratio: '4:3' | '16:9' | '1:1' | '9:16';
    maxWidth: number;
    lineHeight: number;
    renderMode: ImgRenderMode;
}

// ─── Servizio ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ImgBuilderService {
    private readonly theme = inject(ThemeService);

    /** Falso in SSR: buildCanvas lancia se chiamato fuori dal browser. */
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    /** Dimensioni massime/minime assolute in pixel per evitare immagini aberranti. */
    private static readonly DIMENSIONE_MAX_PX = 8000;
    private static readonly DIMENSIONE_MIN_PX = 125;

    // ============================================================
    // ─── Metodi istanza (leggono i Signal del tema come default) ─
    // ============================================================

    /**
     * Genera il canvas PNG con il testo richiesto.
     * Restituisce null se chiamata fuori dal browser (SSR/prerender), cosi' il chiamante
     * puo' gestire l'assenza di canvas come normale ramo di codice senza guard di piattaforma.
     *
     * Flusso interno (solo browser):
     *   1. resolveOptions() completa i default dai Signal
     *   2. buildSvg() produce la stringa SVG con il layout calcolato
     *   3. L'SVG viene trasformato in Blob → ObjectURL → Image.onload → ctx.drawImage
     *
     * È asincrona perché il browser carica l'immagine SVG in modo non bloccante
     * tramite Image.onload; non è possibile farlo in modo sincrono.
     */
    async buildCanvas(text: string, opts: ImgBuildOptions = {}): Promise<HTMLCanvasElement | null> {
        if (!this.isBrowser) return null;

        const r = this.resolveOptions(opts);
        const { svg, width, height } = ImgBuilderService.buildSvg(
            text, r.bgColor, r.textColor, r.fontSize, r.fontFamily,
            r.ratio, r.maxWidth, r.lineHeight, r.renderMode,
        );

        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(width);
            canvas.height = Math.ceil(height);
            const ctx = canvas.getContext('2d')!;

            // Conversione SVG → Blob → URL temporaneo → Image
            const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
            const objectUrl = URL.createObjectURL(blob);
            const img = new Image();

            img.onload = () => {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(objectUrl); // libera la memoria del Blob
                resolve(canvas);
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Rendering SVG→Canvas fallito'));
            };
            img.src = objectUrl;
        });
    }

    /** Restituisce un Blob PNG (utile per download o condivisione via Web Share API). */
    async buildBlob(text: string, opts?: ImgBuildOptions): Promise<Blob | null> {
        const canvas = await this.buildCanvas(text, opts);
        if (!canvas) return null;
        return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }

    /** Restituisce un File PNG pronto per essere allegato a un FormData o upload. */
    async buildFile(text: string, filename = 'immagine.png', opts?: ImgBuildOptions): Promise<File | null> {
        const blob = await this.buildBlob(text, opts);
        return blob ? new File([blob], filename, { type: 'image/png' }) : null;
    }

    /**
     * Unico punto dove vengono letti i Signal Angular.
     * Converte ImgBuildOptions (tutto opzionale) in ImgBuildResolved (tutto obbligatorio)
     * riempiendo i buchi con i valori correnti del tema.
     */
    private resolveOptions(opts: ImgBuildOptions): ImgBuildResolved {
        return {
            bgColor: opts.bgColor ?? this.theme.colorPrimary(),
            textColor: opts.textColor ?? this.theme.colorPrimaryText(),
            fontSize: opts.fontSize ?? 40,
            fontFamily: opts.fontFamily ?? FontConfig.DEFAULT_WEB_FONT,
            ratio: opts.ratio ?? '4:3',
            maxWidth: opts.maxWidth ?? 1000,
            lineHeight: opts.lineHeight ?? 1.4,
            renderMode: opts.renderMode ?? 'wrap',
        };
    }

    // ============================================================
    // ─── API STATICA — pura, SSR-safe, zero Signal/this/DOM ─────
    //
    // Non ha accesso ai Signal Angular né al DOM: tutti i parametri
    // devono essere passati esplicitamente dal chiamante.
    // ============================================================

    static buildSvg(
        text: string,
        bgColor: string,
        textColor: string,
        fontSize: number,
        fontFamily: string,
        ratio: '4:3' | '16:9' | '1:1' | '9:16',
        maxWidth: number,
        lineHeight: number,
        renderMode: ImgRenderMode,
    ): { svg: string; width: number; height: number } {

        // Nel browser: crea un canvas temporaneo per misurare il testo con le metriche reali del font.
        // Nel server (SSR/Node): measureFn resta undefined → wrapText userà la stima 0.55.
        let measureFn: ((t: string) => number) | undefined;
        if (typeof document !== 'undefined') {
            const offscreen = document.createElement('canvas');
            const ctx = offscreen.getContext('2d')!;
            ctx.font = `700 ${fontSize}px ${fontFamily}`;
            measureFn = (t: string) => ctx.measureText(t).width;
        }

        // Il padding è proporzionale al font: testi grandi hanno margini grandi.
        const paddingPx = fontSize * 2;
        const targetRatio = ImgBuilderService.parseRatio(ratio);
        const normalizedText = ImgBuilderService.normalizeWhitespace(text);

        let finalWidth: number;
        let finalHeight: number;
        let lines: string[];

        const measure = measureFn ?? ((t: string) => ImgBuilderService.approxTextWidth(t, fontSize));

        if (renderMode === 'exactInLine') {
            // ── Nessun wrap: il contenuto guida le dimensioni ─────────────────────
            lines = normalizedText.split('\n').map(l => l.trim() || ' ');

            const larghezzaMassimaTestoPx = Math.max(...lines.map(l => measure(l)));
            const contentW = larghezzaMassimaTestoPx + paddingPx * 2;
            const contentH = lines.length * (fontSize * lineHeight) + paddingPx * 2;

            if (contentW / contentH > targetRatio) {
                finalWidth = contentW;
                finalHeight = contentW / targetRatio;
            } else {
                finalHeight = contentH;
                finalWidth = contentH * targetRatio;
            }

        } else if (renderMode === 'wrap') {
            // ── Larghezza fissa a maxWidth, altezza segue il contenuto ────────────
            const larghezzaDisponibilePx = maxWidth - paddingPx * 2;
            lines = ImgBuilderService.wrapText(normalizedText, larghezzaDisponibilePx, fontSize, measureFn);

            const altezzaTotaleTestoPx = lines.length * (fontSize * lineHeight);
            finalWidth = maxWidth;
            finalHeight = Math.max(altezzaTotaleTestoPx + paddingPx * 2, finalWidth / targetRatio);

        } else {
            // ── fixedRatio: il ratio comanda, margini dinamici, ri-wrapping ───────
            let larghezza = maxWidth;
            let padding = larghezza * 0.05;
            lines = ImgBuilderService.wrapText(normalizedText, larghezza - padding * 2, fontSize, measureFn);

            let altezza = lines.length * (fontSize * lineHeight) + padding * 2;
            if (larghezza / altezza < targetRatio) {
                larghezza = altezza * targetRatio;
                padding = larghezza * 0.05;
                lines = ImgBuilderService.wrapText(normalizedText, larghezza - padding * 2, fontSize, measureFn);
                altezza = lines.length * (fontSize * lineHeight) + padding * 2;
                if (larghezza / altezza > targetRatio) {
                    altezza = larghezza / targetRatio;
                }
            } else {
                altezza = larghezza / targetRatio;
            }

            finalWidth = larghezza;
            finalHeight = altezza;
        }

        // Clamp finale: evita dimensioni fuori controllo per testi molto lunghi o molto corti
        finalWidth = Math.min(Math.max(Math.ceil(finalWidth), ImgBuilderService.DIMENSIONE_MIN_PX), ImgBuilderService.DIMENSIONE_MAX_PX);
        finalHeight = Math.min(Math.max(Math.ceil(finalHeight), ImgBuilderService.DIMENSIONE_MIN_PX), ImgBuilderService.DIMENSIONE_MAX_PX);

        // ── Posizionamento verticale del blocco testo ─────────────────────────────
        // Il blocco testo deve risultare centrato verticalmente nel canvas.
        // SVG posiziona il testo con l'attributo `y` = baseline della prima riga,
        // poi ogni <tspan> aggiunge `dy` (delta-y) rispetto alla riga precedente.
        //
        //  startY = margine superiore disponibile + metà interlinea
        //         = (altezzaCanvas - altezzaBloccoTesto) / 2  +  altezzaRiga / 2
        //
        // Il "+ altezzaRiga / 2" compensa `dominant-baseline="middle"` applicato al <text>:
        // con quel valore il punto di ancoraggio è al centro del carattere, non alla baseline.
        const altezzaBloccoTestoPx = lines.length * (fontSize * lineHeight);
        const altezzaRigaPx = fontSize * lineHeight;
        const centraleX = finalWidth / 2;
        const primaRigaY = (finalHeight - altezzaBloccoTestoPx) / 2 + altezzaRigaPx / 2;

        // ── Assemblaggio SVG ──────────────────────────────────────────────────────
        // Ogni riga diventa un <tspan>: la prima ha dy=0 (parte da primaRigaY),
        // le successive hanno dy=altezzaRigaPx (spostamento relativo rispetto al tspan precedente).
        const esc = ImgBuilderService.escapeXml;
        const tspans = lines
            .map((riga, i) => `<tspan x="${centraleX}" dy="${i === 0 ? 0 : altezzaRigaPx}">${esc(riga)}</tspan>`)
            .join('');

        const svg =
            `<?xml version="1.0" encoding="UTF-8"?>` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="${finalWidth}" height="${finalHeight}" viewBox="0 0 ${finalWidth} ${finalHeight}">` +
            `<rect width="${finalWidth}" height="${finalHeight}" fill="${esc(bgColor)}"/>` +
            `<text x="${centraleX}" y="${primaRigaY}" font-family="${esc(fontFamily)}" font-size="${fontSize}" font-weight="700" fill="${esc(textColor)}" text-anchor="middle" dominant-baseline="middle">` +
            tspans +
            `</text>` +
            `</svg>`;

        return { svg, width: finalWidth, height: finalHeight };
    }

    /**
     * Sostituisce i caratteri riservati XML/SVG con le entità corrispondenti.
     * Necessario sia per i valori degli attributi (fill, font-family) sia per
     * il contenuto testuale dei <tspan>, dove '<' e '&' romperebbero il markup.
     */
    static escapeXml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Espone getReadableTextColor di ThemeService tramite questo servizio.
     * Comodo per chi importa già ImgBuilderService e vuole calcolare il contrasto
     * senza aggiungere una seconda dipendenza.
     */
    static getReadableTextColor(bgHex: string): '#000000' | '#ffffff' {
        return ThemeService.getReadableTextColor(bgHex);
    }

    // ── Helper privati statici ─────────────────────────────────────────────────

    /**
     * Converte la stringa ratio (es. '16:9') nel numero decimale corrispondente (es. 1.777...).
     * Fallback a 4/3 se il formato non è riconosciuto o se il denominatore è 0.
     */
    private static parseRatio(ratio: string): number {
        const match = /^(\d+):(\d+)$/.exec(ratio);
        if (!match) return 4 / 3;
        const denominatore = Number(match[2]);
        return denominatore === 0 ? 4 / 3 : Number(match[1]) / denominatore;
    }

    /**
     * Spezza il testo in righe che stanno entro maxWidthPx.
     *
     * Se measureFn è fornita (es. ctx.measureText nel browser) misura la larghezza
     * reale di ogni stringa. Altrimenti usa la stima fontSize * 0.55 (SSR/server).
     *
     * Gestisce anche il caso in cui una singola parola sia più lunga della riga:
     * in quel caso la parola viene spezzata carattere per carattere.
     */
    static wrapText(text: string, maxWidthPx: number, fontSizePx: number, measureFn?: (t: string) => number): string[] {
        const measure = measureFn ?? ((t: string) => t.length * fontSizePx * 0.55);

        return text.split('\n').flatMap(paragrafo => {
            const p = paragrafo.trim();
            // Riga vuota → spazio singolo per preservare la spaziatura verticale nel SVG
            if (!p) return [' '];

            const parole: string[] = p.split(/\s+/);
            const righe: string[] = [];
            let rigaCorrente = '';

            for (const parola of parole) {
                // Parola più lunga della riga: spezzala carattere per carattere
                if (measure(parola) > maxWidthPx) {
                    if (rigaCorrente) { righe.push(rigaCorrente); rigaCorrente = ''; }
                    for (const char of parola) {
                        const candidato = rigaCorrente ? rigaCorrente + char : char;
                        if (measure(candidato) > maxWidthPx && rigaCorrente) {
                            righe.push(rigaCorrente);
                            rigaCorrente = char;
                        } else {
                            rigaCorrente = candidato;
                        }
                    }
                    continue;
                }
                // Prima parola della riga corrente
                if (!rigaCorrente) { rigaCorrente = parola; continue; }
                // La parola ci sta: aggiungila alla riga corrente
                const candidato = rigaCorrente + ' ' + parola;
                if (measure(candidato) <= maxWidthPx) {
                    rigaCorrente = candidato;
                } else {
                    // Non ci sta: chiudi la riga corrente e inizia una nuova
                    righe.push(rigaCorrente);
                    rigaCorrente = parola;
                }
            }
            if (rigaCorrente) righe.push(rigaCorrente);
            return righe;
        });
    }

    /**
     * Stima la larghezza in pixel di una stringa senza canvas.
     * Usa lo stesso fattore 0.55 di wrapText per coerenza nel calcolo del layout.
     */
    private static approxTextWidth(text: string, fontSize: number): number {
        return text.length * fontSize * 0.55;
    }

    /**
     * Normalizza i ritorni a capo (CRLF → LF) e comprime gli spazi multipli
     * all'interno di ogni riga in uno spazio singolo.
     * Preserva le righe vuote (usate come separatori di paragrafo).
     */
    static normalizeWhitespace(text: string): string {
        return text
            .replace(/\r\n/g, '\n')
            .split('\n')
            .map(riga => riga.replace(/\s+/g, ' ').trim())
            .join('\n');
    }
}
