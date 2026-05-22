import { Injectable, effect, signal, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ContestoSito } from '../../site';
import { FontConfig } from '../../../styles/font-config';

/**
 * THEME SERVICE
 *
 * Unica fonte di verità per colori e font del sito.
 * Gestisce il colore tema, calcola automaticamente i colori derivati (testo,
 * primario) tramite computed Signal, e sincronizza le variabili CSS sul DOM.
 *
 * I metodi e le proprietà statiche (WCAG 2.1, mixing) sono puri
 * e importabili anche da Node/server.ts senza istanziare il servizio Angular.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
    private readonly doc = inject(DOCUMENT);

    // ── Signal scrivibile: cambiarlo aggiorna tutto il sistema a cascata ──────
    /** Colore tema corrente (hex, es. '#3a86ff'). Modificabile a runtime per switchare tema. */
    readonly colorTema = signal<string>(ContestoSito.config.colorTema);

    /**
     * Se true il pannello centrale rimane in modalità light anche su temi scuri.
     * Deroga intenzionale: i pannelli bianchi risultano più leggibili sopra sfondi scenografici.
     */
    readonly panelForcedLight = signal(true);

    /**
     * Sovrascrive il themeTone auto-calcolato dal contrasto col colorTema.
     *   null    → auto (default): light/dark derivato dal contrasto WCAG sul colorTema
     *   'light' → forza light a prescindere dal colore
     *   'dark'  → forza dark a prescindere dal colore
     * Utile quando l'identità visiva del sito vuole un tono fisso indipendente
     * dal colorTema (es. brand sempre chiaro anche se il colore è scuro).
     */
    readonly forcedTone = signal<'light' | 'dark' | null>(null);

    private readonly _prefersReducedMotion = signal<boolean>(
        typeof window !== 'undefined'
            ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
            : false
    );
    /** true se l'utente ha preferenza media query prefers-reduced-motion: reduce. Reattivo ai cambi OS. */
    readonly prefersReducedMotion = this._prefersReducedMotion.asReadonly();

    // ── Computed: si aggiornano automaticamente al cambio di colorTema ────────

    /** true se il nero offre contrasto maggiore o uguale al bianco sul colorTema corrente. */
    readonly isDarkTextPreferred = computed(() =>
        ThemeService.prefersDarkText(this.colorTema())
    );

    /** Colore del testo (#000000 o #ffffff) con contrasto massimo sul colorTema corrente. */
    readonly colorTemaText = computed(() =>
        ThemeService.getReadableTextColor(this.colorTema())
    );

    /**
     * Colore primario: versione scura del colorTema, usata per pulsanti e accenti.
     *
     * Adattivo: parte dal 40% nero miscelato (sufficiente per la maggior parte dei
     * temi scuri) e aumenta la quantità di nero finché il colore non garantisce
     * contrasto WCAG AA (≥ 4.5:1) col bianco — così `.btn-primary` ha sempre testo
     * bianco leggibile a prescindere da quanto sia chiaro il colorTema scelto.
     * Esempi:
     *   #131e54 (navy) → 40% nero → #0b1232 (contrasto col bianco ~16:1) — invariato.
     *   #ffff23 (giallo) → 40% darebbe mustard #99991e (contrasto col bianco ~3:1,
     *   fallisce AA) → l'algoritmo scende fino a ~60% nero per soddisfare il vincolo.
     */
    readonly colorPrimary = computed(() => {
        const base = this.colorTema();
        for (let mixWeight = 0.4; mixWeight < 0.95; mixWeight += 0.05) {
            const candidate = ThemeService.mixHexColors(base, '#000000', mixWeight);
            if (ThemeService.calcContrastRatio(candidate, '#ffffff') >= 4.5) return candidate;
        }
        // Fallback estremo (non dovrebbe mai capitare): nero quasi puro.
        return '#1a1a1a';
    });

    /** Colore testo con contrasto massimo sul colorPrimary. */
    readonly colorPrimaryText = computed(() =>
        ThemeService.getReadableTextColor(this.colorPrimary())
    );

    /** colorPrimary in formato "r, g, b" — richiesto da Bootstrap per `rgba(var(--bs-primary-rgb), <op>)`. */
    readonly colorPrimaryRgb = computed(() =>
        ThemeService.hexToRgbTriplet(this.colorPrimary())
    );

    /**
     * Tono generale del tema: 'light' se il testo deve essere scuro (sfondo chiaro),
     * 'dark' se il testo deve essere chiaro (sfondo scuro). Usato come attributo
     * `data-theme-tone` e `data-bs-theme` per Bootstrap.
     * Se forcedTone è settato manualmente, vince sull'auto-calcolo dal contrasto.
     */
    readonly themeTone = computed<'light' | 'dark'>(() =>
        this.forcedTone() ?? (this.isDarkTextPreferred() ? 'light' : 'dark')
    );

    /**
     * Tema Bootstrap del pannello centrale: fisso a 'light' se panelForcedLight è attivo,
     * altrimenti null (Bootstrap eredita il tema globale).
     */
    readonly panelBootstrapTheme = computed<'light' | null>(() =>
        this.panelForcedLight() ? 'light' : null
    );

    constructor() {
        // Aggiorna il signal prefersReducedMotion quando l'utente cambia le preferenze OS.
        if (typeof window !== 'undefined') {
            window.matchMedia('(prefers-reduced-motion: reduce)')
                .addEventListener('change', e => this._prefersReducedMotion.set(e.matches));
        }

        // Effect reattivo: ogni volta che colorTema o themeTone cambiano,
        // aggiorna le variabili CSS e gli attributi Bootstrap sul DOM.
        effect(() => {
            const color        = this.colorTema();
            const primary      = this.colorPrimary();
            const primaryRgb   = this.colorPrimaryRgb();
            const themeTone    = this.themeTone();
            const root         = this.doc.documentElement;

            if (root) {
                root.style?.setProperty('--colorTema', color);
                root.style?.setProperty('--fontFamily', FontConfig.DEFAULT_WEB_FONT);
                root.style?.setProperty('--bs-body-font-family', FontConfig.DEFAULT_WEB_FONT);
                // Variabili "tema nostre" (Bootstrap non le ridefinisce). Il mapping
                // a --bs-primary / --bs-primary-rgb vive in base.css ed è ripetuto
                // per ogni scope [data-bs-theme] perché Bootstrap 5.3 rigenera
                // --bs-primary nei suoi color-mode subtrees.
                root.style?.setProperty('--colorPrimary', primary);
                root.style?.setProperty('--colorPrimaryRgb', primaryRgb);
                root.style?.setProperty('--colorPrimaryText', this.colorPrimaryText());
                // data-theme-tone usato dai selettori CSS custom del template
                root.setAttribute('data-theme-tone', themeTone);
                // data-bs-theme attiva la palette chiara/scura di Bootstrap 5.3+
                root.setAttribute('data-bs-theme', themeTone);
            }

            // <body> riceve data-bs-theme in modo indipendente per compatibilità
            // con componenti Bootstrap che leggono il tema dal body anziché dall'html
            const body = this.doc.body;
            if (body) body.setAttribute('data-bs-theme', themeTone);

            // <meta name="theme-color"> colora la barra del browser su mobile
            const metaThemeColor = this.doc.querySelector('meta[name="theme-color"]');
            if (metaThemeColor) metaThemeColor.setAttribute('content', color);
        });
    }

    // ── Metodi statici: calcoli colore WCAG 2.1 ──────────────────────────────
    //
    // Puri e senza dipendenze Angular: importabili direttamente in server.ts o
    // in qualsiasi contesto Node senza istanziare il servizio.

    /**
     * Restituisce true se il testo nero (#000000) offre un rapporto di contrasto
     * uguale o superiore al testo bianco (#ffffff) sul colore di sfondo dato.
     */
    static prefersDarkText(hexColor: string): boolean {
        return ThemeService.calcContrastRatio(hexColor, '#000000') >=
               ThemeService.calcContrastRatio(hexColor, '#ffffff');
    }

    /**
     * Restituisce il colore testo con il contrasto massimo sul colore dato.
     * Sempre e solo #000000 o #ffffff — niente mezze misure, solo il massimo contrasto.
     */
    static getReadableTextColor(hexColor: string): '#000000' | '#ffffff' {
        return ThemeService.prefersDarkText(hexColor) ? '#000000' : '#ffffff';
    }

    /**
     * Miscela due colori esadecimali in base a un peso 0–1.
     * @param mixWeight  0 = risultato uguale a baseHex, 1 = risultato uguale a mixHex
     * Es: mixHexColors('#3a86ff', '#000000', 0.4) → 40% nero mescolato al colore base
     */
    static mixHexColors(baseHex: string, mixHex: string, mixWeight: number): string {
        const base   = ThemeService.hexToRgb(baseHex);
        const mix    = ThemeService.hexToRgb(mixHex);
        const weight = Math.min(Math.max(mixWeight, 0), 1); // clampa 0–1

        const r = Math.round(base.r * (1 - weight) + mix.r * weight);
        const g = Math.round(base.g * (1 - weight) + mix.g * weight);
        const b = Math.round(base.b * (1 - weight) + mix.b * weight);
        return ThemeService.rgbToHex(r, g, b);
    }

    /**
     * Rapporto di contrasto WCAG 2.1 tra due colori.
     * Valore 1 = nessun contrasto (stesso colore), 21 = contrasto massimo (nero su bianco).
     * WCAG AA richiede ≥ 4.5 per testo normale, ≥ 3.0 per testo grande.
     */
    static calcContrastRatio(colorA: string, colorB: string): number {
        const lumA    = ThemeService.calcLuminance(colorA);
        const lumB    = ThemeService.calcLuminance(colorB);
        const lighter = Math.max(lumA, lumB);
        const darker  = Math.min(lumA, lumB);
        // Formula WCAG 2.1: (L1 + 0.05) / (L2 + 0.05)
        return (lighter + 0.05) / (darker + 0.05);
    }

    /**
     * Restituisce un colore hex in formato "r, g, b" (es. "53, 92, 142").
     * Bootstrap usa questo formato per le variabili `*-rgb` quando applica opacità:
     * `rgba(var(--bs-primary-rgb), 0.5)`.
     */
    static hexToRgbTriplet(hexColor: string): string {
        const { r, g, b } = ThemeService.hexToRgb(hexColor);
        return `${r}, ${g}, ${b}`;
    }

    /**
     * Luminanza relativa di un colore hex secondo WCAG 2.1 (sRGB linearizzato).
     * Restituisce un valore 0 (nero assoluto) – 1 (bianco assoluto).
     */
    static calcLuminance(hexColor: string): number {
        const normalized = ThemeService.normalizeHex(hexColor);
        // Converte ogni canale da 0–255 a 0–1, poi applica la linearizzazione gamma sRGB
        const r = ThemeService.toLinearChannel(parseInt(normalized.substring(0, 2), 16) / 255);
        const g = ThemeService.toLinearChannel(parseInt(normalized.substring(2, 4), 16) / 255);
        const b = ThemeService.toLinearChannel(parseInt(normalized.substring(4, 6), 16) / 255);
        // Coefficienti di luminanza WCAG (il canale verde pesa ~72% perché l'occhio umano è
        // molto più sensibile al verde che al rosso o al blu)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    // ── Helper privati ────────────────────────────────────────────────────────

    /** Converte un colore hex in oggetto {r, g, b} con valori 0–255. */
    private static hexToRgb(hexColor: string): { r: number; g: number; b: number } {
        const normalized = ThemeService.normalizeHex(hexColor);
        return {
            r: parseInt(normalized.slice(0, 2), 16),
            g: parseInt(normalized.slice(2, 4), 16),
            b: parseInt(normalized.slice(4, 6), 16),
        };
    }

    /**
     * Porta un hex al formato a 6 cifre senza '#'.
     * Gestisce la forma corta a 3 cifre (es. '#f0a' → 'ff00aa')
     * e l'assenza del prefisso '#'.
     */
    private static normalizeHex(hexColor: string): string {
        const stripped = hexColor.replace('#', '').trim();
        return stripped.length === 3
            ? stripped.split('').map(c => c + c).join('')  // '3af' → '33aaff'
            : stripped.padEnd(6, '0').slice(0, 6);
    }

    /** Converte tre canali 0–255 in stringa hex con prefisso '#'. */
    private static rgbToHex(r: number, g: number, b: number): string {
        const toHexChannel = (v: number) =>
            Math.min(Math.max(Math.round(v), 0), 255).toString(16).padStart(2, '0');
        return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
    }

    /**
     * Linearizza un singolo canale sRGB per il calcolo della luminanza.
     * I valori ≤ 0.04045 usano la formula lineare semplice;
     * i valori superiori usano la formula con correzione gamma 2.4 (standard sRGB).
     */
    private static toLinearChannel(channelValue: number): number {
        return channelValue <= 0.04045
            ? channelValue / 12.92
            : Math.pow((channelValue + 0.055) / 1.055, 2.4);
    }
}
