import { InjectionToken, makeStateKey } from '@angular/core';

/** Dati salvati nei log per ogni richiesta. */
export type CampoLog = 'ip' | 'dataOra' | 'url' | 'metodo' | 'stato' | 'dimensione' | 'referrer' | 'userAgent';
/** Base di un trasferimento fuori dallo Spazio economico europeo: decisione di adeguatezza (art. 45) o clausole standard (art. 46). */
export type GaranziaTrasferimento = 'adeguatezza' | 'clausole-standard';
/** `accessi`: ogni richiesta; `errori`: solo quelle con errore o avviso; `applicazione`: i log delle applicazioni del sito. */
export type TipoLog = 'accessi' | 'errori' | 'applicazione';

/** Chi ospita o instrada il traffico: nome del fornitore e paese dei server (ISO 3166-1 alpha-2). */
export interface FornitoreInfrastruttura {
    fornitore: string;
    paese?: string;
    /** Obbligatoria se `paese` è fuori dallo Spazio economico europeo. */
    garanzie?: GaranziaTrasferimento;
}

/** Un file di log del server (reverse proxy compreso): cosa salva e per quanto. */
export interface LogServer {
    tipo: TipoLog;
    campi?: readonly CampoLog[];
    /** Giorni al massimo, se una rotazione a tempo li garantisce; assente = log a dimensione limitata, sovrascritti a rotazione. */
    conservazioneGiorni?: number;
    ipAnonimizzato?: boolean;
}

/** Fatti di un server: ogni campo è facoltativo, e se manca la frase non compare. */
export interface ServerInfo {
    hosting?: FornitoreInfrastruttura;
    /** `false`: nessuna CDN davanti al server; come l'assenza, nel testo non compare. */
    cdn?: false | FornitoreInfrastruttura;
    /** Le richieste passano da un reverse proxy del server, che scrive i log. */
    reverseProxy?: boolean;
    log?: readonly LogServer[];
}

/** Fatti dell'installazione, dichiarati nel file indicato da `frontend.hostingInfo`: un file per server, condiviso
 *  dai siti che ci girano. I campi in radice descrivono il server del sito; `backend` il server delle API, se è un altro. */
export interface HostingInfo extends ServerInfo {
    backend?: ServerInfo;
}

/** Fatti che la Privacy Policy ricava da installazione e configurazione, calcolati dall'SSR e passati al browser
 *  (TransferState di ogni pagina, `/internal/legal-facts`): solo ciò che il testo dell'informativa scrive, niente di più.
 *  Un fatto che il testo non usa (limite spento, finestra dei login a login spento, campi dei log applicativi) non
 *  entra qui: sarebbe ricognizione gratuita per chiunque legga la pagina. */
export interface LegalFacts {
    installazione: HostingInfo | null;
    /** URL del sito coperto dall'informativa (`FRONTEND_BASE_URL` o `frontend.hostname`); null se non noto. */
    sito: string | null;
    /** Per quanti secondi l'IP resta in memoria per il limite di richieste (`Security.ApiConfig.RateLimiting`: la finestra
     *  più lunga fra quella generale e, col login acceso, quella dei login); `null` con il limite spento, e la frase non c'è.
     *  Le soglie non entrano nell'informativa, che non deve dire quanto si può chiedere. */
    limiteRichiesteSecondi: number | null;
}

export const LEGAL_FACTS = new InjectionToken<LegalFacts | null>('LEGAL_FACTS', { providedIn: 'root', factory: () => null });
export const LEGAL_FACTS_STATE_KEY = makeStateKey<LegalFacts | null>('br1_legal_facts');

const CAMPI: readonly CampoLog[] = ['ip', 'dataOra', 'url', 'metodo', 'stato', 'dimensione', 'referrer', 'userAgent'];
const TIPI: readonly TipoLog[] = ['accessi', 'errori', 'applicazione'];
const UE = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']);
const SEE_EXTRA_UE = new Set(['IS', 'LI', 'NO']);
const CHIAVI_SERVER = ['hosting', 'cdn', 'reverseProxy', 'log'];

