import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, Injector, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PageType } from '../../app.routes';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { PageBaseComponent } from '../page-base.component';
import { ContestoSito } from '../../site';

/**
 * Componente riusabile per tutte le pagine legali.
 *
 * Il tipo di pagina viene determinato dai dati della route.
 * Con withComponentInputBinding() il valore arriva direttamente come input del componente.
 *
 * Il contenuto legale e' in file Markdown dedicati in assets/legal/.
 * Il componente sceglie il file corretto a runtime in base a PageType e lingua.
 */
@Component({
    selector: 'app-policy',
    imports: [MarkdownPipe],
    templateUrl: './policy.component.html',
    styleUrl: './policy.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush
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
        if (!fileName) {
            this.content.set('');
            return;
        }

        const defaultLang = ContestoSito.config.defaultLang;

        const text =
            await this.tryLoadFile(`/assets/legal/${fileName}.${lang}.md`) ??
            (lang !== defaultLang
                ? await this.tryLoadFile(`/assets/legal/${fileName}.${defaultLang}.md`)
                : null) ??
            '';

        this.content.set(text);
    }

    /**
     * Mappa l'enum PageType ai nomi base dei file Markdown in assets/legal.
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

    private async tryLoadFile(path: string): Promise<string | null> {
        try {
            return await firstValueFrom(this.http.get(path, { responseType: 'text' }));
        } catch {
            return null;
        }
    }
}
