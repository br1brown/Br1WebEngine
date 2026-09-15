import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, isDevMode, PLATFORM_ID, signal, viewChild, viewChildren } from '@angular/core';
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs/operators';
import { injectCurrentUrl, mergeRouteParams } from '../../routing';
import { isDesktopViewport } from '../../breakpoints';
import { ThemeService } from '../../services/theme.service';
import { TranslateService } from '../../services/translate.service';
import { LocalizationService } from '../../services/localization.service';
import { PageMetaService } from '../../services/page-meta.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { NavLinkComponent } from '../nav-link/nav-link.component';
import { NavDropdownComponent } from '../nav-dropdown/nav-dropdown.component';
import { ContestoSito } from '../../../../site';
import { applyPathParams } from '../../siteBuilder';
import { filterNavByAuth, isNavGroup, navLinkKey, NavLink } from '../../shell-nav';
import { ShellNavService } from '../../services/shell-nav.service';
import { AssetDirective } from '../../directives/asset.directive';
import { UserNavComponent } from '../../../../components/shared/user-nav/user-nav.component';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';
import { TokenService } from '../../services/token.service';

/** Oltre questa soglia: warning dev (console) + calcolo overflow "Altro" attivo. Sotto, tutte le
 *  voci restano sempre in riga senza costo (nessun ResizeObserver montato) — è la soglia stessa
 *  già raccomandata nel warning, non un limite indipendente. */
const MAX_RECOMMENDED_TOP_LEVEL_ITEMS = 6;

@Component({
    selector: 'app-navbar',
    imports: [TranslatePipe, AssetDirective, NavLinkComponent, NavDropdownComponent, RouterLink, UserNavComponent, NotificationBellComponent, NgTemplateOutlet],
    templateUrl: './navbar.component.html',
    styleUrl: './navbar.component.scss',
    host: {
        class: 'd-block',
        '(document:click)': 'onDocumentClick($event)',
    }
})
/**
 * Barra di navigazione principale del sito, configurata interamente da `site.ts`.
 *
 * Responsabilità:
 * - Renderizza il brand, le voci di menu (flat o dropdown), il selettore lingua e
 *   l'area login/logout (delegata a `UserNavComponent`).
 * - Gestisce l'apertura/chiusura del menu mobile e dei dropdown nidificati.
 * - Chiude tutto alla navigazione (RouterEvent) e ai click fuori dal componente
 *   (`@HostListener document:click`).
 *
 * Configurazione: tutto viene letto da `ContestoSito` (alias di `site.ts`).
 * Non modificare questo file — personalizza `site.ts` e `components/shared/user-nav/user-nav.component.ts`
 * (Dominio a contratto fisso: cambi il corpo, non path/nome-classe/selettore).
 */
export class NavbarComponent {
    readonly theme = inject(ThemeService);
    readonly translate = inject(TranslateService);
    private readonly localization = inject(LocalizationService);
    private readonly pageMeta = inject(PageMetaService);
    private readonly router = inject(Router);
    private readonly elRef = inject(ElementRef);
    private readonly destroyRef = inject(DestroyRef);
    private readonly tokenService = inject(TokenService);
    private readonly shellNav = inject(ShellNavService);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    /** Chiave `track` per il template — vedi doc su `navLinkKey` in shell-nav.ts. */
    protected readonly navLinkKey = navLinkKey;

