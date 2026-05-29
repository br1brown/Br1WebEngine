import { ImgBuilderService } from '../services/img-builder.service';
import { FontConfig } from '../../../../styles/font-config';

export interface PreviewSvgOptions {
    /** Nome applicazione mostrato nella preview SVG. */
    appName: string;
    /** Titolo principale della preview. */
    title: string;
    /** Sottotitolo opzionale mostrato sotto il titolo. */
    subtitle?: string | null;
    /** Colore di sfondo dell'intera immagine SVG. */
    bgColor: string;
    /** Favicon/logo codificato come data URL SVG/PNG. */
    faviconDataUrl?: string;
    /** Colore principale del testo. */
    textColor?: string;
    /** Larghezza canvas SVG finale. */
    width?: number;
    /** Altezza canvas SVG finale. */
    height?: number;
    /** Font-family globale usato nei text node SVG. */
    fontFamily?: string;
    /** Font-size del nome applicazione. */
    appFontSize?: number;
    /** Font-size del titolo principale. */
    titleFontSize?: number;
    /** Font-size del sottotitolo. */
    subtitleFontSize?: number;
    /** Dimensione quadrata favicon/logo. */
    faviconSize?: number;
    /** Spaziatura verticale tra i blocchi. */
    spacing?: number;
    /** Padding orizzontale interno. */
    horizontalPadding?: number;
    /** Moltiplicatore line-height del titolo. */
    titleLineHeight?: number;
    /** Moltiplicatore line-height del sottotitolo. */
    subtitleLineHeight?: number;
}

export interface TitleBadgeOptions {
    /** Larghezza del canvas SVG di output (deve combaciare con la cover OG). */
    canvasW: number;
    /** Altezza del canvas SVG di output. */
    canvasH: number;
    /** X del bordo sinistro del badge (di solito a destra dell'icona favicon). */
    anchorLeft: number;
    /** Y del centro verticale a cui ancorare il badge (di solito il centro dell'icona). */
    anchorCenterY: number;
    /** Limite destro entro cui il badge non può sconfinare. */
    maxRight: number;
    /** Testo del badge (già normalizzato). */
    title: string;
    /** Colore di sfondo del pill; il testo riceve automaticamente il contrasto WCAG. */
    bgColor: string;
    /** Override del font-size (default: FONT_PRIMARY). */
    fontSize?: number;
    /** Padding orizzontale sinistro (default: SPACING_MD). */
    hPadL?: number;
    /** Padding orizzontale destro (default: SPACING_MD). */
    hPadR?: number;
    /** Padding verticale sopra/sotto il testo (default: SPACING_SM). */
    vPad?: number;
    /** Opacità del pill (default: OPACITY_OVERLAY). */
    fillOpacity?: number;
}

export class PreviewBuilder {
    // =========================================================
    // DESIGN SYSTEM & TOKENS CONDIVISI
    // =========================================================

    // --- Tipografia ---
    /** Font size per elementi primari (Titolo preview, Testo badge) */
    static readonly FONT_PRIMARY = 40;
    /** Font size per elementi secondari (Sottotitolo, Nome App) */
    static readonly FONT_SECONDARY = 30;
    /** Moltiplicatore line-height universale per tutti i testi multilinea */
    static readonly LINE_HEIGHT = 1.3;

    /** Stima px/char per i calcoli della larghezza dei font SVG (usata in wrapText e calcolo box). */
    static readonly CHAR_WIDTH_RATIO = 0.55;
    /** Offset per spostarsi dalla cima del cap-box alla baseline tipografica nei nodi <text>. */
    static readonly BASELINE_OFFSET_RATIO = 0.8;

    // --- Spaziature (Padding & Margini) ---
    /** Padding verticale ridotto (es. interno verticale del badge) */
    static readonly SPACING_SM = 16;
    /** Spaziatura standard tra i blocchi della preview e padding orizzontale del badge */
    static readonly SPACING_MD = 32;
    /** Padding orizzontale globale del canvas della preview (per evitare bordi troppo vicini) */
    static readonly SPACING_LG = 48;

