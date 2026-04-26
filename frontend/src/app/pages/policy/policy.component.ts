import { Component, computed, inject } from '@angular/core';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { switchMap, map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { PageBaseComponent } from '../page-base.component';
import { ContestoSito, PageType } from '../../site';

/**
 * Componente riusabile per tutte le pagine legali.
 *
 * Il pageType arriva dall'input required (withComponentInputBinding), non è
 * necessario alcun resolver: il file Markdown viene scelto a runtime.
 *
 * Il contenuto reagisce sia al cambio di pageType (navigazione tra policy)
 * sia al cambio di lingua, senza effect() né lifecycle hook:
 * toSignal+switchMap cancella automaticamente le richieste in volo superate.
 */
@Component({
    selector: 'app-policy',
    imports: [MarkdownPipe],
    templateUrl: './policy.component.html',
    styleUrl: './policy.component.css'
})
export class PolicyComponent extends PageBaseComponent {
    private readonly http = inject(HttpClient);

    readonly content = toSignal(
        toObservable(computed(() => ({
            slug: this.fileSlug(this.pageType()),
            lang: this.translate.currentLang()
        }))).pipe(
            switchMap(({ slug, lang }) => {
                if (!slug) return of('');

                const defaultLang = ContestoSito.config.defaultLang;

                return this.tryLoad(`/assets/legal/${slug}.${lang}.md`).pipe(
                    switchMap(text =>
                        text !== null ? of(text) :
                        lang !== defaultLang
                            ? this.tryLoad(`/assets/legal/${slug}.${defaultLang}.md`).pipe(map(t => t ?? ''))
                            : of('')
                    )
                );
            })
        ),
        { initialValue: '' }
    );

    private fileSlug(pageType: PageType): string {
        switch (pageType) {
            case PageType.PrivacyPolicy:  return 'privacy';
            case PageType.CookiePolicy:   return 'cookie';
            case PageType.TermsOfService: return 'TOS';
            case PageType.LegalNotice:    return 'legal';
            default: return '';
        }
    }

    private tryLoad(path: string) {
        return this.http.get(path, { responseType: 'text' }).pipe(
            catchError(() => of(null))
        );
    }
}
