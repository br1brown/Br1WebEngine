import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, Signal, WritableSignal, afterNextRender, inject, signal } from '@angular/core';
import { ContestoSito } from '../../../site';
import { FontConfig } from '../../../../styles/font-config';

/**
 * Token subtle/emphasis generati da `computeSemanticSubtle` per un colore semantico.
 * Alimentano il sistema Bootstrap `.alert-*-subtle` / `.text-*-emphasis` / `.bg-*-subtle`.
 * Le varianti `Lt`/`Dk` sono pre-calcolate per entrambi i toni: `_applyPalette`
 * seleziona la coppia corretta in base al tone OS corrente.
 */
export interface SemanticSubtleTokens {
    /** Sfondo pastello light: tinta pallida del colore semantico su base chiara. CSS: `--bs-*-bg-subtle` (light) */
    bgSubtleLt: string;
    /** Sfondo pastello dark: tinta pallida del colore semantico su base scura. CSS: `--bs-*-bg-subtle` (dark) */
    bgSubtleDk: string;
    /** Bordo intermedio light per `.alert-*`. CSS: `--bs-*-border-subtle` (light) */
    borderSubtleLt: string;
    /** Bordo intermedio dark per `.alert-*`. CSS: `--bs-*-border-subtle` (dark) */
    borderSubtleDk: string;
    /** Testo con contrasto WCAG 4.5:1 su `bgSubtleLt`, per `.text-*-emphasis`. CSS: `--bs-*-text-emphasis` (light) */
    textEmphasisLt: string;
    /** Testo con contrasto WCAG 4.5:1 su `bgSubtleDk`, per `.text-*-emphasis`. CSS: `--bs-*-text-emphasis` (dark) */
    textEmphasisDk: string;
}

/**
 * Snapshot completo della palette calcolata da `computePalette` per un dato `colorTema`.
 * Tutti i valori sono esadecimali (`#rrggbb`) tranne `colorPrimaryRgb` (tripla `"r, g, b"`)
 * e `naturalTone`. Le varianti `Lt`/`Dk` sono pre-calcolate per entrambi i toni in un
 * unico passaggio: `_applyPalette` si limita a selezionare la coppia corretta senza
 * ricalcolare nulla a ogni cambio di tema.
 */
export interface PaletteTokens {
    // ── Brand ─────────────────────────────────────────────────────────────────
    /** Colore brand esatto dichiarato in `site.ts`. CSS: `--colorTema` */
    colorTema: string;
    /** `#000000` o `#ffffff` — testo a massimo contrasto su `colorTema`. CSS: `--colorTemaText` */
    colorTemaText: '#000000' | '#ffffff';
    /** Brand scurito finché il contrasto WCAG 4.5:1 su bianco è garantito. Usato per link, bottoni, CTA. CSS: `--colorPrimary` */
    colorPrimary: string;
    /** Tripla RGB di `colorPrimary` (es. `"31, 64, 255"`), per le utility `rgba()` di Bootstrap. CSS: `--colorPrimaryRgb` */
    colorPrimaryRgb: string;
    /** `#000000` o `#ffffff` — testo leggibile su `colorPrimary`. CSS: `--colorPrimaryText` */
    colorPrimaryText: '#000000' | '#ffffff';

    // ── Link — tone-adaptive ────────────────────────────────────────────────
    /** Link in light mode: uguale a `colorPrimary`, già 4.5:1 su sfondo chiaro. CSS: `--colorLinkLt` */
    colorLinkLt: string;
    /** Link in dark mode: stessa hue brand, luminosità alzata da `findCompliantColor` fino a 4.5:1 su sfondo scuro. CSS: `--colorLinkDk` */
    colorLinkDk: string;

    // ── Surfaces — light tone ──────────────────────────────────────────────
    /** Sfondo pagina light: quasi bianco con leggera tinta brand (L=0.970). CSS: `--colorBaseLt` */
    colorBaseLt: string;
    /** Sfondo card/modal light: leggermente più luminoso di Base (L=0.985). CSS: `--colorSurfaceLt` */
    colorSurfaceLt: string;
    /** Sfondo hover su elementi interattivi light (L=0.950). CSS: `--colorSurfaceHoverLt` */
    colorSurfaceHoverLt: string;
    /** Bordo separatore light: L=0.570, C=0 → ~4.3:1 su Base (WCAG 1.4.11 ≥ 3:1). CSS: `--colorSurfaceBorderLt` */
    colorSurfaceBorderLt: string;
    /** Testo corpo light: quasi nero con leggera tinta brand (L=0.200). CSS: `--colorSurfaceTextLt` */
    colorSurfaceTextLt: string;

    // ── Surfaces — dark tone ───────────────────────────────────────────────
    /** Sfondo pagina dark: quasi nero con leggera tinta brand (L=0.140). CSS: `--colorBaseDk` */
    colorBaseDk: string;
    /** Sfondo card/modal dark (L=0.180). CSS: `--colorSurfaceDk` */
    colorSurfaceDk: string;
    /** Sfondo hover su elementi interattivi dark (L=0.220). CSS: `--colorSurfaceHoverDk` */
    colorSurfaceHoverDk: string;
    /** Bordo separatore dark: L=0.490, C=0 → ~3.3:1 su Base dark (WCAG 1.4.11 ≥ 3:1). CSS: `--colorSurfaceBorderDk` */
    colorSurfaceBorderDk: string;
    /** Testo corpo dark: quasi bianco con leggera tinta brand (L=0.920). CSS: `--colorSurfaceTextDk` */
    colorSurfaceTextDk: string;

    // ── Semantic — light tone ──────────────────────────────────────────────
    /** Variante muted del brand (chroma ridotta al 75%), light mode. Usato da `.btn-secondary`, `.badge`. CSS: `--colorSecondaryLt` */
    colorSecondaryLt: string;
    /** `#000000` o `#ffffff` — testo leggibile su `colorSecondaryLt`. CSS: `--colorSecondaryTextLt` */
    colorSecondaryTextLt: '#000000' | '#ffffff';

    // ── Semantic — dark tone ───────────────────────────────────────────────
    /** Variante muted del brand (chroma ridotta al 75%), dark mode. CSS: `--colorSecondaryDk` */
    colorSecondaryDk: string;
    /** `#000000` o `#ffffff` — testo leggibile su `colorSecondaryDk`. CSS: `--colorSecondaryTextDk` */
    colorSecondaryTextDk: '#000000' | '#ffffff';

    // ── Subtle/emphasis — usati da .alert-*-subtle, .text-*-emphasis per primary e secondary
    /** Token sfondo/bordo/testo per `.alert-primary`, `.text-primary-emphasis`, `.bg-primary-subtle`. */
    subtlePrimary: SemanticSubtleTokens;
    /** Token sfondo/bordo/testo per `.alert-secondary`, `.text-secondary-emphasis`, `.bg-secondary-subtle`. */
    subtleSecondary: SemanticSubtleTokens;

