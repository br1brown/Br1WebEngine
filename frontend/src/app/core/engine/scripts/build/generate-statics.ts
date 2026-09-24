/** Sincronizza i file statici (index.html, environment.ts, manifest, robots.txt, theme-init.js, palette Sass) con
 *  global-settings.json/site.ts. Eseguire con `npm run generate:statics` (già nei pre-hook build/dev). */

// Necessario: carica il JIT compiler di Angular così i decoratori @Injectable
// funzionano quando Node.js importa site.ts e il suo grafo di dipendenze.
import '@angular/compiler';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { ContestoSito } from '../../../../site';
import { AppearanceService, siteOverrides, type PaletteTokens } from '../../services/appearance.service';
import { buildThemeScss, paletteDegenerata } from './theme-scss';
import { fingerprintIdentitySections } from '../config/config-fingerprint';
import { readFeaturesStrict } from '../config/features';
import { ensureLocalSettings } from '../config/local-settings';
import { checkLegalFolders, listLegalFiles } from './legal-check';
import { activeLegalPartials } from '../../legal/legal-pages';
import { deepMergeSettings } from '../config/settings-merge';
import { getLastModifiedDate } from '../config/last-modified';
import type { GlobalSettings } from '../../global-settings.types';

const ROOT = join(__dirname, '../../../../../../');

// Config di progetto a build-time (global-settings.json). Nel build Docker il file non è nel
// build context, quindi deploy.sh lo passa minificato come ARG BR1_PROJECT_JSON. Tipizzato con
// GlobalSettings: un typo di chiave è errore a tsc.
function readProjectSettings(): GlobalSettings {
    // BR1_PROJECT_JSON: SOLO il file base, mai fuso con .local.json — confine di sicurezza voluto,
    // i segreti di .local.json non devono finire in un build ARG.
    const inline = process.env['BR1_PROJECT_JSON'];
    if (inline) {
        try { return JSON.parse(inline) as GlobalSettings; } catch { /* fallback al file */ }
    }

    const candidates = [
        process.env['GLOBAL_SETTINGS_PATH'],
        join(ROOT, '../global-settings.json'), // host/CI: root del repo
        join(ROOT, 'global-settings.json'),
    ].filter((p): p is string => Boolean(p));

    let base: GlobalSettings | null = null;
    for (const p of candidates) {
        try {
            if (existsSync(p)) {
                base = JSON.parse(readFileSync(p, 'utf-8')) as GlobalSettings;
                break;
            }
        } catch { /* file illeggibile: prova il prossimo candidato */ }
    }
    if (!base) return {};

    // Fusa con global-settings.local.json se presente (stessa deepMergeSettings di server-env.ts al
    // boot): senza, un progetto con identità/tema in .local.json vedrebbe l'avviso "environment.ts
    // disallineato" anche subito dopo un generate:statics pulito.
    const localCandidates = [
        join(ROOT, '../global-settings.local.json'),
        join(ROOT, 'global-settings.local.json'),
    ];
    // Copia di sviluppo del repository (il file base sta nella root, non nel container) senza `.local`:
    // lo si genera qui, con le chiavi, invece di chiedere di lanciare setup.mjs. Il login demo e il
    // proxy del dev server vogliono quelle chiavi; il backend fa lo stesso al suo avvio.
    if (existsSync(join(ROOT, '../global-settings.json')) && !localCandidates.some(existsSync)) {
        ensureLocalSettings(localCandidates[0]);
        console.log('[statics] global-settings.local.json creato accanto a global-settings.json, con API key e SecretKey generate (gitignored).');
    }
    for (const p of localCandidates) {
        let local: Record<string, unknown>;
        try {
            if (!existsSync(p)) continue;
            local = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
        } catch { continue; /* file illeggibile: ignora l'override, resta il solo base */ }
        // Il build Docker legge il solo file base (BR1_PROJECT_JSON): Features nel .local
        // funzionerebbe in locale e dividerebbe frontend e backend in produzione.
        if (Object.keys(local).some(k => k.toLowerCase() === 'features')) {
            throw new Error('[statics] Features sta in global-settings.local.json: va solo in global-settings.json.');
        }
        return deepMergeSettings(base as unknown as Record<string, unknown>, local) as GlobalSettings;
    }
    return base;
}