    // --- Opacità ---
    /** Opacità unificata per testi non principali (Nome App, Sottotitolo) per gerarchia visiva. */
    static readonly OPACITY_TEXT_SECONDARY = 0.75;
    /** Opacità per lo sfondo di elementi in overlay (es. sfondo del badge OG). */
    static readonly OPACITY_OVERLAY = 0.9;

    // --- Dimensioni Specifiche Preview ---
    static readonly CANVAS_WIDTH = 1200;
    static readonly CANVAS_HEIGHT = 630;
    static readonly FAVICON_SIZE = 200;

    // =========================================================
    // LOGICA PREVIEW SVG
    // =========================================================

    /** Risolve tutte le opzioni della preview applicando normalizzazione e fallback ai token del Design System. */
    static resolvePreviewBuilder(opts: PreviewSvgOptions) {
        return {
            appName: ImgBuilderService.normalizeWhitespace(opts.appName),
            title: ImgBuilderService.normalizeWhitespace(opts.title),
            subtitle: ImgBuilderService.normalizeWhitespace(opts.subtitle ?? ''),
            bgColor: opts.bgColor,
            faviconDataUrl: opts.faviconDataUrl ?? '',
            textColor: opts.textColor ?? ImgBuilderService.getReadableTextColor(opts.bgColor),
            width: Math.max(1, Math.ceil(opts.width ?? this.CANVAS_WIDTH)),
            height: Math.max(1, Math.ceil(opts.height ?? this.CANVAS_HEIGHT)),
            fontFamily: opts.fontFamily ?? FontConfig.DEFAULT_SERVER_FONT,
            appFontSize: opts.appFontSize ?? this.FONT_SECONDARY,
            titleFontSize: opts.titleFontSize ?? this.FONT_PRIMARY,
            subtitleFontSize: opts.subtitleFontSize ?? this.FONT_SECONDARY,
            faviconSize: opts.faviconSize ?? this.FAVICON_SIZE,
            spacing: opts.spacing ?? this.SPACING_MD,
            horizontalPadding: opts.horizontalPadding ?? this.SPACING_LG,
            titleLineHeight: opts.titleLineHeight ?? this.LINE_HEIGHT,
            subtitleLineHeight: opts.subtitleLineHeight ?? this.LINE_HEIGHT,
        };
    }

