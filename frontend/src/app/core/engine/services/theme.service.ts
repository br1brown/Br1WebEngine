import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, Signal, WritableSignal, afterNextRender, computed, inject, isDevMode, signal, DOCUMENT } from '@angular/core';
import { ContestoSito } from '../../../site';
import { resolvedFonts } from '../../../../styles/font-config';

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
    /** Colore brand esatto (`site.colorTema` in global-settings.json). CSS: `--colorTema` */
    colorTema: string;
    /** `#000000` o `#ffffff` — testo a massimo contrasto su `colorTema`. CSS: `--colorTemaText` */
    colorTemaText: '#000000' | '#ffffff';
    /** Brand scurito in OKLCH (hue e chroma preservate) finché il contrasto WCAG 4.5:1 sullo sfondo pagina chiaro (`baseLt`) è garantito. Usato per link, bottoni, CTA. CSS: `--colorPrimary` */
    colorPrimary: string;
    /** Tripla RGB di `colorPrimary` (es. `"31, 64, 255"`), per le utility `rgba()` di Bootstrap. CSS: `--colorPrimaryRgb` */
    colorPrimaryRgb: string;
    /**
     * Gemella scura di `colorPrimary`: brand schiarito in OKLCH (hue e chroma preservate) finché il
     * contrasto 4.8:1 (sopra AA) sulla superficie più ESTREMA dark (`mutedBgDk`) è garantito. Usata per
     * il primary come FOREGROUND (testo `.text-primary`, bordo `.border-primary`) in dark mode, dove
     * `colorPrimary` — tarato per il fondo chiaro — risulterebbe scuro-su-scuro. CSS: `--colorPrimaryFgDk`
     */
    colorPrimaryFgDk: string;
    /** Tripla RGB di `colorPrimaryFgDk`, per le utility `rgba()` con opacity. CSS: `--colorPrimaryFgRgbDk` */
    colorPrimaryFgDkRgb: string;
    /**
     * Variante LIGHT del primary come FOREGROUND (testo `.text-primary`, bordo `.border-primary`):
     * brand scurito in OKLCH finché il contrasto 4.8:1 (sopra AA) sulla superficie più ESTREMA light
     * (`mutedBgLt`) è garantito. Disaccoppiata dal fill `colorPrimary` (`--bs-primary`), che resta il
     * colore brand fedele: il foreground vive sulle superfici, il fill ospita testo proprio. CSS: `--colorPrimaryFgLt`
     */
    colorPrimaryFgLt: string;
    /** Tripla RGB di `colorPrimaryFgLt`. CSS: `--colorPrimaryFgRgbLt` */
    colorPrimaryFgLtRgb: string;
    /**
     * Variante DARK del primary come FILL (`--bs-primary` in dark mode): `colorPrimary` schiarito quanto
     * basta per un boundary ≥3.2:1 sul fondo pagina scuro, così `.btn-primary`/`.bg-primary` resta
     * visibile anche con brand quasi-neri. Brand già luminosi: invariato. CSS: `--colorPrimaryDk` (fill)
     */
    colorPrimaryFillDk: string;
    /** Tripla RGB di `colorPrimaryFillDk`. CSS: `--colorPrimaryRgbDk` (fill) */
    colorPrimaryFillDkRgb: string;
    /** `#000000` o `#ffffff` — testo leggibile su `colorPrimaryFillDk` (fill primary in dark). CSS: `--colorPrimaryTextDk` */
    colorPrimaryTextDk: '#000000' | '#ffffff';
    /** `#000000` o `#ffffff` — testo leggibile su `colorPrimary` (fill primary in light). CSS: `--colorPrimaryText` */
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
    // Nota: warning/success/danger NON sono calcolati qui — restano colori semantici con hue fisse
    // (non derivate dal brand): significato universale (allerta/successo/errore), non negoziabile.
    // Bootstrap 5.3 fornisce già varianti light/dark WCAG-safe tramite i blocchi [data-bs-theme] nel
    // suo CSS. ThemeService imposta data-bs-theme su <html>, quindi --bs-warning-text-emphasis ecc.
    // si risolvono automaticamente senza ricalcolo.

    // ── Info — SOLO se PaletteOverrides.info è presente (a differenza di primary/secondary non ha
    // un fallback derivato dal brand: assente, questi 5 campi restano undefined e --bs-info* resta
    // gestito per intero da Bootstrap, invariato). Stessa pipeline WCAG di subtleSecondary.
    /** `.btn-outline-info`/testo su `colorInfoBgSubtleLt`. Presente solo se overridden. CSS: `--colorInfoLt` */
    colorInfoLt?: string;
    /** Come sopra, dark mode. CSS: `--colorInfoDk` */
    colorInfoDk?: string;
    /** `#000000` o `#ffffff` — testo leggibile su `colorInfoLt`. CSS: `--colorInfoTextLt` */
    colorInfoTextLt?: '#000000' | '#ffffff';
    /** `#000000` o `#ffffff` — testo leggibile su `colorInfoDk`. CSS: `--colorInfoTextDk` */
    colorInfoTextDk?: '#000000' | '#ffffff';
    /** Token sfondo/bordo/testo per `.alert-info`, `.text-info-emphasis`, `.bg-info-subtle`. Presente solo se overridden. */
    subtleInfo?: SemanticSubtleTokens;

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
    /** Bordo navbar/dropdown light: mix 15% text su bg. CSS: `--colorNavBorderLt` */
    colorNavBorderLt: string;
    /** Bordo navbar/dropdown dark: mix 15% text su bg. CSS: `--colorNavBorderDk` */
    colorNavBorderDk: string;

    /**
     * Tono suggerito dal brand: `'light'` se il brand è sufficientemente chiaro da richiedere testo scuro,
     * `'dark'` altrimenti. Usato come valore iniziale di `themeTone` in SSR (dove `prefers-color-scheme` non è disponibile).
     */
    naturalTone: 'light' | 'dark';
}

/**
 * Override opzionali per le catene di derivazione che possono avere una hue indipendente dal
 * brand: secondario, sfondo (superfici), testo e info. Ciascun campo, se presente, sostituisce
 * hue e chroma SOLO per la propria catena — le varianti light/dark/subtle/emphasis restano
 * comunque calcolate e garantite WCAG dalla stessa pipeline usata per `colorTema`. Un solo hex
 * per campo genera automaticamente sia la variante light sia quella dark, come già avviene per
 * `colorTema`. Assente: ciascun campo ha un proprio fallback — vedi il commento del singolo
 * campo (`text` NON ricade sul brand ma su `background`, `info` non ha alcun fallback).
 */
