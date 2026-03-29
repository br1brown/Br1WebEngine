import { HttpClient } from '@angular/common/http';
import { Component, effect, inject, Injector, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { PageType } from '../../app.routes';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { PageBaseComponent } from '../page-base.component';

/**
 * Componente riusabile per tutte le pagine legali.
 *
 * Il tipo di pagina viene determinato dai dati della route.
 * Con withComponentInputBinding() il valore arriva direttamente come input del componente.
 *
 * Il contenuto legale e' in file Markdown dedicati in assets/legal/,
 * separati dal codice e dal sistema i18n. Questo permette di versionarli
 * e farli revisionare a un legale senza toccare il codice sorgente.
 */
@Component({
    selector: 'app-policy',
    imports: [MarkdownPipe],
    templateUrl: './policy.component.html',
    styleUrl: './policy.component.css'
})
export class PolicyComponent extends PageBaseComponent implements OnInit {
    private readonly http = inject(HttpClient);
    private readonly injector = inject(Injector);
    readonly content = signal('');

    ngOnInit(): void {
        effect(() => {
            void this.loadContent(this.translate.currentLang(), this.PageType);
        }, { injector: this.injector });
    }

    private async loadContent(lang: string, pageType: PageType): Promise<void> {
        const fileName = this.getFileName(pageType);
        if (!fileName) return;

        const path = `/assets/legal/${fileName}.${lang}.md`;

        try {
            const text = await firstValueFrom(this.http.get(path, { responseType: 'text' }));
            this.content.set(text);
        } catch {
            if (lang !== 'it') {
                const fallback = `/assets/legal/${fileName}.it.md`;
                try {
                    const text = await firstValueFrom(this.http.get(fallback, { responseType: 'text' }));
                    this.content.set(text);
                } catch {
                    this.content.set('');
                }
            } else {
                this.content.set('');
            }
        }
    }

    /**
     * Mappa l'enum PageType alle vecchie stringhe usate per i file assets.
     */
    private getFileName(pageType: PageType): string {
        switch (pageType) {
            case PageType.PrivacyPolicy: return 'privacy';
            case PageType.CookiePolicy: return 'cookie';
            case PageType.TermsOfService: return 'TOS';
            case PageType.LegalNotice: return 'legal';
            default: return '';
        }
    }
}
