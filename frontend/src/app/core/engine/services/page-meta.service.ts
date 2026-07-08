import { CSP_NONCE, inject, Injectable, InjectionToken, DOCUMENT, signal } from '@angular/core';

import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { ContestoSito } from '../../../site';
import { pickLocaleText } from '../siteBuilder';
import { CdnCgi } from './asset.service';
import { TranslateService } from './translate.service';
import { IdentityService } from './identity.service';
import { type Identity, type Address, type DayName, DAY_ORDER } from '../dto/identity.dto';
import { type StructuredDataInput, buildStructuredDataGraph } from './structured-data';

/** Orario "HH:mm" (24h): difesa contro valori sporchi prima di mapparli su JSON-LD. */
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function isHm(value: unknown): value is string {
    return typeof value === 'string' && HM_RE.test(value);
}

/** Input di {@link PageMetaService.setPageMeta}. Tutti i campi tranne `title` sono opzionali. */
export interface PageMetaInput {
    /** Titolo grezzo della pagina (es. "Home", non "Home | Template"). */
    title: string;
    /** Meta-description. Se assente/null si usa la `site.description` di default (localizzata). */
    description?: string | null;
    /** ID asset anteprima: `string` = variante immagine; `false` = nessuna anteprima; assente = variante testuale. */
    imgId?: string | null | false;
    /** Tipo Open Graph (es. 'website', 'article'). Default: 'website'. */
    ogType?: string | null;
    /** Timestamp ISO 8601 ultima modifica (og:updated_time). Se assente resta il valore di build. */
    updatedTime?: string | null;
    /** Dati strutturati ricchi tipizzati: un item o una lista (vedi `structured-data.ts`). Tradotti in JSON-LD. */
    structuredData?: StructuredDataInput | null;
}

/**
 * Funzione sincrona di cifratura del payload preview.
 * Fornita in SSR via `app.config.server.ts` con `useFactory` (Node.js `crypto` sincrono).
 * Nel browser il token non è fornito → inject restituisce null → og:image non viene
 * aggiornato durante la navigazione SPA (i crawler vedono sempre l'HTML SSR).
 *
 * NOTA: usare `useFactory` anziché `useValue` — Angular SSR non propaga correttamente
 * funzioni passate con `useValue` agli injection token.
 */
export const SSR_PREVIEW_ENCRYPT_FN =
    new InjectionToken<(payload: Record<string, string>) => string>('SSR_PREVIEW_ENCRYPT_FN');

/**
 * Origin canonico del frontend (es. "https://yourdomain.com"), letto da FRONTEND_BASE_URL.
 * Fornito in SSR via app.config.server.ts con useValue — sorgente di verità per og:image,
 * indipendente dagli header proxy e dal valore che Angular ricostruisce per document.URL.
 * Nel browser non è fornito → fallback a document.location.origin.
 */
export const SSR_FRONTEND_ORIGIN =
    new InjectionToken<string>('SSR_FRONTEND_ORIGIN');


/**
 * PAGE META SERVICE
 * Gestisce l'aggiornamento dinamico del titolo della pagina e dei meta tag.
 * Essenziale per l'indicizzazione (Google) e il social sharing (Facebook, LinkedIn, ecc.).
 */
@Injectable({ providedIn: 'root' })
export class PageMetaService {
    // Servizi Angular per manipolare i tag nel <head>
    private readonly title = inject(Title);
    private readonly meta = inject(Meta);
    private readonly document = inject(DOCUMENT);
    private readonly translate = inject(TranslateService);
    private readonly identity = inject(IdentityService);
    private readonly cspNonce = inject(CSP_NONCE, { optional: true });

    /** Cifratura preview: disponibile solo in SSR, null nel browser. */
    private readonly encryptFn = inject(SSR_PREVIEW_ENCRYPT_FN, { optional: true });
    /** Origin del frontend: fornito in SSR, null nel browser. */
    private readonly frontendOrigin = inject(SSR_FRONTEND_ORIGIN, { optional: true });

