import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { LEGAL_LINK, STANDARD_SLOTS, type LegalPageSpec, type LegalPartial } from '../../legal/legal-pages';

/** File di sistema e backup degli editor: non sono testi legali, il check li salta. */
const IGNORED_FILE = /^\.|^Thumbs\.db$|^desktop\.ini$|~$|\.swp$|\.bak$/i;

/** File di lingua dentro la cartella di una parte: `it.md`, `en.md`… */
const LANG_FILE = /^([a-z]{2,3})\.md$/;

/** Parti presenti di una pagina: `intro`, `outro`, `<parte>`, `<parte>/off` → lingue che hanno il file.
 *  Ogni voce inattesa (file sciolto, cartella o file dal nome non previsto) finisce in `errors`. */
function scanPage(dir: string, slug: string, allowed: readonly string[], errors: string[]): Map<string, Set<string>> {
    const units = new Map<string, Set<string>>();
    const visible = (d: string) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }) : []).filter(e => !IGNORED_FILE.test(e.name));
    for (const entry of visible(dir)) {
        if (!entry.isDirectory() || !allowed.includes(entry.name)) {
            errors.push(`${slug}/${entry.name}: non previsto (ammesse le cartelle ${allowed.join(', ')}, ognuna con <lingua>.md)`);
            continue;
        }
        const scanUnit = (unit: string, unitDir: string, allowOff: boolean) => {
            const langs = new Set<string>();
            units.set(unit, langs);
            for (const file of visible(unitDir)) {
                const lang = LANG_FILE.exec(file.name)?.[1];
                if (file.isFile() && lang) langs.add(lang);
                else if (allowOff && file.isDirectory() && file.name === 'off') scanUnit(`${unit}/off`, join(unitDir, 'off'), false);
                else errors.push(`${slug}/${unit}/${file.name}: non previsto (ammessi <lingua>.md${allowOff ? ' e la cartella off/' : ''})`);
            }
        };
        // `off/` (testo a funzione spenta) esiste solo per le parti legate a una funzione.
        scanUnit(entry.name, join(dir, entry.name), entry.name !== 'intro' && entry.name !== 'outro');
    }
    return units;
}

/** Apre con il titolo della pagina (`# `), tolti BOM e righe vuote iniziali. */
function opensWithTitle(file: string): boolean {
    return /^# \S/.test(readFileSync(file, 'utf-8').trimStart());
}

/** Link `policy:<slot>` con uno slot che non esiste (errore di battitura: il link non si risolverebbe mai). */
function badLegalLinks(file: string, label: string, errors: string[]): void {
    for (const [, , slot] of readFileSync(file, 'utf-8').matchAll(LEGAL_LINK)) {
        if (!(STANDARD_SLOTS as readonly string[]).includes(slot)) {
            errors.push(`${label}: link policy:${slot} non valido (slot: ${STANDARD_SLOTS.join(', ')})`);
        }
    }
}

/** Verifica i testi delle pagine legali gestite dall'Engine, sulle lingue del sito. Pagina composta:
 *  `assets/legal/<pagina>/<parte>/<lingua>.md` con soli nomi previsti dalla ricetta, `intro` presente e aperta
 *  da `# `, ogni parte attiva presente, ogni cartella completa in tutte le lingue (una lingua o una parte
 *  nuova si notano subito). Pagina con `markdown` (sostitutivo o `extra`): `assets/legal/<markdown>.<lingua>.md`
 *  in ogni lingua, aperto da `# `. Nomi e unicità dei `markdown` li controlla `resolveLegalPages`. Il resto di
 *  `assets/legal/` (altri Markdown, allegati, cartelle del progetto) non lo guarda: il progetto ci tiene ciò che vuole. */
