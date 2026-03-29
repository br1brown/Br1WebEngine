import { Injectable, effect, computed, signal, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ContestoSito } from '../../site';

/**
 * Colore tema: imposta --colorTema su :root, espone il tono chiaro/scuro e calcola contrasto testo (WCAG 2.1).
 * Configurazione: colorTema in site.ts. Le variabili derivate usano color-mix() in base.css.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
    private doc = inject(DOCUMENT);

    /**
     * Colore tema attivo usato da tutto il sito.
     * In futuro, se il sito dovra' seguire il tema del sistema, conviene tenere
     * comunque questa come unica sorgente attiva e sceglierla qui nel service
     * partendo da due valori di config, per esempio colorTemaLight/colorTemaDark.
     */
    readonly colorTema = signal<string>(ContestoSito.config.colorTema);

    /**
     * Deroga intenzionale: mantiene il pannello centrale in modalita' light
     * per conservare leggibilita' sopra sfondi piu' scenografici.
     * Puo' restare indipendente dal tema globale anche in una futura
     * integrazione con prefers-color-scheme.
     */
    readonly panelForcedLight = signal(true);

    /** true se il nero offre piu' contrasto del bianco sul colore tema */
    readonly isDarkTextPreferred = computed(() =>
        ThemeService.prefersDarkText(this.colorTema())
    );

    readonly colorTemaText = computed(() =>
        ThemeService.getReadableTextColor(this.colorTema())
    );

    readonly colorPrimary = computed(() =>
        ThemeService.mixHexColors(this.colorTema(), '#000000', 0.4)
    );

    readonly colorPrimaryText = computed(() =>
        ThemeService.getReadableTextColor(this.colorPrimary())
    );

    /** Tono globale di Bootstrap/UI ricavato automaticamente dal colore tema. */
    readonly themeTone = computed<'light' | 'dark'>(() =>
        this.isDarkTextPreferred() ? 'light' : 'dark'
    );

    /** Tema Bootstrap da applicare al pannello centrale; null = eredita dal tema globale. */
    readonly panelBootstrapTheme = computed<'light' | null>(() =>
        this.panelForcedLight() ? 'light' : null
    );

    constructor() {
        effect(() => {
            // aggiungere i colori light/dark in ContestoSito.config
            // rilevare qui lo schema attivo del sistema
            // aggiornare colorTema con il colore scelto
            // lasciare invariato il flusso dei token derivati e di data-bs-theme
            const color = this.colorTema();
            const themeTone = this.themeTone();
            const root = this.doc.documentElement;
            root.style.setProperty('--colorTema', color);
            root.dataset['themeTone'] = themeTone;
            root.setAttribute('data-bs-theme', themeTone);

            const body = this.doc.body;
            if (body) {
                body.setAttribute('data-bs-theme', themeTone);
            }

            const meta = this.doc.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', color);
        });
    }

    /** true se il testo nero offre almeno lo stesso contrasto del bianco. */
    prefersDarkText(hexColor: string): boolean {
        return ThemeService.prefersDarkText(hexColor);
    }

    /** Restituisce nero o bianco in base al contrasto migliore sul colore dato. */
    getReadableTextColor(hexColor: string): '#000000' | '#ffffff' {
        return ThemeService.getReadableTextColor(hexColor);
    }

    mixHexColors(baseHex: string, mixHex: string, mixWeight: number): string {
        return ThemeService.mixHexColors(baseHex, mixHex, mixWeight);
    }

    mixWithBlack(baseHex: string, mixWeight: number): string {
        return ThemeService.mixHexColors(baseHex, '#000000', mixWeight);
    }

    /** true se il testo nero offre almeno lo stesso contrasto del bianco. */
    static prefersDarkText(hexColor: string): boolean {
        return ThemeService.calcContrastRatio(hexColor, '#000000') >=
            ThemeService.calcContrastRatio(hexColor, '#ffffff');
    }

    /** Restituisce nero o bianco in base al contrasto migliore sul colore dato. */
    static getReadableTextColor(hexColor: string): '#000000' | '#ffffff' {
        return ThemeService.prefersDarkText(hexColor) ? '#000000' : '#ffffff';
    }

    static mixHexColors(baseHex: string, mixHex: string, mixWeight: number): string {
        const base = ThemeService.hexToRgb(baseHex);
        const mix = ThemeService.hexToRgb(mixHex);
        const weight = ThemeService.clamp(mixWeight, 0, 1);

        const r = Math.round(base.r * (1 - weight) + mix.r * weight);
        const g = Math.round(base.g * (1 - weight) + mix.g * weight);
        const b = Math.round(base.b * (1 - weight) + mix.b * weight);

        return ThemeService.rgbToHex(r, g, b);
    }

    /** Rapporto di contrasto WCAG 2.1 tra due colori. */
    static calcContrastRatio(colorA: string, colorB: string): number {
        const luminanceA = ThemeService.calcLuminance(colorA);
        const luminanceB = ThemeService.calcLuminance(colorB);
        const lighter = Math.max(luminanceA, luminanceB);
        const darker = Math.min(luminanceA, luminanceB);
        return (lighter + 0.05) / (darker + 0.05);
    }

    /** Luminanza relativa WCAG 2.1 gamma-corretta: 0 = nero, 1 = bianco. */
    static calcLuminance(hexColor: string): number {
        const normalized = ThemeService.normalizeHex(hexColor);
        const r = ThemeService.toLinearChannel(parseInt(normalized.substring(0, 2), 16) / 255);
        const g = ThemeService.toLinearChannel(parseInt(normalized.substring(2, 4), 16) / 255);
        const b = ThemeService.toLinearChannel(parseInt(normalized.substring(4, 6), 16) / 255);
        return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
    }

    private static hexToRgb(hexColor: string): { r: number; g: number; b: number } {
        const normalized = ThemeService.normalizeHex(hexColor);
        return {
            r: parseInt(normalized.slice(0, 2), 16),
            g: parseInt(normalized.slice(2, 4), 16),
            b: parseInt(normalized.slice(4, 6), 16)
        };
    }

    private static normalizeHex(hexColor: string): string {
        const hex = hexColor.replace('#', '').trim();
        return hex.length === 3
            ? hex.split('').map(char => char + char).join('')
            : hex.padEnd(6, '0').slice(0, 6);
    }

    private static rgbToHex(r: number, g: number, b: number): string {
        return `#${ThemeService.toHex(r)}${ThemeService.toHex(g)}${ThemeService.toHex(b)}`;
    }

    private static toHex(value: number): string {
        return ThemeService.clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
    }

    private static clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max);
    }

    private static toLinearChannel(channel: number): number {
        return channel <= 0.04045
            ? channel / 12.92
            : Math.pow((channel + 0.055) / 1.055, 2.4);
    }
}
