import { inject, Injectable, REQUEST } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ResolveFn } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ContestoSito, PageType } from '../../site';
import { TranslateService } from '../../core/services/translate.service';

/**
 * Carica il markdown di una policy dagli asset locali, con fallback alla lingua
 * di default se la versione richiesta manca.
 *
 * In SSR la fetch viene risolta come URL assoluta usando l'origin della request
 * corrente (token REQUEST), così la chiamata loopback raggiunge lo stesso
 * processo Express che serve gli asset statici. Nel browser resta un path
 * relativo, intercettato dal service worker / cache standard.
 */
@Injectable({ providedIn: 'root' })
export class PolicyContentService {
    private readonly http = inject(HttpClient);
    private readonly translate = inject(TranslateService);
    private readonly request = inject(REQUEST, { optional: true });

    async load(pageType: PageType, lang?: string): Promise<string> {
        const slug = this.fileSlug(pageType);
        if (!slug) return '';

        const language = lang ?? this.translate.currentLang();
        const defaultLang = ContestoSito.config.defaultLang;

        const primary = await this.tryLoad(slug, language);
        if (primary !== null) return primary;
        if (language === defaultLang) return '';
        return (await this.tryLoad(slug, defaultLang)) ?? '';
    }

    private async tryLoad(slug: string, lang: string): Promise<string | null> {
        const path = `/assets/legal/${slug}.${lang}.md`;
        const url = this.request ? new URL(path, this.request.url).toString() : path;

        return await firstValueFrom(
            this.http.get(url, { responseType: 'text' }).pipe(catchError(() => of(null)))
        );
    }

    private fileSlug(pageType: PageType): string {
        switch (pageType) {
            case PageType.PrivacyPolicy:  return 'privacy';
            case PageType.CookiePolicy:   return 'cookie';
            case PageType.TermsOfService: return 'TOS';
            case PageType.LegalNotice:    return 'legal';
            default: return '';
        }
    }
}

/**
 * Factory di resolver tipizzato per le rotte policy in site.ts.
 * Lo slug del file resta nascosto dentro PolicyContentService: qui basta il PageType.
 */
export const policyContent = (pageType: PageType): ResolveFn<string> =>
    () => inject(PolicyContentService).load(pageType);