const _settings = readProjectSettings();
// Scritta in environment.ts più sotto; letta di nuovo al boot da server.ts per accorgersi se
// qualcuno lancia `ng serve` senza rigenerare gli statici dopo una modifica a global-settings.json.
const CONFIG_FINGERPRINT = fingerprintIdentitySections(_settings);
const _fileLoc = _settings.Localization ?? {};
const _fileProject = _settings.project ?? {};
// Features decide login e sezioni della Privacy Policy. Lettura rigorosa: una forma che il backend
// leggerebbe diversamente (chiave in minuscolo, "true" come stringa, chiave ignota) ferma il build.
const FEATURES = readFeaturesStrict(_settings as Record<string, unknown>);
// Login acceso senza una pagina di login: il backend lo attiverebbe, ma nessuno potrebbe usarlo.
if (FEATURES.login && !ContestoSito.hasLoginPageSlot) {
    throw new Error('[statics] Features.Login/PublicLogin è acceso ma site.ts non valorizza loginPage.');
}
// Solo identità MINIMA finisce in environment.ts: aspetto e comportamento stanno in site.ts
// (struttura o design system); ogni altra chiave di `site` nel JSON resta fuori.
const SITE_CONFIG = _settings.site ?? {};
const SITE_AESTHETIC_KEYS = ['description', 'colorTema'];

// Identità dell'app — fonte unica: project.name / project.version.
const APP_NAME = _fileProject.name || 'App';
const APP_VERSION = _fileProject.version || '1.0.0';
const COLOR_TEMA = SITE_CONFIG.colorTema ?? '#888888';
// Validato qui, non solo in siteBuilder (che legge l'environment.ts del giro precedente): un valore non esadecimale
// arriverebbe a computePalette e uscirebbe come `#NaNNaNNaN` in _theme.scss, con un errore Sass senza spiegazione.
if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(COLOR_TEMA)) {
    throw new Error(`[statics] site.colorTema "${COLOR_TEMA}" non è un colore esadecimale (#rgb o #rrggbb) in global-settings.json.`);
}
// Gli override colore sono una proposta del design system attivo (site.ts), letti da
// ContestoSito.config senza rischio di staleness (site.ts non passa da environment.ts, a
// differenza di COLOR_TEMA/SITE_CONFIG sopra).
const COLOR_OVERRIDES = siteOverrides();
// Tono forzato dal design system attivo (`tono.forza`), già risolto da siteBuilder.ts.
const FORCE_THEME_TONE: 'light' | 'dark' | undefined = ContestoSito.config.aspetto.tono.forza;

/** Palette del build (manifest e tema Sass), calcolata una volta. I ripieghi di contrasto del motore colore
 *  (un `console.warn` per token) qui si contano e si stampano in una riga sola: venti avvisi uguali nascondono il
 *  caso in cui la palette è degenerata, che invece ferma il build (`paletteDegenerata`). */
let _palette: PaletteTokens | undefined;
function buildPalette(): PaletteTokens {
    if (_palette) return _palette;
    const warn = console.warn;
    const ripieghi = new Map<string, number>();
    console.warn = (...args: unknown[]): void => {
        const fn = /\[AppearanceService\] (\w+)/.exec(args.map(String).join(' '))?.[1];
        if (fn) ripieghi.set(fn, (ripieghi.get(fn) ?? 0) + 1); else warn(...args);
    };
    try { _palette = AppearanceService.computePalette(COLOR_TEMA, COLOR_OVERRIDES); } finally { console.warn = warn; }
    const degenerata = paletteDegenerata(_palette, COLOR_TEMA);
    if (degenerata) throw new Error(`[statics] ${degenerata}`);
    if (ripieghi.size > 0) {
        const totale = [...ripieghi.values()].reduce((a, b) => a + b, 0);
        warn(`[statics] Palette: ${totale} ripieghi di contrasto su nero/bianco (${[...ripieghi].map(([fn, n]) => `${fn} ×${n}`).join(', ')}): ` +
            'i colori restano leggibili (≥4.5:1) ma perdono la tinta del brand. Brand o superfici troppo vicini alla luminanza media.');
    }
    return _palette;
}

