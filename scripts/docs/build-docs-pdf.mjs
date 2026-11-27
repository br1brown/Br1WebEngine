#!/usr/bin/env node
/**
 * Raccoglie tutta la documentazione Markdown del repo in un unico PDF, diviso in
 * grandi capitoli, con copertina, indice cliccabile e segnalibri. Non modifica
 * nessun file di documentazione: legge, converte, scrive solo nell'output.
 *
 * Uso:   node scripts/docs/build-docs-pdf.mjs [opzioni]
 *        --out <file.pdf>    destinazione (default: dist/docs/Br1WebEngine-documentazione.pdf)
 *        --no-changelog      salta il CHANGELOG (da solo è più di metà del volume)
 *        --html-only         produce solo l'HTML, senza PDF (utile per ispezionarlo)
 *
 * Requisiti: `pandoc` nel PATH e un Chromium/Chrome (Playwright se risolvibile,
 * altrimenti un binario trovato nel PATH o indicato in CHROME_PATH).
 *
 * Per aggiungere o togliere un documento, modifica CHAPTERS qui sotto.
 */
import { spawnSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Capitoli, nell'ordine in cui compaiono. Ogni capitolo raccoglie uno o più file
 * (percorsi dalla radice del repo). Fuori di proposito: i template di issue/PR
 * (`.github/ISSUE_TEMPLATE`, `PULL_REQUEST_TEMPLATE.md`) e i testi legali in
 * `frontend/src/assets/legal/`, che sono contenuto del sito e non documentazione.
 */
const CHAPTERS = [
    { title: 'Panoramica del progetto', files: ['README.md'] },
    { title: 'Quickstart', files: ['QUICKSTART.md'] },
    { title: 'Regole e ricette (AGENTS)', files: ['AGENTS.md'] },
    { title: 'Implementazione interna dell\'Engine', files: ['ENGINE.md'] },
    { title: 'Frontend', files: ['frontend/README.md'] },
    { title: 'Backend', files: ['backend/README.md'] },
    { title: 'Docker e infrastruttura', files: ['DOCKER_README.md'] },
    { title: 'Rilascio', files: ['RELEASE.md'] },
    {
        title: 'Contribuire, sicurezza e codice di condotta',
        files: ['.github/CONTRIBUTING.md', '.github/SECURITY.md', '.github/CODE_OF_CONDUCT.md'],
    },
    { title: 'Changelog', files: ['CHANGELOG.md'], optional: 'changelog' },
];

// ── Argomenti ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valueOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const outPdf = path.resolve(valueOf('--out') ?? path.join(ROOT, 'dist', 'docs', 'Br1WebEngine-documentazione.pdf'));
const outHtml = outPdf.replace(/\.pdf$/i, '') + '.html';
const skipChangelog = flag('--no-changelog');
const htmlOnly = flag('--html-only');

const log = (m) => console.log(`[docs-pdf] ${m}`);
const fail = (m) => { console.error(`[docs-pdf] ERRORE: ${m}`); process.exit(1); };

// ── Utilità ─────────────────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, '\'').trim();
const posix = (p) => p.split(path.sep).join('/');

function git(cmd) {
    try { return execSync(`git ${cmd}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
    catch { return ''; }
}

// ── Conversione Markdown → HTML (un file alla volta, id con prefisso) ───────
if (spawnSync('pandoc', ['-v']).status !== 0) fail('pandoc non trovato nel PATH (https://pandoc.org/installing.html).');

const chapters = CHAPTERS
    .filter((c) => !(skipChangelog && c.optional === 'changelog'))
    .map((c, ci) => ({
        ...c,
        id: `cap${ci + 1}`,
        files: c.files.map((rel, fi) => ({ rel, id: `c${ci + 1}f${fi + 1}`, prefix: `c${ci + 1}f${fi + 1}-` })),
    }));

const byPath = new Map();
for (const ch of chapters) for (const f of ch.files) byPath.set(f.rel, f);

for (const ch of chapters) {
    for (const f of ch.files) {
        const abs = path.join(ROOT, f.rel);
        if (!existsSync(abs)) fail(`file mancante: ${f.rel}`);
        log(`converto ${f.rel}`);
        const r = spawnSync('pandoc', [
            '-f', 'gfm', '-t', 'html5', '--wrap=none',
            '--shift-heading-level-by=1',          // il titolo del file (H1) diventa H2 sotto quello del capitolo
            `--id-prefix=${f.prefix}`,
            '--highlight-style=tango',
        ], { input: readFileSync(abs), maxBuffer: 1 << 29 });
        if (r.status !== 0) fail(`pandoc su ${f.rel}: ${r.stderr}`);
        f.html = r.stdout.toString('utf8');
        f.ids = new Set([...f.html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    }
}

// ── Link: i riferimenti fra i documenti diventano interni al PDF ────────────
let internal = 0, dropped = 0;
for (const ch of chapters) {
    for (const f of ch.files) {
        const dir = path.posix.dirname(f.rel);
        f.html = f.html
            .replace(/<a\s([^>]*?)href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g, (all, pre, href, post, inner) => {
                if (href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) return all;   // ancora locale o URL assoluto: invariato
                const [rawPath, hash = ''] = href.split('#');
                const target = byPath.get(path.posix.normalize(path.posix.join(dir, decodeURI(rawPath))));
                if (!target) {                                                               // file fuori dal PDF (codice, asset…): resta il testo
                    dropped++;
                    return `<span class="dead-link">${inner}</span>`;
                }
                internal++;
                const wanted = target.prefix + hash;
                const to = hash && target.ids.has(wanted) ? wanted : `${target.id}-top`;
                return `<a ${pre}href="#${to}"${post}>${inner}</a>`;
            })
            // immagini relative → file:// assoluto, così Chromium le trova
            .replace(/(<img\s[^>]*?src=")([^":]+)(")/g, (all, a, src, b) =>
                /^(https?:|data:|file:)/i.test(src) ? all : `${a}${pathToFileURL(path.join(ROOT, dir, src)).href}${b}`);
    }
}
log(`link fra documenti risolti: ${internal}; verso file non inclusi (lasciati come testo): ${dropped}`);

// ── Indice (cliccabile; i numeri di pagina non sono calcolabili qui, i segnalibri del PDF coprono la navigazione) ──
function headingsOf(f, maxLevel) {
    return [...f.html.matchAll(/<h([1-6])\s[^>]*?id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)]
        .filter((m) => Number(m[1]) <= maxLevel)
        .map((m) => ({ level: Number(m[1]), id: m[2], text: stripTags(m[3]) }));
}
const tocHtml = chapters.map((ch, i) => {
    const rows = ch.files.flatMap((f) => headingsOf(f, 3)).map((h) =>
        `<li class="toc-l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`).join('\n');
    return `<li class="toc-chapter"><a href="#${ch.id}"><span class="num">${i + 1}.</span> ${esc(ch.title)}</a>\n<ul>${rows}</ul></li>`;
}).join('\n');

// ── Documento finale ────────────────────────────────────────────────────────
const commit = git('rev-parse --short HEAD');
const today = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const docTitle = 'Br1WebEngine: documentazione';

const body = chapters.map((ch, i) => {
    const files = ch.files.map((f) => `<section class="doc" id="${f.id}-top">\n${f.html}\n</section>`).join('\n');
    const src = ch.files.map((f) => `<code>${esc(f.rel)}</code>`).join(', ');
    return `<section class="chapter" id="${ch.id}">
<header class="chapter-head"><div class="chapter-kicker">Capitolo ${i + 1}</div><h1>${esc(ch.title)}</h1><p class="chapter-src">Fonte: ${src}</p></header>
${files}
</section>`;
}).join('\n');

const css = `
@page { size: A4; margin: 0; }
:root { --ink:#1b1f24; --muted:#5b6570; --line:#d6dbe0; --soft:#f4f6f8; --accent:#1f4f8f; }
* { box-sizing: border-box; }
html { font-size: 10pt; }
body { margin: 0; color: var(--ink); background: #fff; line-height: 1.5;
  font-family: "Noto Sans", "DejaVu Sans", "Segoe UI", Helvetica, Arial, sans-serif; overflow-wrap: anywhere; }
.cover { height: 257mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; border-left: 6px solid var(--accent); padding-left: 14mm; }
.cover h1 { font-size: 34pt; margin: 0 0 6mm; line-height: 1.15; }
.cover p { margin: 0 0 2mm; color: var(--muted); font-size: 12pt; }
.toc { page-break-after: always; }
.toc h1 { font-size: 20pt; border-bottom: 2px solid var(--accent); padding-bottom: 2mm; }
.toc ul { list-style: none; margin: 0; padding: 0; }
.toc-chapter { margin-top: 5mm; break-inside: avoid-page; }
.toc-chapter > a { font-size: 12pt; font-weight: 700; }
.toc-chapter ul { margin-top: 1mm; }
.toc li { margin: 0; }
.toc-l2 { padding-left: 4mm; font-size: 9pt; }
.toc-l3 { padding-left: 9mm; font-size: 8.5pt; color: var(--muted); }
.toc a { color: inherit; text-decoration: none; }
.chapter { page-break-before: always; }
.chapter-head { border-bottom: 3px solid var(--accent); margin-bottom: 8mm; padding-bottom: 3mm; }
.chapter-kicker { text-transform: uppercase; letter-spacing: .12em; font-size: 9pt; color: var(--accent); font-weight: 700; }
.chapter-head h1 { font-size: 26pt; margin: 1mm 0 2mm; line-height: 1.15; }
.chapter-src { margin: 0; color: var(--muted); font-size: 9pt; }
.doc + .doc { page-break-before: always; }
h2 { font-size: 17pt; margin: 9mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 1px solid var(--line); break-after: avoid; }
h3 { font-size: 13.5pt; margin: 7mm 0 2mm; break-after: avoid; }
h4 { font-size: 11.5pt; margin: 5mm 0 2mm; break-after: avoid; }
h5, h6 { font-size: 10.5pt; margin: 4mm 0 1.5mm; break-after: avoid; }
p, ul, ol, blockquote, table, pre { margin: 0 0 3mm; }
ul, ol { padding-left: 6mm; }
li { margin: .6mm 0; }
a { color: var(--accent); text-decoration: none; }
a[href^="http"]:after { content: ""; }
.dead-link { border-bottom: 1px dotted var(--muted); }
code { font-family: "DejaVu Sans Mono", "Noto Sans Mono", Menlo, Consolas, monospace; font-size: .88em;
  background: var(--soft); padding: .1em .3em; border-radius: 3px; }
pre { background: var(--soft); border: 1px solid var(--line); border-radius: 4px; padding: 3mm; white-space: pre-wrap; word-break: break-word; font-size: 8pt; line-height: 1.4; }
pre code { background: none; padding: 0; font-size: inherit; }
blockquote { border-left: 3px solid var(--line); margin-left: 0; padding: .5mm 0 .5mm 4mm; color: var(--muted); }
table { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
th, td { border: 1px solid var(--line); padding: 1.2mm 2mm; vertical-align: top; text-align: left; }
th { background: var(--soft); }
tr { break-inside: avoid; }
hr { border: 0; border-top: 1px solid var(--line); margin: 5mm 0; }
img { max-width: 100%; }
div.sourceCode { margin: 0; }
/* tango (pandoc) */
code span.al { color:#ef2929; } code span.an { color:#8f5902; font-style:italic; } code span.at { color:#c4a000; }
code span.bn, code span.dv, code span.fl { color:#0000cf; } code span.cf, code span.kw { color:#204a87; font-weight:bold; }
code span.ch, code span.st, code span.vs, code span.ss, code span.sc { color:#4e9a06; } code span.co { color:#8f5902; font-style:italic; }
code span.dt { color:#204a87; } code span.fu { color:#000; } code span.er { color:#a40000; font-weight:bold; }
code span.op { color:#ce5c00; font-weight:bold; } code span.im, code span.pp { color:#8f5902; font-style:italic; }
`;

const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>${esc(docTitle)}</title><style>${css}</style></head>
<body>
<section class="cover">
<h1>Br1WebEngine<br>Documentazione</h1>
<p>Raccolta unica di tutta la documentazione Markdown del progetto.</p>
<p>${chapters.length} capitoli · generato il ${esc(today)}${commit ? ` · revisione ${esc(commit)}` : ''}</p>
</section>
<nav class="toc"><h1>Indice</h1><ul>${tocHtml}</ul></nav>
${body}
</body></html>`;

mkdirSync(path.dirname(outPdf), { recursive: true });
writeFileSync(outHtml, html);
log(`HTML scritto: ${path.relative(ROOT, outHtml)}`);
if (htmlOnly) process.exit(0);

// ── HTML → PDF con Chromium ─────────────────────────────────────────────────
async function loadPlaywright() {
    const roots = [ROOT, path.join(ROOT, 'frontend')];
    try { roots.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch { /* npm assente */ }
    roots.push(...(process.env.NODE_PATH ?? '').split(path.delimiter).filter(Boolean));
    for (const r of roots) {
        try { return createRequire(path.join(r, 'x.js'))('playwright'); } catch { /* prossimo */ }
        try { return createRequire(path.join(r, 'x.js'))('playwright-core'); } catch { /* prossimo */ }
    }
    return null;
}
function findChrome() {
    const cands = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
    for (const c of cands) {
        if (path.isAbsolute(c) ? existsSync(c) : spawnSync(process.platform === 'win32' ? 'where' : 'which', [c]).status === 0) return c;
    }
    return null;
}

const pw = await loadPlaywright();
if (pw) {
    log('genero il PDF con Playwright/Chromium (può richiedere un po\')');
    const browser = await pw.chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
    try {
        const page = await browser.newPage();
        await page.goto(pathToFileURL(outHtml).href, { waitUntil: 'load', timeout: 0 });
        await page.pdf({
            path: outPdf, format: 'A4', printBackground: true, outline: true, tagged: true, timeout: 0,
            margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
            displayHeaderFooter: true,
            headerTemplate: '<span></span>',
            footerTemplate: `<div style="width:100%;font-size:8px;color:#5b6570;padding:0 16mm;display:flex;justify-content:space-between;font-family:sans-serif">
<span>${esc(docTitle)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
        });
    } finally { await browser.close(); }
} else {
    const chrome = findChrome();
    if (!chrome) fail('nessun Chromium/Chrome trovato: installa Playwright (npm i -g playwright) oppure imposta CHROME_PATH.');
    log(`Playwright assente, uso ${chrome} da riga di comando (senza numeri di pagina né segnalibri)`);
    const r = spawnSync(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer',
        `--print-to-pdf=${outPdf}`, pathToFileURL(outHtml).href], { stdio: 'inherit' });
    if (r.status !== 0) fail('Chromium ha terminato con errore.');
}
log(`PDF pronto: ${path.relative(ROOT, outPdf)}`);