    readonly appName = ContestoSito.config.appName;
    // Path della home dallo slot `homePage`, nella lingua corrente; `null` se non valorizzato →
    // il brand non è un link. Reattivo: il link resta coerente con la lingua dopo uno switch.
    readonly homePath = computed<string | null>(() => ContestoSito.config.homePage != null
        ? ContestoSito.getPath(ContestoSito.config.homePage, this.translate.currentLang())
        : null);
    /** Menu risolto da `ShellNavService` per la lingua corrente, senza filtro auth: usato solo
     *  per le decisioni strutturali che devono restare stabili a prescindere dal login (soglia
     *  overflow "Altro", warning di usabilità, sentinel `altroDropdownIndex`) — vedi `menuItems`
     *  per il render. Il servizio è già risolto al primo render (atteso da `provideAppInitializer`
     *  in app.config.ts): leggerlo qui, anche in un field initializer sincrono, è sicuro. */
    private readonly rawMenuItems = computed(() => this.shellNav.header());
    /** Menu effettivamente reso: filtra le voci/gruppi `authOnly` in base al login corrente
     *  (`TokenService.isLoggedIn()`). In SSR e prima dell'idratazione l'utente risulta sempre
     *  sloggato (nessun token), quindi anche i bot vedono solo le voci pubbliche — coerente con
     *  `requiresAuth` che già forza quelle pagine fuori da sitemap/SSR. */
    readonly menuItems = computed(() => filterNavByAuth(this.rawMenuItems(), this.tokenService.isLoggedIn()));
    readonly fixTop = ContestoSito.config.fixedTopHeader;
    /** Valore per `[appAsset]`: `null` = icona nascosta, altrimenti chiave mapping.json o GUID
     *  blob (`ShellNavResolver.brandIcon`); `true`/assente → `favIcon` di sempre. */
    readonly brandIconAsset = computed<string | null>(() => {
        const value = this.shellNav.brandIcon();
        if (value === false) return null;
        return value === true ? 'favIcon' : value;
    });
    /** Mostra il campanellino delle notifiche realtime (shell.showNotifications, default false). */
    readonly showNotifications = ContestoSito.config.showNotifications;
    // Set di lingue dalla config (coerente coi cataloghi i18n presenti → setLanguage funziona
    // sempre); il NOME mostrato è quello nativo derivato via Intl (LocalizationService).
    readonly languages = this.translate.availableLangs;
    /** True se il sito ha un'area auth in navbar: basta una `loginPage` configurata. Non dipende da
     *  `showLoginInHeader` — quel flag nasconde il *link di login* ai visitatori, ma il logout (da
     *  loggato) resta, quindi l'area può comunque renderizzare qualcosa. Governa la comparsa del
     *  toggler mobile quando non ci sono altre voci di menu. */
    readonly hasAuthPage = ContestoSito.config.loginPage != null;
    readonly menuOpen = signal(false);
    protected readonly openDropdownIndex = signal(-1);
    protected readonly langOpen = signal(false);
    private readonly currentUrl = injectCurrentUrl();
    private readonly navEl = viewChild<ElementRef<HTMLElement>>('navEl');
    /** Altezza reale della navbar, esposta come custom property `--nav-height` (vedi template)
     *  e usata in due punti: lo spacer sotto la navbar fixed, e il tetto di altezza del pannello
     *  mobile aperto (`calc(100dvh - var(--nav-height))`, navbar.component.scss). 56px = 3.5rem
     *  di default (l'altezza standard della navbar Bootstrap), una stima sicura finché non viene
     *  misurata; da lì in poi segue l'elemento vero (voci di menu che vanno a capo, zoom testo,
     *  ecc.), così né lo spacer né il tetto restano tarati su un'altezza diversa da quella reale. */
    readonly navHeight = signal(56);

    // ── Overflow "Altro" (desktop) ──────────────────────────────────────────────────────
    // Bootstrap forza flex-wrap:nowrap su .navbar-expand-md: con più voci di primo livello di
    // quante ne entrino in riga (oltre le 6 consigliate, vedi warning sotto), il contenuto in
    // eccesso uscirebbe dalla viewport senza scroll, cioè letteralmente irraggiungibile.
    // Per gestire l'overflow, misuriamo la larghezza reale disponibile e decidiamo in TS 
    // quante voci entrano, spostando le altre in un dropdown "Altro" finale.
    private readonly containerFluidEl = viewChild<ElementRef<HTMLElement>>('containerFluidEl');
    private readonly brandEl = viewChild<ElementRef<HTMLElement>>('brandEl');
    private readonly navListEl = viewChild<ElementRef<HTMLElement>>('navListEl');
    private readonly navItemEls = viewChildren<ElementRef<HTMLElement>>('navItemEl');
    private readonly userNavWrapperEl = viewChild<ElementRef<HTMLElement>>('userNavWrapperEl');
    private readonly langWrapEl = viewChild<ElementRef<HTMLElement>>('langWrapEl');
    /** Esiste solo quando overflowMenuItems() non è vuoto (vedi template): usato per misurare
     *  la larghezza vera del toggle "Altro" una volta che esiste, invece della sola stima
     *  fissa iniziale (vedi ALTRO_WIDTH_ESTIMATE_FALLBACK in recomputeOverflow). */
    private readonly altroToggleEl = viewChild<ElementRef<HTMLElement>>('altroToggleEl');
    /** Quante voci di primo livello entrano in riga; le altre finiscono in "Altro".
     *  Parte da "tutte visibili" (coerente col comportamento pre-misura, prima dell'idratazione)
     *  e viene corretta da recomputeOverflow() appena il layout reale è misurabile. */
    readonly visibleCount = signal(this.menuItems().length);
    readonly overflowMenuItems = computed(() => this.menuItems().slice(this.visibleCount()));
    /** Gruppo sintetico passato a <app-nav-dropdown>: stessa struttura di un gruppo dichiarato
     *  in site.ts (addGroup), così il rendering (incluso l'annidamento di eventuali sotto-gruppi
     *  finiti in overflow) è quello già esistente, nessuna duplicazione di template. */
    readonly altroGroup = computed<NavLink & { children: NavLink[] }>(() => ({
        label: 'altroNav',
        path: '',
        isExternal: false,
        children: this.overflowMenuItems(),
    }));
    /** Indice dedicato per isNavDropdownOpen/onNavDropdownToggle: basato su rawMenuItems (il
     *  massimo possibile, indipendente dal login) così non collide mai con un indice reale
     *  del menu filtrato (0..length-1, sempre <= rawMenuItems.length) né con -1 ("nessun
     *  dropdown aperto"). */
    readonly altroDropdownIndex = this.rawMenuItems().length;