    // ── Structural Bootstrap vars (headings, muted bg, muted text) ─────────
    /** Colore headings/`<strong>` light: quasi nero con leggera tinta brand (L=0.165). CSS: `--colorHeadingLt` / `--bs-heading-color` */
    colorHeadingLt: string;
    /** Colore headings/`<strong>` dark: quasi bianco con leggera tinta brand (L=0.958). CSS: `--colorHeadingDk` / `--bs-heading-color` */
    colorHeadingDk: string;
    /** Sfondo muted light: input disabilitati, righe table-striped (L=0.942). CSS: `--bs-secondary-bg` (light) */
    colorMutedBgLt: string;
    /** Sfondo muted dark: input disabilitati, righe table-striped (L=0.295). CSS: `--bs-secondary-bg` (dark) */
    colorMutedBgDk: string;
    /** Sfondo tertiary light: table-striped alternato, testo placeholder (L=0.967). CSS: `--bs-tertiary-bg` (light) */
    colorSubtleBgLt: string;
    /** Sfondo tertiary dark: table-striped alternato, testo placeholder (L=0.248). CSS: `--bs-tertiary-bg` (dark) */
    colorSubtleBgDk: string;
    /** Testo muted light: WCAG 4.5:1 su `colorBaseLt`, calcolato da `findCompliantColor`. CSS: `--bs-secondary-color` (light) */
    colorMutedTextLt: string;
    /** Testo muted dark: WCAG 4.5:1 su `colorBaseDk`, calcolato da `findCompliantColor`. CSS: `--bs-secondary-color` (dark) */
    colorMutedTextDk: string;

    // ── Adaptive Navbar/Footer tokens ──────────────────────────────────────
    /**
     * Sfondo navbar/footer light. Se `colorTemaText === '#ffffff'` (brand scuro): usa `colorTema` direttamente
     * per un look brand immersivo. Altrimenti versione pastello (L=0.965) per evitare colori aggressivi. CSS: `--colorNavBgLt`
     */
    colorNavBgLt: string;
    /** Testo navbar/footer light: bianco su brand scuro, oppure quasi-nero tintato brand su pastello. CSS: `--colorNavTextLt` */
    colorNavTextLt: string;
    /** Sfondo navbar/footer dark: quasi nero con leggera tinta brand (L=0.150). CSS: `--colorNavBgDk` */
    colorNavBgDk: string;
    /** Testo navbar/footer dark: quasi bianco con leggera tinta brand (L=0.920). CSS: `--colorNavTextDk` */
    colorNavTextDk: string;

    /**
     * Tono suggerito dal brand: `'light'` se il brand è sufficientemente chiaro da richiedere testo scuro,
     * `'dark'` altrimenti. Usato come valore iniziale di `themeTone` in SSR (dove `prefers-color-scheme` non è disponibile).
     */
    naturalTone: 'light' | 'dark';
}

