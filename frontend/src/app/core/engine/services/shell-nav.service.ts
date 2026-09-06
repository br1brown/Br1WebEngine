import { effect, EnvironmentInjector, inject, Injectable, InjectionToken, runInInjectionContext, signal, TransferState, makeStateKey, type WritableSignal } from '@angular/core';
import type { PageType } from '../../../site';
import { ContestoSito } from '../../../site';
import {
    createNavSectionBuilder,
    resolveNavItems,
    validateNavDepth,
    type NavLink,
    type RawNavItem,
    type ShellNavResolver,
} from '../shell-nav';
import { TranslateService } from './translate.service';
import { TokenService } from './token.service';

/**
 * Sorgente delle voci di navigazione di header/footer per QUESTO sito — un figlio la sovrascrive
 * (`{ provide: SHELL_NAV_RESOLVER, useValue: ... }` in `app.config.ts`) per collegare la
 * navigazione a un'API invece che a una dichiarazione statica. Default: nessuna voce (menu vuoto),
 * innocuo per chi non fornisce nulla — stesso pattern di `LEGAL_FILE_READER`.
 */
export const SHELL_NAV_RESOLVER = new InjectionToken<ShellNavResolver>('SHELL_NAV_RESOLVER', {
    providedIn: 'root',
    factory: () => ({}),
});

const SHELL_NAV_STATE_KEY = makeStateKey<{ header: NavLink[]; footer: NavLink[] }>('shellNav');

/**
 * Voci di navigazione di header/footer, condivise da `NavbarComponent`/`FooterComponent` (un solo
 * fetch, non uno a testa). Risolte da `SHELL_NAV_RESOLVER` — dato, non struttura del sito: a
 * differenza di `ContestoSito` (build-time), qui gira a ogni richiesta SSR e può dipendere da
 * un'API (es. menu diverso per utente loggato).
 *
 * Il primo giro (lingua iniziale) è atteso da un `provideAppInitializer` in `app.config.ts`, PRIMA
 * che qualunque componente si costruisca: `NavbarComponent` legge `header()`/`footer()` anche in
 * un field initializer sincrono (`altroDropdownIndex`), quindi il valore dev'essere già pronto al
 * primo render, non arrivare dopo. Cambio lingua o login/logout (client): ri-risolve in modo
 * reattivo, senza bloccare nulla.
 *
 * Login tracciato apposta: in SSR `TokenService.isLoggedIn()` è sempre `false` (sessione letta
 * solo client-side, vedi `TokenService.restore()`), quindi un resolver che dipende dal login
 * risolve "guest" al primo giro — corretto per l'idratazione, che deve combaciare col DOM
 * server. Il secondo giro, reattivo, arriva da questa stessa dipendenza appena `restoreSession()`
 * (in `app.config.ts`) valorizza lo stato di login sul client.
 */
@Injectable({ providedIn: 'root' })
export class ShellNavService {
    private readonly resolver = inject(SHELL_NAV_RESOLVER);
    private readonly translate = inject(TranslateService);
    private readonly tokenService = inject(TokenService);
    private readonly transferState = inject(TransferState);
    // Garantisce un injection context valido dentro il resolver del figlio, chiamato dopo almeno
    // un await (stesso motivo di runInInjectionContext in content.resolver.ts): un eventuale
    // inject() nella sua callback altrimenti fallirebbe con NG0203.
    private readonly injector = inject(EnvironmentInjector);

    private readonly _header = signal<NavLink[]>([]);
    private readonly _footer = signal<NavLink[]>([]);
    readonly header = this._header.asReadonly();
    readonly footer = this._footer.asReadonly();

    /** Chiave (lingua + login) dell'ultimo `resolve()` completato: guardia contro il doppio giro
     *  fra la chiamata esplicita del `provideAppInitializer` e il primo scatto automatico
     *  dell'`effect()` sotto, che vedono lo stesso stato iniziale. Un resolver che ignora il login
     *  paga al più un secondo `resolve()` ridondante ma innocuo dopo il login — costo minimo per
     *  la reattività di chi il login lo usa davvero. */
    private lastResolvedKey: string | null = null;

