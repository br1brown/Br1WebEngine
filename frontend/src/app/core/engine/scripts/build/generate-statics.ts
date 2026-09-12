/**
 * Sincronizza i file statici con la configurazione centrale del sito.
 *
 * Aggiorna:
 * - src/index.html           → lang, title, theme-color, meta PWA
 * - src/environments/environment.ts → identità/estetica del progetto iniettate nel bundle
 * - public/manifest.webmanifest → nome, descrizione, colori
 * - public/robots.txt        → user-agent, disallow, sitemap URL
 * - public/theme-init.js     → script anti-flash del tema, referenziato da index.html
 *
 * security.txt (RFC 9116), sitemap.xml e llms.txt NON sono qui: sono endpoint runtime,
 * non file di build — il contatto viene dall'identità del sito, mentre sitemap/llms
 * includono rotte dinamiche (es. catalogo) non enumerabili a build time.
 *
 * Solo index.html ed environment.ts sono generati MA versionati (seed: type-check e build
 * passano anche prima della prima esecuzione). Tutto ciò che finisce in public/ (manifest,
 * robots, theme-init, icons) è solo output di build, gitignored
 * (public/ è ignorata per intero): lo rigenera il pre-hook prebuild.
 *
 * Eseguire con:
 *   npm run generate:statics
 *
 * Variabile d'ambiente:
 *   FRONTEND_BASE_URL — URL base del sito (default: https://example.com con warning)
 *
 * Esclusioni robots automatiche (gestite dal siteBuilder):
 *   - Pagine disabilitate (enabled: false)
 *   - Pagine esterne (externalUrl)
 *   - Pagine protette da autenticazione (requiresAuth: true)
 */

// Necessario: carica il JIT compiler di Angular così i decoratori @Injectable
// funzionano quando Node.js importa site.ts e il suo grafo di dipendenze.
import '@angular/compiler';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { ContestoSito } from '../../../../site';
import { ThemeService } from '../../services/theme.service';
import { fingerprintIdentitySections } from '../config/config-fingerprint';
import { deepMergeSettings } from '../config/settings-merge';
import { getLastModifiedDate } from '../config/last-modified';
import type { GlobalSettings } from '../../global-settings.types';

const ROOT = join(__dirname, '../../../../../../');

// Config di progetto a build-time. Sorgente: global-settings.json (sezioni project /
// Localization / site). Nel build dell'immagine Docker il file (nella root del repo) NON è
// nel build context (./frontend), quindi scripts/deploy.sh passa il suo contenuto minificato come
// build ARG BR1_PROJECT_JSON (solo config di progetto, NIENTE segreti). Su host/CI il file
// c'è e si legge direttamente (guardato). FRONTEND_BASE_URL resta un ARG a parte (deploy).
// Tipizzato con GlobalSettings (generato dallo schema, `npm run generate:types`): le letture sono
// type-safe, un typo di chiave (es. `Localizaton`) è errore a `tsc`.
function readProjectSettings(): GlobalSettings {
    // BR1_PROJECT_JSON (build Docker): SOLO il file base, mai fuso con .local.json qui — è
    // il confine di sicurezza voluto (vedi commento sopra l'export in br1-config.sh): i segreti
    // di .local.json non devono finire in un build ARG. Il flusso automatico non mette mai
    // identità/tema in .local.json (br1_ensure_local_secrets scrive solo frontend/backend/
    // Security), quindi seguendo la convenzione questo ramo non diverge mai dal runtime.
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

    // Fusa con global-settings.local.json se presente, stessa deepMergeSettings usata da
    // server-env.ts al boot (vedi config/settings-merge.ts): letture da file (dev locale/CI, non il
    // ramo BR1_PROJECT_JSON sopra) devono vedere la stessa identità che vedrà il runtime,
    // altrimenti un progetto che (contro convenzione) mette identità/tema in .local.json
    // farebbe scattare l'avviso "environment.ts disallineato" a ogni riavvio, pure appena
    // dopo un generate:statics pulito.
    const localCandidates = [
        join(ROOT, '../global-settings.local.json'),
        join(ROOT, 'global-settings.local.json'),
    ];
    for (const p of localCandidates) {
        try {
            if (existsSync(p)) {
                const local = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
                return deepMergeSettings(base as unknown as Record<string, unknown>, local) as GlobalSettings;
            }
        } catch { /* file illeggibile: ignora l'override, resta il solo base */ }
    }
    return base;
}