    /** Costruisce una preview SVG completa centrata verticalmente con nome app, favicon, titolo e sottotitolo. */
    static buildPreview(opts: PreviewSvgOptions): { svg: string; width: number; height: number } {
        const r = this.resolvePreviewBuilder(opts);

        // Centro asse X
        const cx = r.width / 2;
        // Spazio massimo in larghezza a disposizione del testo
        const maxWidthPx = r.width - r.horizontalPadding * 2;

        // Calcolo dello step (in pixel) tra una riga e l'altra basato sul line-height
        const titleLineStep = r.titleFontSize * r.titleLineHeight;
        const subtitleLineStep = r.subtitleFontSize * r.subtitleLineHeight;

        const esc = ImgBuilderService.escapeXml;

        // Suddivisione in righe basata sullo spazio orizzontale
        const titleLines = ImgBuilderService.wrapText(r.title, maxWidthPx, r.titleFontSize);
        const subtitleLines = r.subtitle
            ? ImgBuilderService.wrapText(r.subtitle, maxWidthPx, r.subtitleFontSize)
            : [];

        // Calcolo dell'altezza totale del blocco titolo (Font base + N righe aggiuntive)
        const titleBlockHeight = r.titleFontSize + (titleLines.length - 1) * titleLineStep;

        // Calcolo dell'altezza totale del blocco sottotitolo (se presente)
        const subtitleBlockHeight = subtitleLines.length > 0
            ? r.subtitleFontSize + (subtitleLines.length - 1) * subtitleLineStep
            : 0;

        // Altezza cumulativa di tutti gli elementi per poterli centrare verticalmente nel canvas
        const totalHeight = r.appFontSize
            + r.spacing + r.faviconSize
            + r.spacing + titleBlockHeight
            + (subtitleBlockHeight > 0 ? r.spacing + subtitleBlockHeight : 0);

        // Coordinata Y di partenza per centrare in blocco il contenuto
        let topY = (r.height - totalHeight) / 2;

        /** Nodo SVG del nome applicazione (in alto). */
        const appNameEl =
            `<text x="${cx}" y="${topY + r.appFontSize}" font-family="${esc(r.fontFamily)}" font-size="${r.appFontSize}" font-weight="400" fill="${esc(r.textColor)}" text-anchor="middle" opacity="${this.OPACITY_TEXT_SECONDARY}">${esc(r.appName)}</text>`;

        topY += r.appFontSize + r.spacing;

        /** Nodo SVG favicon/logo centrale. Centrato rispetto a X = cx. */
        const faviconEl = r.faviconDataUrl
            ? `<image href="${r.faviconDataUrl}" x="${cx - r.faviconSize / 2}" y="${topY}" width="${r.faviconSize}" height="${r.faviconSize}"/>`
            : '';

        topY += r.faviconSize + r.spacing;

        /** Tspan multilinea del titolo principale. La prima riga ha dy=0, le successive scendono di titleLineStep. */
        const titleTspans = titleLines
            .map((line, i) => `<tspan x="${cx}" dy="${i === 0 ? 0 : titleLineStep}">${esc(line)}</tspan>`)
            .join('');

        /** Nodo SVG del titolo principale. */
        const titleEl =
            `<text x="${cx}" y="${topY + r.titleFontSize}" font-family="${esc(r.fontFamily)}" font-size="${r.titleFontSize}" font-weight="700" fill="${esc(r.textColor)}" text-anchor="middle">${titleTspans}</text>`;

        topY += titleBlockHeight + r.spacing;

        let subtitleEl = '';

        if (subtitleLines.length > 0) {
            /** Tspan multilinea del sottotitolo. */
            const subtitleTspans = subtitleLines
                .map((line, i) => `<tspan x="${cx}" dy="${i === 0 ? 0 : subtitleLineStep}">${esc(line)}</tspan>`)
                .join('');

            /** Nodo SVG del sottotitolo. */
            subtitleEl =
                `<text x="${cx}" y="${topY + r.subtitleFontSize}" font-family="${esc(r.fontFamily)}" font-size="${r.subtitleFontSize}" font-weight="400" fill="${esc(r.textColor)}" text-anchor="middle" opacity="${this.OPACITY_TEXT_SECONDARY}">${subtitleTspans}</text>`;
        }

        /** SVG finale completo di background e raggruppamento nodi. */
        const svg =
            `<?xml version="1.0" encoding="UTF-8"?>` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}" viewBox="0 0 ${r.width} ${r.height}">` +
            `<rect width="${r.width}" height="${r.height}" fill="${esc(r.bgColor)}"/>` +
            appNameEl + faviconEl + titleEl + subtitleEl +
            `</svg>`;