// PWA on/off: guida i TRIGGER di installabilità (manifest, <link rel="manifest">, meta
// mobile-web-app-*). La de-registrazione runtime del SW è gestita da cookie-consent.service.ts;
// qui solo il lato generazione statici.
const IS_WEBAPP = ContestoSito.config.isWebApp;

const _normLang = (tag: unknown): string | null => {
    if (typeof tag !== 'string' || !tag.trim()) return null;
    try { return new Intl.Locale(tag.trim()).language ?? null; } catch { return null; }
};

// Lingue di build (Localization): servono a chi le legge al caricamento del modulo (routing, fallback).
const _defaultRaw   = _fileLoc.DefaultLanguage;
const _supportedRaw = _fileLoc.SupportedLanguages;

const DEFAULT_LANG = _normLang(_defaultRaw) ?? 'it';
// Anche un `SupportedLanguages: []` o tutto malformato ricade sulla lingua di default: zero lingue = zero rotte.
const _normalizedSupported = (_supportedRaw && _supportedRaw.length > 0 ? _supportedRaw : [DEFAULT_LANG])
    .map(_normLang)
    .filter((l): l is string => l !== null)
    .filter((v, i, a) => a.indexOf(v) === i); // deduplication
const AVAILABLE_LANGS = _normalizedSupported.length > 0 ? _normalizedSupported : [DEFAULT_LANG];

// Pagine legali: cartelle assets/legal/<pagina>/<parte>/<lingua>.md (intro, outro, parti della ricetta),
// verificate sulle stesse lingue che il sito serve (AVAILABLE_LANGS, scritte in environment.ts).
const LEGAL_DIR = join(ROOT, 'src', 'assets', 'legal');
const LEGAL_PAGES = ContestoSito.config.legalPages.filter(s => ContestoSito.getLegalPage(s.page) != null);
const legalErrors = checkLegalFolders(
    LEGAL_DIR,
    LEGAL_PAGES,
    AVAILABLE_LANGS,
    activeLegalPartials(FEATURES, ContestoSito.config.cookiePolicy != null),
);
if (legalErrors.length) {
    throw new Error(`[statics] Pagine legali non valide:\n${legalErrors.join('\n')}`);
}
// Scritto in environment.ts: il resolver chiede solo i file che esistono.
const LEGAL_FILES = listLegalFiles(LEGAL_DIR, LEGAL_PAGES);

// description: mappa per-lingua { it, en, ... } (accetta anche una stringa singola,
// normalizzata sulla lingua default). environment.ts riceve la mappa; i file statici
// usano la lingua default (in SSR i meta sono riscritti per richiesta).
const _rawDesc = SITE_CONFIG.description;
const DESCRIPTION_MAP: Record<string, string> =
    typeof _rawDesc === 'string'
        ? { [DEFAULT_LANG]: _rawDesc }
        : (_rawDesc && typeof _rawDesc === 'object'
            ? Object.fromEntries(
                Object.entries(_rawDesc as Record<string, unknown>)
                    .filter((e): e is [string, string] => typeof e[1] === 'string'))
            : {});
const DESCRIPTION = DESCRIPTION_MAP[DEFAULT_LANG] ?? Object.values(DESCRIPTION_MAP)[0] ?? '';

// Solo identità/estetica finisce in environment.ts (description normalizzata a mappa).
// L'identità legale/social del brand e il tipo entità sono dato runtime, serviti
// dall'Engine (GET /identity), e alimentano da lì footer, pagine legali e JSON-LD.
const SITE_CONFIG_OUT = {
    ...Object.fromEntries(
        Object.entries(SITE_CONFIG).filter(([k]) => SITE_AESTHETIC_KEYS.includes(k) && k !== 'description')
    ),
    description: DESCRIPTION_MAP,
};

const INDEX = join(ROOT, 'src', 'index.html');
const MANIFEST = join(ROOT, 'public', 'manifest.webmanifest');
const ROBOTS = join(ROOT, 'public', 'robots.txt');

