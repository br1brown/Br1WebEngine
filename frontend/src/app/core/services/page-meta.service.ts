import { inject, Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { ContestoSito } from '../../site';

/**
 * Setter puro per titolo browser e meta tag SEO (description, og:*, twitter:*, canonical).
 *
 * Riceve valori già pronti e li applica direttamente — nessuna formattazione,
 * nessuna logica di default. Quella responsabilità appartiene a chi chiama.
 *
 * L'URL assoluto viene letto da DOCUMENT.URL: in SSR riflette l'URL della richiesta,
 * garantendo og:url e canonical corretti nell'HTML servito ai crawler sociali.
 *
 * Uso tipico in un componente con contenuto dinamico:
 *   private readonly pageMeta = inject(PageMetaService);
 *   this.pageMeta.setTitle('Titolo già formattato', 'Descrizione pagina');
 */
@Injectable({ providedIn: 'root' })
export class PageMetaService {
    private readonly title = inject(Title);
    private readonly meta = inject(Meta);
    private readonly document = inject(DOCUMENT);

    /**
     * Estrae la rotta foglia (quella attiva) dall'intero albero del router.
     */
    static getLeaf(route: ActivatedRouteSnapshot | RouterStateSnapshot): ActivatedRouteSnapshot {
        let leaf = route instanceof RouterStateSnapshot ? route.root : route;
        while (leaf.firstChild) leaf = leaf.firstChild;
        return leaf;
    }

    setTitle(
        title: string,
        description?: string | null,
        imgId?: string | null,
    ): void {

        this.title.setTitle(title);

        this.meta.updateTag({ name: 'twitter:title', content: title });
        this.meta.updateTag({ property: 'og:title', content: title });
        if (!!description) {
            this.meta.updateTag({ name: 'description', content: description });
            this.meta.updateTag({ property: 'og:description', content: description });
            this.meta.updateTag({ name: 'twitter:description', content: description });
        }

        const url = this.document.URL;
        // document.location?.origin può essere falso/vuoto in SSR — estrazione da URL come fallback.
        // og:image richiede URL assoluto per i crawler social (WhatsApp, Telegram, ecc.)
        const origin = this.document.location?.origin || (() => {
            try { return new URL(url).origin; } catch { return ''; }
        })();

        const v = ContestoSito.config.version ? `?v=${ContestoSito.config.version}` : '';

        const imageUrl = imgId
            ? `${origin}/cdn-cgi/asset?id=${imgId}${v}`
            : `${origin}/icons/icon-512x512.png${v}`;

        this.meta.updateTag({ property: 'og:url', content: url });
        this.meta.updateTag({ property: 'og:image', content: imageUrl });
        this.meta.updateTag({ name: 'twitter:image', content: imageUrl });

        this.updateCanonical(url);
    }

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
