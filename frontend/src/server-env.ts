/**
 * Variabili d'ambiente lette una volta sola al boot del server Node
 * Unica sorgente di verità per server.ts e app.config.server.ts
 */

const parseAllowedHosts = (value: string | undefined): string[] =>
    (value ?? '')
        .split(',')
        .map((host) => host.trim())
        .filter((host) => host.length > 0);

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const serverEnv = {
    /** Porta su cui girerà il server Node: usa PORT dall'ambiente o il default 3000 */
    port: parsePositiveInt(process.env['PORT'], 3000),

    /** Indirizzo del backend: rimuove lo slash finale se presente per evitare URL malformati (es. //api) */
    backendOrigin: (process.env['BACKEND_ORIGIN'] ?? 'http://backend:8080').replace(/\/$/, ''),

    /** Chiave segreta per le chiamate dal server al backend */
    backendApiKey: process.env['BACKEND_API_KEY'] ?? 'frontend',

    /** Tempo massimo di attesa per le risposte del proxy prima di andare in timeout */
    proxyTimeout: parsePositiveInt(process.env['PROXY_TIMEOUT_MS'], 30_000),

    /** Percorso della cartella contenente i file statici (immagini, ecc.) caricati dall'utente */
    assetsDir: process.env['ASSETS_DIR'] ?? '',

    /** URL canonico del frontend, usato per logging e diagnostica operativa */
    frontendBaseUrl: process.env['FRONTEND_BASE_URL'] ?? '',

    /** Host autorizzati per Angular SSR, letti esclusivamente dall'ambiente */
    allowedHosts: parseAllowedHosts(process.env['NG_ALLOWED_HOSTS']),

    /**
     * Configurazione di Express `trust proxy`. Default: 'loopback, linklocal,
     * uniquelocal' — copre il loopback locale e le subnet private (incluso il
     * bridge Docker) usate dal reverse proxy davanti al container.
     * Sovrascrivibile via env per setup diversi.
     */
    trustProxy: process.env['TRUST_PROXY'] ?? 'loopback, linklocal, uniquelocal',
};