const _settings = readProjectSettings();
// Scritta in environment.ts più sotto; letta di nuovo al boot da server.ts per accorgersi se
// qualcuno lancia `ng serve` senza rigenerare gli statici dopo una modifica a global-settings.json.
const CONFIG_FINGERPRINT = fingerprintIdentitySections(_settings);
const _fileLoc = _settings.Localization ?? {};
const _fileProject = _settings.project ?? {};
// Config di sito: solo identità/estetica finisce in environment.ts. I flag di
// COMPORTAMENTO (showNav/showFooter/showPanel/fixedTopHeader/showBrandIconInHeader/
// showLoginInHeader/showNotifications/panelForcedLight/isWebApp/onlyPlainImage) sono migrati in site.ts,
// quindi vengono filtrati via qui anche se un vecchio JSON li contiene ancora.
const SITE_CONFIG = _settings.site ?? {};
const SITE_AESTHETIC_KEYS = ['description', 'colorTema', 'colorSecondary', 'colorBackground', 'colorText', 'colorInfo', 'smoke'];

// Identità dell'app — fonte unica: project.name / project.version.
const APP_NAME = _fileProject.name || 'App';
const APP_VERSION = _fileProject.version || '1.0.0';
const COLOR_TEMA = SITE_CONFIG.colorTema ?? '#888888';
const COLOR_OVERRIDES = {
    secondary: SITE_CONFIG.colorSecondary,
    background: SITE_CONFIG.colorBackground,
    text: SITE_CONFIG.colorText,
    info: SITE_CONFIG.colorInfo,
};

// PWA on/off — fonte unica: ContestoSito.config.isWebApp (site.ts). Guida la generazione
// dei TRIGGER di installabilità: il manifest e, in index.html, <link rel="manifest"> più i
// meta mobile-web-app-capable / apple-mobile-web-app-*. Quando è false il sito non deve
// essere installabile (nessun prompt "Aggiungi a schermata Home"), quindi questi elementi
// non vengono scritti. La de-registrazione runtime del Service Worker è già gestita da
// cookie-consent.service.ts; qui agiamo solo sul lato generazione statici.
const IS_WEBAPP = ContestoSito.config.isWebApp;

const _normLang = (tag: unknown): string | null => {
    if (typeof tag !== 'string' || !tag.trim()) return null;
    try { return new Intl.Locale(tag.trim()).language ?? null; } catch { return null; }
};

// Lingue di build dai codici dichiarati in global-settings.json (Localization): le leggono i
// consumatori sincroni a module-load (routing per-lingua, fallback di pickLocaleText, shell
// statica). Gli stessi codici alimentano la cultura runtime derivata via Intl (LocalizationService);
// l'SSR riscrive comunque lang/meta per richiesta.
const _defaultRaw   = _fileLoc.DefaultLanguage;
const _supportedRaw = _fileLoc.SupportedLanguages;

const DEFAULT_LANG = _normLang(_defaultRaw) ?? 'it';
// `?? [DEFAULT_LANG]` da solo copre solo null/undefined: uno `SupportedLanguages: []` esplicito (mai
// validato a runtime, lo schema JSON lo vieta solo sulla carta) lo attraverserebbe intatto, producendo
// AVAILABLE_LANGS=[] → routing.ts/siteBuilder.ts costruiscono zero rotte/sitemap dal build in poi,
// senza errore. Stesso guard di scripts/test/i18n-check.sh: fallback su array vuoto O dopo la
// normalizzazione (tag tutti malformati filtrati via) se il risultato resta vuoto.
const _normalizedSupported = (_supportedRaw && _supportedRaw.length > 0 ? _supportedRaw : [DEFAULT_LANG])
    .map(_normLang)
    .filter((l): l is string => l !== null)
    .filter((v, i, a) => a.indexOf(v) === i); // deduplication
