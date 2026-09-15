/**
 * Preset nominati di design system: un nome comodo che espande in un bundle di campi granulari
 * già esistenti (`SiteConfig.forceThemeTone`, `SiteShellConfig.panelSurface`, ...). Il preset dà
 * solo il DEFAULT — un campo impostato esplicitamente da `site.ts` vince sempre sul preset, mai il
 * contrario (stesso principio di `addon.json` che sovrascrive `basic.json`).
 *
 * Un design system è CODICE, non un dato statico: ogni voce di `DESIGN_SYSTEM_PRESETS` è una
 * funzione (`DesignSystemFactory`), non un oggetto letterale — stesso idioma di `pages: () => [...]`
 * in site.ts. Non serve quasi mai fare calcoli per costruire un preset, ma quando serve (derivare
 * più sfumature da un unico colore, comporre un `customPalette` a partire da poche costanti) si può,
 * senza inventare un secondo meccanismo. `extendDesignSystem` sotto dà l'ergonomia di "estendi e
 * sovrascrivi solo quello che ti serve" via composizione (deep-merge mirato), non via `class`/
 * `extends` — nessun altro punto di questo template usa ereditarietà OOP per la configurazione, e
 * introdurla solo qui sarebbe uno stile a sé in un codebase che compone con funzioni e spread.
 *
 * Deliberatamente un bundle PARZIALE, non campi fissi: un domani, quando servirà davvero (non prima
 * — non è un problema architetturale da anticipare oggi), un preset potrà includere anche campi
 * strutturali dello shell (es. una fascia istituzionale fissa sopra la navbar, tipo i siti della PA)
 * semplicemente aggiungendo la proprietà a `DesignSystemPreset` — nessun redesign.
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
 * Il ruolo si dichiara nello stesso posto di ogni altro fatto sulla pagina — `layout.role` nel file
 * di area (`pages/*.pages.ts`) o in `legal-pages.ts` per le legali — non in una mappa a parte né
 * dedotto dalla rotta: stesso principio con cui path/title/SEO vivono già lì, non altrove.
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
     * Override dei quattro colori derivati opzionali (secondario, sfondo pagina, testo, info) —
     * STESSA matematica di sempre (`ThemeService.computePalette`), nessun nuovo calcolo. Non vivono
     * più in `global-settings.json`: l'unico colore di identità che resta nel JSON è `colorTema`
     * (il brand). Tutto il resto — anche questi quattro — è una decisione del design system attivo,
     * non un valore di progetto. Un design system che non li imposta ottiene esattamente i default
     * storici (derivati automaticamente dal brand), calcolati come sempre.
     */
    colorBackground?: string;
    colorSecondary?: string;
    colorText?: string;
    colorInfo?: string;
    /**
     * Colori con nome proprio, oltre ai quattro slot fissi sopra — la leva per un design system che
     * vuole la SUA palette (es. quella di un cliente), non solo scostarsi dai quattro default
     * generici. Ogni voce è un hex; ThemeService la porta nella stessa pipeline WCAG di tutto il
     * resto (`findCompliantColor`/`getReadableTextColor`) e la espone come coppia di CSS custom
     * properties — `--color<Label>` (il colore) e `--color<Label>Text` (il testo leggibile sopra),
     * `<Label>` = la chiave in PascalCase, tone-adaptive come ogni altro token `--color*`. Es.
     * `{ bordeaux: '#5c1a2b' }` → `--colorBordeaux`/`--colorBordeauxText` disponibili ovunque in CSS,
     * accanto a `--colorPrimary`/`--colorSecondary` ecc., senza sostituirli: i quattro slot semantici
     * sopra restano gli stessi (con o senza override) — `customPalette` aggiunge, non silenzia.
     */
    customPalette?: Record<string, string>;
}

/**
 * Un design system è una funzione, non un dato: stesso idioma di `pages: () => [...]` in site.ts.
 * Zero argomenti oggi — non c'è ancora un consumer reale che ne abbia bisogno — ma è già un punto
 * di estensione: se un domani servirà del contesto (come `pages` lo riceve da `SitePageContext`),
 * è un parametro in più sulla firma, non un redesign.
 */
export type DesignSystemFactory = () => DesignSystemPreset;