    /** Titolo browser dell'ultima `setPageMeta`: la shell lo annuncia (regione `aria-live`) agli
     *  screen reader dopo ogni navigazione SPA, dove il cambio pagina non ricarica il documento e
     *  quindi non genera di per sé alcun annuncio automatico. Stesso testo del tag `<title>`. */
    readonly announcedTitle = signal('');

    /**
     * Utility statica per navigare l'albero delle rotte di Angular.
     * Trova l'ultima rotta figlia attiva (quella che effettivamente definisce il contenuto della pagina).
     */
    static getLeaf(route: ActivatedRouteSnapshot | RouterStateSnapshot): ActivatedRouteSnapshot {
        let leaf = route instanceof RouterStateSnapshot ? route.root : route;
        while (leaf.firstChild) leaf = leaf.firstChild;
        return leaf;
    }

    /**
     * Applica i metadati alla pagina corrente.
     *
     * Tutti i tag (title, og:title, description, canonical, ecc.) vengono scritti
     * in modo sincrono. L'aggiornamento di `og:image` / `twitter:image` avviene
     * solo in SSR, dove la funzione di cifratura è fornita via InjectionToken
     * (`SSR_PREVIEW_ENCRYPT_FN`). Nel browser il token è assente: i tag og:image
     * restano quelli iniettati dall'SSR — i crawler non eseguono JavaScript,
     * quindi vedono sempre la versione server-rendered.
     *
     * @param input - Vedi {@link PageMetaInput}. `title` è il titolo grezzo (es. "Home", non "Home | Template").
     */
    setPageMeta(input: PageMetaInput): void {
        const { title: pageTitle, description, imgId, ogType, updatedTime, structuredData } = input;

        // Titolo browser: "Pagina | AppName", oppure solo "AppName" se pageTitle è vuoto
        const { appName } = ContestoSito.config;
        const browserTitle = pageTitle ? `${pageTitle} | ${appName}` : appName;

        // Aggiorna il tag <title> del browser
        this.title.setTitle(browserTitle);
        this.announcedTitle.set(browserTitle);

        // Aggiorna i tag per i social (Open Graph e Twitter)
        this.meta.updateTag({ name: 'twitter:title', content: browserTitle });
        this.meta.updateTag({ property: 'og:title', content: browserTitle });

        // twitter:site (@handle del brand) derivato dai profili social, se ce n'è uno Twitter/X.
        const twitterSite = this.twitterSiteHandle();
        if (twitterSite) this.meta.updateTag({ name: 'twitter:site', content: twitterSite });

        // Description: se la pagina non ne ha una, si ricade sulla description di default del
        // sito (localizzata) anziché lasciare quella della pagina precedente — che in navigazione
        // SPA resterebbe "stantia". I crawler vedono l'SSR fresco, ma così è coerente anche lato client.
        const metaDescription = description
            ?? pickLocaleText(ContestoSito.config.description, this.translate.currentLang());
        if (metaDescription) {
            this.meta.updateTag({ name: 'description', content: metaDescription });
            this.meta.updateTag({ property: 'og:description', content: metaDescription });
            this.meta.updateTag({ name: 'twitter:description', content: metaDescription });
        }

        const canonicalUrl = this.getCanonicalUrl();
        const origin = this.getCanonicalOrigin(canonicalUrl);

        this.meta.updateTag({ property: 'og:url', content: canonicalUrl });

        // Gestione del tag rel="canonical"
        this.updateCanonical(canonicalUrl);

        // Aggiorna og:type (default: website)
        this.meta.updateTag({ property: 'og:type', content: ogType || 'website' });

        // Override per-pagina di og:updated_time. Se assente resta il valore
        // globale di build (segnale di refresh per gli scraper social a ogni deploy).
        if (updatedTime) {
            this.meta.updateTag({ property: 'og:updated_time', content: updatedTime });
        }

        // Aggiorna og:locale e og:locale:alternate per i18n
        this.updateLocaleMetaTags();

        // og:image: in SSR cifra il payload e scrive l'URL; nel browser salta
        // (i crawler vedono sempre l'HTML server-rendered).
        // imgId === false → pagina senza anteprima: i tag vengono rimossi.
        let imageUrl: string | null = null;
        if (imgId === false) {
            this.meta.removeTag('property="og:image"');
            this.meta.removeTag('name="twitter:image"');
            this.removeImageDimensionTags();
            // Senza immagine la card grande non ha senso: si declassa a 'summary' (testo).
            this.meta.updateTag({ name: 'twitter:card', content: 'summary' });
        } else if (this.encryptFn) {
            const payload: Record<string, string> = { title: pageTitle };
            if (description) payload['subtitle'] = description;
            if (imgId) payload['id'] = imgId;
            if (ContestoSito.config.onlyPlainImage) payload['onlyImage'] = 'true';
            const blob = this.encryptFn(payload);
            imageUrl = `${origin}${CdnCgi.preview}?p=${blob}`;
            this.meta.updateTag({ property: 'og:image', content: imageUrl });
            this.meta.updateTag({ name: 'twitter:image', content: imageUrl });

            // Dimensioni/tipo dichiarati: i crawler renderizzano la card senza dover prima
            // scaricare l'immagine (niente prima-condivisione "vuota"). Il canvas è 1200x630
            // per entrambe le varianti; il MIME segue il formato realmente generato in
            // og-preview.ts (variante con immagine → JPEG, variante testuale → PNG).
            this.meta.updateTag({ property: 'og:image:width', content: '1200' });
            this.meta.updateTag({ property: 'og:image:height', content: '630' });
            this.meta.updateTag({ property: 'og:image:type', content: imgId ? 'image/jpeg' : 'image/png' });
            this.meta.updateTag({ property: 'og:image:alt', content: browserTitle });
            this.meta.updateTag({ name: 'twitter:image:alt', content: browserTitle });
            // secure_url: ridondante ma richiesto da alcuni scraper datati (solo se già https).
            if (imageUrl.startsWith('https:')) {
                this.meta.updateTag({ property: 'og:image:secure_url', content: imageUrl });
            }
            // C'è un'immagine 1200x630: card grande.
            this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
        }

        // Aggiorna JSON-LD structured data (usa la description risolta, coerente con i meta tag)
        this.updateStructuredData(pageTitle || appName, metaDescription, imageUrl, canonicalUrl, structuredData);
    }

