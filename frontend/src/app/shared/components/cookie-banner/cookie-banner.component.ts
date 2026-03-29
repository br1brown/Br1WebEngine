import { HttpClient } from '@angular/common/http';
import { Component, ViewEncapsulation, effect, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { PageType } from '../../../app.routes';
import { CookieConsentService } from '../../../core/services/cookie-consent.service';
import { ThemeService } from '../../../core/services/theme.service';
import { TranslateService } from '../../../core/services/translate.service';
import { ContestoSito } from '../../../site';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { TranslatePipe } from '../../pipes/translate.pipe';

const PLACEHOLDER = '{{COOKIE_POLICY_URL}}';

@Component({
    selector: 'app-cookie-banner',
    imports: [TranslatePipe, MarkdownPipe],
    templateUrl: './cookie-banner.component.html',
    styleUrl: './cookie-banner.component.css',
    encapsulation: ViewEncapsulation.None
})
export class CookieBannerComponent {
    readonly tiny = input(false);
    readonly cookieConsent = inject(CookieConsentService);
    private readonly translate = inject(TranslateService);
    private readonly http = inject(HttpClient);
    readonly theme = inject(ThemeService);

    private loadVersion = 0;
    readonly bannerText = signal('');

    constructor() {
        effect(() => {
            const lang = this.translate.currentLang();
            void this.loadBannerText(lang);
        });
    }

    accept(): void {
        this.cookieConsent.accept();
    }

    reject(): void {
        this.cookieConsent.reject();
    }

    private async loadBannerText(lang: string): Promise<void> {
        const version = ++this.loadVersion;

        const text =
            await this.tryLoadFile(`/assets/legal/cookie-banner.${lang}.md`) ??
            (lang !== 'it' ? await this.tryLoadFile('/assets/legal/cookie-banner.it.md') : null) ??
            '';

        if (version !== this.loadVersion) return;

        this.bannerText.set(this.resolvePlaceholder(text));
    }

    private async tryLoadFile(path: string): Promise<string | null> {
        try {
            return await firstValueFrom(this.http.get(path, { responseType: 'text' }));
        } catch {
            return null;
        }
    }

    private resolvePlaceholder(text: string): string {
        const path = ContestoSito.getPath(PageType.CookiePolicy) ?? '';
        return text.replaceAll(PLACEHOLDER, path);
    }
}