const THEME_INIT = join(ROOT, 'public', 'theme-init.js');
// Letto da styles/engine/bootstrap.scss e base.scss: generato a ogni build, quindi gitignored.
const THEME_SCSS = join(ROOT, 'src', 'styles', 'engine', 'generated', '_theme.scss');

// Rimuove lo slash finale per evitare doppi slash negli URL generati
const BASE_URL = (process.env['FRONTEND_BASE_URL'] || 'https://example.com').replace(/\/$/, '');

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Stessa lista di translate.service.ts (RTL_LANGUAGES) — duplicata qui perché questo è uno
 *  script Node standalone, non un contesto Angular: importare il service trascinerebbe l'intero
 *  DI framework per una costante statica. */
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'dv', 'ckb']);
// Unica fonte per <html dir> e manifest.webmanifest["dir"]: stessa lingua, stesso verso.
const DIR = RTL_LANGUAGES.has(DEFAULT_LANG) ? 'rtl' : 'ltr';

function toOpenGraphLocale(lang: string): string {
    try {
        const locale = new Intl.Locale(lang).maximize();
        return locale.region ? `${locale.language}_${locale.region}` : locale.language;
    } catch {
        const [base] = lang.split('-');
        return `${base}_${base.toUpperCase()}`;
    }
}

function replaceMeta(
    html: string,
    attr: 'name' | 'property',
    key: string,
    content: string
): string {
    const escapedKey = escapeRegex(key);
    // Tolera qualsiasi ordine degli attributi nel tag meta
    const pattern = new RegExp(`<meta\\s[^>]*${attr}="${escapedKey}"[^>]*>`, 'i');
    const replacement = `<meta ${attr}="${key}" content="${content}">`;

    if (!pattern.test(html)) {
        throw new Error(`[statics] Impossibile trovare meta[${attr}="${key}"] in index.html.`);
    }

    return html.replace(pattern, replacement);
}

function replaceTag(html: string, pattern: RegExp, replacement: string, label: string): string {
    if (!pattern.test(html)) {
        throw new Error(`[statics] Impossibile trovare ${label} in index.html.`);
    }

    return html.replace(pattern, replacement);
}

// ── Aggiornamento index.html ──────────────────────────────────────────────