    /** Emette i meta Open Graph `article:*` dell'entità principale (da `structuredData` di tipo
     *  article). Rimuove prima tutti gli `article:*` esistenti — così in navigazione SPA non
     *  restano stantii passando a una pagina non-articolo — e li riemette (`article:tag` ripetibile). */
    private updateArticleMeta(ogMeta: { property: string; content: string }[]): void {
        this.document.querySelectorAll('meta[property^="article:"]').forEach(tag => tag.remove());
        for (const { property, content } of ogMeta) {
            this.meta.addTag({ property, content });
        }
    }

    /** Estrae l'handle Twitter/X (`@nome`) dai profili social del brand (identità), per
     *  `twitter:site`. Ritorna il primo trovato, o `null` se nessun profilo Twitter/X è configurato. */
    private twitterSiteHandle(): string | null {
        const social = this.identity.identity()?.social;
        if (!Array.isArray(social)) return null;
        for (const entry of social) {
            if (typeof entry?.url !== 'string') continue;
            // Parsing con la primitiva `URL` (non regex): valida l'URL ed estrae host/handle in modo
            // robusto (host esatto, niente match casuali in query/path). Gli URL non validi sono già
            // scartati a monte dal backend, ma il try/catch tiene comunque sicuro il render SSR.
            let parsed: URL;
            try { parsed = new URL(entry.url); } catch { continue; }
            const host = parsed.hostname.replace(/^www\./, '');
            if (host !== 'twitter.com' && host !== 'x.com') continue;
            const handle = parsed.pathname.split('/').filter(Boolean)[0]?.replace(/^@/, '');
            if (handle && /^[A-Za-z0-9_]{1,15}$/.test(handle)) return `@${handle}`;
        }
        return null;
    }

