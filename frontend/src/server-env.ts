/**
 * Variabili d'ambiente lette una volta sola al boot del server Node.
 * Unica sorgente di verità per server.ts e app.config.server.ts.
 */
export const serverEnv = {
    port:          Number(process.env['PORT']              ?? 3000),
    backendOrigin: (process.env['BACKEND_ORIGIN']          ?? 'http://backend:8080').replace(/\/$/, ''),
    backendApiKey: process.env['BACKEND_API_KEY']          ?? 'frontend',
    proxyTimeout:  Number(process.env['PROXY_TIMEOUT_MS']  ?? 30_000),
};