export interface PaletteOverrides {
    /** Hue/chroma indipendenti per `colorSecondary*`/`subtleSecondary`. Assente: muted del brand. */
    secondary?: string;
    /** Hue/chroma indipendenti per `colorBase*`/`colorSurface*`/`colorMutedBg*`/`colorSubtleBg*`. */
    background?: string;
    /**
     * Hue/chroma indipendenti per `colorSurfaceText*`/`colorHeading*`/`colorMutedText*`. Assente:
     * il testo NON ricade sul brand ma segue `background` (che a sua volta è il brand se nemmeno
     * quello è overridden) — testo e sfondo restano sempre intonati di default, evitando due tinte
     * scollegate che nessuno ha scelto di proposito.
     */
    text?: string;
    /**
     * Hue/chroma per un `colorInfo*`/`subtleInfo` calcolato ad hoc — a differenza degli altri tre
     * campi, `info` non ha un fallback derivato dal brand: assente, `computePalette` non produce
     * alcun token `colorInfo*` e Bootstrap 5.3 continua a gestire `--bs-info*` per intero coi suoi
     * blocchi `[data-bs-theme]` nativi. Presente: stessa pipeline WCAG di `secondary`
     * (findCompliantColor + subtle/emphasis), iniettata SOLO sulle variabili `--bs-info*` interessate.
     */
    info?: string;
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
 *   computePalette, hexToOklch, oklchToHex,
 *   computeThemeTone, computeColorPrimary, prefersDarkText,
 *   getReadableTextColor, mixHexColors, calcContrastRatio, ecc.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {

    // Signal scrivibile per il colore brand — valore iniziale da ContestoSito.config
    // (site.colorTema in global-settings.json), modificabile runtime.
    // _palette è un computed signal: si ricalcola automaticamente (con cache) ad ogni cambio.
    private readonly _colorTema: WritableSignal<string>;
    private readonly _palette: Signal<PaletteTokens>;

    // Override di secondario/sfondo/testo — statici per la durata della sessione (config di
    // progetto, non runtime come colorTema): letti una volta in costruzione da ContestoSito.config.
    private readonly _overrides: PaletteOverrides;

    private readonly document = inject(DOCUMENT);
    private readonly platformId = inject(PLATFORM_ID);

    // ── Plain readonly from palette ───────────────────────────────────────

    /** Colore brand corrente. Aggiornabile runtime via `setColorTema()`. CSS: `--colorTema` */
    readonly colorTema: Signal<string>;
    /** Signal `true` se il brand corrente richiede testo scuro sopra di esso. */
    readonly isDarkTextPreferred: Signal<boolean>;
    /** Signal `#000000` o `#ffffff` — testo a contrasto massimo su `--colorTema`. CSS: `--colorTemaText` */
    readonly colorTemaText: Signal<'#000000' | '#ffffff'>;
    /**
     * Signal della variante scurita del brand con contrasto WCAG 4.5:1 sullo sfondo pagina chiaro reale.
     * Usare per bottoni, CTA e link. CSS: `--colorPrimary`
     */
    readonly colorPrimary: Signal<string>;
    /** Signal `#000000` o `#ffffff` — testo leggibile su `--colorPrimary`. CSS: `--colorPrimaryText` */
    readonly colorPrimaryText: Signal<'#000000' | '#ffffff'>;
    /**
     * Signal della tripla RGB di `--colorPrimary` (es. `"31, 64, 255"`), per le utility `rgba()` di Bootstrap.
     * CSS: `--colorPrimaryRgb`
     */
    readonly colorPrimaryRgb: Signal<string>;
    /**
     * `true` se `shell.panelForcedLight` è `true` in site.ts.
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
        // 1. Signal del colore brand + palette computed con cache automatica.
        //    Valore iniziale da ContestoSito.config (global-settings.json); modificabile runtime via setColorTema().
        this._colorTema = signal(ContestoSito.config.colorTema);
        this._overrides = {
            secondary: ContestoSito.config.colorSecondary,
            background: ContestoSito.config.colorBackground,
            text: ContestoSito.config.colorText,
            info: ContestoSito.config.colorInfo,
        };
        this._palette = computed(() => ThemeService._getCachedPalette(this._colorTema(), this._overrides));

        // 2. Signal pubblici derivati dalla palette — si aggiornano automaticamente
        //    quando cambia _colorTema, senza calcoli aggiuntivi.
        this.colorTema          = this._colorTema.asReadonly();
        this.colorTemaText      = computed(() => this._palette().colorTemaText);
        this.isDarkTextPreferred = computed(() => ThemeService.prefersDarkText(this._palette().colorTema));
        this.colorPrimary       = computed(() => this._palette().colorPrimary);
        this.colorPrimaryText   = computed(() => this._palette().colorPrimaryText);
        this.colorPrimaryRgb    = computed(() => this._palette().colorPrimaryRgb);
        this.panelForcedLight   = ContestoSito.config.panelForcedLight;
        this.panelBootstrapTheme = this.panelForcedLight ? 'light' : null;

        // 3. themeTone inizializzato con naturalTone (SSR-safe, senza leggere prefers-color-scheme).
        this._themeTone = signal(this._palette().naturalTone);
        this.themeTone = this._themeTone.asReadonly();
        this._prefersReducedMotion = signal(false);
        this.prefersReducedMotion = this._prefersReducedMotion.asReadonly();

        // 4. Applica le CSS vars dopo il primo render. Il <style id="theme-init"> nel DOM
        //    copre già la fase pre-idratazione; questo è il "confirm" post-hydration.
        afterNextRender(() => {
            this._applyPalette(this._palette(), this._themeTone());
            this._ensureCustomFontFace();
        });

        if (!isPlatformBrowser(this.platformId)) return;

        // 5. Aggiorna con le preferenze OS reali (client-only).
        const osTone: 'light' | 'dark' =
            window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        this._themeTone.set(osTone);

        this._prefersReducedMotion.set(
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        );

        // 6. Ascolta i cambiamenti OS in tempo reale.
        window.matchMedia('(prefers-color-scheme: dark)')
            .addEventListener('change', e => {
                const t: 'light' | 'dark' = e.matches ? 'dark' : 'light';
                this._themeTone.set(t);
                this._applyPalette(this._palette(), t);
            });

        window.matchMedia('(prefers-reduced-motion: reduce)')
            .addEventListener('change', e => this._prefersReducedMotion.set(e.matches));
    }

    /**
     * Cambia il colore brand a runtime: ricalcola la palette (con cache) e reinietta
     * tutte le CSS vars su `<html>`. I signal `colorTema`, `colorPrimary` ecc. si
     * aggiornano automaticamente. La build-time bake in index.html rimane invariata —
     * questo metodo sovrascrive con le inline styles di priorità più alta.
     */
    setColorTema(color: string): void {
        this._colorTema.set(color);
        if (isPlatformBrowser(this.platformId)) {
            this._applyPalette(this._palette(), this._themeTone());
        }
    }

    // ── DOM injection ─────────────────────────────────────────────────────

    /**
     * Inietta tutte le CSS custom properties del tema su `<html>` via `style.setProperty`.
     * Chiamata da `afterNextRender` al boot e dal listener `prefers-color-scheme` a ogni cambio OS.
     * Aggiorna anche `data-bs-theme` e `data-theme-tone` per il sistema di varianti Bootstrap.
     */
    private _applyPalette(p: PaletteTokens, tone: 'light' | 'dark'): void {
        const el = this.document.documentElement;
        const lt = tone === 'light';

        el.setAttribute('data-bs-theme', tone);
        el.setAttribute('data-theme-tone', tone);

        const link = lt ? p.colorLinkLt : p.colorLinkDk;
        // Fissi Lt/Dk (non tone-adaptive sull'OS): servono al ponte CSS dei subtheme [data-bs-theme]
        // nidificati, stesso motivo di --colorLinkLt/Dk sotto — vedi commento su "Varianti Lt/Dk separate".
        const linkHoverLt = ThemeService.mixHexColors(p.colorLinkLt, '#000000', 0.15);
        const linkHoverDk = ThemeService.mixHexColors(p.colorLinkDk, '#ffffff', 0.15);
        const fontFamily = resolvedFonts.webStack;
        const vars: [string, string][] = [
            // Font
            ['--fontFamily', fontFamily],
            ['--bs-body-font-family', fontFamily],
            // Brand
            ['--colorTema', p.colorTema],
            ['--colorTemaText', p.colorTemaText],
            // Primary FILL tone-adaptive (--bs-primary, .btn-primary/.bg-primary): colorPrimary in
            // light, colorPrimaryFillDk in dark (schiarito per boundary ≥3.2:1 sul fondo scuro).
            // Il testo del fill segue: colorPrimaryText (light) / colorPrimaryTextDk (dark).
            ['--colorPrimary', lt ? p.colorPrimary : p.colorPrimaryFillDk],
            ['--colorPrimaryRgb', lt ? p.colorPrimaryRgb : p.colorPrimaryFillDkRgb],
            ['--colorPrimaryText', lt ? p.colorPrimaryText : p.colorPrimaryTextDk],
            // Varianti fisse Lt/Dk del FILL per il ponte CSS dei subtheme [data-bs-theme] nidificati
            ['--colorPrimaryLt', p.colorPrimary],
            ['--colorPrimaryRgbLt', p.colorPrimaryRgb],
            ['--colorPrimaryTextLt', p.colorPrimaryText],
            ['--colorPrimaryDk', p.colorPrimaryFillDk],
            ['--colorPrimaryRgbDk', p.colorPrimaryFillDkRgb],
            ['--colorPrimaryTextDk', p.colorPrimaryTextDk],
            // Primary FOREGROUND tone-adaptive (testo/bordo .text-primary/.border-primary),
            // DISACCOPPIATO dal fill: colorPrimaryFgLt in light, colorPrimaryFgDk in dark — entrambi
            // tarati 4.8:1 sulla superficie più estrema. I FILL restano su --bs-primary. Pattern di --colorLink.
            ['--colorPrimaryFg', lt ? p.colorPrimaryFgLt : p.colorPrimaryFgDk],
            ['--colorPrimaryFgRgb', lt ? p.colorPrimaryFgLtRgb : p.colorPrimaryFgDkRgb],
            // Varianti fisse Lt/Dk del primary FOREGROUND per il ponte CSS dei subtheme [data-bs-theme]
            ['--colorPrimaryFgLt', p.colorPrimaryFgLt],
            ['--colorPrimaryFgRgbLt', p.colorPrimaryFgLtRgb],
            ['--colorPrimaryFgDk', p.colorPrimaryFgDk],
            ['--colorPrimaryFgRgbDk', p.colorPrimaryFgDkRgb],
            // Link + focus ring — tone-adaptive: contrasto leggibile del link sul pannello
            ['--colorLinkLt', p.colorLinkLt],
            ['--colorLinkDk', p.colorLinkDk],
            // Triple RGB fisse Lt/Dk di link e link-hover: senza queste, un subtheme [data-bs-theme]
            // nidificato (es. pannello forced-light dentro pagina dark, vedi app.component.html) fa
            // ricadere Bootstrap sul SUO --bs-link-color-rgb di stock (#0d6efd) — la mixin
            // theme-bridge in _lib.scss sovrascrive --bs-link-color (hex) ma non la variante -rgb,
            // che è quella che il CSS compilato di Bootstrap usa davvero per il colore del testo dei
            // link (`a { color: rgba(var(--bs-link-color-rgb), ...) }`) e per il suo hover
            // (`a:hover { --bs-link-color-rgb: var(--bs-link-hover-color-rgb) }`). Risultato pratico:
            // link su un pannello a tema forzato restavano blu Bootstrap invece del brand, a volte
            // sotto soglia WCAG AA (bug trovato da a11y-test.sh dopo l'aggiunta del runner axe-core).
            ['--colorLinkRgbLt', ThemeService.hexToRgbTriplet(p.colorLinkLt)],
            ['--colorLinkRgbDk', ThemeService.hexToRgbTriplet(p.colorLinkDk)],
            ['--colorLinkHoverRgbLt', ThemeService.hexToRgbTriplet(linkHoverLt)],
            ['--colorLinkHoverRgbDk', ThemeService.hexToRgbTriplet(linkHoverDk)],
            ['--colorLink', link],
            ['--focusRingColor', link],
            ['--bs-link-color', link],
            ['--bs-link-hover-color', lt ? linkHoverLt : linkHoverDk],
            // Surfaces (tone-adaptive)
            ['--colorBase', lt ? p.colorBaseLt : p.colorBaseDk],
            ['--colorSurface', lt ? p.colorSurfaceLt : p.colorSurfaceDk],
            ['--colorSurfaceHover', lt ? p.colorSurfaceHoverLt : p.colorSurfaceHoverDk],
            ['--colorSurfaceBorder', lt ? p.colorSurfaceBorderLt : p.colorSurfaceBorderDk],
            ['--colorSurfaceText', lt ? p.colorSurfaceTextLt : p.colorSurfaceTextDk],
            // Semantic (tone-adaptive, derivati da brand)
            ['--colorSecondary', lt ? p.colorSecondaryLt : p.colorSecondaryDk],
            ['--colorSecondaryRgb', ThemeService.hexToRgbTriplet(lt ? p.colorSecondaryLt : p.colorSecondaryDk)],
            ['--colorSecondaryText', lt ? p.colorSecondaryTextLt : p.colorSecondaryTextDk],
            // Bootstrap overrides
            ['--bs-primary', lt ? p.colorPrimary : p.colorPrimaryFillDk],
            ['--bs-primary-rgb', lt ? p.colorPrimaryRgb : p.colorPrimaryFillDkRgb],
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
            // Bridge vars — esposti come --color* su :root così base.scss può propagarli
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
            // a [data-bs-theme="light/dark"] in base.scss di usare il valore corretto
            // indipendentemente dal tone globale. Stesso pattern già usato per --colorLinkLt/Dk.
            ['--colorSecondaryLt', p.colorSecondaryLt],
            ['--colorSecondaryDk', p.colorSecondaryDk],
            ['--colorSecondaryRgbLt', ThemeService.hexToRgbTriplet(p.colorSecondaryLt)],
            ['--colorSecondaryRgbDk', ThemeService.hexToRgbTriplet(p.colorSecondaryDk)],
            ['--colorSecondaryTextLt', p.colorSecondaryTextLt],
            ['--colorSecondaryTextDk', p.colorSecondaryTextDk],
            // Idem per il subtle/emphasis system (.bg-*-subtle, .text-*-emphasis): senza queste
            // fisse, un subtheme [data-bs-theme] nidificato in tono diverso dal globale (es. pannello
            // forced-light dentro pagina dark) resterebbe con badge/alert colorati sul tono SBAGLIATO,
            // perché --colorPrimaryBgSubtle/--colorSecondaryBgSubtle sopra sono tone-adaptive sull'OS.
            ['--colorPrimaryBgSubtleLt', p.subtlePrimary.bgSubtleLt],
            ['--colorPrimaryBgSubtleDk', p.subtlePrimary.bgSubtleDk],
            ['--colorPrimaryBorderSubtleLt', p.subtlePrimary.borderSubtleLt],
            ['--colorPrimaryBorderSubtleDk', p.subtlePrimary.borderSubtleDk],
            ['--colorPrimaryTextEmphasisLt', p.subtlePrimary.textEmphasisLt],
            ['--colorPrimaryTextEmphasisDk', p.subtlePrimary.textEmphasisDk],
            ['--colorSecondaryBgSubtleLt', p.subtleSecondary.bgSubtleLt],
            ['--colorSecondaryBgSubtleDk', p.subtleSecondary.bgSubtleDk],
            ['--colorSecondaryBorderSubtleLt', p.subtleSecondary.borderSubtleLt],
            ['--colorSecondaryBorderSubtleDk', p.subtleSecondary.borderSubtleDk],
            ['--colorSecondaryTextEmphasisLt', p.subtleSecondary.textEmphasisLt],
            ['--colorSecondaryTextEmphasisDk', p.subtleSecondary.textEmphasisDk],
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
            ['--colorNavBorder', lt ? p.colorNavBorderLt : p.colorNavBorderDk],
            ['--colorNavBorderLt', p.colorNavBorderLt],
            ['--colorNavBorderDk', p.colorNavBorderDk],
        ];

        // Info — SOLO se PaletteOverrides.info era presente in computePalette (vedi PaletteTokens).
        // Assente: questi campi sono undefined, niente viene toccato, --bs-info* resta gestito da
        // Bootstrap. Presente: stesso schema --bs-primary*/--bs-secondary* sopra.
        if (p.colorInfoLt !== undefined && p.colorInfoDk !== undefined && p.subtleInfo) {
            const colorInfo = lt ? p.colorInfoLt : p.colorInfoDk;
            const colorInfoText = lt ? p.colorInfoTextLt! : p.colorInfoTextDk!;
            vars.push(
                ['--bs-info', colorInfo],
                ['--bs-info-rgb', ThemeService.hexToRgbTriplet(colorInfo)],
                ['--colorInfoText', colorInfoText],
                ['--bs-info-bg-subtle', lt ? p.subtleInfo.bgSubtleLt : p.subtleInfo.bgSubtleDk],
                ['--bs-info-border-subtle', lt ? p.subtleInfo.borderSubtleLt : p.subtleInfo.borderSubtleDk],
                ['--bs-info-text-emphasis', lt ? p.subtleInfo.textEmphasisLt : p.subtleInfo.textEmphasisDk],
            );
        }

        for (const [prop, val] of vars) {
            el.style.setProperty(prop, val);
        }
        el.style.colorScheme = tone;
    }

    /** Inietta `@font-face` una sola volta. Se `theme-init` è già nel DOM l'SSR l'ha già fatto —
     *  altrimenti (client-only, `ng serve`) crea un tag dedicato, perché le CSS custom properties
     *  di `_applyPalette` non possono dichiarare un at-rule. */
    private _ensureCustomFontFace(): void {
        if (!resolvedFonts.custom) return;
        if (this.document.getElementById('theme-init')) return;
        if (this.document.getElementById('custom-font-face')) return;
        const style = this.document.createElement('style');
        style.setAttribute('id', 'custom-font-face');
        style.textContent = ThemeService._buildFontFaceRule();
        this.document.head.appendChild(style);
    }

    /** Regola `@font-face` per `resolvedFonts.custom` — dato puro, identico client e server. */
    private static _buildFontFaceRule(): string {
        const { family, file } = resolvedFonts.custom!;
        const url = `/assets/fonts/${encodeURIComponent(file)}`;
        return `@font-face{font-family:"${family}";src:url("${url}");font-display:swap;}`;
    }

    // ── Theme HTML injection ──────────────────────────────────────────────

    // Cache di computePalette con chiave colorTema: evita di ricalcolare la costosa pipeline
    // OKLCH se buildThemeHeadTags/buildThemeStyleTag viene chiamato più volte con lo stesso brand
    // (comune in SSR dove molte route chiamano buildThemeHeadTags nella stessa sessione Node).
    private static readonly _paletteCache = new Map<string, PaletteTokens>();

    // Chiave di cache: colorTema + override serializzati (assenti = stringa vuota, invariata
    // quando PaletteOverrides non è passato).
    private static _paletteCacheKey(colorTema: string, overrides?: PaletteOverrides): string {
        return `${colorTema}|${overrides?.secondary ?? ''}|${overrides?.background ?? ''}|${overrides?.text ?? ''}|${overrides?.info ?? ''}`;
    }

    // Legge dalla cache o calcola e memorizza la palette per questo brand color + override.
    private static _getCachedPalette(colorTema: string, overrides?: PaletteOverrides): PaletteTokens {
        const key = ThemeService._paletteCacheKey(colorTema, overrides);
        let p = ThemeService._paletteCache.get(key);
        if (!p) {
            p = ThemeService.computePalette(colorTema, overrides);
            ThemeService._paletteCache.set(key, p);
        }
        return p;
    }

    /** Produce tutti i tag `<head>` del tema: `<meta name="theme-color">` + `<style id="theme-init">`. */
    static buildThemeHeadTags(colorTema: string, overrides?: PaletteOverrides): string {
        const p = ThemeService._getCachedPalette(colorTema, overrides);
        return ThemeService._buildThemeColorMetaFromPalette(p) + '\n' + ThemeService._buildThemeStyleTagFromPalette(p);
    }

    /** Produce solo `<style id="theme-init">` senza il meta theme-color. Utile per render parziale o testing. */
    static buildThemeStyleTag(colorTema: string, overrides?: PaletteOverrides): string {
        return ThemeService._buildThemeStyleTagFromPalette(ThemeService._getCachedPalette(colorTema, overrides));
    }

    /**
     * Produce il blocco `<style id="theme-init">` da iniettare nell'HTML SSR prima di `</head>`.
     * Posizionato dopo il `<link>` di Bootstrap → stessa specificità (0,1,0), posizione successiva
     * → nostro `:root` vince la cascade senza bisogno di inline styles.
     * I `@media` blocks delegano al browser la scelta del tone in base all'OS.
     * Se `resolvedFonts.custom` è impostato, aggiunge `@font-face` nello STESSO tag — così
     * `_ensureCustomFontFace` (client) lo trova già pronto ed evita un duplicato.
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
                `--colorSecondaryRgb:${ThemeService.hexToRgbTriplet(s ? p.colorSecondaryLt : p.colorSecondaryDk)};` +
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
                // Primary FOREGROUND tone-adaptive (disaccoppiato dal fill) — .text-primary/.border-primary
                // ≥4.8:1 sulla superficie estrema in entrambi i toni
                `--colorPrimaryFg:${s ? p.colorPrimaryFgLt : p.colorPrimaryFgDk};` +
                `--colorPrimaryFgRgb:${s ? p.colorPrimaryFgLtRgb : p.colorPrimaryFgDkRgb};` +
                // Primary FILL tone-adaptive — colorPrimary in light, colorPrimaryFillDk in dark
                // (schiarito per boundary ≥3.2:1). --bs-primary segue; il testo del fill anche.
                `--colorPrimary:${s ? p.colorPrimary : p.colorPrimaryFillDk};` +
                `--colorPrimaryRgb:${s ? p.colorPrimaryRgb : p.colorPrimaryFillDkRgb};` +
                `--colorPrimaryText:${s ? p.colorPrimaryText : p.colorPrimaryTextDk};` +
                `--bs-primary:${s ? p.colorPrimary : p.colorPrimaryFillDk};` +
                `--bs-primary-rgb:${s ? p.colorPrimaryRgb : p.colorPrimaryFillDkRgb};` +
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
                `--colorNavText:${s ? p.colorNavTextLt : p.colorNavTextDk};` +
                `--colorNavBorder:${s ? p.colorNavBorderLt : p.colorNavBorderDk};` +
                // Info — SOLO se PaletteOverrides.info era presente (vedi PaletteTokens/_applyPalette).
                // Assente: stringa vuota, --bs-info* resta gestito per intero da Bootstrap.
                (p.colorInfoLt !== undefined && p.colorInfoDk !== undefined && p.subtleInfo
                    ? `--bs-info:${s ? p.colorInfoLt : p.colorInfoDk};` +
                      `--bs-info-rgb:${ThemeService.hexToRgbTriplet(s ? p.colorInfoLt : p.colorInfoDk)};` +
                      `--colorInfoText:${s ? p.colorInfoTextLt : p.colorInfoTextDk};` +
                      `--bs-info-bg-subtle:${s ? p.subtleInfo.bgSubtleLt : p.subtleInfo.bgSubtleDk};` +
                      `--bs-info-border-subtle:${s ? p.subtleInfo.borderSubtleLt : p.subtleInfo.borderSubtleDk};` +
                      `--bs-info-text-emphasis:${s ? p.subtleInfo.textEmphasisLt : p.subtleInfo.textEmphasisDk};`
                    : '')
            );
        };

        const fontFamily = resolvedFonts.webStack;
        const base =
            `--fontFamily:${fontFamily};` +
            `--bs-body-font-family:${fontFamily};` +
            `--colorTema:${p.colorTema};` +
            `--colorTemaText:${p.colorTemaText};` +
            // (--colorPrimary/--colorPrimaryText/--bs-primary sono tone-adaptive in surfaces())
            // Varianti fisse Lt/Dk del primary FILL — per il ponte CSS subtheme in base.scss
            `--colorPrimaryLt:${p.colorPrimary};` +
            `--colorPrimaryRgbLt:${p.colorPrimaryRgb};` +
            `--colorPrimaryTextLt:${p.colorPrimaryText};` +
            `--colorPrimaryDk:${p.colorPrimaryFillDk};` +
            `--colorPrimaryRgbDk:${p.colorPrimaryFillDkRgb};` +
            `--colorPrimaryTextDk:${p.colorPrimaryTextDk};` +
            // Varianti fisse Lt/Dk del primary FOREGROUND — per il ponte CSS subtheme in base.scss
            `--colorPrimaryFgLt:${p.colorPrimaryFgLt};` +
            `--colorPrimaryFgRgbLt:${p.colorPrimaryFgLtRgb};` +
            `--colorPrimaryFgDk:${p.colorPrimaryFgDk};` +
            `--colorPrimaryFgRgbDk:${p.colorPrimaryFgDkRgb};` +
            // Varianti Lt/Dk fisse — per il ponte CSS subtheme in base.scss
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
            `--colorSecondaryLt:${p.colorSecondaryLt};` +
            `--colorSecondaryDk:${p.colorSecondaryDk};` +
            `--colorSecondaryRgbLt:${ThemeService.hexToRgbTriplet(p.colorSecondaryLt)};` +
            `--colorSecondaryRgbDk:${ThemeService.hexToRgbTriplet(p.colorSecondaryDk)};` +
            `--colorSecondaryTextLt:${p.colorSecondaryTextLt};` +
            `--colorSecondaryTextDk:${p.colorSecondaryTextDk};` +
            // Varianti fisse Lt/Dk del subtle/emphasis system — stesso motivo di colorSecondaryLt/Dk sopra.
            `--colorPrimaryBgSubtleLt:${p.subtlePrimary.bgSubtleLt};` +
            `--colorPrimaryBgSubtleDk:${p.subtlePrimary.bgSubtleDk};` +
            `--colorPrimaryBorderSubtleLt:${p.subtlePrimary.borderSubtleLt};` +
            `--colorPrimaryBorderSubtleDk:${p.subtlePrimary.borderSubtleDk};` +
            `--colorPrimaryTextEmphasisLt:${p.subtlePrimary.textEmphasisLt};` +
            `--colorPrimaryTextEmphasisDk:${p.subtlePrimary.textEmphasisDk};` +
            `--colorSecondaryBgSubtleLt:${p.subtleSecondary.bgSubtleLt};` +
            `--colorSecondaryBgSubtleDk:${p.subtleSecondary.bgSubtleDk};` +
            `--colorSecondaryBorderSubtleLt:${p.subtleSecondary.borderSubtleLt};` +
            `--colorSecondaryBorderSubtleDk:${p.subtleSecondary.borderSubtleDk};` +
            `--colorSecondaryTextEmphasisLt:${p.subtleSecondary.textEmphasisLt};` +
            `--colorSecondaryTextEmphasisDk:${p.subtleSecondary.textEmphasisDk};` +
            `--colorNavBgLt:${p.colorNavBgLt};` +
            `--colorNavBgDk:${p.colorNavBgDk};` +
            `--colorNavTextLt:${p.colorNavTextLt};` +
            `--colorNavTextDk:${p.colorNavTextDk};` +
            `--colorNavBorderLt:${p.colorNavBorderLt};` +
            `--colorNavBorderDk:${p.colorNavBorderDk};`;

        return (
            `<style id="theme-init">` +
            (resolvedFonts.custom ? ThemeService._buildFontFaceRule() : '') +
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
    static buildThemeColorMeta(colorTema: string, overrides?: PaletteOverrides): string {
        return ThemeService._buildThemeColorMetaFromPalette(ThemeService.computePalette(colorTema, overrides));
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
     * Target di contrasto per i foreground testuali derivati (link, secondary, muted, primary-fg):
     * 4.8:1, un margine sopra il minimo WCAG AA (4.5:1) per una lettura più confortevole e robusta
     * agli arrotondamenti dell'audit. Fonte unica usata da `computePalette` e `computeColorPrimaryFgDk`.
     */
    private static readonly TARGET_TEXT_CONTRAST = 4.8;

    /**
     * Target di contrasto NON-testo per il boundary del fill primary (`--bs-primary`) contro lo sfondo
     * pagina: 3.2:1, un margine sopra il minimo WCAG 1.4.11 (3:1). Usato in dark mode da
     * `computeColorPrimaryFillDk` per garantire che `.btn-primary`/`.bg-primary` resti distinguibile
     * dal fondo scuro anche con brand quasi-neri (che da soli sarebbero invisibili, ~1:1).
     */
    private static readonly TARGET_FILL_BOUNDARY = 3.2;

    /**
     * Calcola l'intera `PaletteTokens` dal solo colore brand.
     * Ogni token è derivato matematicamente in OKLCH: nessun valore hardcoded
     * ad eccezione delle costanti di luminosità (L) che definiscono la struttura Bootstrap.
     */
    static computePalette(colorTema: string, overrides?: PaletteOverrides): PaletteTokens {
        const [, C_t, H_t] = ThemeService.hexToOklch(colorTema);
        const colorTemaText = ThemeService.getReadableTextColor(colorTema);
        const naturalTone = ThemeService.computeThemeTone(colorTema);

        // Hue/chroma di sfondo: dall'override se presente, altrimenti dal brand — un solo hex
        // alimenta comunque entrambi i toni, come C_t/H_t per colorTema.
        const chFor = (hex?: string): [number, number] => {
            if (!hex) return [C_t, H_t];
            const [, c, h] = ThemeService.hexToOklch(hex);
            return [c, h];
        };
        const [C_bg, H_bg] = chFor(overrides?.background);
        // Testo: se overrides.text è presente resta un override pieno e indipendente (stessa
        // pipeline di sempre, contrasto garantito allo stesso modo). Se ASSENTE, il default non è
        // più il brand ma lo sfondo (C_bg/H_bg) — che a sua volta è già il brand se nemmeno
        // colorBackground è stato impostato. Testo e sfondo restano quindi sempre intonati tra loro
        // di default, invece di poter divergere in due tinte scollegate senza che nessuno lo scelga
        // esplicitamente: elimina un asse di stonatura estetica che il solo controllo WCAG (basato
        // su luminanza, non su armonia) non può intercettare.
        const [C_txt, H_txt] = overrides?.text ? chFor(overrides.text) : [C_bg, H_bg];

        // I tetti di chroma delle superfici (vedi computeBaseLt/computeMutedBgLt/ecc., tutti
        // Math.min(C*fattore, tetto)) sono tarati per il caso "brand derivato automaticamente":
        // una sfumatura appena percettibile, perché prima era l'unico input possibile — e quel tetto
        // è quasi sempre il valore VINCENTE del min(), a prescindere da quanto è saturo il colore in
        // ingresso (un input molto saturo supera il tetto comunque). Con un override esplicito il
        // risultato resterebbe quindi IDENTICO indipendentemente dalla tinta scelta: un giallo pieno
        // finirebbe comunque appena percettibile. bgBoost/txtBoost moltiplicano il risultato GIÀ
        // clampato (non l'input prima del tetto: min(a,b)*k = min(a*k,b*k), quindi alzare l'input da
        // solo non basta se il tetto resta più piccolo) SOLO quando la tinta arriva da un override —
        // il caso derivato dal brand resta bit-a-bit invariato. 16 è tarato empiricamente: rende la
        // tinta riconoscibile (#fffacd → base ≈ #f8f6e1, chiaramente calda) restando una superficie
        // chiara/scura, non un blocco di colore pieno — verificato anche con input a saturazione
        // piena (#ff0000, #00ff00) senza mai scendere sotto WCAG AA. Il contrasto resta garantito a
        // prescindere dal boost: findCompliantColor calcola sempre il testo dinamicamente contro la
        // superficie reale risultante, qualunque essa sia.
        const OVERRIDE_CHROMA_BOOST = 16;
        const bgBoost = overrides?.background ? OVERRIDE_CHROMA_BOOST : 1;
        const txtBoost = overrides?.text ? OVERRIDE_CHROMA_BOOST : 1;

        // Sfondo base precomputato — serve come riferimento per i check di contrasto
        // dei colori semantici (findCompliantColor li usa per garantire WCAG 4.5:1).
        // Segue l'override background se presente.
        const baseLtHex = ThemeService.computeBaseLt(C_bg, H_bg, bgBoost);
        const baseDkHex = ThemeService.computeBaseDk(C_bg, H_bg, bgBoost);

        // Superfici precomputate qui (dipendono solo da C_bg/H_bg) perché sono i riferimenti
        // di contrasto per i foreground derivati (link/secondary/muted/primary-fg).
        //
        // tertiary-bg (--bs-tertiary-bg): table-striped alternato, placeholder.
        const colorSubtleBgLt = ThemeService.oklchToHex(0.967, Math.min(C_bg * 0.05, 0.007) * bgBoost, H_bg);
        const colorSubtleBgDk = ThemeService.oklchToHex(0.248, Math.min(C_bg * 0.20, 0.025) * bgBoost, H_bg);
        // secondary-bg (--bs-secondary-bg): disabled inputs, table-striped. È la superficie
        // più ESTREMA su cui i foreground possono comparire, in ENTRAMBI i toni:
        //   light L=0.942 → più SCURA di tertiary(0.967)/base(0.970)/surface(0.985)/hover(0.950);
        //   dark  L=0.295 → più CHIARA di tertiary(0.248)/surface(0.180)/base(0.140)/hover(0.220).
        // Tarare i foreground contro questa (anziché la tertiary) garantisce il target a fortiori
        // su TUTTE le altre superfici (base, card, hover, tertiary) — verificato via stress test.
        const colorMutedBgLt = ThemeService.computeMutedBgLt(C_bg, H_bg, bgBoost);
        const colorMutedBgDk = ThemeService.computeMutedBgDk(C_bg, H_bg, bgBoost);

        // Primary: fill/foreground tarati esplicitamente sulle superfici REALI appena calcolate
        // (già bg-aware) invece di ri-derivarle internamente dal solo brand — altrimenti, con un
        // background overridden, il contrasto verrebbe garantito contro una superficie diversa
        // da quella che l'utente vede davvero.
        const colorPrimary = ThemeService.computeColorPrimary(colorTema, baseLtHex);
        const colorPrimaryRgb = ThemeService.hexToRgbTriplet(colorPrimary);
        const colorPrimaryFgDk = ThemeService.computeColorPrimaryFgDk(colorTema, colorMutedBgDk);
        const colorPrimaryFgDkRgb = ThemeService.hexToRgbTriplet(colorPrimaryFgDk);
        const colorPrimaryFgLt = ThemeService.computeColorPrimaryFgLt(colorTema, colorMutedBgLt);
        const colorPrimaryFgLtRgb = ThemeService.hexToRgbTriplet(colorPrimaryFgLt);
        const colorPrimaryFillDk = ThemeService.computeColorPrimaryFillDk(colorPrimary, baseDkHex);
        const colorPrimaryFillDkRgb = ThemeService.hexToRgbTriplet(colorPrimaryFillDk);
        const colorPrimaryText = ThemeService.getReadableTextColor(colorPrimary);
        const colorPrimaryTextDk = ThemeService.getReadableTextColor(colorPrimaryFillDk);

        // Target di contrasto per i foreground testuali: 4.8:1, sopra il minimo WCAG AA (4.5:1).
        // Il margine evita di "passare per il rotto della cuffia" (token al limite a 4.50) e dà una
        // lettura più confortevole; findCompliantColor ripiega comunque su nero/bianco se serve,
        // quindi alzare il target non scende MAI sotto AA. Verificato: 0 perdita di tinta brand.
        const TARGET_TEXT = ThemeService.TARGET_TEXT_CONTRAST;

        // Link Lt/Dk: hue del BRAND (il link è un'affordance di brand, non di sfondo/testo), L
        // cercata finché ≥ TARGET_TEXT sulla superficie più
        // estrema (secondary-bg), così il link resta leggibile su ogni superficie/componente.
        // Chroma minima 0.08 per una tinta riconoscibile anche su brand grigi.
        const colorLinkLt = ThemeService.findCompliantColor(
            Math.max(C_t, 0.08), H_t, colorMutedBgLt, TARGET_TEXT, 0.55, -0.01
        );
        const colorLinkDk = ThemeService.findCompliantColor(
            Math.max(C_t, 0.08), H_t, colorMutedBgDk, TARGET_TEXT, 0.55, +0.01
        );

        // Secondary: hue/chroma indipendenti se overrides.secondary è presente, altrimenti C più
        // bassa del brand — è una variante muted, non un accento.
        let C_sec: number, H_sec: number;
        // L di partenza della ricerca: di default le due costanti fisse (pensate per il caso
        // "muted del brand"). Con un override esplicito si parte invece dalla
        // L del colore scelto — findCompliantColor cerca comunque il primo punto conforme più
        // vicino al punto di partenza, quindi ancorarsi alla L originale riduce lo scarto percepito
        // tra il colore scelto e il risultato finale (a parità di garanzia WCAG: il target non cambia,
        // cambia solo da dove si parte a cercarlo).
        let startLt = 0.72, startDk = 0.55;
        if (overrides?.secondary) {
            const [L_ov, c, h] = ThemeService.hexToOklch(overrides.secondary);
            C_sec = c; H_sec = h;
            startLt = L_ov; startDk = L_ov;
        } else {
            C_sec = Math.min(C_t * 0.75, 0.12);
            H_sec = H_t;
        }

        let secLt = ThemeService.findCompliantColor(C_sec, H_sec, colorMutedBgLt, TARGET_TEXT, startLt, -0.01);
        if (ThemeService.calcContrastRatio(secLt, '#ffffff') < TARGET_TEXT) {
            secLt = ThemeService.findCompliantColor(C_sec, H_sec, '#ffffff', TARGET_TEXT, startLt, -0.01);
        }
        let secDk = ThemeService.findCompliantColor(C_sec, H_sec, colorMutedBgDk, TARGET_TEXT, startDk, +0.01);
        if (ThemeService.calcContrastRatio(secDk, '#000000') < TARGET_TEXT) {
            secDk = ThemeService.findCompliantColor(C_sec, H_sec, '#000000', TARGET_TEXT, startDk, +0.01);
        }

        // ── Subtle/emphasis system ─────────────────────────────────────────
        const [, C_p, H_p] = ThemeService.hexToOklch(colorPrimary);
        const subtlePrimary = ThemeService.computeSemanticSubtle(C_p, H_p);
        const subtleSecondary = ThemeService.computeSemanticSubtle(C_sec, H_sec);

        // Info: SOLO se overrides.info è presente — stessa pipeline di secondary (findCompliantColor
        // con fallback bianco/nero, poi subtle/emphasis), ma senza fallback derivato dal brand: quando
        // assente questi token restano undefined e _applyPalette/_buildThemeStyleTagFromPalette non
        // toccano --bs-info*, che resta gestito per intero da Bootstrap.
        let colorInfoLt: string | undefined;
        let colorInfoDk: string | undefined;
        let colorInfoTextLt: '#000000' | '#ffffff' | undefined;
        let colorInfoTextDk: '#000000' | '#ffffff' | undefined;
        let subtleInfo: SemanticSubtleTokens | undefined;
        if (overrides?.info) {
            // L di partenza = quella scelta dall'utente (non una costante fissa): stesso
            // ragionamento di colorSecondary sopra, riduce lo scarto percepito a parità di garanzia WCAG.
            const [L_info, C_info, H_info] = ThemeService.hexToOklch(overrides.info);
            colorInfoLt = ThemeService.findCompliantColor(C_info, H_info, colorMutedBgLt, TARGET_TEXT, L_info, -0.01);
            if (ThemeService.calcContrastRatio(colorInfoLt, '#ffffff') < TARGET_TEXT) {
                colorInfoLt = ThemeService.findCompliantColor(C_info, H_info, '#ffffff', TARGET_TEXT, L_info, -0.01);
            }
            colorInfoDk = ThemeService.findCompliantColor(C_info, H_info, colorMutedBgDk, TARGET_TEXT, L_info, +0.01);
            if (ThemeService.calcContrastRatio(colorInfoDk, '#000000') < TARGET_TEXT) {
                colorInfoDk = ThemeService.findCompliantColor(C_info, H_info, '#000000', TARGET_TEXT, L_info, +0.01);
            }
            colorInfoTextLt = ThemeService.getReadableTextColor(colorInfoLt);
            colorInfoTextDk = ThemeService.getReadableTextColor(colorInfoDk);
            subtleInfo = ThemeService.computeSemanticSubtle(C_info, H_info);
        }


        // ── Structural Bootstrap vars ──────────────────────────────────────
        // emphasis: headings/strong — quasi nero/bianco con leggera tinta testo (segue l'override testo)
        const colorHeadingLt = ThemeService.oklchToHex(0.165, Math.min(C_txt * 0.14, 0.020) * txtBoost, H_txt);
        const colorHeadingDk = ThemeService.oklchToHex(0.958, Math.min(C_txt * 0.04, 0.006) * txtBoost, H_txt);
        // (colorMutedBgLt/Dk — secondary-bg — sono precomputati sopra: servono come
        //  riferimento di contrasto estremo per i foreground oltre che come token nel return.)
        // secondary-color: testo muted — hue dal testo (segue l'override), TARGET_TEXT (4.8:1,
        // sopra AA) garantito da findCompliantColor contro la superficie più ESTREMA (secondary-bg,
        // già bg-aware): il muted compare su card/pannelli, righe tabella alternate e input
        // disabilitati. Garantendolo lì, lo si ottiene su ogni altra superficie. È il token che
        // l'audit segnalava al limite (4.49:1).
        // NB: colorSurfaceDkHex resta definito qui, è ancora il token --colorSurfaceDk nel return —
        // segue l'override background, non testo.
        const colorSurfaceDkHex = ThemeService.oklchToHex(0.180, Math.min(C_bg * 0.12, 0.014) * bgBoost, H_bg);
        const colorMutedTextLt = ThemeService.findCompliantColor(Math.min(C_txt * 0.08, 0.012) * txtBoost, H_txt, colorMutedBgLt, TARGET_TEXT, 0.65, -0.01);
        const colorMutedTextDk = ThemeService.findCompliantColor(Math.min(C_txt * 0.08, 0.012) * txtBoost, H_txt, colorMutedBgDk, TARGET_TEXT, 0.45, +0.01);

        // Adaptive Navbar/Footer colors (NavBg / NavText) — restano legati al BRAND (C_t/H_t), non
        // a background/testo: la navbar è pensata come superficie immersiva di brand, non di contenuto.
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

        const colorNavBorderLt = ThemeService.mixHexColors(colorNavBgLt, colorNavTextLt, 0.15);
        const colorNavBorderDk = ThemeService.mixHexColors(colorNavBgDk, colorNavTextDk, 0.15);

        return {
            colorTema,
            colorTemaText,
            colorPrimary,
            colorPrimaryRgb,
            colorPrimaryFgDk,
            colorPrimaryFgDkRgb,
            colorPrimaryFgLt,
            colorPrimaryFgLtRgb,
            colorPrimaryFillDk,
            colorPrimaryFillDkRgb,
            colorPrimaryTextDk,
            colorPrimaryText,
            colorLinkLt,
            colorLinkDk,

            // Light surfaces — high L, low chroma, background hue (testo: text hue).
            // Border L=0.570: caso peggiore vs la superficie più SCURA (secondary-bg L=0.942)
            // → ≈ 3.75:1 (WCAG 1.4.11 ≥ 3:1); a fortiori su base/surface/hover/tertiary.
            colorBaseLt: baseLtHex,
            colorSurfaceLt: ThemeService.oklchToHex(0.985, Math.min(C_bg * 0.02, 0.003) * bgBoost, H_bg),
            colorSurfaceHoverLt: ThemeService.oklchToHex(0.950, Math.min(C_bg * 0.04, 0.006) * bgBoost, H_bg),
            colorSurfaceBorderLt: ThemeService.oklchToHex(0.570, 0, 0),
            colorSurfaceTextLt: ThemeService.oklchToHex(0.200, Math.min(C_txt * 0.20, 0.030) * txtBoost, H_txt),

            // Dark surfaces — low L, moderate chroma, background hue (testo: text hue).
            // Border L=0.600: un valore più basso (es. ~0.490) fa cadere il contrasto sotto 3:1 su
            // tutte le superfici tranne base (es. bordo input disabilitato su secondary-bg L=0.295
            // → 2.18:1). A L=0.600 il caso peggiore vs la superficie più CHIARA (secondary-bg) è
            // ≈ 3.47:1 — margine sopra il minimo WCAG 1.4.11 (3:1); a fortiori su base/surface/hover/tertiary.
            colorBaseDk: baseDkHex,
            colorSurfaceDk: colorSurfaceDkHex,
            colorSurfaceHoverDk: ThemeService.oklchToHex(0.220, Math.min(C_bg * 0.10, 0.012) * bgBoost, H_bg),
            colorSurfaceBorderDk: ThemeService.oklchToHex(0.600, 0, 0),
            colorSurfaceTextDk: ThemeService.oklchToHex(0.920, Math.min(C_txt * 0.06, 0.010) * txtBoost, H_txt),

            // Semantic light
            colorSecondaryLt: secLt, colorSecondaryTextLt: ThemeService.getReadableTextColor(secLt),

            // Semantic dark
            colorSecondaryDk: secDk, colorSecondaryTextDk: ThemeService.getReadableTextColor(secDk),

            subtlePrimary, subtleSecondary,
            colorInfoLt, colorInfoDk, colorInfoTextLt, colorInfoTextDk, subtleInfo,
            colorHeadingLt, colorHeadingDk,
            colorMutedBgLt, colorMutedBgDk,
            colorSubtleBgLt, colorSubtleBgDk,
            colorMutedTextLt, colorMutedTextDk,

            colorNavBgLt,
            colorNavTextLt,
            colorNavBgDk,
            colorNavTextDk,
            colorNavBorderLt,
            colorNavBorderDk,

            naturalTone,
        };
    }

    /**
     * Sfondo pagina chiaro reale: off-white con micro-tinta brand (L=0.970, chroma minima).
     * È il riferimento di contrasto per i token che vi compaiono come testo (`colorPrimary`,
     * `colorLink`, `mutedText`): più scuro del bianco puro, quindi il caso peggiore in light mode.
     * Fonte unica della formula — usato sia da `computePalette` (token `colorBaseLt`) sia da
     * `computeColorPrimary`, così il primary si tara sullo stesso fondo su cui poi vive.
     */
    private static computeBaseLt(C: number, H: number, boost = 1): string {
        return ThemeService.oklchToHex(0.970, Math.min(C * 0.03, 0.004) * boost, H);
    }

    /**
     * Sfondo pagina scuro reale: near-black con micro-tinta brand (L=0.140, chroma minima).
     * Gemello scuro di `computeBaseLt`: è il riferimento di contrasto per il boundary del FILL primary
     * in dark mode (`colorPrimaryFillDk`). Fonte unica della formula — usato sia da `computePalette`
     * (token `colorBaseDk`) sia da `computeColorPrimaryFillDk`, così il fill scuro si tara sullo stesso
     * fondo pagina su cui poi compare. (I foreground dark — `colorPrimaryFgDk`, `colorLinkDk` — si
     * tarano invece sulla superficie più estrema `mutedBgDk`, non sulla base.)
     */
    private static computeBaseDk(C: number, H: number, boost = 1): string {
        return ThemeService.oklchToHex(0.140, Math.min(C * 0.08, 0.010) * boost, H);
    }

    /**
     * Superficie più ESTREMA su cui un foreground può comparire (`--bs-secondary-bg`: table-striped,
     * input disabilitati). Light L=0.942 → più scura di tertiary/base/surface/hover; dark L=0.295 →
     * più chiara delle stesse. È il riferimento di contrasto worst-case per i token foreground:
     * garantendo il target qui lo si ottiene a fortiori su ogni altra superficie. Fonte unica della
     * formula — usata da `computePalette` (token `colorMutedBg`) e dai foreground `computeColorPrimaryFgLt`/`computeColorPrimaryFgDk`.
     */
    private static computeMutedBgLt(C: number, H: number, boost = 1): string {
        return ThemeService.oklchToHex(0.942, Math.min(C * 0.08, 0.011) * boost, H);
    }
    private static computeMutedBgDk(C: number, H: number, boost = 1): string {
        return ThemeService.oklchToHex(0.295, Math.min(C * 0.18, 0.022) * boost, H);
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
        // Nessuna L a chroma fisso raggiunge il target (tipico con hue molto sature,
        // clampate al gamut sRGB): si ripiega sul massimo contrasto possibile su bgHex
        // (nero o bianco puro), sacrificando la tinta brand ma MAI la conformità WCAG.
        const fallback = ThemeService.getReadableTextColor(bgHex);
        if (isDevMode()) {
            console.warn(
                `[ThemeService] findCompliantColor non converge a ${targetRatio}:1 ` +
                `(C=${C.toFixed(3)}, H=${H.toFixed(1)}, bg=${bgHex}) → ripiego su ${fallback}.`
            );
        }
        return fallback;
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

    // ── Metodi statici (SSR-safe) ───────────────────────────────────────────
    // API pubblica di calcolo colore, usata sia internamente (computePalette e la generazione
    // SSR dei tag <head>) sia direttamente dai consumer (vedi frontend/README.md "Metodi Statici
    // (SSR-Safe)"): pure, senza stato, chiamabili sia lato server che client.

    /**
     * Variante del brand con contrasto WCAG 4.5:1 (AA, testo normale) sullo sfondo pagina chiaro
     * reale `baseLt`, per bottoni/CTA/link e testo `.text-primary`. Scurisce in OKLCH a hue e
     * chroma invariati — abbassa solo la luminanza L, partendo da quella del brand, il minimo
     * indispensabile per raggiungere 4.5:1. A differenza del mix con nero in RGB, NON desatura:
     * un brand chiaro (es. `#bfffff`) resta una tinta viva invece di virare al grigio spento, e
     * un brand già conforme viene restituito pressoché intatto invece di essere sovra-scurito.
     *
     * Il riferimento è `baseLt` (off-white con micro-tinta brand, L=0.970), NON il bianco puro:
     * il primary compare anche come testo su quel fondo, che essendo più scuro del bianco
     * abbassa il contrasto reale (~0.4 in meno) — tararlo sul bianco lascerebbe il testo più
     * piccolo sotto la soglia AA sulla pagina vera. Stesso ragionamento già applicato a
     * `colorLink`. Il contrasto WCAG dipende dalla luminanza, non dalla chroma: preservare la
     * saturazione non costa accessibilità.
     * Fallback `#1a1a1a` se nessuna L conforme (hue al limite del gamut sRGB).
     *
     * `baseLtHex`, se passato, sostituisce il calcolo interno di `baseLt` — usato da
     * `computePalette` per tarare il primary sulla superficie REALE quando `PaletteOverrides.background`
     * è presente, invece che su una derivata dal solo brand.
     */
    static computeColorPrimary(colorTema: string, baseLtHex?: string): string {
        const [L0, C, H] = ThemeService.hexToOklch(colorTema);
        const bg = baseLtHex ?? ThemeService.computeBaseLt(C, H);
        for (let L = L0; L >= 0.05; L -= 0.01) {
            const candidate = ThemeService.oklchToHex(L, C, H);
            if (ThemeService.calcContrastRatio(candidate, bg) >= 4.5) return candidate;
        }
        return '#1a1a1a';
    }

    /**
     * Variante LIGHT del primary come FOREGROUND (testo `.text-primary`, bordo `.border-primary`).
     * Gemella light di `computeColorPrimaryFgDk`: scurisce il brand in OKLCH (hue e chroma preservate)
     * finché il contrasto `TARGET_TEXT_CONTRAST` (4.8:1, sopra AA) sulla superficie più ESTREMA light
     * (`mutedBgLt`, `--bs-secondary-bg` L=0.942) è garantito. È DISACCOPPIATA dal fill `colorPrimary`:
     * il fill `--bs-primary` resta il colore brand fedele (tarato 4.5:1 su `baseLt`, ospita testo
     * proprio via `colorPrimaryText`), mentre questo foreground vive sulle superfici interne (card,
     * righe-tabella, input disabilitati) dove serve più contrasto. Tararlo su `baseLt` come il fill
     * lasciava `.text-primary` a ~4.1:1 su quelle superfici. Fallback `#1a1a1a` (hue al limite gamut).
     *
     * `mutedBgLtHex`, se passato, sostituisce il calcolo interno di `mutedBgLt` — usato da
     * `computePalette` per rispettare `PaletteOverrides.background` quando presente.
     */
    static computeColorPrimaryFgLt(colorTema: string, mutedBgLtHex?: string): string {
        const [L0, C, H] = ThemeService.hexToOklch(colorTema);
        const bg = mutedBgLtHex ?? ThemeService.computeMutedBgLt(C, H);
        for (let L = L0; L >= 0.05; L -= 0.01) {
            const candidate = ThemeService.oklchToHex(L, C, H);
            if (ThemeService.calcContrastRatio(candidate, bg) >= ThemeService.TARGET_TEXT_CONTRAST) return candidate;
        }
        return '#1a1a1a';
    }

    /**
     * Variante DARK del primary come FILL (`--bs-primary`, `.btn-primary`/`.bg-primary`) in dark mode.
     * Il fill light `colorPrimary` è tarato per il fondo CHIARO: usato letteralmente come bg su pagina
     * scura, un brand scuro/quasi-nero sparisce (boundary ~1:1, sotto WCAG 1.4.11). Qui si SCHIARISCE
     * il fill light in OKLCH (hue e chroma preservati) finché soddisfa DUE vincoli: boundary
     * `TARGET_FILL_BOUNDARY` (3.2:1) vs lo sfondo pagina scuro `baseDk`, E un testo leggibile (≥4.5:1,
     * bianco o nero) ospitabile sopra. I brand già abbastanza luminosi restano invariati (nessuna
     * deriva). Il testo del bottone in dark è poi `getReadableTextColor(questo)` = `colorPrimaryTextDk`.
     *
     * `baseDkHex`, se passato, sostituisce il calcolo interno di `baseDk` — usato da `computePalette`
     * per rispettare `PaletteOverrides.background` quando presente.
     */
    private static computeColorPrimaryFillDk(colorPrimaryLt: string, baseDkHex?: string): string {
        const [L0, C, H] = ThemeService.hexToOklch(colorPrimaryLt);
        const bg = baseDkHex ?? ThemeService.computeBaseDk(C, H);
        for (let L = L0; L <= 0.98; L += 0.01) {
            const candidate = ThemeService.oklchToHex(L, C, H);
            const boundary = ThemeService.calcContrastRatio(candidate, bg);
            const text = Math.max(
                ThemeService.calcContrastRatio(candidate, '#000000'),
                ThemeService.calcContrastRatio(candidate, '#ffffff'),
            );
            if (boundary >= ThemeService.TARGET_FILL_BOUNDARY && text >= 4.5) return candidate;
        }
        return colorPrimaryLt;
    }

    /**
     * Gemella scura di `computeColorPrimary`: variante del brand con contrasto WCAG sopra-AA
     * (`TARGET_TEXT_CONTRAST` = 4.8:1) per il primary usato come FOREGROUND (testo `.text-primary`,
     * bordo `.border-primary`) in dark mode. Schiarisce in OKLCH a hue e chroma invariati — alza solo
     * la luminanza L partendo da quella del brand, il minimo indispensabile. Preserva la chroma REALE
     * del brand (non una minima): un primary-come-testo resta una tinta brand viva anche su fondo scuro.
     *
     * Riferimento = la superficie più ESTREMA `mutedBgDk` (`--bs-secondary-bg`, L=0.295), NON la base
     * pagina: il primary come foreground compare anche su card/righe-tabella/input disabilitati, dove
     * il contrasto è peggiore che sulla base (tarando su `baseDk` `.text-primary` cadeva a ~3.1:1).
     * È token foreground-only (mai usato come fill `--bs-primary`), quindi alzarne il contrasto non
     * tocca i bottoni. Fallback `#e6e6e6` se nessuna L conforme (hue al limite del gamut sRGB).
     *
     * `mutedBgDkHex`, se passato, sostituisce il calcolo interno di `mutedBgDk` — usato da
     * `computePalette` per rispettare `PaletteOverrides.background` quando presente.
     */
    static computeColorPrimaryFgDk(colorTema: string, mutedBgDkHex?: string): string {
        const [L0, C, H] = ThemeService.hexToOklch(colorTema);
        const bg = mutedBgDkHex ?? ThemeService.computeMutedBgDk(C, H);
        for (let L = L0; L <= 0.98; L += 0.01) {
            const candidate = ThemeService.oklchToHex(L, C, H);
            if (ThemeService.calcContrastRatio(candidate, bg) >= ThemeService.TARGET_TEXT_CONTRAST) return candidate;
        }
        return '#e6e6e6';
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