    /** `PostalAddress` da un indirizzo dell'identità (sede legale o operativa). Null se nessun campo utile. */
    private buildPostalAddress(a: Address | null | undefined): Record<string, unknown> | null {
        if (!a) return null;
        const street = [a.via, a.civico].filter(s => typeof s === 'string' && s.trim()).join(' ').trim();
        const addr: Record<string, unknown> = { '@type': 'PostalAddress' };
        if (street) addr['streetAddress'] = street;
        if (a.cap?.trim()) addr['postalCode'] = a.cap.trim();
        if (a.citta?.trim()) addr['addressLocality'] = a.citta.trim();
        if (a.provincia?.trim()) addr['addressRegion'] = a.provincia.trim();
        // addressCountry = codice ISO 3166-1 alpha-2 (la forma che schema.org/Google preferiscono).
        if (a.nazione?.trim()) addr['addressCountry'] = a.nazione.trim();
        return Object.keys(addr).length > 1 ? addr : null;   // solo @type → nessun dato
    }

    /** `ContactPoint` con telefono/email, `hoursAvailable` dagli orari e `availableLanguage` dalle
     *  lingue configurate del sito. `includeHours=false` per un'attività, dove gli orari vivono come
     *  `openingHoursSpecification` sul nodo (qui sarebbero un doppione). Null se non c'è canale né orari. */
    private buildContactPoint(identity: Identity | null, includeHours = true): Record<string, unknown> | null {
        const c = identity?.contatti;
        const hours = includeHours ? this.buildOpeningHours(identity) : [];
        const cp: Record<string, unknown> = { '@type': 'ContactPoint', contactType: 'customer service' };
        if (c?.telefono?.trim()) cp['telephone'] = c.telefono.trim();
        if (c?.email?.trim()) cp['email'] = c.email.trim();
        if (hours.length) cp['hoursAvailable'] = hours;
        // Serve almeno un canale (telefono/email) o gli orari, altrimenti niente ContactPoint.
        if (!cp['telephone'] && !cp['email'] && !hours.length) return null;
        // availableLanguage: derivato dalle lingue del sito (config), arricchisce un ContactPoint esistente.
        const langs = this.translate.availableLangs();
        if (Array.isArray(langs) && langs.length) cp['availableLanguage'] = langs;
        return cp;
    }

