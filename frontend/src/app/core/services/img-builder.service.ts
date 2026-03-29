/**
 * Servizio di generazione immagini su canvas — funzioni pure, nessuna dipendenza Angular.
 * Utilizzabile da qualsiasi componente del template per creare immagini dinamiche
 * (banner, placeholder, thumbnail, ecc.) senza dipendere dal componente ImgBuilder.
 */

/**
 * Font web-safe disponibili per la generazione immagini.
 * Ridotti ai piu' affidabili cross-platform (Windows, macOS, Linux).
 * Per aggiungerne: 'Nome Visibile': '"font-family CSS", fallback-generico'
 */
const FONTS: Record<string, string> = {
    'Arial':            'Arial, sans-serif',
    'Georgia':          'Georgia, serif',
    'Courier New':      '"Courier New", monospace',
    'Verdana':          'Verdana, sans-serif',
    'Times':  '"Times New Roman", serif',
};

export const FONT_NAMES = Object.keys(FONTS);

export interface ImgRenderOptions {
    text: string;
    bgColor: string;
    textColor: string;
    fontSize: number;
    canvasWidth: number;
    fontFamily: string;
    margin: number;
}

/** Suddivide il testo in righe rispettando la larghezza massima (word-wrap via measureText) */
function splitTextIntoLines(ctx: CanvasRenderingContext2D, testo: string, maxWidth: number): string[] {
    const parole = testo.split(' ');
    const righe: string[] = [];
    let rigaCorrente = '';

    for (const parola of parole) {
        const candidato = rigaCorrente ? `${rigaCorrente} ${parola}` : parola;
        if (ctx.measureText(candidato).width <= maxWidth) {
            rigaCorrente = candidato;
        } else {
            if (rigaCorrente) righe.push(rigaCorrente);
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

/** Renderizza testo su un canvas con le opzioni specificate */
export function renderToCanvas(canvas: HTMLCanvasElement, opts: ImgRenderOptions): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { text, bgColor, textColor, fontSize, canvasWidth: width, fontFamily, margin } = opts;
    const fontCss = `${fontSize}px ${FONTS[fontFamily] ?? fontFamily}`;

    ctx.font = fontCss;

    const maxWidth = width - margin * 2;
    const righe = splitTextIntoLines(ctx, text, maxWidth);

    const altezzaMinima = Math.ceil(width * 3 / 4);
    const altezzaTesto = righe.length * fontSize * 1.4 + margin * 2;
    const height = Math.max(altezzaTesto, altezzaMinima);

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    ctx.font = fontCss;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const lineHeight = fontSize * 1.4;
    const totalTextHeight = righe.length * lineHeight;
    const startY = (height - totalTextHeight) / 2;

    for (let i = 0; i < righe.length; i++) {
        ctx.fillText(righe[i], width / 2, startY + i * lineHeight);
    }
}

