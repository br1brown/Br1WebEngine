/**
 * Variabili d'ambiente lette una volta sola al boot del server Node
 * Unica sorgente di verità per server.ts e app.config.server.ts
 */

const parseAllowedHosts = (value: string | undefined): string[] =>
    (value ?? '')
        .split(',')
        .map((host) => host.trim())
        .filter((host) => host.length > 0);

export const serverEnv = {
    /** Porta su cui girerà il server Node: usa PORT dall'ambiente o il default 3000 */
    port: Number(process.env['PORT'] ?? 3000),

    /** Indirizzo del backend: rimuove lo slash finale se presente per evitare URL malformati (es. //api) */
    backendOrigin: (process.env['BACKEND_ORIGIN'] ?? 'http://backend:8080').replace(/\/$/, ''),

    /** Chiave segreta per le chiamate dal server al backend */
    backendApiKey: process.env['BACKEND_API_KEY'] ?? 'frontend',

    /** Tempo massimo di attesa per le risposte del proxy prima di andare in timeout */
    proxyTimeout: Number(process.env['PROXY_TIMEOUT_MS'] ?? 30_000),

    /** Percorso della cartella contenente i file statici (immagini, ecc.) caricati dall'utente */
    assetsDir: process.env['ASSETS_DIR'] ?? '',

    /** URL canonico del frontend, usato per logging e diagnostica operativa */
    frontendBaseUrl: process.env['FRONTEND_BASE_URL'] ?? '',

    /** Host autorizzati per Angular SSR, letti esclusivamente dall'ambiente */
    allowedHosts: parseAllowedHosts(process.env['NG_ALLOWED_HOSTS']),
};
