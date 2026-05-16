import { inject, Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { ContestoSito } from '../../site';
import { AssetService, CdnCgi } from './asset.service';
import { TranslateService } from './translate.service';

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
     * @param pageTitle - Titolo grezzo della pagina (es. "Home", non "Home | Template").
     *                    Questo metodo aggiunge " | AppName" dove serve (browser, og:title)
     *                    e usa il titolo grezzo direttamente per /cdn-cgi/preview.
     * @param description - La meta-description per i motori di ricerca
     * @param imgId - ID asset dell'immagine di anteprima. Se nullo, genera automaticamente
     *               l'URL dell'endpoint /cdn-cgi/preview con titolo e descrizione.
     * @param ogType - Tipo Open Graph per og:type (es. 'website', 'article'). Default: 'website'.
     * @param structuredDataType - Tipo Schema.org per il JSON-LD @type (es. 'WebPage', 'Article'). Default: 'WebPage'.
     */
    setTitle(
        pageTitle: string,
        description?: string | null,
        imgId?: string | null | false,
        ogType?: string | null,
        structuredDataType?: string | null,
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

        // Calcola l'origine (dominio) in modo sicuro sia per Browser che per SSR
        const origin = this.document.location?.origin || (() => {
            try { return new URL(url).origin; } catch { return ''; }
        })();

        this.meta.updateTag({ property: 'og:url', content: url });

        // Cache busting per le immagini tramite versione del sito
        const version = ContestoSito.config.version;

        // imgId === false → pagina senza immagine di anteprima: i tag vengono rimossi.
        // imgId === string → asset statico. imgId === null/undefined → preview dinamica.
        let imageUrl: string | null = null;
        if (imgId === false) {
            this.meta.removeTag('property="og:image"');
            this.meta.removeTag('name="twitter:image"');
        } else {
            imageUrl = imgId
                ? `${origin}${AssetService._UrlPreviewImage(imgId, version)}`
                : `${origin}${PageMetaService.buildDynamicPreviewPath(pageTitle || appName, description, version)}`;
            this.meta.updateTag({ property: 'og:image', content: imageUrl });
            this.meta.updateTag({ name: 'twitter:image', content: imageUrl });
        }

        // Gestione del tag rel="canonical"
        this.updateCanonical(url);

        // Aggiorna og:type (default: website)
        this.meta.updateTag({ property: 'og:type', content: ogType || 'website' });

        // Aggiorna og:locale e og:locale:alternate per i18n
        this.updateLocaleMetaTags();

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
     * Costruisce il path relativo dell'endpoint server `/cdn-cgi/preview`
     * a partire da titolo, descrizione e versione del sito.
     *
     * Statico per essere chiamato anche dal layer server (es. in eventuali
     * generatori di sitemap o pipeline di prerender) senza dipendere da DI.
     */
    static buildDynamicPreviewPath(
        title: string,
        subtitle?: string | null,
        version?: string,
    ): string {
        const params = new URLSearchParams();
        params.set('title', title);
        if (subtitle) params.set('subtitle', subtitle);
        if (version) params.set('v', version);
        return `${CdnCgi.preview}?${params.toString()}`;
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