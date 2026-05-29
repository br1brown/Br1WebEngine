// Proxy del dev server Angular (sviluppo locale, backend su localhost:5000).
// La x-api-key viene letta da global-settings.json — stessa sorgente di verità
// usata dal backend e dal Node SSR — così non resta hardcodata e disallineata.
const { readFileSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

// Stessa catena di candidati di server-env.ts: GLOBAL_SETTINGS_PATH (Docker),
// cwd e cartella del file (dev locale: cwd/__dirname = frontend/, il file è in ../).
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
        target: 'http://localhost:5000',
        secure: false,
        changeOrigin: true,
        pathRewrite: { '^/api': '' },
        headers: { 'x-api-key': readApiKey() },
    },
};