const AVAILABLE_LANGS = _normalizedSupported.length > 0 ? _normalizedSupported : [DEFAULT_LANG];

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
    const dir = RTL_LANGUAGES.has(DEFAULT_LANG) ? 'rtl' : 'ltr';
    const ogLocale = escapeHtml(toOpenGraphLocale(DEFAULT_LANG));
    // 'default' è sicuro per qualsiasi tema: apple-mobile-web-app-status-bar-style
    // non supporta media queries e non può adattarsi all'OS preference a runtime.
    const iosStatusBar = 'default';

    let html = readFileSync(INDEX, 'utf8');

    // Regex flessibile: matcha <html> con qualsiasi combinazione di attributi, riscrive solo lang.
    html = replaceTag(html, /<html\b[^>]*>/, `<html lang="${lang}" dir="${dir}">`, '<html lang>');
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

    // Genera il file TS con identità, lingue e config di sito per il frontend (invece di esporre
    // JSON nel meta tag). Sorgente: global-settings.json (project / Localization / site). Le lingue
    // qui sono il seed di build (shell, fallback pickLocaleText, pagina cookie); la cultura runtime
    // (nomi nativi, giorni, formati) la deriva il frontend via Intl.
    const generatedTsPath = join(ROOT, 'src', 'environments', 'environment.ts');
    const generatedTsContent = `// FILE GENERATO AUTOMATICAMENTE DA scripts/build/generate-statics.ts
// Non modificare manualmente. Sorgente di verità: global-settings.json (sezioni project / Localization / site)

export interface AppSiteConfig {
    description?: Record<string, string>;
    colorTema?: string;
    colorSecondary?: string;
    colorBackground?: string;
    colorText?: string;
    colorInfo?: string;
    smoke?: {
        enable?: boolean;
        color?: string;
        opacity?: number;
        maximumVelocity?: number;
        particleRadius?: number;
        density?: number;
    };
}

export interface AppEnvironment {
    appName: string;
    version: string;
    defaultLang: string;
    availableLanguages: string[];
    config: AppSiteConfig;
    /** Impronta di project/Localization/site al momento della generazione (vedi
     *  core/engine/scripts/config/config-fingerprint.ts). server.ts la confronta con quella
     *  ricalcolata al boot per accorgersi se global-settings.json è cambiato da allora
     *  senza rilanciare generate:statics (es. \`ng serve\` lanciato senza i pre-hook npm). */
    configFingerprint: string;
}

export const environment: AppEnvironment = {
    appName: ${JSON.stringify(APP_NAME)},
    version: ${JSON.stringify(APP_VERSION)},
    defaultLang: '${DEFAULT_LANG}',
    availableLanguages: ${JSON.stringify(AVAILABLE_LANGS)},
    config: ${JSON.stringify(SITE_CONFIG_OUT, null, 8).replace(/\n/g, '\n    ')},
    configFingerprint: ${JSON.stringify(CONFIG_FINGERPRINT)}
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

    // theme-init.js DEVE essere referenziato con path ASSOLUTO: lo <script> sta prima
    // di <base href>, quindi un path relativo risolverebbe contro la rotta corrente
    // (es. /sezione/theme-init.js → 404) sulle pagine annidate. Forzato qui così è
    // deterministico e sopravvive a un'eventuale reintroduzione del path relativo.
    html = replaceTag(
        html,
        /<script\s+src="\/?theme-init\.js"><\/script>/,
        '<script src="/theme-init.js"></script>',
        '<script theme-init>'
    );

    // ── Blocco PWA deterministico ────────────────────────────────────────────
    // I trigger di installabilità (manifest + meta) vivono in un blocco delimitato da
    // marker, rigenerato per intero da qui: con IS_WEBAPP vengono iniettati, altrimenti
    // rimossi del tutto. Così l'installabilità non dipende mai da tag hardcoded nel seed.
    // Solo marker nudi (PWA:START/END) nell'HTML servito: nessun path di build né nome di
    // flag di config nel sorgente pubblico. Quando IS_WEBAPP è false il blocco resta vuoto
    // (niente manifest né meta di installabilità), senza commenti che ne spieghino il perché.
    const pwaBlock = IS_WEBAPP
        ? '\n    ' + [
            '<meta name="mobile-web-app-capable" content="yes">',
            `<meta name="apple-mobile-web-app-status-bar-style" content="${iosStatusBar}">`,
            `<meta name="apple-mobile-web-app-title" content="${appName}">`,
            '<link rel="apple-touch-icon" href="icons/icon-512x512.png">',
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
    // PWA disattivata: nessun manifest installabile. Se un manifest era stato generato da
    // un build precedente (toggle isWebApp da true a false) lo rimuoviamo, così il sito non
    // resta installabile via un file residuo. public/ è gitignored: il manifest vive solo
    // come artefatto di build, mai nel repo — niente da versionare in questo ramo.
    if (!IS_WEBAPP) {
        if (existsSync(MANIFEST)) {
            rmSync(MANIFEST);
            console.log('[statics] manifest.webmanifest rimosso (isWebApp:false → sito non installabile)');
        } else {
            console.log('[statics] manifest.webmanifest non generato (isWebApp:false)');
        }
        return;
    }

    const palette = ThemeService.computePalette(COLOR_TEMA, COLOR_OVERRIDES);

    const manifest: Record<string, unknown> = {
        name: APP_NAME,
        short_name: APP_NAME,
        description: DESCRIPTION,
        lang: DEFAULT_LANG,
        theme_color: palette.colorPrimary,
        background_color: palette.naturalTone === 'light' ? palette.colorBaseLt : palette.colorBaseDk,
        display: "standalone",
        scope: "./",
        start_url: "./",
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
                purpose: "any maskable"
            }
        ],
        version: APP_VERSION
    };

    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 4)}\n`, 'utf8');
    console.log(`[statics] manifest.webmanifest aggiornato`);
}