    /** Contatore monotono: ogni `resolve()` cattura il proprio valore e lo confronta prima di
     *  scrivere sui signal. Cambio lingua/login due volte di fretta avvia due `resolve()` in
     *  parallelo — senza questa guardia, la rete potrebbe far arrivare per prima la risposta del
     *  giro PIÙ VECCHIO e sovrascrivere quella corretta del giro nuovo. Puramente locale (nessun
     *  round-trip, nessuno stato lato server): non c'entra con l'invalidazione di token/sessione. */
    private generation = 0;

    constructor() {
        effect(() => {
            const lang = this.translate.currentLang();
            const loggedIn = this.tokenService.isLoggedIn();
            const key = `${lang}:${loggedIn}`;
            if (key === this.lastResolvedKey) return;
            void this.resolve(lang);
        });
    }

    private readonly getPath = (type: PageType, lang: string): string | null => ContestoSito.getPath(type, lang);
    private readonly getPageInfo = (type: PageType, lang: string) => ContestoSito.getPageInfo(type, lang);

    /** Risolve header e footer per `lang` e aggiorna i signal. Le due sezioni sono indipendenti:
     *  un resolver che fallisce (es. API giù, gruppo annidato oltre il limite) svuota solo la
     *  propria sezione, mai anche l'altra — mai voci pensate per lo stato precedente (es. link
     *  autenticati rimasti visibili dopo un logout il cui resolver è fallito). */
    async resolve(lang: string): Promise<void> {
        // Sincrono, PRIMA di ogni await: garantisce che l'effect() sopra veda già la guardia
        // valorizzata quando Angular lo esegue per la prima volta (schedulazione asincrona,
        // sempre dopo la fine del blocco sincrono corrente). Stessa chiave (lingua+login) letta
        // qui e nell'effect: sincrona anche lei, per lo stesso motivo.
        this.lastResolvedKey = `${lang}:${this.tokenService.isLoggedIn()}`;
        const generation = ++this.generation;

        if (this.transferState.hasKey(SHELL_NAV_STATE_KEY)) {
            const cached = this.transferState.get(SHELL_NAV_STATE_KEY, { header: [], footer: [] });
            this.transferState.remove(SHELL_NAV_STATE_KEY);
            this._header.set(cached.header);
            this._footer.set(cached.footer);
            return;
        }

        await Promise.all([
            this.resolveInto('header', this.resolver.header, lang, this._header, generation),
            this.resolveInto('footer', this.resolver.footer, lang, this._footer, generation),
        ]);
        // Un resolve() più recente è partito nel frattempo (cambio lingua/login a raffica): i suoi
        // risultati sono già nei signal, questo giro non ha più nulla di attendibile da trasferire.
        if (generation !== this.generation) return;
        // In SSR: passa il risultato al client, che altrimenti rifarebbe subito lo stesso fetch
        // appena idratato. Anche a una sezione fallita (svuotata, vedi resolveInto): meglio
        // trasferire quello che c'è che rifare comunque entrambe le chiamate lato client.
        this.transferState.set(SHELL_NAV_STATE_KEY, { header: this._header(), footer: this._footer() });
    }

    private async resolveInto(
        section: 'header' | 'footer',
        run: ShellNavResolver['header'],
        lang: string,
        target: WritableSignal<NavLink[]>,
        generation: number,
    ): Promise<void> {
        // Un resolve() più recente potrebbe aver già scritto sul signal mentre questo giro era in
        // volo: un giro vecchio che scrive per ultimo (fine solo per ordine di arrivo in rete, non
        // di partenza) sovrascriverebbe un risultato più fresco con uno stantio.
        const isCurrent = () => generation === this.generation;
        if (!run) { if (isCurrent()) target.set([]); return; }
        try {
            const raw: RawNavItem[] = [];
            await runInInjectionContext(this.injector, () => run(createNavSectionBuilder(raw), { lang, getPath: this.getPath }));
            const resolved = resolveNavItems(raw, this.getPageInfo, lang);
            validateNavDepth(resolved, section);
            if (isCurrent()) target.set(resolved);
        } catch (err) {
            console.error(`[ShellNavService] Risoluzione ${section} fallita:`, err);
            // Svuota, non lascia lo stato precedente: quello poteva appartenere a un login/lingua
            // diversi (vedi doc di resolve()) — mostrare voci sbagliate è peggio di non mostrarne.
            if (isCurrent()) target.set([]);
        }
    }
}
