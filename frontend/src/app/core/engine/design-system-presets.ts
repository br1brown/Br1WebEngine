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

/**
 * Ruolo dichiarato da una pagina (`LeafPageInput.layout.role` in `siteBuilder.ts`): CHE COSA serve
 * alla pagina, non COME renderlo — la resa concreta (nav/footer/pannello sì o no) la decide il
 * design system attivo tramite `DesignSystemPreset.roleChrome`, tranne `'naked'` che è hard-coded
 * dall'Engine (vedi `NAKED_CHROME` sotto). Un contratto chiuso: lo stesso set di nomi per
 * qualunque design system, Engine o dominio — un design system nuovo mappa questi ruoli, non ne
 * inventa altri.
 *  - `'default'`: pagina di contenuto normale.
 *  - `'legal'`: pagina di testo lungo (policy, note legali...) — un design system può volerla
 *    diversa (es. un pannello quando le altre pagine ne sono prive, per leggibilità).
 *  - `'naked'`: nessuna chrome. L'UNICO ruolo forzato — nessun design system la reinterpreta.
 *
 * Nav/footer/pannello non sono (più) una leva della pagina: `LeafPageInput.layout` non ha
 * `showNav`/`showFooter`/`showPanel` — l'unico modo per una pagina di influenzarli è scegliere il
 * ruolo. La resa concreta resta sempre e solo decisione del design system attivo.
 */
export type PageRole = 'default' | 'legal' | 'naked';

/** Comportamento di chrome (nav/footer/pannello) associato a un ruolo da un design system. Ogni
 *  campo omesso resta al comportamento globale di sito (`SiteShellConfig.showNav`/`showFooter`/
 *  `showPanel` in site.ts). */
export interface RoleChromeSpec {
    showNav?: boolean;
    showFooter?: boolean;
    showPanel?: boolean;
}

/** Chrome del ruolo `'naked'` — non è un default, è un valore fisso: nessun design system la
 *  dichiara (non esiste `roleChrome.naked`), applicato incondizionatamente in `resolveRoleChrome`
 *  (siteBuilder.ts). */
export const NAKED_CHROME: Required<RoleChromeSpec> = { showNav: false, showFooter: false, showPanel: false };

/** Bundle di default per un preset — solo i campi che il preset sceglie di toccare. */
export interface DesignSystemPreset {
    forceThemeTone?: 'light' | 'dark';
    panelSurface?: SiteShellConfig['panelSurface'];
    /**
     * Sfondo/testo di navbar e footer. `'brand'` (default): superficie immersiva di brand — colore
     * pieno o pastello derivato da `colorTema`, sempre diversa dallo sfondo pagina (`colorBase`) di
     * proposito, per un chrome riconoscibile. `'body'`: navbar/footer condividono esattamente lo
     * sfondo/testo della pagina (`colorBase`/`colorSurfaceText`) — nessuna cesura visibile fra
     * chrome e contenuto, per un sito a superficie unica (es. `muro` sotto). Nessuna nuova matematica:
     * sceglie solo QUALE coppia di token già calcolati da `ThemeService.computePalette()` alimenta
     * `--colorNavBg`/`--colorNavText`/`--colorNavBorder`.
     */
    navSurface?: 'brand' | 'body';
    /**
     * Come questo design system interpreta i ruoli `'default'`/`'legal'` (vedi `PageRole` sopra —
     * `'naked'` non è qui: è hard-coded dall'Engine, uguale per ogni design system). Campo assente,
     * o ruolo non mappato, = nessuna differenza dal comportamento pre-ruoli (i flag globali di
     * sito, eventualmente scostati dal `layout.*` della singola pagina). Solo i design system che
     * vogliono davvero differenziare i ruoli lo popolano (es. `muro` sotto).
     */
    roleChrome?: {
        default?: RoleChromeSpec;
        legal?: RoleChromeSpec;
    };
    /**
     * Navbar fissa in alto allo scroll. Non è più (solo) una scelta libera del sito: un design
     * system a esperienza immersiva/istituzionale può volerla sempre fissa (o sempre statica) come
     * parte della propria identità, non lasciata al caso di ogni progetto figlio. `shell.fixedTopHeader`
     * in site.ts resta comunque una scappatoia esplicita — vince sempre su questo default.
     */
    fixedTopHeader?: boolean;
    /**
     * Fade-in d'ingresso pagina. Un design system minimale/istituzionale può preferirlo spento
     * (transizioni brusche, coerenti con un'estetica più "netta"); il default resta `true`
     * (`shell.pageFade`) quando nessun design system è attivo o non lo mappa.
     */
    pageFade?: boolean;
    /** Mostra il breadcrumb sulle pagine interne. Come sopra: un design system può volerlo sempre
     *  presente (siti istituzionali/gerarchici) o sempre assente (siti a pagina singola/immersivi). */
    showBreadcrumb?: boolean;
    /**
     * Default proposti per gli override colore opzionali (`site.colorBackground`/`colorSecondary`/
     * `colorText`/`colorInfo` in `global-settings.json`) — STESSA matematica di sempre
     * (`ThemeService.computePalette`), nessun nuovo calcolo: solo un valore di ripiego quando il
     * JSON non ne dichiara uno proprio. Un valore esplicito nel JSON vince sempre sul preset (stesso
     * principio di `addon.json` che sovrascrive `basic.json`) — il preset non forza mai una palette,
     * la propone solo per chi non ha già deciso diversamente. Nessun preset di questo template li usa
     * oggi (nessun colore specifico da imporre); la leva esiste per i design system che vorranno
     * davvero una palette secondaria/di sfondo/di testo/di stato coerente con la propria identità.
     */
    colorBackground?: string;
    colorSecondary?: string;
    colorText?: string;
    colorInfo?: string;
}

/**
 * Gli 8 scheletri di questo template: i 7 visivamente distinti della griglia
 * {forceThemeTone × panelSurface} 3×3 (i due angoli dark/dark e light/light collassano su
 * dark/auto e light/auto — stesso risultato quando il sito è già tutto su un tono), più `muro`
 * che aggiunge la dimensione `roleChrome`. Nomi negoziabili, non fanno parte del contratto:
 * cambiarli non è breaking per un figlio che non li usa, lo è solo per chi ha scritto
 * `designSystem: 'nome'`.
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
    /** Sito uniforme "a muro" (Agnese Subacchi): palette fissa scura, nessun pannello sulle pagine
     *  di contenuto — il contenuto vive direttamente sullo sfondo, senza la "card" chiara che
     *  spezzerebbe l'uniformità. Le pagine legali (`role: 'legal'`) restano un'eccezione voluta:
     *  testo lungo, il pannello torna per leggibilità — l'esperienza "a parete" è per le pagine
     *  di contenuto, non per le policy. */
    muro: {
        forceThemeTone: 'dark',
        navSurface: 'body',
        roleChrome: {
            default: { showPanel: false },
            legal: { showPanel: true },
        },
    },
} as const satisfies Record<string, DesignSystemPreset>;

export type DesignSystemPresetName = keyof typeof DESIGN_SYSTEM_PRESETS;