/** Valida il contenuto del file (già parsato) e lo restituisce tipizzato; lancia un errore che nomina il campo. */
export function parseHostingInfo(raw: unknown, source: string): HostingInfo {
    const fail = (msg: string): never => { throw new Error(`[br1-engine] ${source}: ${msg}`); };
    const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
    const onlyKeys = (o: Record<string, unknown>, keys: readonly string[], where: string) => {
        for (const k of Object.keys(o)) if (!keys.includes(k)) fail(`${where}: campo "${k}" sconosciuto (ammessi: ${keys.join(', ')}).`);
    };
    const fornitore = (v: unknown, where: string): void => {
        if (!isObj(v)) return fail(`${where} deve essere un oggetto { fornitore, paese?, garanzie? }.`);
        onlyKeys(v, ['fornitore', 'paese', 'garanzie'], where);
        if (typeof v['fornitore'] !== 'string' || !v['fornitore'].trim()) fail(`${where}.fornitore deve essere il nome del fornitore.`);
        const paese = v['paese'];
        if (paese !== undefined && (typeof paese !== 'string' || !/^[A-Z]{2}$/.test(paese) || new Intl.DisplayNames('en', { type: 'region' }).of(paese) === paese)) {
            fail(`${where}.paese "${String(paese)}" non è un codice paese ISO 3166-1 (es. "FR").`);
        }
        const garanzie = v['garanzie'];
        if (garanzie !== undefined && garanzie !== 'adeguatezza' && garanzie !== 'clausole-standard') {
            fail(`${where}.garanzie "${String(garanzie)}" non valida (adeguatezza | clausole-standard).`);
        }
        if (typeof paese === 'string' && !UE.has(paese) && !SEE_EXTRA_UE.has(paese) && garanzie === undefined) {
            fail(`${where}: server fuori dallo Spazio economico europeo (${paese}) senza "garanzie" per il trasferimento (adeguatezza | clausole-standard).`);
        }
    };
    const server = (o: Record<string, unknown>, prefix: string): void => {
        if (o['hosting'] !== undefined) fornitore(o['hosting'], `${prefix}hosting`);
        if (o['cdn'] !== undefined && o['cdn'] !== false) fornitore(o['cdn'], `${prefix}cdn`);
        if (o['reverseProxy'] !== undefined && typeof o['reverseProxy'] !== 'boolean') fail(`${prefix}reverseProxy deve essere true o false.`);
        const log = o['log'];
        if (log === undefined) return;
        if (!Array.isArray(log)) return fail(`${prefix}log deve essere un array.`);
        const tipi = new Set<unknown>();
        log.forEach((entry: unknown, i: number) => {
            const where = `${prefix}log[${i}]`;
            if (!isObj(entry)) return fail(`${where} deve essere un oggetto { tipo, campi?, conservazioneGiorni?, ipAnonimizzato? }.`);
            onlyKeys(entry, ['tipo', 'campi', 'conservazioneGiorni', 'ipAnonimizzato'], where);
            if (!TIPI.includes(entry['tipo'] as TipoLog)) fail(`${where}.tipo "${String(entry['tipo'])}" non valido (${TIPI.join(' | ')}).`);
            if (tipi.has(entry['tipo'])) fail(`${where}: tipo "${String(entry['tipo'])}" già dichiarato.`);
            tipi.add(entry['tipo']);
            const giorni = entry['conservazioneGiorni'];
            if (giorni !== undefined && (!Number.isInteger(giorni) || (giorni as number) < 1 || (giorni as number) > 3650)) fail(`${where}.conservazioneGiorni deve essere un intero di giorni, da 1 a 3650.`);
            const campi = entry['campi'];
            if (campi !== undefined && (!Array.isArray(campi) || campi.some(c => !CAMPI.includes(c)) || new Set(campi).size !== campi.length)) {
                fail(`${where}.campi: valori ammessi, senza ripetizioni: ${CAMPI.join(', ')}.`);
            }
            if (entry['ipAnonimizzato'] !== undefined && typeof entry['ipAnonimizzato'] !== 'boolean') fail(`${where}.ipAnonimizzato deve essere true o false.`);
        });
    };

    if (!isObj(raw)) return fail('deve contenere un oggetto JSON.');
    onlyKeys(raw, ['$schema', ...CHIAVI_SERVER, 'backend'], 'radice');
    server(raw, '');
    if (raw['backend'] !== undefined) {
        if (!isObj(raw['backend'])) return fail('backend deve essere un oggetto con gli stessi campi della radice (hosting, cdn, reverseProxy, log).');
        onlyKeys(raw['backend'], CHIAVI_SERVER, 'backend');
        server(raw['backend'], 'backend.');
    }
    // Solo i fatti che il testo usa: il risultato viaggia nella pagina (TransferState), e `$schema` o `cdn: false`
    // direbbero nel sorgente ciò che l'informativa non scrive.
    // Dei log applicativi il testo usa solo tipo e conservazione: campi e anonimizzazione dell'IP non escono di qui.
    const logEssenziale = (l: LogServer): LogServer => l.tipo === 'applicazione'
        ? { tipo: l.tipo, ...(l.conservazioneGiorni != null ? { conservazioneGiorni: l.conservazioneGiorni } : {}) }
        : l;
    const essenziale = (s: ServerInfo): ServerInfo => ({
        ...(s.hosting ? { hosting: s.hosting } : {}),
        ...(s.cdn ? { cdn: s.cdn } : {}),
        ...(s.reverseProxy ? { reverseProxy: true } : {}),
        ...(s.log?.length ? { log: s.log.map(logEssenziale) } : {}),
    });
    const info = raw as HostingInfo;
    return { ...essenziale(info), ...(info.backend ? { backend: essenziale(info.backend) } : {}) };
}