export function checkLegalFolders(
    legalDir: string,
    pages: readonly LegalPageSpec[],
    languages: readonly string[],
    active: Record<LegalPartial, boolean>,
): string[] {
    const errors: string[] = [];
    for (const page of pages) {
        if (page.markdown != null) {
            for (const lang of languages) {
                const name = `${page.markdown}.${lang}.md`;
                const file = join(legalDir, name);
                if (!existsSync(file)) errors.push(`${name}: manca`);
                else if (!opensWithTitle(file)) errors.push(`${name}: deve aprire con il titolo della pagina (\`# Titolo\`)`);
                if (existsSync(file)) badLegalLinks(file, name, errors);
            }
            continue;
        }

        const slug = page.folder!;
        const dir = join(legalDir, slug);
        const partials = page.recipe.partials ?? [];
        const units = scanPage(dir, slug, ['intro', 'outro', ...partials], errors);

        if (!units.has('intro')) errors.push(`${slug}/intro/: manca`);
        for (const partial of partials) {
            if (active[partial] && !units.has(partial)) errors.push(`${slug}/${partial}/: manca, e la funzione è attiva`);
        }
        // Ogni cartella presente ha un file per ogni lingua del sito.
        for (const [unit, langs] of units) {
            for (const lang of languages) {
                if (!langs.has(lang)) errors.push(`${slug}/${unit}/${lang}.md: manca`);
                else badLegalLinks(join(dir, unit, `${lang}.md`), `${slug}/${unit}/${lang}.md`, errors);
            }
        }
        for (const lang of languages) {
            const intro = join(dir, 'intro', `${lang}.md`);
            if (existsSync(intro) && !opensWithTitle(intro)) {
                errors.push(`${slug}/intro/${lang}.md: deve aprire con il titolo della pagina (\`# Titolo\`)`);
            }
        }
    }
    return errors;
}

/** Per ogni pagina legale composta, le parti presenti (`intro`, `outro`, `<parte>`, `<parte>/off`): il resolver carica
 *  solo queste, così un testo facoltativo assente non diventa mai una richiesta a vuoto (404 nel browser,
 *  richiesta del server a sé stesso in SSR). Da chiamare dopo `checkLegalFolders`, che garantisce ogni
 *  lingua del sito in ogni cartella presente. */
export function listLegalFiles(legalDir: string, pages: readonly LegalPageSpec[]): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const page of pages.filter(p => p.markdown == null)) {
        const units = scanPage(join(legalDir, page.folder!), page.folder!,
            ['intro', 'outro', ...(page.recipe.partials ?? [])], []);
        out[page.folder!] = [...units.keys()].sort();
    }
    return out;
}

/** Chi è e come si contatta il titolare (art. 13.1.a GDPR), da `backend/data/identity.json`: la Privacy composta dall'Engine
 *  lo mostra nella sezione identità e senza non è un'informativa. Nome: `ragioneSociale` o `titolareDelTrattamento.nome`;
 *  recapito: email, PEC o telefono di `contatti`, o `titolareDelTrattamento.email`. `backendDir` assente (build Docker del
 *  solo frontend) = controllo saltato: lo fanno il build locale e la CI, che vedono il repository intero. */
export function checkControllerIdentity(backendDir: string): string[] {
    if (!existsSync(backendDir)) return [];
    const file = join(backendDir, 'data', 'identity.json');
    const where = 'backend/data/identity.json';
    if (!existsSync(file)) {
        return [`${where}: manca, e la Privacy Policy non avrebbe il titolare del trattamento (se l'identità viene da un ` +
            `IIdentityStore proprio invece che dal file, questo controllo — statico, letto a build-time del frontend, prima ` +
            `che il backend giri — non lo sa: o tieni il file come sorgente di riserva sempre allineata, o passa la Privacy a ` +
            `\`markdown\` in site.ts, che salta il controllo del tutto)`];
    }
    let id: Record<string, unknown>;
    try { id = JSON.parse(readFileSync(file, 'utf-8').replace(/^﻿/, '')) as Record<string, unknown>; }
    catch (e) { return [`${where}: JSON non valido (${(e as Error).message})`]; }
    const filled = (v: unknown): boolean => typeof v === 'string' ? v.trim() !== ''
        : typeof v === 'object' && v !== null && Object.values(v).some(x => typeof x === 'string' && x.trim() !== '');
    const obj = (v: unknown) => (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
    const titolare = obj(id['titolareDelTrattamento']);
    const contatti = obj(id['contatti']);
    const errors: string[] = [];
    if (!filled(id['ragioneSociale']) && !filled(titolare['nome'])) {
        errors.push(`${where}: la Privacy Policy vuole il titolare del trattamento: valorizza ragioneSociale (o titolareDelTrattamento.nome)`);
    }
    if (![contatti['email'], contatti['pec'], contatti['telefono'], titolare['email']].some(filled)) {
        errors.push(`${where}: la Privacy Policy vuole un recapito del titolare: valorizza contatti.email, contatti.pec o contatti.telefono (o titolareDelTrattamento.email)`);
    }
    return errors;
}
