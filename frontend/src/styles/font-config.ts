/**
 * FONT CONFIG
 *
 * Fonte di verità centralizzata per i font del sito.
 * Nessuna dipendenza Angular o da altri moduli del progetto: importabile ovunque
 * senza rischi di dipendenze circolari (siteBuilder, ThemeService, ImgBuilderService, server.ts).
 *
 * Due dizionari distinti per due contesti distinti:
 *
 *   WEB_FONTS   → browser e Canvas (ImgBuilderService). Font di sistema, zero dipendenze esterne.
 *   SERVER_FONTS → Sharp / immagini OG (server.ts). Font fisicamente installati nel Docker.
 *
 * Per cambiare il font di default: modifica DEFAULT_WEB_FONT o DEFAULT_SERVER_FONT.
 * Per aggiungere un font web: aggiungerlo a WEB_FONTS (nessuna installazione richiesta).
 * Per aggiungere un font server: aggiungerlo a SERVER_FONTS e installarlo nel Dockerfile.
 * Il suffisso emoji fa sì che i caratteri emoji vengano renderizzati a colori.
 */
export class FontConfig {

    /**
     * Font per il browser e Canvas — font di sistema, zero dipendenze esterne.
     * Ogni OS usa il suo font nativo senza bisogno di file aggiuntivi.
     */
    static readonly WEB_FONTS = {
        System: 'system-ui, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
        Arial: 'Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
        Verdana: 'Verdana, "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
        Georgia: 'Georgia, "Apple Color Emoji", "Segoe UI Emoji", serif',
        Times: '"Times New Roman", Times, "Apple Color Emoji", "Segoe UI Emoji", serif',
        CourierNew: '"Courier New", "Apple Color Emoji", "Segoe UI Emoji", monospace',
    } as const;

    /**
     * Font per Sharp / immagini OG — font fisicamente installati nel container Docker.
     * Usati da ImgBuilderService (SVG path) e PreviewBuilder in server.ts.
     */
    static readonly SERVER_FONTS = {
        Roboto: 'Roboto, "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
        DejaVu: 'DejaVu Sans, "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
        Noto: '"Noto Sans", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
        Liberation: '"Liberation Sans", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
    } as const;

    /** Font di default per il browser e Canvas.. */
    static readonly DEFAULT_WEB_FONT = FontConfig.WEB_FONTS.System;

    /** Font di default per le immagini OG. */
    static readonly DEFAULT_SERVER_FONT = FontConfig.SERVER_FONTS.Liberation;

}
