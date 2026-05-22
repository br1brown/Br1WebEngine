import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ResolveFn } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ContestoSito, PageType } from '../site';
import { TranslateService } from '../core/services/translate.service';
import { ApiService } from '../core/services/api.service';
import { CookieConsentService } from '../core/services/cookie-consent.service';
import { PageInfo } from '../siteBuilder';

export type LegalFileReader = (slug: string, lang: string) => Promise<string | null>;

/** In SSR viene fornita da app.config.server.ts per leggere i file .md da disco.
 *  Nel browser rimane null e tryLoadPolicy usa la fetch HTTP normale. */
export const LEGAL_FILE_READER = new InjectionToken<LegalFileReader | null>(
    'LegalFileReader', { providedIn: 'root', factory: () => null }
);

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
 * Per aggiungere il contenuto di una nuova pagina:
 *   1. Aggiungere il metodo in ApiService (o usare tryLoadPolicy per file statici)
 *   2. Aggiungere un case nello switch di loadResolved()
 *
 * Il try-catch esterno protegge il router: se l'API fallisce, BaseApiService
 * ha già mostrato il dialog all'utente e il resolver restituisce content = null
 * invece di rigettare (che cancellerebbe la navigazione).
 *
 * In SSR i file .md delle policy vengono letti direttamente da disco tramite
 * LEGAL_FILE_READER (fornito da app.config.server.ts), eliminando la chiamata
 * HTTP loopback. Nel browser resta una semplice fetch relativa.
 *
 * Il placeholder {{cookieList}} viene sostituito qui con la tabella Markdown
 * generata da CookieConsentService.listMarkdown(). I placeholder di profilo
 * ({{ragioneSociale}} ecc.) sono gestiti da PolicyComponent.
 */
@Injectable({ providedIn: 'root' })
export class ContentResolver {
    private readonly http = inject(HttpClient);
    private readonly translate = inject(TranslateService);
    private readonly apiService = inject(ApiService);
    private readonly cookieConsent = inject(CookieConsentService);
    private readonly fileReader = inject(LEGAL_FILE_READER);

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
        let raw: string | null;
        if (this.fileReader) {
            raw = await this.fileReader(slug, lang);
        } else {
            raw = await firstValueFrom(
                this.http.get(`/assets/legal/${slug}.${lang}.md`, { responseType: 'text' })
                    .pipe(catchError(() => of(null)))
            );
        }
        if (raw === null) return null;
        return this.injectCookieList(raw);
    }

    private injectCookieList(content: string): string {
        if (!content.includes('{{cookieList}}')) return content;
        const table = this.cookieConsent.listMarkdown(k => this.translate.translate(k));
        return content.replace(/\{\{cookieList\}\}/g, table);
    }
}

/* Factory ResolveFn per app.routes.ts */
export const contentLoaderResolver = (pageType: PageType): ResolveFn<ResolvedPage> =>
    () => inject(ContentResolver).loadResolved(pageType);