type Translate = (key: string, ...args: unknown[]) => string;

/** Parte della Privacy Policy generata dall'Engine, in Markdown: un riepilogo "in sintesi" (informativa a strati,
 *  stessa pagina), ambito (il sito coperto) e sezione "Dati di navigazione", dai fatti di installazione e
 *  configurazione e dalle chiavi `nav*` di `basic.*.json`. Senza fatti d'installazione: riepilogo generico,
 *  elenco dei dati tipico e conservazione per criterio. */
export function renderNavigationData(facts: LegalFacts | null, t: Translate, lang: string): string {
    const info = facts?.installazione ?? null;
    const list = (items: string[]) => new Intl.ListFormat(lang, { type: 'conjunction' }).format(items);
    const unita = (valore: number, unit: 'day' | 'week' | 'second' | 'minute' | 'hour') =>
        new Intl.NumberFormat(lang, { style: 'unit', unit, unitDisplay: 'long' }).format(valore);
    const giorni = (g: number) => g >= 14 && g % 7 === 0 ? unita(g / 7, 'week') : unita(g, 'day');
    const secondi = (s: number) => s % 3600 === 0 ? unita(s / 3600, 'hour') : s % 60 === 0 ? unita(s / 60, 'minute') : unita(s, 'second');
    const luogo = (f: FornitoreInfrastruttura): string => {
        if (!f.paese) return '';
        const nome = new Intl.DisplayNames(lang, { type: 'region' }).of(f.paese) ?? f.paese;
        if (UE.has(f.paese)) return t('navLuogoUe', nome);
        if (SEE_EXTRA_UE.has(f.paese)) return t('navLuogoSee', nome);
        return t('navLuogoExtra', nome, t(f.garanzie === 'adeguatezza' ? 'navGaranziaAdeguatezza' : 'navGaranziaClausole'));
    };
    const chiaveLog: Record<TipoLog, string> = { accessi: 'navLogAccessi', errori: 'navLogErrori', applicazione: 'navLogApplicazione' };
    // Log con la stessa conservazione (stessa durata, o entrambi a rotazione) si nominano insieme, con la
    // frase di durata una volta sola, invece di ripeterla per ogni tipo: una formulazione unitaria, non un
    // elenco di frasi quasi identiche.
    const raggruppaConservazione = (log: readonly LogServer[]): string[] => {
        const gruppi = new Map<string, TipoLog[]>();
        for (const l of log) {
            const chiave = l.conservazioneGiorni != null ? `g${l.conservazioneGiorni}` : 'rotazione';
            (gruppi.get(chiave) ?? gruppi.set(chiave, []).get(chiave)!).push(l.tipo);
        }
        return [...gruppi.entries()].map(([chiave, tipi]) => {
            const durata = chiave === 'rotazione' ? t('navLogRotazione') : t('navLogDurata', giorni(Number(chiave.slice(1))));
            return `${list(tipi.map(tp => t(chiaveLog[tp])))} ${durata}`;
        });
    };
    /** Conservazione, hosting e CDN di un server, come voci di elenco. */
    const voci = (s: ServerInfo, criterio: boolean): string[] => [
        ...(s.log?.length
            ? [t('navConservazione', list(raggruppaConservazione(s.log)))]
            : criterio ? [t('navConservazioneCriterio')] : []),
        ...(s.hosting ? [t('navHosting', s.hosting.fornitore, luogo(s.hosting))] : []),
        ...(s.cdn ? [t('navCdn', s.cdn.fornitore, luogo(s.cdn))] : []),
    ];

    // Dati salvati: quelli dichiarati dai log del sito, o l'elenco tipico del Garante.
    const logs = [...(info?.log ?? []), ...(info?.backend?.log ?? [])].filter(l => l.tipo !== 'applicazione');
    const dichiarati = new Set(logs.flatMap(l => l.campi ?? []));
    // "IP reso anonimo" solo se lo è in ogni log che l'IP lo salva (senza `campi` = elenco generico, IP compreso).
    const conIp = logs.filter(l => !l.campi || l.campi.includes('ip'));
    const anonimo = conIp.length > 0 && conIp.every(l => l.ipAnonimizzato);
    const campo = (c: CampoLog) => t(c === 'ip' && anonimo ? 'navCampoIpAnonimo' : `navCampo${c[0].toUpperCase()}${c.slice(1)}`);
    const dati = dichiarati.size > 0
        ? list(CAMPI.filter(c => dichiarati.has(c)).map(campo))
        : list([...(['ip', 'url', 'dataOra', 'metodo', 'dimensione', 'stato'] as CampoLog[]).map(campo), t('navCampiAltri')]);

    const limite = facts?.limiteRichiesteSecondi ?? null;
    // Perché, chi li registra, per quanto l'IP resta in memoria per il limite di richieste.
    const finalita = [
        t('navFinalita'),
        info?.reverseProxy ? t('navReverseProxy') : '',
        limite !== null ? t('navLimite', secondi(limite)) : '',
    ].filter(Boolean).join(' ');

    const backend = info?.backend;
    // Un URL del sito malformato (senza schema) toglie solo la frase sull'ambito, non la pagina.
    const host = (() => { try { return facts?.sito ? new URL(facts.sito).host : null; } catch { return null; } })();

    // "In sintesi": riassunto in cima, in linguaggio semplice, prima della sezione estesa che segue —
    // l'informativa "a strati" raccomandata dal Garante, sulla stessa pagina invece che su una pagina
    // separata. Usa solo i fatti che la sezione sotto spiega per esteso, mai un'affermazione in più.
    const maxGiorni = logs.reduce<number | null>((max, l) =>
        l.conservazioneGiorni != null && (max == null || l.conservazioneGiorni > max) ? l.conservazioneGiorni : max, null);
    const sintesiConservazione = maxGiorni != null ? t('navSintesiConservazione', giorni(maxGiorni)) : t('navSintesiConservazioneGenerica');
    const sintesi = [
        t('navSintesi', sintesiConservazione),
        limite !== null ? t('navSintesiLimite') : '',
        t('navSintesiDettagli'),
    ].filter(Boolean).join(' ');

    const parti = [
        `> ${sintesi}`,
        ...(host ? [t('navAmbito', `[${host}](${facts!.sito})`)] : []),
        `## ${t('navSezione')}`,
        `### ${t('navTitolo')}`,
        t('navAcquisizione'),
        t('navCategoria', dati),
        finalita,
        [t('navBaseGiuridica'), ...voci(info ?? {}, true)].map(v => `- ${v}`).join('\n'),
        ...(backend ? [
            [t('navBackend'), backend.reverseProxy ? t('navBackendReverseProxy') : ''].filter(Boolean).join(' '),
            voci(backend, false).map(v => `- ${v}`).join('\n'),
        ].filter(Boolean) : []),
    ];
    return parti.join('\n\n');
}
