import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ThemeService } from './theme.service';

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

// ─── Interfacce pubbliche ──────────────────────────────────────────────────────

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
    /**
     * Chiave del font nell'elenco interno (es. 'Arial', 'Georgia').
     * Viene espansa nello stack CSS completo con emoji fallback.
     * Se non corrisponde a nessuna chiave, il valore viene usato verbatim come font-family.
     */
    fontFamily?: string;
    /** Rapporto d'aspetto dell'immagine finale. Default: '4:3'. */
    ratio?: '4:3' | '16:9' | '1:1' | '9:16';
    /** Larghezza massima in pixel usata solo in modalità wordWrap:true. Default: 1200. */
    maxWidth?: number;
    /** Moltiplicatore di interlinea rispetto al fontSize. Default: 1.4. */
    lineHeight?: number;
    /**
     * true  → il testo viene spezzato automaticamente a maxWidth (testo breve/medio)
     * false → si rispettano solo i \n espliciti; la canvas si adatta al testo (titoli, tag)
     */
    wordWrap?: boolean;
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
    wordWrap: boolean;
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

    /**
     * Mappa nome-breve → stack CSS completo.
     * Il suffisso emoji ('Apple Color Emoji', 'Segoe UI Emoji') fa sì che i caratteri
     * emoji nel testo vengano renderizzati a colori invece di comparire come tofu.
     */
    private readonly fonts: Record<string, string> = {
        'Arial': 'Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
        'Georgia': 'Georgia, "Apple Color Emoji", "Segoe UI Emoji", serif',
        'Courier New': '"Courier New", "Apple Color Emoji", "Segoe UI Emoji", monospace',
        'Verdana': 'Verdana, "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
        'Times': '"Times New Roman", "Apple Color Emoji", "Segoe UI Emoji", serif',
    };

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
            r.ratio, r.maxWidth, r.lineHeight, r.wordWrap,
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
        // Se il chiamante passa 'Arial', cerchiamo lo stack completo nel dizionario;
        // se non lo troviamo usiamo il valore grezzo (es. un font-family personalizzato).
        const fontKey = opts.fontFamily ?? Object.keys(this.fonts)[0];
        const fontStack = this.fonts[fontKey] ?? fontKey;

        return {
            bgColor: opts.bgColor ?? this.theme.colorTema(),
            textColor: opts.textColor ?? this.theme.colorTemaText(),
            fontSize: opts.fontSize ?? 40,
            fontFamily: fontStack,
            ratio: opts.ratio ?? '4:3',
            maxWidth: opts.maxWidth ?? 1200,
            lineHeight: opts.lineHeight ?? 1.4,
            wordWrap: opts.wordWrap ?? true,
        };
    }

    // ============================================================
    // ─── API STATICA — pura, SSR-safe, zero Signal/this/DOM ─────
    //
    // Non ha accesso ai Signal Angular né al DOM: tutti i parametri
    // devono essere passati esplicitamente dal chiamante.
    // ============================================================

    /**
     * Calcola il layout del testo e produce la stringa SVG XML pronta per il rendering.
     *
     * Restituisce anche le dimensioni finali perché il chiamante ne ha bisogno per
     * impostare canvas.width/height (browser) o il tag <svg width/height> (server).
     *
     * ── Modalità wordWrap:false ──
     *   Il testo comanda: si misura il testo, si calcola il canvas di conseguenza.
     *   Utile per titoli brevi e tag dove il testo non deve mai andare a capo in modo inatteso.
     *
     * ── Modalità wordWrap:true ──
     *   maxWidth comanda: il testo va a capo entro la larghezza indicata.
     *   Utile per descrizioni più lunghe con layout prevedibile.
     *
     * In entrambe le modalità il rapporto d'aspetto `ratio` viene rispettato:
     * se il contenuto è più "largo" del ratio si aggiunge altezza, e viceversa.
     */
    static buildSvg(
        text: string,
        bgColor: string,
        textColor: string,
        fontSize: number,
        fontFamily: string,
        ratio: '4:3' | '16:9' | '1:1' | '9:16',
        maxWidth: number,
        lineHeight: number,
        wordWrap: boolean,
    ): { svg: string; width: number; height: number } {

        // Il padding è proporzionale al font: testi grandi hanno margini grandi.
        const paddingPx = fontSize * 2;
        const targetRatio = ImgBuilderService.parseRatio(ratio);
        const normalizedText = ImgBuilderService.normalizeWhitespace(text);

        let finalWidth: number;
        let finalHeight: number;
        let lines: string[];

        if (!wordWrap) {
            // ── Modalità free-size: il contenuto guida le dimensioni ──────────────
            // Rispetta solo i \n espliciti, nessun word-wrap automatico.
            lines = normalizedText.split('\n').map(l => l.trim() || ' ');

            // Larghezza del testo più lungo + padding sui due lati
            const larghezzaMassimaTestoPx = Math.max(...lines.map(l => ImgBuilderService.approxTextWidth(l, fontSize)));
            const contentW = larghezzaMassimaTestoPx + paddingPx * 2;
            // Altezza totale delle righe + padding sopra e sotto
            const contentH = lines.length * (fontSize * lineHeight) + paddingPx * 2;

            // Rispettiamo il ratio espandendo la dimensione "corta":
            // se il contenuto è più largo del ratio, l'altezza si adegua; altrimenti la larghezza.
            if (contentW / contentH > targetRatio) {
                finalWidth = contentW;
                finalHeight = contentW / targetRatio;
            } else {
                finalHeight = contentH;
                finalWidth = contentH * targetRatio;
            }

        } else {
            // ── Modalità word-wrap: maxWidth guida, il testo si adatta ───────────
            const larghezzaDisponibilePx = maxWidth - paddingPx * 2;
            lines = ImgBuilderService.wrapText(normalizedText, larghezzaDisponibilePx, fontSize);

            const larghezzaMassimaTestoPx = Math.max(...lines.map(l => ImgBuilderService.approxTextWidth(l, fontSize)));
            const altezzaTotaleTestoPx = lines.length * (fontSize * lineHeight);

            // La larghezza del canvas si stringe alla riga più lunga (+ padding)
            finalWidth = larghezzaMassimaTestoPx + paddingPx * 2;
            finalHeight = altezzaTotaleTestoPx + paddingPx * 2;

            // Adeguamento al ratio identico alla modalità free-size
            if (finalWidth / finalHeight > targetRatio) {
                finalHeight = finalWidth / targetRatio;
            } else {
                finalWidth = finalHeight * targetRatio;
            }
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
     * Non usa canvas.measureText (non disponibile lato server): stima la larghezza
     * di ogni carattere come `fontSize * 0.55`, un valore conservativo calibrato
     * per font sans-serif proporzionali. Caratteri più stretti (es. 'i', 'l') sono
     * sovrastimati, ma è preferibile andare a capo un po' prima che uscire dal bordo.
     *
     * Gestisce anche il caso in cui una singola parola sia più lunga della riga:
     * in quel caso la parola viene spezzata per carattere.
     */
    static wrapText(text: string, maxWidthPx: number, fontSizePx: number): string[] {
        const larghezzaMediaCaratterePx = fontSizePx * 0.55;
        const maxCaratteriPerRiga = Math.max(1, Math.floor(maxWidthPx / larghezzaMediaCaratterePx));

        return text.split('\n').flatMap(paragrafo => {
            const p = paragrafo.trim();
            // Riga vuota → spazio singolo per preservare la spaziatura verticale nel SVG
            if (!p) return [' '];

            const parole: string[] = p.split(/\s+/);
            const righe: string[] = [];
            let rigaCorrente = '';

            for (const parola of parole) {
                // Parola più lunga della riga: spezzala carattere per carattere
                if (parola.length > maxCaratteriPerRiga) {
                    if (rigaCorrente) { righe.push(rigaCorrente); rigaCorrente = ''; }
                    for (let i = 0; i < parola.length; i += maxCaratteriPerRiga) {
                        const slice = parola.slice(i, i + maxCaratteriPerRiga);
                        // L'ultimo pezzo diventa l'inizio della riga corrente (potrebbe continuare)
                        if (i + maxCaratteriPerRiga >= parola.length) rigaCorrente = slice;
                        else righe.push(slice);
                    }
                    continue;
                }
                // Prima parola della riga corrente
                if (!rigaCorrente) { rigaCorrente = parola; continue; }
                // La parola ci sta: aggiungila alla riga corrente
                if (rigaCorrente.length + 1 + parola.length <= maxCaratteriPerRiga) {
                    rigaCorrente += ' ' + parola;
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
