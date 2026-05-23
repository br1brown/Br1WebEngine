import { inject, Injectable, InjectionToken } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { ContestoSito } from '../../site';
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

        // Gestione URL e Origin
        // In SSR, document.URL riflette l'indirizzo richiesto dal client.
        const url = this.document.URL;

        const origin = this.frontendOrigin
            || this.document.location?.origin
            || (() => { try { return new URL(url).origin; } catch { return ''; } })();

        this.meta.updateTag({ property: 'og:url', content: url });

        // Gestione del tag rel="canonical"
        this.updateCanonical(url);

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
        this.updateStructuredData(pageTitle || appName, description, imageUrl, structuredDataType || 'WebPage');
    }

    /**
     * Aggiorna og:locale e og:locale:alternate basandosi sulla lingua corrente.
     * Formato: "it_IT", "en_US", ecc.
     */
    private updateLocaleMetaTags(): void {
        const currentLang = this.translate.currentLang();
        const allLangs = this.translate.availableLangs();

        const localeFormat = (lang: string): string => {
            const [base] = lang.split('-');
            return `${base}_${base.toUpperCase()}`;
        };

        this.meta.updateTag({ property: 'og:locale', content: localeFormat(currentLang) });

        // Alternate locales per le altre lingue disponibili
        allLangs
            .filter(l => l !== currentLang)
            .forEach(lang => {
                this.meta.updateTag({ property: 'og:locale:alternate', content: localeFormat(lang) });
            });
    }

    /**
     * Aggiorna il tag script JSON-LD con structured data.
     * Accetta imageUrl come stringa, null o undefined.
     * @param schemaType Tipo Schema.org (@type), es. 'WebPage', 'Article'. Default: 'WebPage'.
     */
    private updateStructuredData(title: string, description?: string | null, imageUrl?: string | null, schemaType: string = 'WebPage'): void {
        const { appName } = ContestoSito.config;
        const url = this.document.URL;

        const structuredData = {
            '@context': 'https://schema.org',
            '@type': schemaType,
            name: title,
            ...(description && { description }),
            url,
            // Se imageUrl è null, undefined o stringa vuota, l'oggetto image non viene aggiunto
            ...(imageUrl && {
                image: {
                    '@type': 'ImageObject',
                    url: imageUrl
                }
            }),
            publisher: {
                '@type': 'Organization',
                name: appName
            }
        };

        // Logica per rimuovere il vecchio script e appendere il nuovo...
        const existing = this.document.querySelector('script[type="application/ld+json"]');
        if (existing) {
            existing.remove();
        }

        const script = this.document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(structuredData);
        this.document.head.appendChild(script);
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
