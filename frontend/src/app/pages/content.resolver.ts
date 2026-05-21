import { inject, Injectable, REQUEST } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ResolveFn } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ContestoSito, PageType } from '../site';
import { TranslateService } from '../core/services/translate.service';
import { ApiService } from '../core/services/api.service';
import { PageInfo } from '../siteBuilder';

/**
 * Dati restituiti dal resolver: contenuto della pagina + metadati SEO.
 * Il component base li riceve, aggiorna i meta tag via effect() e
 * espone pageContent() già tipizzato tramite il generic T.
 */
export interface ResolvedPage<T = unknown> {
    content: T | null;
    info: PageInfo | null;
}

/**
 * Servizio centralizzato per il caricamento dei contenuti di pagina.
 *
 * Punto unico di estensione: per aggiungere contenuto a una nuova pagina
 * basta aggiungere un case in fileSlug() — nessun altro file da toccare.
 *
 * In SSR la fetch viene risolta come URL assoluta usando l'origin della request
 * corrente (token REQUEST), cosi' la chiamata loopback raggiunge lo stesso
 * processo Express che serve gli asset statici. Nel browser resta un path
 * relativo, intercettato dal service worker / cache standard.
 */
@Injectable({ providedIn: 'root' })
export class ContentResolver {
    private readonly http = inject(HttpClient);
    private readonly translate = inject(TranslateService);
    private readonly apiService = inject(ApiService);
    private readonly request = inject(REQUEST, { optional: true });

    async loadResolved(pageType: PageType, lang?: string): Promise<ResolvedPage> {

        let language = lang ?? this.translate.currentLang();
        if (!language)
            language = ContestoSito.config.defaultLang;

        let content: unknown = null;
        const info = ContestoSito.getPageInfo(pageType);

        try {
            switch (pageType) {
                case PageType.Social:
                    content = await this.apiService.getSocial();
                    break;
                case PageType.PrivacyPolicy:
                    content = await this.tryLoadPolicy('privacy', language);
                    break;
                case PageType.CookiePolicy:
                    content = await this.tryLoadPolicy('cookie', language);
                    break;
                case PageType.TermsOfService:
                    content = await this.tryLoadPolicy('TOS', language);
                    break;
                case PageType.LegalNotice:
                    content = await this.tryLoadPolicy('legal', language);
                    break;
            }
        } catch {
            // BaseApiService.handleError() ha già notificato l'utente via Swal.
            // Restituiamo null content affinché il resolver si risolva sempre
            // e il router completi la navigazione invece di cancellarla.
            content = null;
        }

        return { content, info: info };
    }

    private async tryLoadPolicy(slug: string, lang: string): Promise<string | null> {
        const path = `/assets/legal/${slug}.${lang}.md`;
        const url = this.request ? new URL(path, this.request.url).toString() : path;

        return await firstValueFrom(
            this.http.get(url, { responseType: 'text' }).pipe(catchError(() => of(null)))
        );
    }
}

/* Factory ResolveFn per app.routes.ts */
export const contentLoaderResolver = (pageType: PageType): ResolveFn<ResolvedPage> =>
    () => inject(ContentResolver).loadResolved(pageType);
