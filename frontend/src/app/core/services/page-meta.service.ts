import { inject, Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { ContestoSito } from '../../site';
import { AssetService } from './asset.service';

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
     */
    setTitle(
        pageTitle: string,
        description?: string | null,
        imgId?: string | null,
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
        if (description) {
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

        // Cache busting per le immagini tramite versione del sito
        const version = ContestoSito.config.version;

        // Costruzione dell'URL assoluto per l'immagine (richiesto dai crawler social).
        // pageTitle è già grezzo: nessuno strip necessario, il server lo usa direttamente.
        const imageUrl = imgId
            ? `${origin}${AssetService._UrlvirtualPathAsset(imgId, version)}`
            : `${origin}${PageMetaService.buildDynamicPreviewPath(pageTitle || appName, description, version)}`;

        // Applicazione dei tag per le anteprime grafiche
        this.meta.updateTag({ property: 'og:url', content: url });
        this.meta.updateTag({ property: 'og:image', content: imageUrl });
        this.meta.updateTag({ name: 'twitter:image', content: imageUrl });

        // Gestione del tag rel="canonical"
        this.updateCanonical(url);
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
        return `/cdn-cgi/preview?${params.toString()}`;
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