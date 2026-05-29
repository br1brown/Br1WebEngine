// Proxy del dev server Angular (dev in Docker, backend sul container 'backend:8080').
// La x-api-key viene letta da global-settings.json — stessa sorgente di verità
// usata dal backend e dal Node SSR — così non resta hardcodata e disallineata.
const { readFileSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

// Stessa catena di candidati di server-env.ts. In Docker il file è montato in
// /app/global-settings.json (GLOBAL_SETTINGS_PATH o cwd=/app), NON in ../ rispetto
// alla cartella del proxy: per questo non basta __dirname/../global-settings.json.
function readApiKey() {
    const candidates = [
        process.env.GLOBAL_SETTINGS_PATH,
        resolve(process.cwd(), 'global-settings.json'),
        join(__dirname, 'global-settings.json'),
        join(__dirname, '../global-settings.json'),
    ].filter(Boolean);

    for (const p of candidates) {
        try {
            if (existsSync(p)) {
                const s = JSON.parse(readFileSync(p, 'utf-8'));
                return s?.Security?.ApiKeys?.[0] ?? 'frontend';
            }
        } catch { /* file illeggibile: prova il prossimo candidato */ }
    }
    return 'frontend';
}

module.exports = {
    '/api': {
        target: 'http://backend:8080',
        secure: false,
        changeOrigin: true,
        pathRewrite: { '^/api': '' },
        headers: { 'x-api-key': readApiKey() },
    },
};