// ── Generazione robots.txt ────────────────────────────────────────────────

function updateRobots(): void {
    // Le pagine protette (`requiresAuth`) NON vengono più elencate come `Disallow`: un
    // `robots.txt` è pubblico, quindi enumerarle ne rivelerebbe i path. La non-indicizzazione
    // è ottenuta in modo più solido a runtime dal server SSR con `X-Robots-Tag: noindex` su
    // quelle rotte (vedi server.ts), che vale anche per i crawler che ignorano robots.txt.
    // La disattivazione globale dell'indicizzazione (staging) è gestita dal server via
    // SEO_NOINDEX, che serve un robots.txt dinamico `Disallow: /` sovrascrivendo questo file.
    const lines = ['User-agent: *', 'Allow: /', '', `Sitemap: ${BASE_URL}/sitemap.xml`];

    writeFileSync(ROBOTS, lines.join('\n') + '\n', 'utf8');
    console.log(`[statics] robots.txt aggiornato`);
}



// ── Generazione theme-init.js (anti-flash tema, pre-idratazione) ───────────

function updateThemeInit(): void {
    // Script anti-flash: imposta data-bs-theme / data-theme-tone su <html> prima che
    // Bootstrap carichi qualsiasi stile. Referenziato da <script src="theme-init.js"> in
    // index.html, eseguito sincrono (no defer/async) nel <head> così non c'è un ciclo di
    // rendering col tono sbagliato. È uno script esterno, non inline: coperto da
    // script-src 'self' nella CSP, quindi non serve né hash né nonce. È un asset statico
    // servito da express.static: va materializzato qui perché public/ è gitignored,
    // altrimenti mancherebbe su un checkout/build pulito (404 + MIME error a ogni full load).
    const script = `(function () {
    var t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var el = document.documentElement;
    el.setAttribute('data-bs-theme', t);
    el.setAttribute('data-theme-tone', t);
}());
`;

    writeFileSync(THEME_INIT, script, 'utf8');
    console.log('[statics] theme-init.js aggiornato');
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
}

main();