function updateIndexHtml(): void {
    const appName = escapeHtml(APP_NAME);
    const description = escapeHtml(DESCRIPTION);
    const lang = escapeHtml(DEFAULT_LANG);
    const ogLocale = escapeHtml(toOpenGraphLocale(DEFAULT_LANG));
    // 'default' è sicuro per qualsiasi tema: apple-mobile-web-app-status-bar-style
    // non supporta media queries e non può adattarsi all'OS preference a runtime.
    const iosStatusBar = 'default';

    let html = readFileSync(INDEX, 'utf8');

    // Regex flessibile: matcha <html> con qualsiasi combinazione di attributi, riscrive solo lang.
    html = replaceTag(html, /<html\b[^>]*>/, `<html lang="${lang}" dir="${DIR}">`, '<html lang>');
    html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${appName}</title>`, '<title>');

    const defaultImageUrl = `${BASE_URL}/icons/icon-512x512.png`;
    const updatedTime = getLastModifiedDate(_fileProject);

    // <meta name="theme-color"> è omesso: viene iniettato dinamicamente per-request
    // dall'app-initializer SSR (app.config.server.ts), con varianti light/dark via media attribute.
    const allMeta: ['name' | 'property', string, string][] = [
        ['name', 'app-version', APP_VERSION],
        ['property', 'og:updated_time', updatedTime],
        ['name', 'description', description],
        // I meta apple-mobile-web-app-* sono trigger PWA e vivono nel blocco PWA
        // condizionato da IS_WEBAPP (vedi più sotto), così spariscono quando il sito
        // non è installabile invece di restare sempre presenti.
        ['name', 'application-name', appName],
        ['name', 'twitter:title', appName],
        ['name', 'twitter:description', description],
        ['name', 'twitter:image', defaultImageUrl],
        ['property', 'og:title', appName],
        ['property', 'og:description', description],
        ['property', 'og:site_name', appName],
        ['property', 'og:locale', ogLocale],
        ['property', 'og:url', BASE_URL],
        ['property', 'og:image', defaultImageUrl],
    ];

    // environment.ts: identità, lingue e config di sito da global-settings.json (seed di build).
    const generatedTsPath = join(ROOT, 'src', 'environments', 'environment.ts');
    const generatedTsContent = `// FILE GENERATO AUTOMATICAMENTE DA scripts/build/generate-statics.ts
// Non modificare manualmente. Sorgente di verità: global-settings.json (sezioni project / Localization / site / Features)

export interface AppSiteConfig {
    description?: Record<string, string>;
    colorTema?: string;
}

/** Funzioni opzionali accese in global-settings.json (§ Features). */
export interface AppFeatures {
    /** Login attivo, riservato o pubblico. */
    login: boolean;
    /** Login pubblico: link in navbar e sezione nella Privacy Policy. */
    publicLogin: boolean;
    mail: boolean;
    errorReporting: boolean;
    forms: boolean;
}

export interface AppEnvironment {
    appName: string;
    version: string;
    defaultLang: string;
    availableLanguages: string[];
    config: AppSiteConfig;
    features: AppFeatures;
    /** Impronta della config alla generazione: server.ts la confronta al boot per scoprire un global-settings.json non rigenerato. */
    configFingerprint: string;
    /** File presenti per pagina legale (cartella → nomi senza lingua): il resolver carica solo questi. */
    legalFiles: Record<string, string[]>;
}

export const environment: AppEnvironment = {
    appName: ${JSON.stringify(APP_NAME)},
    version: ${JSON.stringify(APP_VERSION)},
    defaultLang: '${DEFAULT_LANG}',
    availableLanguages: ${JSON.stringify(AVAILABLE_LANGS)},
    config: ${JSON.stringify(SITE_CONFIG_OUT, null, 8).replace(/\n/g, '\n    ')},
    features: ${JSON.stringify(FEATURES)},
    configFingerprint: ${JSON.stringify(CONFIG_FINGERPRINT)},
    legalFiles: ${JSON.stringify(LEGAL_FILES)}
};
`;
    writeFileSync(generatedTsPath, generatedTsContent, 'utf8');
    console.log('[statics] src/environments/environment.ts aggiornato');

    for (const [attr, key, value] of allMeta) {
        html = replaceMeta(html, attr, key, value);
    }

    html = replaceTag(
        html,
        /<link rel="icon" type="image\/png" href="[^"]*">/,
        '<link rel="icon" type="image/png" href="icons/icon-192x192.png">',
        '<link rel="icon">'
    );

    // Apple Touch Icon sempre, anche senza PWA: "Aggiungi a Home" su iOS la usa comunque.
    html = replaceTag(
        html,
        /<link rel="apple-touch-icon"[^>]*>/,
        '<link rel="apple-touch-icon" sizes="180x180" href="icons/apple-touch-icon-180x180.png">',
        '<link rel="apple-touch-icon">'
    );

    // Path assoluto: lo <script> sta prima di <base href>, un path relativo darebbe 404 sulle pagine annidate.
    html = replaceTag(
        html,
        /<script\s+src="\/?theme-init\.js"><\/script>/,
        '<script src="/theme-init.js"></script>',
        '<script theme-init>'
    );

    // ── Blocco PWA fra marker nudi, rigenerato intero: pieno con IS_WEBAPP, vuoto altrimenti ──
    const pwaBlock = IS_WEBAPP
        ? '\n    ' + [
            '<meta name="mobile-web-app-capable" content="yes">',
            `<meta name="apple-mobile-web-app-status-bar-style" content="${iosStatusBar}">`,
            `<meta name="apple-mobile-web-app-title" content="${appName}">`,
            '<link rel="manifest" href="manifest.webmanifest">',
        ].join('\n    ') + '\n    '
        : '';

    html = replaceTag(
        html,
        /<!-- PWA:START[\s\S]*?PWA:END -->/,
        `<!-- PWA:START -->${pwaBlock}<!-- PWA:END -->`,
        'blocco PWA'
    );

    writeFileSync(INDEX, html, 'utf8');
    console.log(`[statics] index.html aggiornato`);
}

// ── Aggiornamento manifest.webmanifest ────────────────────────────────────

function updateManifest(): void {
    // PWA disattivata: rimuove un eventuale manifest residuo di un build precedente (toggle
    // isWebApp true→false), così il sito non resta installabile via un file vecchio.
    if (!IS_WEBAPP) {
        if (existsSync(MANIFEST)) {
            rmSync(MANIFEST);
            console.log('[statics] manifest.webmanifest rimosso (isWebApp:false → sito non installabile)');
        } else {
            console.log('[statics] manifest.webmanifest non generato (isWebApp:false)');
        }
        return;
    }

    const palette = buildPalette();

    const manifest: Record<string, unknown> = {
        name: APP_NAME,
        short_name: APP_NAME,
        // Relativo come scope/start_url, mai un "/" assoluto hardcoded (ogni progetto figlio ha il
        // proprio dominio). Dichiarato esplicito anche se oggi coincide con start_url (spec: id
        // assente vi ricade): un domani start_url con un query param non cambierebbe l'identità installata.
        id: "./",
        description: DESCRIPTION,
        lang: DEFAULT_LANG,
        dir: DIR,
        theme_color: palette.colorPrimary,
        background_color: (FORCE_THEME_TONE ?? palette.naturalTone) === 'light' ? palette.colorBaseLt : palette.colorBaseDk,
        display: "standalone",
        scope: "./",
        start_url: "./",
        // `any` e `maskable` sono DUE file/entry separate (mai un solo "purpose": "any maskable"
        // combinato): un'icona maskable ha già il suo padding di sicurezza, quindi usata anche
        // come `any` apparirebbe più piccola del dovuto fuori da un contesto di masking adattivo.
        icons: [
            {
                src: "icons/icon-192x192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any"
            },
            {
                src: "icons/icon-512x512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any"
            },
            {
                src: "icons/icon-512x512-maskable.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable"
            }
        ],
        version: APP_VERSION
    };

    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 4)}\n`, 'utf8');
    console.log(`[statics] manifest.webmanifest aggiornato`);
}

