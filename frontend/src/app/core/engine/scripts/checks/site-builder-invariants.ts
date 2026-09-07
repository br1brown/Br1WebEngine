/**
 * Invarianti di SiteBuilder che ogni figlio eredita e potrebbe rompere senza accorgersene (es. un
 * merge che tocca siteBuilder.ts, o una modifica a site.ts che ne cambia i presupposti): un
 * fallimento qui è un difetto dell'Engine, non serve alzare un server per scoprirlo.
 *
 * - auditPaths (Pa11y/Lighthouse in CI, vedi scripts/test/a11y-test.sh e lighthouse-test.sh):
 *   SOLO lingua di default — vedi il commento su isLiveAuditEndpoint in siteBuilder.ts. Una
 *   regressione che tornasse a includere le altre lingue raddoppierebbe (o peggio, con più
 *   lingue) il tempo degli audit live senza che nessuno se ne accorga finché non nota la CI più
 *   lenta.
 * - sitemap: invariante opposta sullo stesso dato di partenza — deve restare multi-lingua
 *   (hreflang) quando il sito ne configura più di una, altrimenti i motori di ricerca smettono
 *   di ricevere le varianti-lingua delle pagine.
 *
 * Uso: tsx site-builder-invariants.ts (wrapper: scripts/test/site-builder-check.sh)
 */
// Richiesto per importare site.ts fuori da un bundle Angular (stesso motivo di
// generate-statics.ts): alcuni injectable delle librerie Angular (es. PlatformLocation)
// vanno in JIT senza il compiler già caricato.
import '@angular/compiler';
import { ContestoSito } from '../../../../site';
import { environment } from '../../../../../environments/environment';

const { defaultLang, availableLanguages } = environment;
const otherLangs = availableLanguages.filter(lang => lang !== defaultLang);

let failures = 0;
function fail(message: string): void {
    console.error(`[site-builder-check] ${message}`);
    failures++;
}

const auditPaths = ContestoSito.getAuditPaths();

for (const path of auditPaths) {
    const firstSegment = path.split('/')[1] ?? '';
    if (otherLangs.includes(firstSegment)) {
        fail(`auditPaths contiene una variante non-default: "${path}" — gli audit live (Pa11y/Lighthouse) devono restare alla sola lingua di default ("${defaultLang}").`);
    }
}

if (new Set(auditPaths).size !== auditPaths.length) {
    fail('auditPaths contiene path duplicati.');
}

if (otherLangs.length > 0) {
    const langsInSitemap = new Set(ContestoSito.getSitemapEntries().map(entry => entry.lang));
    for (const lang of availableLanguages) {
        if (!langsInSitemap.has(lang)) {
            fail(`la sitemap non ha alcuna entry per la lingua "${lang}" — hreflang incompleto.`);
        }
    }
}

if (failures > 0) {
    console.error(`[site-builder-check] ${failures} invariante/i violata/e`);
    process.exit(1);
}

console.log(`[site-builder-check] OK — ${auditPaths.length} auditPaths (solo "${defaultLang}"), sitemap copre ${availableLanguages.length} lingua/e`);
