import { CSP_NONCE, inject, Injectable, InjectionToken } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { ContestoSito } from '../../../site';
import { CdnCgi } from './asset.service';
import { TranslateService } from './translate.service';

/**
 * Funzione sincrona di cifratura del payload preview.
 * Fornita in SSR via `app.config.server.ts` con `useFactory` (Node.js `crypto` sincrono).
 * Nel browser il token non è fornito → inject restituisce null → og:image non viene
 * aggiornato durante la navigazione SPA (i crawler vedono sempre l'HTML SSR).
 *
 * NOTA: usare `useFactory` anziché `useValue` — Angular 19 SSR non propaga correttamente
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
    private readonly cspNonce = inject(CSP_NONCE, { optional: true });

    /** Cifratura preview: disponibile solo in SSR, null nel browser. */
    private readonly encryptFn = inject(SSR_PREVIEW_ENCRYPT_FN, { optional: true });
    /** Origin del frontend: fornito in SSR, null nel browser. */
    private readonly frontendOrigin = inject(SSR_FRONTEND_ORIGIN, { optional: true });


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
     * @param pageTitle - Titolo grezzo della pagina (es. "Home", non "Home | Template")
     * @param description - Meta-description per i motori di ricerca
     * @param imgId - ID asset dell'immagine di anteprima:
     *               - `string` → variante con immagine (sovrapposizione asset + favicon + badge)
     *               - `false`  → nessuna anteprima (og:image e twitter:image rimossi)
     *               - `null` / `undefined` → variante testuale (SVG con titolo e sottotitolo)
     * @param ogType - Tipo Open Graph (es. 'website', 'article'). Default: 'website'.
     * @param structuredDataType - Tipo Schema.org JSON-LD. Default: 'WebPage'.
     * @param updatedTime - Timestamp ISO 8601 ultima modifica. Se nullo, resta
     *                     il valore globale di build emesso da `generate-statics.ts`.
     */
    setPageMeta(
        pageTitle: string,
        description?: string | null,
        imgId?: string | null | false,
        ogType?: string | null,
        structuredDataType?: string | null,
        updatedTime?: string | null,
    ): void {

        // Titolo browser: "Pagina | AppName", oppure solo "AppName" se pageTitle è vuoto
        const { appName } = ContestoSito.config;
        const browserTitle = pageTitle ? `${pageTitle} | ${appName}` : appName;

        // Aggiorna il tag <title> del browser
        this.title.setTitle(browserTitle);

        // Aggiorna i tag per i social (Open Graph e Twitter)
        this.meta.updateTag({ name: 'twitter:title', content: browserTitle });
        this.meta.updateTag({ property: 'og:title', content: browserTitle });

        // Se presente, aggiorna la descrizione ovunque
        if (!!description) {
            this.meta.updateTag({ name: 'description', content: description });
            this.meta.updateTag({ property: 'og:description', content: description });
            this.meta.updateTag({ name: 'twitter:description', content: description });
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
        } else if (this.encryptFn) {
            const payload: Record<string, string> = { title: pageTitle };
            if (description) payload['subtitle'] = description;
            if (imgId) payload['id'] = imgId;
            if (ContestoSito.config.onlyPlainImage) payload['onlyImage'] = 'true';
            const blob = this.encryptFn(payload);
            imageUrl = `${origin}${CdnCgi.preview}?p=${blob}`;
            this.meta.updateTag({ property: 'og:image', content: imageUrl });
            this.meta.updateTag({ name: 'twitter:image', content: imageUrl });
        }

        // Aggiorna JSON-LD structured data
        this.updateStructuredData(pageTitle || appName, description, imageUrl, structuredDataType || 'WebPage', canonicalUrl);
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
     * Vengono emessi blocchi separati per WebPage, Organization, WebSite e,
     * quando utile, BreadcrumbList: separarli rende il grafo piu' leggibile ai
     * validator e permette di aggiornare ogni entita' senza sovrascrivere le altre.
     * @param schemaType Tipo Schema.org (@type), es. 'WebPage', 'Article'. Default: 'WebPage'.
     */
    private updateStructuredData(
        title: string,
        description?: string | null,
        imageUrl?: string | null,
        schemaType: string = 'WebPage',
        canonicalUrl: string = this.getCanonicalUrl(),
    ): void {
        const { appName } = ContestoSito.config;
        const siteUrl = this.getSiteUrl(canonicalUrl);
        const currentLang = this.translate.currentLang();
        const organizationId = `${siteUrl}#organization`;
        const websiteId = `${siteUrl}#website`;
        const pageId = `${canonicalUrl}#webpage`;

        const organization = {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            '@id': organizationId,
            name: appName,
            url: siteUrl,
            logo: `${siteUrl}icons/icon-512x512.png`,
        };

        const website = {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            '@id': websiteId,
            url: siteUrl,
            name: appName,
            ...(ContestoSito.config.description && { description: ContestoSito.config.description }),
            inLanguage: currentLang,
            publisher: { '@id': organizationId },
        };

        const webPage = {
            '@context': 'https://schema.org',
            '@type': schemaType,
            '@id': pageId,
            name: title,
            ...(description && { description }),
            url: canonicalUrl,
            inLanguage: currentLang,
            isPartOf: { '@id': websiteId },
            publisher: { '@id': organizationId },
            // Se imageUrl è null, undefined o stringa vuota, l'oggetto image non viene aggiunto
            ...(imageUrl && {
                image: {
                    '@type': 'ImageObject',
                    url: imageUrl
                }
            }),
        };

        const graph: object[] = [organization, website, webPage];
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
            script.textContent = JSON.stringify(data);
            this.document.head.appendChild(script);
        });
    }

    /**
     * Costruisce un canonical stabile: niente query/hash e, in SSR, origin forzato
     * a FRONTEND_BASE_URL. Evita canonical divergenti tra HTML iniziale e idratazione.
     */
    private getCanonicalUrl(): string {
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