    /** Orari (lista di intervalli) → `OpeningHoursSpecification[]`: una spec per fascia, coi giorni che
     *  la condividono. `dayOfWeek` = `schema.org/{nome giorno}` diretto (il nome `DayOfWeek` È il nome
     *  schema.org), niente mappa a mano. Type-safe contro valori sporchi (JSON/compose/CMS). */
    private buildOpeningHours(identity: Identity | null): Record<string, unknown>[] {
        const list = identity?.openingHours;
        if (!Array.isArray(list)) return [];

        // Raggruppa per fascia (opens-closes) → giorni.
        const byRange = new Map<string, { opens: string; closes: string; days: DayName[] }>();
        for (const it of list) {
            if (!it || !DAY_ORDER.includes(it.day) || !isHm(it.opens) || !isHm(it.closes)) continue;
            const group = byRange.get(`${it.opens}-${it.closes}`);
            if (group) { if (!group.days.includes(it.day)) group.days.push(it.day); }
            else byRange.set(`${it.opens}-${it.closes}`, { opens: it.opens, closes: it.closes, days: [it.day] });
        }

        const out: Record<string, unknown>[] = [];
        for (const { opens, closes, days } of byRange.values()) {
            out.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: days.map(d => `https://schema.org/${d}`), opens, closes });
        }
        return out;
    }

    /** Rimuove i tag accessori dell'immagine (dimensioni/tipo/alt) quando la pagina non
     *  ha anteprima: evita che restino orfani dopo aver rimosso og:image/twitter:image. */
    private removeImageDimensionTags(): void {
        this.meta.removeTag('property="og:image:width"');
        this.meta.removeTag('property="og:image:height"');
        this.meta.removeTag('property="og:image:type"');
        this.meta.removeTag('property="og:image:alt"');
        this.meta.removeTag('property="og:image:secure_url"');
        this.meta.removeTag('name="twitter:image:alt"');
    }

    /**
     * Aggiorna og:locale e og:locale:alternate basandosi sulla lingua corrente.
     * Formato: "it_IT", "en_US", ecc.
     */
    private updateLocaleMetaTags(): void {
        const currentLang = this.translate.currentLang();
        const allLangs = this.translate.availableLangs();

        const localeFormat = (lang: string): string => {
            try {
                const locale = new Intl.Locale(lang).maximize();
                return locale.region ? `${locale.language}_${locale.region}` : locale.language;
            } catch {
                const [base] = lang.split('-');
                return `${base}_${base.toUpperCase()}`;
            }
        };

        this.meta.updateTag({ property: 'og:locale', content: localeFormat(currentLang) });

        // Alternate locales per le altre lingue disponibili. remove+add evita
        // che Meta.updateTag sovrascriva un solo tag quando le lingue sono > 2.
        this.document
            .querySelectorAll('meta[property="og:locale:alternate"]')
            .forEach(tag => tag.remove());
        allLangs
            .filter(l => l !== currentLang)
            .forEach(lang => {
                this.meta.addTag({ property: 'og:locale:alternate', content: localeFormat(lang) });
            });
    }

    /**
     * Aggiorna gli script JSON-LD con structured data coerenti con il canonical.
     *
     * Vengono emessi blocchi separati per WebPage, l'entità brand (Organization o Person,
     * dall'identità `personal`), WebSite e, quando utile, BreadcrumbList: separarli rende il grafo piu' leggibile ai
     * validator e permette di aggiornare ogni entita' senza sovrascrivere le altre.
     * @param structuredData Dati strutturati: stringa (solo @type), oggetto tipizzato o lista.
     *        L'adapter li traduce in JSON-LD, arricchendo il nodo pagina (@type + proprietà) ed
     *        eventualmente aggiungendo nodi al grafo. Se assente il nodo pagina resta `WebPage`.
     */
    private updateStructuredData(
        title: string,
        description?: string | null,
        imageUrl?: string | null,
        canonicalUrl: string = this.getCanonicalUrl(),
        structuredData?: StructuredDataInput | null,
    ): void {
        const { appName } = ContestoSito.config;
        const siteUrl = this.getSiteUrl(canonicalUrl);
        const currentLang = this.translate.currentLang();
        // Identità del sito (runtime, condivisa): dà natura del brand, social e nome legale.
        // Assente (sito che non la configura, o backend giù) → default Organization senza sameAs.
        const identity = this.identity.identity();
        // Tipo entità brand: se l'identità dichiara un'attività fisica (businessType, es. "Restaurant")
        // l'entità è quel sottotipo di LocalBusiness; altrimenti Person per un sito personale
        // (personal=true) o Organization (default). È il publisher di WebSite/WebPage.
        const businessType = typeof identity?.businessType === 'string' && identity.businessType.trim()
            ? identity.businessType.trim() : null;
        // Un'attività locale è sempre Organization-like, mai Person: così i gate legali sotto restano validi.
        const isPerson = (identity?.personal ?? false) && !businessType;
        const publisherId = `${siteUrl}#${isPerson ? 'person' : 'organization'}`;
        const websiteId = `${siteUrl}#website`;
        const pageId = `${canonicalUrl}#webpage`;

        // sameAs dai profili social ufficiali del brand (solo gli URL; il `name` è footer). Vuoto → omesso.
        const social = Array.isArray(identity?.social)
            ? identity.social.map(s => s?.url).filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
            : [];
        const brandImage = `${siteUrl}icons/icon-512x512.png`;
        // Indirizzo del nodo: per un'attività la sede operativa fisica (fallback alla legale), altrimenti
        // la sede legale. Gli orari di un'attività vanno come openingHoursSpecification SUL NODO (segnale
        // locale di Google); su Organization/Person restano in contactPoint.hoursAvailable.
        const address = this.buildPostalAddress(
            (businessType && identity?.sedeOperativa) ? identity.sedeOperativa : identity?.sedeLegale);
        const openingHours = businessType ? this.buildOpeningHours(identity) : [];
        const contactPoint = this.buildContactPoint(identity, !businessType);
        const publisher = {
            // Default dell'Engine: tipo, nome, identificativi legali, social, indirizzo, contatti.
            '@type': businessType ?? (isPerson ? 'Person' : 'Organization'),
            // Nome dell'entità brand: ragione sociale legale se presente, altrimenti il nome del sito.
            name: identity?.ragioneSociale || appName,
            url: siteUrl,
            // L'icona del brand (stessa sorgente via mapping asset): Organization la espone come
            // `logo` (Knowledge Panel), Person come `image` (foto profilo) — `logo` non è valido su Person.
            ...(isPerson ? { image: brandImage } : { logo: brandImage }),
            // Identificativi legali (solo Organization): fatti dichiarati nell'identità, non dedotti.
            ...(!isPerson && identity?.ragioneSociale && { legalName: identity.ragioneSociale }),
            ...(!isPerson && identity?.partitaIva && { vatID: identity.partitaIva }),
            ...(!isPerson && identity?.codiceFiscale && { taxID: identity.codiceFiscale }),
            // sameAs: profili ufficiali del brand → segnale per il Knowledge Panel di Google.
            ...(social.length > 0 && { sameAs: social }),
            ...(address && { address }),
            // openingHoursSpecification sul nodo: solo per un'attività (Organization non ha questo campo).
            ...(openingHours.length > 0 && { openingHoursSpecification: openingHours }),
            ...(contactPoint && { contactPoint }),
            // Via di fuga: le proprietà extra del figlio fuse PER ULTIME → SOVRASCRIVONO i default,
            // non solo aggiungono (es. `@type` → `LocalBusiness`/sottotipi, `geo`, `priceRange`).
            ...(identity?.extra && typeof identity.extra === 'object' ? identity.extra : {}),
            // Perni del grafo: `@context` e `@id` restano sempre dell'Engine — `website`/`webpage`
            // referenziano il publisher via `@id`, l'extra non deve poterli spezzare.
            '@context': 'https://schema.org',
            '@id': publisherId,
        };

        const siteDescription = pickLocaleText(ContestoSito.config.description, currentLang);
        const website = {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            '@id': websiteId,
            url: siteUrl,
            name: appName,
            ...(siteDescription && { description: siteDescription }),
            inLanguage: currentLang,
            publisher: { '@id': publisherId },
        };

        // Segnale di freschezza: riusa il valore effettivo di og:updated_time (override per-pagina
        // se impostato, altrimenti il timestamp di build emesso in index.html da generate-statics).
        const dateModified = this.meta.getTag('property="og:updated_time"')?.content;

        // Structured data tipizzati → JSON-LD (unico punto di traduzione, in structured-data.ts).
        // Compone uno o più item: il primo arricchisce il WebPage, gli altri sono nodi a sé.
        const sd = buildStructuredDataGraph(structuredData, { pageName: title, imageUrl, dateModified, publisherId });

        // Meta Open Graph dell'entità principale (es. article:*), gemelli dei dati JSON-LD.
        this.updateArticleMeta(sd.ogMeta);

        const webPage = {
            '@context': 'https://schema.org',
            '@type': sd.pageType ?? 'WebPage',
            '@id': pageId,
            name: title,
            ...(description && { description }),
            url: canonicalUrl,
            inLanguage: currentLang,
            ...(dateModified && { dateModified }),
            isPartOf: { '@id': websiteId },
            publisher: { '@id': publisherId },
            // Se imageUrl è null, undefined o stringa vuota, l'oggetto image non viene aggiunto
            ...(imageUrl && {
                image: {
                    '@type': 'ImageObject',
                    url: imageUrl
                }
            }),
            // Arricchimento dall'adapter (headline/author/offers/…). Va per ultimo: ha la precedenza.
            ...sd.pageProps,
        };

        // Nodi standalone dall'adapter (item successivi al primo + tutti i 'raw'), accanto al WebPage.
        const graph: object[] = [publisher, website, webPage, ...sd.nodes];
        const breadcrumb = this.buildBreadcrumbData(title, canonicalUrl, siteUrl);
        if (breadcrumb) graph.push(breadcrumb);

        this.document
            .querySelectorAll('script[type="application/ld+json"][data-br1-jsonld]')
            .forEach(script => script.remove());

        graph.forEach((data, index) => {
            const script = this.document.createElement('script');
            script.type = 'application/ld+json';
            script.setAttribute('data-br1-jsonld', String(index));
            if (this.cspNonce) script.nonce = this.cspNonce;
            // Hardening anti-XSS: escape di <, >, & in \uXXXX così un valore tipo "</script>"
            // non può chiudere il tag e iniettare markup (breakout). I parser JSON-LD decodificano
            // gli escape: il dato resta identico e valido. Vale per qualunque sorgente del grafo
            // (identità, structured data di pagina, raw), anche quando i dati vengono da DB/CMS.
            script.textContent = JSON.stringify(data)
                .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
            this.document.head.appendChild(script);
        });
    }

    /**
     * Costruisce un canonical stabile: niente query/hash e, in SSR, origin forzato
     * a FRONTEND_BASE_URL. Evita canonical divergenti tra HTML iniziale e idratazione.
     */
    public getCanonicalUrl(): string {
        try {
            const parsed = new URL(this.document.URL);
            parsed.search = '';
            parsed.hash = '';

            const configuredOrigin = this.frontendOrigin?.replace(/\/$/, '');
            if (configuredOrigin) {
                const configured = new URL(configuredOrigin);
                parsed.protocol = configured.protocol;
                parsed.host = configured.host;
            }

            return parsed.toString();
        } catch {
            return this.frontendOrigin?.replace(/\/$/, '') || '/';
        }
    }

    private getCanonicalOrigin(canonicalUrl: string): string {
        try { return new URL(canonicalUrl).origin; } catch { return ''; }
    }

    private getSiteUrl(canonicalUrl: string): string {
        const origin = this.getCanonicalOrigin(canonicalUrl);
        return origin ? `${origin}/` : '/';
    }

    private buildBreadcrumbData(title: string, canonicalUrl: string, siteUrl: string): object | null {
        const path = (() => {
            try { return new URL(canonicalUrl).pathname; } catch { return '/'; }
        })();

        if (path === '/') return null;

        return {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                {
                    '@type': 'ListItem',
                    position: 1,
                    name: ContestoSito.config.appName,
                    item: siteUrl,
                },
                {
                    '@type': 'ListItem',
                    position: 2,
                    name: title,
                    item: canonicalUrl,
                },
            ],
        };
    }

    /**
     * Gestisce il tag canonical per evitare problemi di contenuti duplicati.
     * Se il tag esiste lo aggiorna, altrimenti lo crea e lo appende al <head>.
     */
    private updateCanonical(url: string): void {
        const existing = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        if (existing) {
            existing.href = url;
            return;
        }
        const link = this.document.createElement('link');
        link.rel = 'canonical';
        link.href = url;
        this.document.head.appendChild(link);
    }
}
