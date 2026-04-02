import { Component, ViewEncapsulation, effect, inject, input, signal } from '@angular/core';

import { PageType } from '../../../app.routes';
import { CookieConsentService } from '../../../core/services/cookie-consent.service';
import { ThemeService } from '../../../core/services/theme.service';
import { TranslateService } from '../../../core/services/translate.service';
import { ContestoSito } from '../../../site';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { TranslatePipe } from '../../pipes/translate.pipe';
import cookieBannerLegalCatalog from './cookie-banner.legal.json';

const PLACEHOLDER = '{{COOKIE_POLICY_URL}}';
const cookieBannerCatalog: Record<string, string> = cookieBannerLegalCatalog;

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
    readonly theme = inject(ThemeService);

    readonly bannerText = signal('');

    constructor() {
        effect(() => {
            const lang = this.translate.currentLang();
            const text = this.getBannerText(lang);
            this.bannerText.set(this.resolvePlaceholder(text));
        });
    }

    accept(): void {
        this.cookieConsent.accept();
    }

    reject(): void {
        this.cookieConsent.reject();
    }

    private getBannerText(lang: string): string {
        const defaultLang = ContestoSito.config.defaultLang;
        return cookieBannerCatalog[lang] ?? cookieBannerCatalog[defaultLang] ?? '';
    }

    private resolvePlaceholder(text: string): string {
        const path = ContestoSito.getPath(PageType.CookiePolicy) ?? '';
        return text.replaceAll(PLACEHOLDER, path);
    }
}