        return { svg, width: r.width, height: r.height };
    }

    // =========================================================
    // LOGICA BADGE SVG
    // =========================================================

    /** Risolve configurazione finale del badge applicando fallback ai token del Design System. */
    private static resolveTitleBadgeBuilder(opts: TitleBadgeOptions) {
        const fontSize = opts.fontSize ?? this.FONT_PRIMARY;
        // Unificato il padding orizzontale destro/sinistro usando la spaziatura media condivisa
        const hPadL = opts.hPadL ?? this.SPACING_MD;
        const hPadR = opts.hPadR ?? this.SPACING_MD;
        const vPad = opts.vPad ?? this.SPACING_SM;

        return {
            ...opts,
            fontSize,
            hPadL,
            hPadR,
            vPad,
            fillOpacity: opts.fillOpacity ?? this.OPACITY_OVERLAY,
            fontFamily: FontConfig.DEFAULT_SERVER_FONT,
            lineStep: fontSize * this.LINE_HEIGHT,
            textColor: ImgBuilderService.getReadableTextColor(opts.bgColor),
        };
    }

    /** Restituisce l'SVG completo (canvas canvasW × canvasH) con il solo pill/badge disegnato. */
    static buildTitleBadge(opts: TitleBadgeOptions): string {
        const r = this.resolveTitleBadgeBuilder(opts);
        const esc = ImgBuilderService.escapeXml;

        // Spazio disponibile per il testo (al netto dei padding orizzontali e del limite destro del canvas).
        const maxTextW = r.maxRight - r.anchorLeft - r.hPadL - r.hPadR;

        /** Righe wrappate del titolo badge. */
        const lines = ImgBuilderService.wrapText(r.title, maxTextW, r.fontSize);

        /** Lunghezza in caratteri della riga più lunga (serve per calcolare la larghezza del rettangolo di sfondo). */
        const longestLen = Math.max(...lines.map(l => l.length));

        /** Altezza del blocco multilinea del testo badge (senza padding). */
        const blockHeight = r.fontSize + (lines.length - 1) * r.lineStep;

        /** Altezza finale del rettangolo del badge/pill (includendo i padding verticali). */
        const badgeH = Math.round(blockHeight + r.vPad * 2);

        /** Larghezza finale del badge, che non deve superare il margine destro impostato (maxRight).
         *  Si basa sulla costante CHAR_WIDTH_RATIO per stimare la larghezza del testo. */
        const badgeW = Math.round(Math.min(
            longestLen * r.fontSize * this.CHAR_WIDTH_RATIO + r.hPadL + r.hPadR,
            r.maxRight - r.anchorLeft
        ));

        /** Coordinata Y superiore del rettangolo del badge (centrato verticalmente su anchorCenterY). */
        const badgeY = Math.round(r.anchorCenterY - badgeH / 2);

        /** Border radius finale del pill.
         *  Se è una riga singola forma un semicerchio perfetto sui bordi,
         *  se è multilinea si limita il raggio per non arrotondare eccessivamente i lati. */
        const radius = Math.round(Math.min(badgeH / 2, r.fontSize / 2 + r.vPad));

        /** Coordinata X iniziale di partenza per scrivere il testo all'interno del badge. */
        const textX = r.anchorLeft + r.hPadL;

        /** Baseline Y della prima riga del testo badge.
         *  Centra verticalmente il blocco testuale nel pill.
         *  Il fattore BASELINE_OFFSET_RATIO (0.8) sposta la Y dalla cima del font-box alla sua baseline tipografica. */
        const firstBaselineY = badgeY + (badgeH - blockHeight) / 2 + r.fontSize * this.BASELINE_OFFSET_RATIO;

        /** Tspan multilinea del testo badge. */
        const tspans = lines
            .map((line, i) => `<tspan x="${textX}" dy="${i === 0 ? 0 : r.lineStep}">${esc(line)}</tspan>`)
            .join('');

        return `<?xml version="1.0" encoding="UTF-8"?>` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="${r.canvasW}" height="${r.canvasH}">` +
            `<rect x="${r.anchorLeft}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="${radius}" fill="${esc(r.bgColor)}" fill-opacity="${r.fillOpacity}"/>` +
            `<text x="${textX}" y="${firstBaselineY}" ` +
            `font-family="${esc(r.fontFamily)}" ` +
            `font-size="${r.fontSize}" font-weight="700" fill="${esc(r.textColor)}" ` +
            `text-anchor="start">${tspans}</text>` +
            `</svg>`;
    }
}
