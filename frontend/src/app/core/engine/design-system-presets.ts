/**
 * Preset nominati di design system: un nome comodo che espande in un bundle di campi granulari
 * già esistenti (`SiteConfig.forceThemeTone`, `SiteShellConfig.panelSurface`, ...). Il preset dà
 * solo il DEFAULT — un campo impostato esplicitamente da `site.ts`/`global-settings.json` vince
 * sempre sul preset, mai il contrario (stesso principio di `addon.json` che sovrascrive `basic.json`).
 *
 * Deliberatamente un bundle PARZIALE, non due campi fissi: un domani, quando servirà davvero (non
 * prima — non è un problema architetturale da anticipare oggi), un preset potrà includere anche
 * campi strutturali dello shell (es. una fascia istituzionale fissa sopra la navbar, tipo i siti
 * della PA) semplicemente aggiungendo la proprietà a `DesignSystemPreset` — nessun redesign.
 * "Tema" è già preso da `ThemeService.themeTone` (auto/OS) per un motivo preciso: nessun design
 * system guardato (Material 3, Radix, Chakra, Ant Design, Carbon, Primer, Atlassian) chiama "tema"
 * qualcosa che includa la struttura — è sempre e solo colore/tono. Questo bundle è volutamente più
 * ampio, da qui il nome diverso.
 */

import type { SiteShellConfig } from './siteBuilder';

/** Bundle di default per un preset — solo i campi che il preset sceglie di toccare. */
export interface DesignSystemPreset {
    forceThemeTone?: 'light' | 'dark';
    panelSurface?: SiteShellConfig['panelSurface'];
}

/**
 * I 7 scheletri visivamente distinti della griglia {forceThemeTone × panelSurface} 3×3 (i due
 * angoli dark/dark e light/light collassano su dark/auto e light/auto — stesso risultato quando
 * il sito è già tutto su un tono). Nomi negoziabili, non fanno parte del contratto: cambiarli non
 * è breaking per un figlio che non li usa, lo è solo per chi ha scritto `designSystem: 'nome'`.
 */
export const DESIGN_SYSTEM_PRESETS = {
    /** Tutto segue l'OS, pannello intonato al tema corrente (nessun campo forzato). */
    adaptive: {},
    /** Segue l'OS, ma il pannello contenuti resta sempre quasi-bianco — il default storico del template. */
    'adaptive-light-panel': { panelSurface: 'light' },
    /** Segue l'OS, ma il pannello contenuti resta sempre scuro — mirror del precedente. */
    'adaptive-dark-panel': { panelSurface: 'dark' },
    /** Sito fissato scuro, pannello intonato — palette a contrasto fisso studiato dal grafico (es. Agnese Subacchi). */
    'locked-dark': { forceThemeTone: 'dark' },
    /** Sito fissato chiaro, pannello intonato — mirror del precedente. */
    'locked-light': { forceThemeTone: 'light' },
    /** Sito fissato scuro, con un pannello chiaro in risalto (pattern Radix `panelBackground` / Carbon "g100 panel in white page"). */
    'locked-dark-accent-panel': { forceThemeTone: 'dark', panelSurface: 'light' },
    /** Sito fissato chiaro, con un pannello scuro in risalto — mirror del precedente. */
    'locked-light-accent-panel': { forceThemeTone: 'light', panelSurface: 'dark' },
} as const satisfies Record<string, DesignSystemPreset>;

export type DesignSystemPresetName = keyof typeof DESIGN_SYSTEM_PRESETS;