/**
 * THEME SERVICE
 *
 * Unica fonte di verità per i valori del tema.
 * - Palette calcolata una volta via OKLCH da ContestoSito.config.colorTema
 * - themeTone è un signal reattivo all'OS preference (prefers-color-scheme)
 * - _applyPalette inietta CSS vars e attributi su <html> in modo sincrono
 *
 * Metodi statici (puri, usabili da Node/scripts di build):
 *   computePalette, hexToOklch, oklchToHex, calcApcaContrast,
 *   computeThemeTone, computeColorPrimary, prefersDarkText,
 *   getReadableTextColor, mixHexColors, calcContrastRatio, ecc.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {

    // Snapshot dell'intera palette calcolata da computePalette al boot del servizio.
    // Tutti i token hex sono pre-computati per entrambi i toni (Lt/Dk): _applyPalette
    // si limita a scegliere la coppia giusta senza ricalcolare nulla a ogni cambio tema.
    private readonly _palette: PaletteTokens;

    private readonly document = inject(DOCUMENT);
    private readonly platformId = inject(PLATFORM_ID);

    // ── Plain readonly from palette ───────────────────────────────────────

    /** Colore brand esatto dichiarato in `site.ts` (`colorTema`). CSS: `--colorTema` */
    readonly colorTema: string;
    /** `true` se il brand è sufficientemente chiaro da richiedere testo scuro sopra di esso. */
    readonly isDarkTextPreferred: boolean;
    /** `#000000` o `#ffffff` — testo a contrasto massimo su `--colorTema`. CSS: `--colorTemaText` */
    readonly colorTemaText: '#000000' | '#ffffff';
    /**
     * Variante scurita del brand che garantisce contrasto WCAG 4.5:1 su sfondo bianco.
     * Usare per bottoni, CTA e link. CSS: `--colorPrimary`
     */
    readonly colorPrimary: string;
    /** `#000000` o `#ffffff` — testo leggibile su `--colorPrimary`. CSS: `--colorPrimaryText` */
    readonly colorPrimaryText: '#000000' | '#ffffff';
    /**
     * Tripla RGB di `--colorPrimary` (es. `"31, 64, 255"`), per le utility `rgba()` di Bootstrap.
     * CSS: `--colorPrimaryRgb`
     */
    readonly colorPrimaryRgb: string;
    /**
     * `true` se la configurazione imposta `forcedLightPanel: true` in `site.ts`.
     * Il pannello contenuti centrale resta in tono chiaro indipendentemente dalla preferenza OS.
     */
    readonly panelForcedLight: boolean;
    /**
     * `'light'` se il pannello è forzato in chiaro, `null` altrimenti.
     * Passare a `[attr.data-bs-theme]` per forzare il sottotema Bootstrap nel pannello:
     * `<div [attr.data-bs-theme]="theme.panelBootstrapTheme">`.
     */
    readonly panelBootstrapTheme: 'light' | null;

    // ── OS-reactive signals ───────────────────────────────────────────────

    // WritableSignal interno: aggiornato dal listener prefers-color-scheme nel costruttore.
    // Esposto in sola lettura come `themeTone` — i componenti leggono, non scrivono.
    private readonly _themeTone: WritableSignal<'light' | 'dark'>;
    /**
     * Signal `'light' | 'dark'` reattivo alla preferenza OS (`prefers-color-scheme`).
     * Cambia in tempo reale se l'utente alterna il tema di sistema senza ricaricare la pagina.
     * Riflesso come attributo `data-theme-tone` su `<html>`.
     * Usare nei componenti che adattano canvas, icone o stili inline al tono corrente.
     */
    readonly themeTone: Signal<'light' | 'dark'>;

    // WritableSignal interno: aggiornato dal listener prefers-reduced-motion nel costruttore.
    // Esposto in sola lettura come `prefersReducedMotion`.
    private readonly _prefersReducedMotion: WritableSignal<boolean>;
    /**
     * Signal `boolean` reattivo a `prefers-reduced-motion`.
     * `true` se l'utente ha richiesto animazioni ridotte nelle impostazioni di accessibilità.
     * Usare per disabilitare transizioni, animazioni canvas o auto-play.
     */
    readonly prefersReducedMotion: Signal<boolean>;

    constructor() {
        // 1. Calcola la palette da colorTema: unico punto dove viene chiamato computePalette
        //    per l'istanza — tutti i token vengono derivati da qui, una volta sola.
        this._palette = ThemeService.computePalette(ContestoSito.config.colorTema);

        // 2. Copia i token brand su proprietà readonly istanza così i componenti possono
        //    leggerli senza dover accedere a _palette (che è privata).
        this.colorTema = this._palette.colorTema;
        this.isDarkTextPreferred = ThemeService.prefersDarkText(this._palette.colorTema);
        this.colorTemaText = this._palette.colorTemaText;
        this.colorPrimary = this._palette.colorPrimary;
        this.colorPrimaryText = this._palette.colorPrimaryText;
        this.colorPrimaryRgb = this._palette.colorPrimaryRgb;
        this.panelForcedLight = ContestoSito.config.forcedLightPanel;
        this.panelBootstrapTheme = this.panelForcedLight ? 'light' : null;

        // 3. Inizializza i signal con naturalTone: valore SSR-safe derivato dal brand,
        //    senza leggere prefers-color-scheme (non disponibile lato server).
        this._themeTone = signal(this._palette.naturalTone);
        this.themeTone = this._themeTone.asReadonly();
        this._prefersReducedMotion = signal(false);
        this.prefersReducedMotion = this._prefersReducedMotion.asReadonly();

        // 4. Applica le CSS vars dopo il primo render di Angular. Il markup è già corretto
        //    grazie all'inline script in <head> — questo è il "confirm" post-idratazione
        //    che sovrascrive l'inline style SSR con le proprietà gestite da Angular.
        afterNextRender(() => this._applyPalette(this._themeTone()));

        // I blocchi seguenti richiedono window: in SSR si esce qui senza errori.
        if (!isPlatformBrowser(this.platformId)) return;

        // 5. Aggiorna i signal con le preferenze OS reali (client-only).
        const osTone: 'light' | 'dark' =
            window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        this._themeTone.set(osTone);

        this._prefersReducedMotion.set(
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        );

        // 6. Ascolta i cambiamenti in tempo reale: l'utente può cambiare il tema OS
        //    mentre la pagina è aperta senza dover ricaricare.
        window.matchMedia('(prefers-color-scheme: dark)')
            .addEventListener('change', e => {
                const t: 'light' | 'dark' = e.matches ? 'dark' : 'light';
                this._themeTone.set(t);
                this._applyPalette(t);
            });

        window.matchMedia('(prefers-reduced-motion: reduce)')
            .addEventListener('change', e => this._prefersReducedMotion.set(e.matches));
    }

    // ── DOM injection ─────────────────────────────────────────────────────

    /**
     * Inietta tutte le CSS custom properties del tema su `<html>` via `style.setProperty`.
     * Chiamata da `afterNextRender` al boot e dal listener `prefers-color-scheme` a ogni cambio OS.
     * Aggiorna anche `data-bs-theme` e `data-theme-tone` per il sistema di varianti Bootstrap.
     */
    private _applyPalette(tone: 'light' | 'dark'): void {
        const p = this._palette;
        const el = this.document.documentElement;
        const lt = tone === 'light';

        el.setAttribute('data-bs-theme', tone);
        el.setAttribute('data-theme-tone', tone);

        const link = lt ? p.colorLinkLt : p.colorLinkDk;
        const vars: [string, string][] = [
            // Font
            ['--fontFamily', FontConfig.DEFAULT_WEB_FONT],
            ['--bs-body-font-family', FontConfig.DEFAULT_WEB_FONT],
            // Brand
            ['--colorTema', p.colorTema],
            ['--colorTemaText', p.colorTemaText],
            ['--colorPrimary', p.colorPrimary],
            ['--colorPrimaryRgb', p.colorPrimaryRgb],
            ['--colorPrimaryText', p.colorPrimaryText],
            // Link + focus ring — tone-adaptive (bug fix: colorPrimary era scuro-su-scuro)
            ['--colorLinkLt', p.colorLinkLt],
            ['--colorLinkDk', p.colorLinkDk],
            ['--colorLink', link],
            ['--focusRingColor', link],
            ['--bs-link-color', link],
            ['--bs-link-hover-color', ThemeService.mixHexColors(link, lt ? '#000000' : '#ffffff', 0.15)],
            // Surfaces (tone-adaptive)
            ['--colorBase', lt ? p.colorBaseLt : p.colorBaseDk],
            ['--colorSurface', lt ? p.colorSurfaceLt : p.colorSurfaceDk],
            ['--colorSurfaceHover', lt ? p.colorSurfaceHoverLt : p.colorSurfaceHoverDk],
            ['--colorSurfaceBorder', lt ? p.colorSurfaceBorderLt : p.colorSurfaceBorderDk],
            ['--colorSurfaceText', lt ? p.colorSurfaceTextLt : p.colorSurfaceTextDk],
            // Semantic (tone-adaptive, derivati da brand)
            ['--colorSecondary', lt ? p.colorSecondaryLt : p.colorSecondaryDk],
            ['--colorSecondaryText', lt ? p.colorSecondaryTextLt : p.colorSecondaryTextDk],
            // Bootstrap overrides
            ['--bs-primary', p.colorPrimary],
            ['--bs-primary-rgb', p.colorPrimaryRgb],
            ['--bs-secondary', lt ? p.colorSecondaryLt : p.colorSecondaryDk],
            ['--bs-body-bg', lt ? p.colorBaseLt : p.colorBaseDk],
            ['--bs-body-color', lt ? p.colorSurfaceTextLt : p.colorSurfaceTextDk],
            ['--bs-body-color-rgb', ThemeService.hexToRgbTriplet(lt ? p.colorSurfaceTextLt : p.colorSurfaceTextDk)],
            ['--bs-border-color', lt ? p.colorSurfaceBorderLt : p.colorSurfaceBorderDk],
            // RGB triplets semantici per rgba() utilities Bootstrap
            ['--bs-secondary-rgb', ThemeService.hexToRgbTriplet(lt ? p.colorSecondaryLt : p.colorSecondaryDk)],
            ['--bs-link-color-rgb', ThemeService.hexToRgbTriplet(link)],
            // Variabili strutturali Bootstrap
            ['--bs-emphasis-color', lt ? p.colorHeadingLt : p.colorHeadingDk],
            ['--bs-emphasis-color-rgb', ThemeService.hexToRgbTriplet(lt ? p.colorHeadingLt : p.colorHeadingDk)],
            ['--bs-heading-color', lt ? p.colorHeadingLt : p.colorHeadingDk],
            ['--bs-secondary-bg', lt ? p.colorMutedBgLt : p.colorMutedBgDk],
            ['--bs-secondary-bg-rgb', ThemeService.hexToRgbTriplet(lt ? p.colorMutedBgLt : p.colorMutedBgDk)],
            ['--bs-tertiary-bg', lt ? p.colorSubtleBgLt : p.colorSubtleBgDk],
            ['--bs-tertiary-bg-rgb', ThemeService.hexToRgbTriplet(lt ? p.colorSubtleBgLt : p.colorSubtleBgDk)],
            ['--bs-secondary-color', lt ? p.colorMutedTextLt : p.colorMutedTextDk],
            ['--bs-secondary-color-rgb', ThemeService.hexToRgbTriplet(lt ? p.colorMutedTextLt : p.colorMutedTextDk)],
            // Bootstrap subtle/emphasis system — .alert-*-subtle, .text-*-emphasis per primary e secondary
            ['--bs-primary-bg-subtle', lt ? p.subtlePrimary.bgSubtleLt : p.subtlePrimary.bgSubtleDk],
            ['--bs-primary-border-subtle', lt ? p.subtlePrimary.borderSubtleLt : p.subtlePrimary.borderSubtleDk],
            ['--bs-primary-text-emphasis', lt ? p.subtlePrimary.textEmphasisLt : p.subtlePrimary.textEmphasisDk],
            ['--bs-secondary-bg-subtle', lt ? p.subtleSecondary.bgSubtleLt : p.subtleSecondary.bgSubtleDk],
            ['--bs-secondary-border-subtle', lt ? p.subtleSecondary.borderSubtleLt : p.subtleSecondary.borderSubtleDk],
            ['--bs-secondary-text-emphasis', lt ? p.subtleSecondary.textEmphasisLt : p.subtleSecondary.textEmphasisDk],
            // Bridge vars — esposti come --color* su :root così base.css può propagarli
            // ai subtheme [data-bs-theme] nested via var(--color*) senza dipendere dall'inline style
            ['--colorHeading', lt ? p.colorHeadingLt : p.colorHeadingDk],
            ['--colorHeadingRgb', ThemeService.hexToRgbTriplet(lt ? p.colorHeadingLt : p.colorHeadingDk)],
            ['--colorMutedBg', lt ? p.colorMutedBgLt : p.colorMutedBgDk],
            ['--colorSubtleBg', lt ? p.colorSubtleBgLt : p.colorSubtleBgDk],
            ['--colorMutedText', lt ? p.colorMutedTextLt : p.colorMutedTextDk],
            ['--colorPrimaryBgSubtle', lt ? p.subtlePrimary.bgSubtleLt : p.subtlePrimary.bgSubtleDk],
            ['--colorPrimaryBorderSubtle', lt ? p.subtlePrimary.borderSubtleLt : p.subtlePrimary.borderSubtleDk],
            ['--colorPrimaryTextEmphasis', lt ? p.subtlePrimary.textEmphasisLt : p.subtlePrimary.textEmphasisDk],
            ['--colorSecondaryBgSubtle', lt ? p.subtleSecondary.bgSubtleLt : p.subtleSecondary.bgSubtleDk],
            ['--colorSecondaryBorderSubtle', lt ? p.subtleSecondary.borderSubtleLt : p.subtleSecondary.borderSubtleDk],
            ['--colorSecondaryTextEmphasis', lt ? p.subtleSecondary.textEmphasisLt : p.subtleSecondary.textEmphasisDk],
            // Varianti Lt/Dk separate — necessarie per il ponte CSS dei subtheme [data-bs-theme]
            // nidificati (es. pannello forced-light dentro pagina dark). Le variabili tone-adattive
            // sopra si risolvono sempre dal tone corrente dell'OS; questi token fissi permettono
            // a [data-bs-theme="light/dark"] in base.css di usare il valore corretto
            // indipendentemente dal tone globale. Stesso pattern già usato per --colorLinkLt/Dk.
            ['--colorHeadingLt', p.colorHeadingLt],
            ['--colorHeadingDk', p.colorHeadingDk],
            ['--colorHeadingRgbLt', ThemeService.hexToRgbTriplet(p.colorHeadingLt)],
            ['--colorHeadingRgbDk', ThemeService.hexToRgbTriplet(p.colorHeadingDk)],
            ['--colorSurfaceTextLt', p.colorSurfaceTextLt],
            ['--colorSurfaceTextDk', p.colorSurfaceTextDk],
            ['--colorSurfaceTextRgbLt', ThemeService.hexToRgbTriplet(p.colorSurfaceTextLt)],
            ['--colorSurfaceTextRgbDk', ThemeService.hexToRgbTriplet(p.colorSurfaceTextDk)],
            ['--colorBaseLt', p.colorBaseLt],
            ['--colorBaseDk', p.colorBaseDk],
            ['--colorSurfaceBorderLt', p.colorSurfaceBorderLt],
            ['--colorSurfaceBorderDk', p.colorSurfaceBorderDk],
            ['--colorMutedBgLt', p.colorMutedBgLt],
            ['--colorMutedBgDk', p.colorMutedBgDk],
            ['--colorSubtleBgLt', p.colorSubtleBgLt],
            ['--colorSubtleBgDk', p.colorSubtleBgDk],
            ['--colorMutedTextLt', p.colorMutedTextLt],
            ['--colorMutedTextDk', p.colorMutedTextDk],
            // Adaptive Nav variables
            ['--colorNavBg', lt ? p.colorNavBgLt : p.colorNavBgDk],
            ['--colorNavText', lt ? p.colorNavTextLt : p.colorNavTextDk],
            ['--colorNavBgLt', p.colorNavBgLt],
            ['--colorNavBgDk', p.colorNavBgDk],
            ['--colorNavTextLt', p.colorNavTextLt],
            ['--colorNavTextDk', p.colorNavTextDk],
        ];

        for (const [prop, val] of vars) {
            el.style.setProperty(prop, val);
        }
        el.style.colorScheme = tone;
    }

    // ── Theme HTML injection ──────────────────────────────────────────────

    // Cache di computePalette con chiave colorTema: evita di ricalcolare la costosa pipeline
    // OKLCH se buildThemeHeadTags/buildThemeStyleTag viene chiamato più volte con lo stesso brand
    // (comune in SSR dove molte route chiamano buildThemeHeadTags nella stessa sessione Node).
    private static readonly _paletteCache = new Map<string, PaletteTokens>();

    // Legge dalla cache o calcola e memorizza la palette per questo brand color.
    private static _getCachedPalette(colorTema: string): PaletteTokens {
        let p = ThemeService._paletteCache.get(colorTema);
        if (!p) {
            p = ThemeService.computePalette(colorTema);
            ThemeService._paletteCache.set(colorTema, p);
        }
        return p;
    }

    /** Produce tutti i tag `<head>` del tema: `<meta name="theme-color">` + `<style id="theme-init">`. */
    static buildThemeHeadTags(colorTema: string): string {
        const p = ThemeService._getCachedPalette(colorTema);
        return ThemeService._buildThemeColorMetaFromPalette(p) + '\n' + ThemeService._buildThemeStyleTagFromPalette(p);
    }

    /** Produce solo `<style id="theme-init">` senza il meta theme-color. Utile per render parziale o testing. */
    static buildThemeStyleTag(colorTema: string): string {
        return ThemeService._buildThemeStyleTagFromPalette(ThemeService._getCachedPalette(colorTema));
    }

    /**
     * Produce il blocco `<style id="theme-init">` da iniettare nell'HTML SSR prima di `</head>`.
     * Posizionato dopo il `<link>` di Bootstrap → stessa specificità (0,1,0), posizione successiva
     * → nostro `:root` vince la cascade senza bisogno di inline styles.
     * I `@media` blocks delegano al browser la scelta del tone in base all'OS.
     */
    private static _buildThemeStyleTagFromPalette(p: PaletteTokens): string {

        const surfaces = (tone: 'light' | 'dark'): string => {
            const s = tone === 'light';
            const link = s ? p.colorLinkLt : p.colorLinkDk;
            return (
                // Link + focus ring tone-adaptive
                `--colorLink:${link};` +
                `--focusRingColor:${link};` +
                `--bs-link-color:${link};` +
                `--bs-link-color-rgb:${ThemeService.hexToRgbTriplet(link)};` +
                `--bs-link-hover-color:${ThemeService.mixHexColors(link, s ? '#000000' : '#ffffff', 0.15)};` +
                // Surfaces
                `--colorBase:${s ? p.colorBaseLt : p.colorBaseDk};` +
                `--colorSurface:${s ? p.colorSurfaceLt : p.colorSurfaceDk};` +
                `--colorSurfaceHover:${s ? p.colorSurfaceHoverLt : p.colorSurfaceHoverDk};` +
                `--colorSurfaceBorder:${s ? p.colorSurfaceBorderLt : p.colorSurfaceBorderDk};` +
                `--colorSurfaceText:${s ? p.colorSurfaceTextLt : p.colorSurfaceTextDk};` +
                // Semantic
                `--colorSecondary:${s ? p.colorSecondaryLt : p.colorSecondaryDk};` +
                `--colorSecondaryText:${s ? p.colorSecondaryTextLt : p.colorSecondaryTextDk};` +
                // Bootstrap
                `--bs-body-bg:${s ? p.colorBaseLt : p.colorBaseDk};` +
                `--bs-body-color:${s ? p.colorSurfaceTextLt : p.colorSurfaceTextDk};` +
                `--bs-body-color-rgb:${ThemeService.hexToRgbTriplet(s ? p.colorSurfaceTextLt : p.colorSurfaceTextDk)};` +
                `--bs-border-color:${s ? p.colorSurfaceBorderLt : p.colorSurfaceBorderDk};` +
                `--bs-secondary:${s ? p.colorSecondaryLt : p.colorSecondaryDk};` +
                `color-scheme:${tone};` +
                // Expose lt/dk link vars per CSS subtheme overrides
                `--colorLinkLt:${p.colorLinkLt};` +
                `--colorLinkDk:${p.colorLinkDk};` +
                // RGB triplets semantici
                `--bs-secondary-rgb:${ThemeService.hexToRgbTriplet(s ? p.colorSecondaryLt : p.colorSecondaryDk)};` +
                // Strutturali Bootstrap
                `--bs-emphasis-color:${s ? p.colorHeadingLt : p.colorHeadingDk};` +
                `--bs-emphasis-color-rgb:${ThemeService.hexToRgbTriplet(s ? p.colorHeadingLt : p.colorHeadingDk)};` +
                `--bs-heading-color:${s ? p.colorHeadingLt : p.colorHeadingDk};` +
                `--bs-secondary-bg:${s ? p.colorMutedBgLt : p.colorMutedBgDk};` +
                `--bs-secondary-bg-rgb:${ThemeService.hexToRgbTriplet(s ? p.colorMutedBgLt : p.colorMutedBgDk)};` +
                `--bs-tertiary-bg:${s ? p.colorSubtleBgLt : p.colorSubtleBgDk};` +
                `--bs-tertiary-bg-rgb:${ThemeService.hexToRgbTriplet(s ? p.colorSubtleBgLt : p.colorSubtleBgDk)};` +
                `--bs-secondary-color:${s ? p.colorMutedTextLt : p.colorMutedTextDk};` +
                `--bs-secondary-color-rgb:${ThemeService.hexToRgbTriplet(s ? p.colorMutedTextLt : p.colorMutedTextDk)};` +
                // Subtle/emphasis system
                `--bs-primary-bg-subtle:${s ? p.subtlePrimary.bgSubtleLt : p.subtlePrimary.bgSubtleDk};` +
                `--bs-primary-border-subtle:${s ? p.subtlePrimary.borderSubtleLt : p.subtlePrimary.borderSubtleDk};` +
                `--bs-primary-text-emphasis:${s ? p.subtlePrimary.textEmphasisLt : p.subtlePrimary.textEmphasisDk};` +
                `--bs-secondary-bg-subtle:${s ? p.subtleSecondary.bgSubtleLt : p.subtleSecondary.bgSubtleDk};` +
                `--bs-secondary-border-subtle:${s ? p.subtleSecondary.borderSubtleLt : p.subtleSecondary.borderSubtleDk};` +
                `--bs-secondary-text-emphasis:${s ? p.subtleSecondary.textEmphasisLt : p.subtleSecondary.textEmphasisDk};` +
                `--colorHeading:${s ? p.colorHeadingLt : p.colorHeadingDk};` +
                `--colorHeadingRgb:${ThemeService.hexToRgbTriplet(s ? p.colorHeadingLt : p.colorHeadingDk)};` +
                `--colorMutedBg:${s ? p.colorMutedBgLt : p.colorMutedBgDk};` +
                `--colorSubtleBg:${s ? p.colorSubtleBgLt : p.colorSubtleBgDk};` +
                `--colorMutedText:${s ? p.colorMutedTextLt : p.colorMutedTextDk};` +
                `--colorPrimaryBgSubtle:${s ? p.subtlePrimary.bgSubtleLt : p.subtlePrimary.bgSubtleDk};` +
                `--colorPrimaryBorderSubtle:${s ? p.subtlePrimary.borderSubtleLt : p.subtlePrimary.borderSubtleDk};` +
                `--colorPrimaryTextEmphasis:${s ? p.subtlePrimary.textEmphasisLt : p.subtlePrimary.textEmphasisDk};` +
                `--colorSecondaryBgSubtle:${s ? p.subtleSecondary.bgSubtleLt : p.subtleSecondary.bgSubtleDk};` +
                `--colorSecondaryBorderSubtle:${s ? p.subtleSecondary.borderSubtleLt : p.subtleSecondary.borderSubtleDk};` +
                `--colorSecondaryTextEmphasis:${s ? p.subtleSecondary.textEmphasisLt : p.subtleSecondary.textEmphasisDk};` +
                `--colorNavBg:${s ? p.colorNavBgLt : p.colorNavBgDk};` +
                `--colorNavText:${s ? p.colorNavTextLt : p.colorNavTextDk};`
            );
        };

        const base =
            `--fontFamily:${FontConfig.DEFAULT_WEB_FONT};` +
            `--bs-body-font-family:${FontConfig.DEFAULT_WEB_FONT};` +
            `--colorTema:${p.colorTema};` +
            `--colorTemaText:${p.colorTemaText};` +
            `--colorPrimary:${p.colorPrimary};` +
            `--colorPrimaryRgb:${p.colorPrimaryRgb};` +
            `--colorPrimaryText:${p.colorPrimaryText};` +
            `--bs-primary:${p.colorPrimary};` +
            `--bs-primary-rgb:${p.colorPrimaryRgb};` +
            // Varianti Lt/Dk fisse — per il ponte CSS subtheme in base.css
            `--colorHeadingLt:${p.colorHeadingLt};` +
            `--colorHeadingDk:${p.colorHeadingDk};` +
            `--colorHeadingRgbLt:${ThemeService.hexToRgbTriplet(p.colorHeadingLt)};` +
            `--colorHeadingRgbDk:${ThemeService.hexToRgbTriplet(p.colorHeadingDk)};` +
            `--colorSurfaceTextLt:${p.colorSurfaceTextLt};` +
            `--colorSurfaceTextDk:${p.colorSurfaceTextDk};` +
            `--colorSurfaceTextRgbLt:${ThemeService.hexToRgbTriplet(p.colorSurfaceTextLt)};` +
            `--colorSurfaceTextRgbDk:${ThemeService.hexToRgbTriplet(p.colorSurfaceTextDk)};` +
            `--colorBaseLt:${p.colorBaseLt};` +
            `--colorBaseDk:${p.colorBaseDk};` +
            `--colorSurfaceBorderLt:${p.colorSurfaceBorderLt};` +
            `--colorSurfaceBorderDk:${p.colorSurfaceBorderDk};` +
            `--colorMutedBgLt:${p.colorMutedBgLt};` +
            `--colorMutedBgDk:${p.colorMutedBgDk};` +
            `--colorSubtleBgLt:${p.colorSubtleBgLt};` +
            `--colorSubtleBgDk:${p.colorSubtleBgDk};` +
            `--colorMutedTextLt:${p.colorMutedTextLt};` +
            `--colorMutedTextDk:${p.colorMutedTextDk};` +
            `--colorNavBgLt:${p.colorNavBgLt};` +
            `--colorNavBgDk:${p.colorNavBgDk};` +
            `--colorNavTextLt:${p.colorNavTextLt};` +
            `--colorNavTextDk:${p.colorNavTextDk};`;

        return (
            `<style id="theme-init">` +
            `:root{${base}${surfaces(p.naturalTone)}}` +
            `@media(prefers-color-scheme:light){:root{${surfaces('light')}}}` +
            `@media(prefers-color-scheme:dark){:root{${surfaces('dark')}}}` +
            `</style>`
        );
    }

    /**
     * Produce i tag <meta name="theme-color"> con varianti light/dark per il chrome
     * del browser (barra indirizzi, status bar PWA). Usa colorBase* come sfondo perché
     * si fonde con la UI — comportamento atteso per le progressive web app.
     */
    static buildThemeColorMeta(colorTema: string): string {
        return ThemeService._buildThemeColorMetaFromPalette(ThemeService.computePalette(colorTema));
    }

    // Produce i due <meta name="theme-color"> per light e dark.
    // Usa colorBase* (sfondo pagina) perché si fonde con il chrome del browser (barra indirizzi, status bar PWA).
    private static _buildThemeColorMetaFromPalette(p: PaletteTokens): string {
        return (
            `<meta name="theme-color" media="(prefers-color-scheme:light)" content="${p.colorBaseLt}">` +
            `<meta name="theme-color" media="(prefers-color-scheme:dark)"  content="${p.colorBaseDk}">`
        );
    }

    // ── Static palette computation ────────────────────────────────────────

    /**
     * Calcola l'intera `PaletteTokens` dal solo colore brand.
     * Ogni token è derivato matematicamente in OKLCH: nessun valore hardcoded
     * ad eccezione delle costanti di luminosità (L) che definiscono la struttura Bootstrap.
     */
    static computePalette(colorTema: string): PaletteTokens {
        const [, C_t, H_t] = ThemeService.hexToOklch(colorTema);
        const colorTemaText = ThemeService.getReadableTextColor(colorTema);
        const colorPrimary = ThemeService.computeColorPrimary(colorTema);
        const colorPrimaryRgb = ThemeService.hexToRgbTriplet(colorPrimary);
        const colorPrimaryText = ThemeService.getReadableTextColor(colorPrimary);
        const naturalTone = ThemeService.computeThemeTone(colorTema);

        // Sfondo base precomputato — serve come riferimento per i check di contrasto
        // dei colori semantici (findCompliantColor li usa per garantire WCAG 4.5:1).
        const baseLtHex = ThemeService.oklchToHex(0.970, Math.min(C_t * 0.03, 0.004), H_t);
        const baseDkHex = ThemeService.oklchToHex(0.140, Math.min(C_t * 0.08, 0.010), H_t);

        // Link Lt = colorPrimary (già WCAG 4.5:1 su bianco).
        // Link Dk = stessa hue del brand, L sale finché ≥ 4.5:1 su sfondo scuro.
        // Chroma minima 0.08 per garantire una tinta riconoscibile anche su brand grigi.
        const colorLinkLt = colorPrimary;
        const colorLinkDk = ThemeService.findCompliantColor(
            Math.max(C_t, 0.08), H_t, baseDkHex, 4.5, 0.55, +0.01
        );

        // Secondary: C più bassa del brand — è una variante muted, non un accento.
        const C_sec = Math.min(C_t * 0.75, 0.12);
        const H_sec = H_t;

        const secLt = ThemeService.findCompliantColor(C_sec, H_sec, baseLtHex, 4.5, 0.72, -0.01);
        const secDk = ThemeService.findCompliantColor(C_sec, H_sec, baseDkHex, 4.5, 0.55, +0.01);

        // ── Subtle/emphasis system ─────────────────────────────────────────
        const [, C_p, H_p] = ThemeService.hexToOklch(colorPrimary);
        const subtlePrimary = ThemeService.computeSemanticSubtle(C_p, H_p);
        const subtleSecondary = ThemeService.computeSemanticSubtle(C_sec, H_sec);

        // ── Structural Bootstrap vars ──────────────────────────────────────
        // emphasis: headings/strong — quasi nero/bianco con leggera tinta brand
        const colorHeadingLt = ThemeService.oklchToHex(0.165, Math.min(C_t * 0.14, 0.020), H_t);
        const colorHeadingDk = ThemeService.oklchToHex(0.958, Math.min(C_t * 0.04, 0.006), H_t);
        // secondary-bg: disabled inputs, table-striped
        const colorMutedBgLt = ThemeService.oklchToHex(0.942, Math.min(C_t * 0.08, 0.011), H_t);
        const colorMutedBgDk = ThemeService.oklchToHex(0.295, Math.min(C_t * 0.18, 0.022), H_t);
        // tertiary-bg: table striped alternato, placeholder
        const colorSubtleBgLt = ThemeService.oklchToHex(0.967, Math.min(C_t * 0.05, 0.007), H_t);
        const colorSubtleBgDk = ThemeService.oklchToHex(0.248, Math.min(C_t * 0.20, 0.025), H_t);
        // secondary-color: testo muted — WCAG 4.5:1 garantito da findCompliantColor
        const colorMutedTextLt = ThemeService.findCompliantColor(Math.min(C_t * 0.08, 0.012), H_t, baseLtHex, 4.5, 0.65, -0.01);
        const colorMutedTextDk = ThemeService.findCompliantColor(Math.min(C_t * 0.08, 0.012), H_t, baseDkHex, 4.5, 0.45, +0.01);

        // Adaptive Navbar/Footer colors (NavBg / NavText)
        let colorNavBgLt: string;
        let colorNavTextLt: string;
        if (colorTemaText === '#ffffff') {
            // Brand color is dark and supports white text beautifully.
            // We use the brand color directly for a very immersive branded look.
            colorNavBgLt = colorTema;
            colorNavTextLt = '#ffffff';
        } else {
            // Brand color is light/vibrant (like pure red, yellow, neon).
            // A solid background would force dark text and look extremely aggressive.
            // Instead, we use an elegant, soft off-white/pastel version of the brand color,
            // with a dark brand-tinted text.
            colorNavBgLt = ThemeService.oklchToHex(0.965, Math.min(C_t * 0.20, 0.020), H_t);
            colorNavTextLt = ThemeService.oklchToHex(0.200, Math.min(C_t * 0.40, 0.040), H_t);
        }

        // In dark mode, we always want a very dark background to respect the dark theme,
        // but elegantly tinted with the brand color.
        const colorNavBgDk = ThemeService.oklchToHex(0.150, Math.min(C_t * 0.25, 0.030), H_t);
        const colorNavTextDk = ThemeService.oklchToHex(0.920, Math.min(C_t * 0.06, 0.010), H_t);

        return {
            colorTema,
            colorTemaText,
            colorPrimary,
            colorPrimaryRgb,
            colorPrimaryText,
            colorLinkLt,
            colorLinkDk,

            // Light surfaces — high L, low chroma, brand hue.
            // Border at L=0.570: lum≈0.185 vs base lum≈0.913 → contrast ≈ 4.3:1 (WCAG 1.4.11 ≥ 3:1).
            colorBaseLt: baseLtHex,
            colorSurfaceLt: ThemeService.oklchToHex(0.985, Math.min(C_t * 0.02, 0.003), H_t),
            colorSurfaceHoverLt: ThemeService.oklchToHex(0.950, Math.min(C_t * 0.04, 0.006), H_t),
            colorSurfaceBorderLt: ThemeService.oklchToHex(0.570, 0, 0),
            colorSurfaceTextLt: ThemeService.oklchToHex(0.200, Math.min(C_t * 0.20, 0.030), H_t),

            // Dark surfaces — low L, moderate chroma, brand hue.
            // Border at L=0.490: lum≈0.118 vs base lum≈0.003 → contrast ≈ 3.3:1 (WCAG 1.4.11 ≥ 3:1).
            colorBaseDk: baseDkHex,
            colorSurfaceDk: ThemeService.oklchToHex(0.180, Math.min(C_t * 0.12, 0.014), H_t),
            colorSurfaceHoverDk: ThemeService.oklchToHex(0.220, Math.min(C_t * 0.10, 0.012), H_t),
            colorSurfaceBorderDk: ThemeService.oklchToHex(0.490, 0, 0),
            colorSurfaceTextDk: ThemeService.oklchToHex(0.920, Math.min(C_t * 0.06, 0.010), H_t),

            // Semantic light
            colorSecondaryLt: secLt, colorSecondaryTextLt: ThemeService.getReadableTextColor(secLt),

            // Semantic dark
            colorSecondaryDk: secDk, colorSecondaryTextDk: ThemeService.getReadableTextColor(secDk),

            subtlePrimary, subtleSecondary,
            colorHeadingLt, colorHeadingDk,
            colorMutedBgLt, colorMutedBgDk,
            colorSubtleBgLt, colorSubtleBgDk,
            colorMutedTextLt, colorMutedTextDk,

            colorNavBgLt,
            colorNavTextLt,
            colorNavBgDk,
            colorNavTextDk,

            naturalTone,
        };
    }

    // Calcola le 3 varianti subtle/emphasis per un colore semantico dato C e H OKLCH.
    // bg-subtle: sfondo pastello (L alto/basso, C molto bassa) per .alert-*, .bg-*-subtle
    // border-subtle: bordo intermedio per .alert-* border
    // text-emphasis: WCAG 4.5:1 su bg-subtle per .text-*-emphasis e testo in .alert-*
    private static computeSemanticSubtle(C: number, H: number): SemanticSubtleTokens {
        const bgSubtleLt = ThemeService.oklchToHex(0.935, Math.min(C * 0.18, 0.030), H);
        const bgSubtleDk = ThemeService.oklchToHex(0.175, Math.min(C * 0.30, 0.042), H);
        const borderSubtleLt = ThemeService.oklchToHex(0.750, Math.min(C * 0.48, 0.082), H);
        const borderSubtleDk = ThemeService.oklchToHex(0.385, Math.min(C * 0.58, 0.090), H);
        const textEmphasisLt = ThemeService.findCompliantColor(Math.min(C, 0.18), H, bgSubtleLt, 4.5, 0.45, -0.01);
        const textEmphasisDk = ThemeService.findCompliantColor(Math.min(C, 0.18), H, bgSubtleDk, 4.5, 0.62, +0.01);
        return { bgSubtleLt, bgSubtleDk, borderSubtleLt, borderSubtleDk, textEmphasisLt, textEmphasisDk };
    }

    // Cerca il colore OKLCH(L, C, H) con il contrasto WCAG ≥ targetRatio contro bgHex.
    // startL + step definiscono la direzione: step < 0 = scende (light mode, cerca scuro);
    // step > 0 = sale (dark mode, cerca chiaro). Fa max 70 passi da 0.01 L cadauno.
    private static findCompliantColor(
        C: number, H: number,
        bgHex: string, targetRatio: number,
        startL: number, step: number,
    ): string {
        let L = startL;
        for (let i = 0; i < 70; i++) {
            L = Math.min(0.95, Math.max(0.05, L + step));
            const hex = ThemeService.oklchToHex(L, C, H);
            if (ThemeService.calcContrastRatio(hex, bgHex) >= targetRatio) return hex;
        }
        return ThemeService.oklchToHex(Math.min(0.95, Math.max(0.05, startL + step * 70)), C, H);
    }

    // ── OKLCH ↔ hex pipeline ──────────────────────────────────────────────
    // Algoritmo di Björn Ottosson (https://bottosson.github.io/posts/oklab/).
    // Pipeline andata: sRGB → linearizza → spazio LMS (matrice M1) → cbrt → OKLab (matrice M2) → OKLCH.

    /** Converte un colore hex sRGB in `[L, C, H]` OKLCH. Restituisce L ∈ [0,1], C ∈ [0,~0.4], H ∈ [0,360). */
    static hexToOklch(hex: string): [number, number, number] {
        const { r, g, b } = ThemeService.hexToRgb(hex);
        const lr = ThemeService.toLinearChannel(r / 255);
        const lg = ThemeService.toLinearChannel(g / 255);
        const lb = ThemeService.toLinearChannel(b / 255);

        const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
        const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
        const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

        const l_ = Math.cbrt(Math.max(0, l));
        const m_ = Math.cbrt(Math.max(0, m));
        const s_ = Math.cbrt(Math.max(0, s));

        const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
        const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
        const bk = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

        const C = Math.sqrt(a * a + bk * bk);
        const H = ((Math.atan2(bk, a) * 180 / Math.PI) + 360) % 360;

        return [L, C, H];
    }

    /** Inverso di `hexToOklch`: `[L, C, H]` OKLCH → hex sRGB. Pipeline: OKLCH → OKLab → LMS → linear → sRGB → hex. I canali sRGB sono clampati a `[0, 255]`. */
    static oklchToHex(L: number, C: number, H: number): string {
        const hRad = H * Math.PI / 180;
        const a = C * Math.cos(hRad);
        const bk = C * Math.sin(hRad);

        const l_ = L + 0.3963377774 * a + 0.2158037573 * bk;
        const m_ = L - 0.1055613458 * a - 0.0638541728 * bk;
        const s_ = L - 0.0894841775 * a - 1.2914855480 * bk;

        const l = l_ * l_ * l_;
        const m = m_ * m_ * m_;
        const s = s_ * s_ * s_;

        const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

        const encode = (c: number): number => {
            const v = Math.max(0, Math.min(1, c));
            return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
        };

        return ThemeService.rgbToHex(
            Math.round(encode(lr) * 255),
            Math.round(encode(lg) * 255),
            Math.round(encode(lb) * 255),
        );
    }

    // ── APCA (WCAG 3 candidate) contrast ─────────────────────────────────

    /**
     * Calcola il contrasto APCA tra testo e sfondo.
     * Restituisce il valore Lc: |Lc| ≥ 60 per testo corpo, ≥ 45 per testo grande/bold.
     */
    static calcApcaContrast(textHex: string, bgHex: string): number {
        // toY: luminanza relativa APCA con coefficienti ITU-R BT.709 sui canali linearizzati.
        const toY = (hex: string): number => {
            const { r, g, b } = ThemeService.hexToRgb(hex);
            return 0.2126729 * ThemeService.toLinearChannel(r / 255)
                + 0.7151522 * ThemeService.toLinearChannel(g / 255)
                + 0.0721750 * ThemeService.toLinearChannel(b / 255);
        };

        const Ys = toY(textHex); // screen (testo)
        const Yb = toY(bgHex);   // background (sfondo)

        // Esponenti asimmetrici: testo scuro su chiaro vs testo chiaro su scuro hanno
        // curve di percettibilità diverse — APCA le modella separatamente.
        let sapc: number;
        if (Yb >= Ys) {
            sapc = (Math.pow(Yb, 0.56) - Math.pow(Ys, 0.57)) * 1.14; // sfondo chiaro
        } else {
            sapc = (Math.pow(Yb, 0.65) - Math.pow(Ys, 0.62)) * 1.14; // sfondo scuro
        }

        // Offset di soglia: valori |sapc| < 0.1 sono percettivamente irrilevanti → restituisce 0.
        if (Math.abs(sapc) < 0.1) return 0;
        return sapc > 0
            ? (sapc - 0.027) * 100
            : (sapc + 0.027) * 100;
    }

    // ── Backward-compat static methods ────────────────────────────────────

    /** Scurisce il brand mescolando con nero finché raggiunge WCAG 4.5:1 su sfondo bianco. Fallback `#1a1a1a` se non convergente. */
    static computeColorPrimary(colorTema: string): string {
        for (let w = 0.4; w < 0.95; w += 0.05) {
            const candidate = ThemeService.mixHexColors(colorTema, '#000000', w);
            if (ThemeService.calcContrastRatio(candidate, '#ffffff') >= 4.5) return candidate;
        }
        return '#1a1a1a';
    }

    /** `'light'` se il brand richiede testo scuro (colore chiaro), `'dark'` se richiede testo bianco. */
    static computeThemeTone(colorTema: string): 'light' | 'dark' {
        return ThemeService.prefersDarkText(colorTema) ? 'light' : 'dark';
    }

    /** `true` se il nero ha contrasto ≥ del bianco sul colore dato — indica un colore chiaro/pastello. */
    static prefersDarkText(hexColor: string): boolean {
        return ThemeService.calcContrastRatio(hexColor, '#000000') >=
            ThemeService.calcContrastRatio(hexColor, '#ffffff');
    }

    /** `#000000` se il colore è chiaro, `#ffffff` se è scuro — massimo contrasto WCAG. */
    static getReadableTextColor(hexColor: string): '#000000' | '#ffffff' {
        return ThemeService.prefersDarkText(hexColor) ? '#000000' : '#ffffff';
    }

    /** Interpola linearmente in spazio RGB tra due hex. `mixWeight=0` → base pura, `1` → mix puro. */
    static mixHexColors(baseHex: string, mixHex: string, mixWeight: number): string {
        const base = ThemeService.hexToRgb(baseHex);
        const mix = ThemeService.hexToRgb(mixHex);
        const weight = Math.min(Math.max(mixWeight, 0), 1);
        const r = Math.round(base.r * (1 - weight) + mix.r * weight);
        const g = Math.round(base.g * (1 - weight) + mix.g * weight);
        const b = Math.round(base.b * (1 - weight) + mix.b * weight);
        return ThemeService.rgbToHex(r, g, b);
    }

    /** Rapporto di contrasto WCAG 2.1: `(L_chiaro + 0.05) / (L_scuro + 0.05)`. Range [1, 21]. */
    static calcContrastRatio(colorA: string, colorB: string): number {
        const lumA = ThemeService.calcLuminance(colorA);
        const lumB = ThemeService.calcLuminance(colorB);
        const lighter = Math.max(lumA, lumB);
        const darker = Math.min(lumA, lumB);
        return (lighter + 0.05) / (darker + 0.05);
    }

    /** Restituisce la tripla `"r, g, b"` (es. `"31, 64, 255"`) per le utility `rgba()` di Bootstrap/CSS. */
    static hexToRgbTriplet(hexColor: string): string {
        const { r, g, b } = ThemeService.hexToRgb(hexColor);
        return `${r}, ${g}, ${b}`;
    }

    /** Luminanza relativa WCAG 2.1: `0.2126R + 0.7152G + 0.0722B` sui canali linearizzati. Range [0, 1]. */
    static calcLuminance(hexColor: string): number {
        const n = ThemeService.normalizeHex(hexColor);
        const r = ThemeService.toLinearChannel(parseInt(n.substring(0, 2), 16) / 255);
        const g = ThemeService.toLinearChannel(parseInt(n.substring(2, 4), 16) / 255);
        const b = ThemeService.toLinearChannel(parseInt(n.substring(4, 6), 16) / 255);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    // ── Private helpers ───────────────────────────────────────────────────

    // Converte hex → {r, g, b} uint8. Delega la normalizzazione a normalizeHex.
    private static hexToRgb(hexColor: string): { r: number; g: number; b: number } {
        const n = ThemeService.normalizeHex(hexColor);
        return {
            r: parseInt(n.slice(0, 2), 16),
            g: parseInt(n.slice(2, 4), 16),
            b: parseInt(n.slice(4, 6), 16),
        };
    }

    // Rimuove il '#', espande la shorthand #RGB → #RRGGBB e garantisce esattamente 6 caratteri.
    private static normalizeHex(hexColor: string): string {
        const s = hexColor.replace('#', '').trim();
        return s.length === 3
            ? s.split('').map(c => c + c).join('')
            : s.padEnd(6, '0').slice(0, 6);
    }

    // Converte tre canali uint8 in '#rrggbb', clampando ogni canale a [0, 255].
    private static rgbToHex(r: number, g: number, b: number): string {
        const ch = (v: number) =>
            Math.min(Math.max(Math.round(v), 0), 255).toString(16).padStart(2, '0');
        return `#${ch(r)}${ch(g)}${ch(b)}`;
    }

    // Linearizzazione gamma sRGB (IEC 61966-2-1): rimuove la curva gamma prima del calcolo della luminanza.
    // Soglia 0.04045: valori sotto usano la rampa lineare, sopra la curva di potenza 2.4.
    private static toLinearChannel(channelValue: number): number {
        return channelValue <= 0.04045
            ? channelValue / 12.92
            : Math.pow((channelValue + 0.055) / 1.055, 2.4);
    }
}