/** Deep-merge mirato per i due campi annidati (`roleChrome`, `customPalette`); tutto il resto è un
 *  override shallow — `patch` vince sul campo omonimo di `base`, un campo assente in `patch` lascia
 *  quello di `base`. */
function mergeDesignSystemPreset(base: DesignSystemPreset, patch: Partial<DesignSystemPreset>): DesignSystemPreset {
    return {
        ...base,
        ...patch,
        roleChrome: (patch.roleChrome || base.roleChrome) ? {
            default: { ...base.roleChrome?.default, ...patch.roleChrome?.default },
            legal: { ...base.roleChrome?.legal, ...patch.roleChrome?.legal },
        } : undefined,
        customPalette: (patch.customPalette || base.customPalette)
            ? { ...base.customPalette, ...patch.customPalette }
            : undefined,
    };
}

/**
 * Costruisce un design system per ESTENSIONE di un altro, invece che per copia — è la "classe
 * padre da sovrascrivere": `base` resta la fonte di verità, `patch` tocca solo ciò che deve
 * cambiare (`roleChrome`/`customPalette` si fondono chiave per chiave, il resto sovrascrive). Un
 * design system di dominio che vuole la palette di un cliente specifico parte da un preset
 * dell'Engine (es. `muro`) invece di riscriverlo da zero:
 * ```typescript
 * export const clienteX = extendDesignSystem(muro, () => ({
 *     customPalette: { bordeaux: '#5c1a2b', oro: '#a97d3f' },
 * }));
 * ```
 * `patch` è a sua volta una funzione (può fare calcoli, come `base`) e riceve il preset di `base`
 * già risolto, per un override che dipenda da un valore calcolato invece che ripeterlo a mano.
 */
export function extendDesignSystem(
    base: DesignSystemFactory,
    patch: Partial<DesignSystemPreset> | ((resolved: DesignSystemPreset) => Partial<DesignSystemPreset>),
): DesignSystemFactory {
    return () => {
        const resolved = base();
        return mergeDesignSystemPreset(resolved, typeof patch === 'function' ? patch(resolved) : patch);
    };
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
    adaptive: (): DesignSystemPreset => ({}),
    /** Segue l'OS, ma il pannello contenuti resta sempre quasi-bianco — il default storico del template. */
    'adaptive-light-panel': (): DesignSystemPreset => ({ panelSurface: 'light' }),
    /** Segue l'OS, ma il pannello contenuti resta sempre scuro — mirror del precedente. */
    'adaptive-dark-panel': (): DesignSystemPreset => ({ panelSurface: 'dark' }),
    /** Sito fissato scuro, pannello intonato — palette a contrasto fisso studiato dal grafico (es. Agnese Subacchi). */
    'locked-dark': (): DesignSystemPreset => ({ forceThemeTone: 'dark' }),
    /** Sito fissato chiaro, pannello intonato — mirror del precedente. */
    'locked-light': (): DesignSystemPreset => ({ forceThemeTone: 'light' }),
    /** Sito fissato scuro, con un pannello chiaro in risalto (pattern Radix `panelBackground` / Carbon "g100 panel in white page"). */
    'locked-dark-accent-panel': (): DesignSystemPreset => ({ forceThemeTone: 'dark', panelSurface: 'light' }),
    /** Sito fissato chiaro, con un pannello scuro in risalto — mirror del precedente. */
    'locked-light-accent-panel': (): DesignSystemPreset => ({ forceThemeTone: 'light', panelSurface: 'dark' }),
    /** Sito uniforme "a muro" (Agnese Subacchi): palette fissa scura, nessun pannello sulle pagine
     *  di contenuto — il contenuto vive direttamente sullo sfondo, senza la "card" chiara che
     *  spezzerebbe l'uniformità. Le pagine legali (`role: 'legal'`) restano un'eccezione voluta:
     *  testo lungo, il pannello torna per leggibilità — l'esperienza "a parete" è per le pagine
     *  di contenuto, non per le policy. */
    muro: (): DesignSystemPreset => ({
        forceThemeTone: 'dark',
        navSurface: 'body',
        roleChrome: {
            default: { showPanel: false },
            legal: { showPanel: true },
        },
    }),
} as const satisfies Record<string, DesignSystemFactory>;

export type DesignSystemPresetName = keyof typeof DESIGN_SYSTEM_PRESETS;