// ── Generazione robots.txt ────────────────────────────────────────────────

function updateRobots(): void {
    // Pagine protette non elencate (ne rivelerebbe i path): le esclude l'SSR con X-Robots-Tag: noindex.
    const lines = ['User-agent: *', 'Allow: /', '', `Sitemap: ${BASE_URL}/sitemap.xml`];

    writeFileSync(ROBOTS, lines.join('\n') + '\n', 'utf8');
    console.log(`[statics] robots.txt aggiornato`);
}



// ── Generazione theme-init.js (anti-flash tema, pre-idratazione) ───────────

function updateThemeInit(): void {
    // Anti-flash: il tono su <html> prima del primo paint (file esterno: basta script-src 'self' in CSP).
    const script = FORCE_THEME_TONE
        ? `(function () {
    document.documentElement.setAttribute('data-bs-theme', '${FORCE_THEME_TONE}');
}());
`
        : `(function () {
    var t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-bs-theme', t);
}());
`;

    writeFileSync(THEME_INIT, script, 'utf8');
    console.log('[statics] theme-init.js aggiornato');
}

// ── Generazione palette Sass (tema compilato dentro Bootstrap) ──────────────

function updateThemeScss(): void {
    // Brand e design system sono noti in build (global-settings.json + site.ts): la palette si
    // calcola qui una volta e Bootstrap si compila coi colori veri, niente CSS iniettato a runtime.
    const palette = buildPalette();
    mkdirSync(join(THEME_SCSS, '..'), { recursive: true });
    writeFileSync(THEME_SCSS, buildThemeScss(palette, ContestoSito.config), 'utf8');
    console.log('[statics] palette Sass aggiornata');
}

// ── Entry point ───────────────────────────────────────────────────────────

function main(): void {
    const publicDir = join(ROOT, 'public');
    if (!existsSync(publicDir)) {
        mkdirSync(publicDir, { recursive: true });
    }

    updateIndexHtml();
    updateManifest();
    updateRobots();

    updateThemeInit();
    updateThemeScss();
}

main();
