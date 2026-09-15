import { DESIGN_SYSTEM_PRESETS, extendDesignSystem, type DesignSystemFactory } from '../../../core/engine/design-system-presets';

/**
 * Demo: un design system di dominio, costruito per ESTENSIONE di un preset dell'Engine invece che
 * riscritto da zero — `extendDesignSystem` è la "classe padre da sovrascrivere" di questo template,
 * fatta per composizione (deep-merge di `roleChrome`/`customPalette`, override shallow per il
 * resto) invece che con `class`/`extends`. Un figlio che vuole la propria palette (es. i colori di
 * un cliente specifico) parte da qui: importa `esempioDesignSystem` come riferimento, non lo
 * riscrive, e lo usa in `site.ts` passandolo DIRETTAMENTE a `shell.designSystem` — un design system
 * di dominio non ha un nome di registro come quelli dell'Engine, è solo una funzione che il sito
 * importa:
 * ```typescript
 * // site.ts
 * import { esempioDesignSystem } from './components/shared/design-systems/esempio.design-system';
 * buildSite({ shell: { designSystem: esempioDesignSystem } });
 * ```
 * I colori qui sotto sono segnaposto — sostituiscili con la palette reale del progetto.
 * `customPalette` aggiunge colori con nome proprio (non sostituisce `colorSecondary`/`colorInfo`
 * ecc.: quelli restano i default calcolati dal brand, a meno di scostarli esplicitamente anche
 * loro) — ogni voce diventa una coppia `--color<Label>`/`--color<Label>Text` disponibile in ogni
 * CSS/SCSS del progetto, con testo leggibile calcolato automaticamente (stessa pipeline WCAG di
 * `colorSecondary`).
 */
export const esempioDesignSystem: DesignSystemFactory = extendDesignSystem(DESIGN_SYSTEM_PRESETS.muro, {
    customPalette: {
        bordeaux: '#5c1a2b',
        oro: '#a97d3f',
    },
});