    constructor() {
        if (isDevMode() && this.rawMenuItems().length > MAX_RECOMMENDED_TOP_LEVEL_ITEMS) {
            console.warn(
                `[Navbar] ${this.rawMenuItems().length} voci di primo livello nel menu ` +
                `(max consigliato: ${MAX_RECOMMENDED_TOP_LEVEL_ITEMS}). ` +
                `Quelle che non entrano in riga finiscono nel dropdown "Altro"; su mobile restano ` +
                `tutte nel pannello, ma richiedono scroll. Raggruppa le voci in dropdown per ridurre ` +
                `il numero di item orizzontali.`
            );
        }
        this.router.events
            .pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed())
            .subscribe(() => this.closeNavigation());

        // Sempre osservata (non solo se fixTop): serve anche al tetto di altezza del pannello
        // mobile aperto, indipendente dal fatto che la navbar sia fixed o in flusso normale.
        afterNextRender(() => this.observeNavHeight());

        // Overflow "Altro" SEMPRE attivo, indipendente dal numero di voci: il conteggio non
        // garantisce nulla sulla larghezza reale (un'etichetta lunga può non entrare anche con
        // 2-3 voci sole). MAX_RECOMMENDED_TOP_LEVEL_ITEMS resta solo un avviso per chi scrive il
        // menu (sopra), non una condizione per il layout.
        afterNextRender(() => this.setupOverflowObserver());
        // Le voci in overflow sono position:absolute: un loro cambio di larghezza (etichette
        // diverse per lingua, o voci authOnly al login/logout) non fa scattare da solo il
        // ResizeObserver su navListEl, da qui il ricalcolo esplicito. queueMicrotask: margine
        // per non misurare nello stesso ciclo in cui i segnali sono appena cambiati.
        effect(() => {
            this.translate.currentLang();
            this.tokenService.isLoggedIn();
            queueMicrotask(() => this.recomputeOverflow());
        });
    }

    private observeNavHeight(): void {
        const el = this.navEl()?.nativeElement;
        if (!el) return;
        this.navHeight.set(el.offsetHeight);
        // Guardia menuOpen(): il pannello mobile espanso è DENTRO <nav>, quindi la aprirlo
        // gonfia anche l'altezza di <nav> stesso. Se aggiornassimo navHeight anche a pannello
        // aperto, il tetto del pannello (calc(100dvh - var(--nav-height)), navbar.component.scss)
        // si ricalcolerebbe su un'altezza già gonfiata dal pannello stesso — un ciclo che lo
        // schiaccia quasi a zero. L'altezza "a riposo" (barra chiusa) non cambia mentre il
        // pannello è aperto, quindi ignorare gli aggiornamenti in quella finestra è corretto,
        // non solo un modo per evitare il loop.
        const observer = new ResizeObserver(([entry]) => {
            if (!this.menuOpen()) this.navHeight.set(entry.target.clientHeight);
        });
        observer.observe(el);
        this.destroyRef.onDestroy(() => observer.disconnect());
    }

    private setupOverflowObserver(): void {
        this.recomputeOverflow();
        const container = this.containerFluidEl()?.nativeElement;
        const list = this.navListEl()?.nativeElement;
        if (!container || !list) return;
        const observer = new ResizeObserver(() => this.recomputeOverflow());
        observer.observe(container);
        observer.observe(list);
        this.destroyRef.onDestroy(() => observer.disconnect());
    }

    /** Ricalcola quante voci di primo livello entrano in riga, dalla larghezza reale disponibile.
     *  Sotto md il pannello collassabile impila già tutto verticalmente: nessun overflow da gestire,
     *  si mostra sempre l'insieme completo. */
    private recomputeOverflow(): void {
        const currentItems = this.menuItems();
        // isDesktopViewport() è solo-browser per contratto (breakpoints.ts) — guardia necessaria
        // perché l'effect() che chiama questo metodo (sotto) gira anche in SSR.
        if (!this.isBrowser || !isDesktopViewport()) {
            this.visibleCount.set(currentItems.length);
            return;
        }

        const container = this.containerFluidEl()?.nativeElement;
        const items = this.navItemEls();
        if (!container || items.length !== currentItems.length) return;

        const brand = this.brandEl()?.nativeElement;
        const userNav = this.userNavWrapperEl()?.nativeElement;
        const langWrap = this.langWrapEl()?.nativeElement;
        const GAP = 16; // 1rem — coerente con .navbar-collapse{gap:1rem} in navbar.component.scss
        const available = container.clientWidth
            - (brand?.offsetWidth ?? 0)
            - (userNav?.offsetWidth ?? 0)
            - (langWrap?.offsetWidth ?? 0)
            - GAP * 3; // brand↔collapse, ul↔user-nav, user-nav↔lingua

        const widths = items.map(ref => ref.nativeElement.offsetWidth);
        const fitCount = (budget: number): number => {
            let used = 0;
            let count = 0;
            for (const w of widths) {
                const next = used + (count > 0 ? GAP : 0) + w;
                if (next > budget) break;
                used = next;
                count++;
            }
            return count;
        };

        let count = fitCount(available);
        if (count < widths.length) {
            // Non entrano tutte: si riserva anche lo spazio del toggle "Altro" stesso e si
            // ricalcola. Se "Altro" esiste già da un giro precedente se ne misura la larghezza
            // vera; altrimenti (primo giro in cui serve, non ancora nel DOM: comparirebbe solo
            // dopo, effetto a cascata) una stima fissa volutamente un po' generosa — nel
            // peggiore dei casi una voce in più nel dropdown al primo giro, mai un pixel di
            // contenuto tagliato fuori dalla viewport.
            const ALTRO_WIDTH_ESTIMATE_FALLBACK = 96;
            const altroWidth = this.altroToggleEl()?.nativeElement.offsetWidth || ALTRO_WIDTH_ESTIMATE_FALLBACK;
            count = fitCount(available - GAP - altroWidth);
        }
        if (count !== this.visibleCount()) {
            this.visibleCount.set(count);
        }
    }

    toggleMenu(): void {
        this.menuOpen.update(open => !open);
        if (!this.menuOpen()) {
            this.closeAllDropdowns();
        }
    }

    isRouteActive(path: string | null): boolean {
        if (path === null) return false;
        this.currentUrl(); // signal dependency → re-render on every navigation
        return this.router.isActive(path, { paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' });
    }

    /** Type-guard riusato nel template per ramificare voce-gruppo (dropdown) / voce-link. */
    readonly isGroup = isNavGroup;

    isNavDropdownOpen(i: number): boolean {
        return this.openDropdownIndex() === i;
    }

    onNavDropdownToggle(i: number): void {
        this.langOpen.set(false);
        this.openDropdownIndex.update(cur => cur === i ? -1 : i);
    }

    toggleLang(): void {
        this.openDropdownIndex.set(-1);
        this.langOpen.update(v => !v);
    }

    onNavigationLinkClick(): void {
        this.closeNavigation();
    }

    onDocumentClick(event: MouseEvent): void {
        if (!this.elRef.nativeElement.contains(event.target)) {
            this.closeAllDropdowns();
        }
    }

    setLanguage(lang: string): void {
        void this.applyLanguageSwitch(lang);
    }

    /** Cambio lingua esplicito: prima lo stato (attende il caricamento dei cataloghi della nuova
     *  lingua), poi la navigazione al path equivalente — così URL e contenuto restano sempre
     *  allineati, invece di lasciare l'URL fermo mentre cambia solo lo stato sotto silenzio.
     *  `getPath` su una pagina parametrica (es. `/social-feed/:slug`) torna il template letterale:
     *  senza sostituire i param della route attiva, il `:slug` finirebbe nell'URL per davvero —
     *  un path che non combacia con nessuna rotta (404). */
    private async applyLanguageSwitch(lang: string): Promise<void> {
        await this.translate.setLanguage(lang);
        const currentType = this.pageMeta.currentPageType();
        const homeType = ContestoSito.config.homePage;
        const template = (currentType != null ? ContestoSito.getPath(currentType, lang) : null)
            ?? (homeType != null ? ContestoSito.getPath(homeType, lang) : null)
            ?? '/';
        const params = mergeRouteParams(this.router.routerState.snapshot);
        const target = applyPathParams(template, params, 'NavbarComponent.applyLanguageSwitch');
        void this.router.navigate([target]);
        this.closeNavigation();
    }

    /** Nome nativo della lingua dal codice (via Intl), con fallback al codice in MAIUSCOLO. */
    langName(code: string): string {
        return this.localization.nameOf()(code);
    }

    private closeNavigation(): void {
        this.menuOpen.set(false);
        this.closeAllDropdowns();
    }

    private closeAllDropdowns(): void {
        this.openDropdownIndex.set(-1);
        this.langOpen.set(false);
    }
}
