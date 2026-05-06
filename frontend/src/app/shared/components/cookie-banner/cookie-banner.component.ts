import { Component, ViewEncapsulation, computed, inject, input } from '@angular/core';
import { CookieConsentService } from '../../../core/services/cookie-consent.service';
import { ThemeService } from '../../../core/services/theme.service';
import { TranslateService } from '../../../core/services/translate.service';
import { ContestoSito, PageType } from '../../../site';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { TranslatePipe } from '../../pipes/translate.pipe';

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
    readonly theme = inject(ThemeService);
    private readonly translate = inject(TranslateService);

    readonly bannerText = computed(() => {
        const path = ContestoSito.getPath(PageType.CookiePolicy) ?? '';
        return this.translate.translate('cookieBannerText', path);
    });

    accept(): void { this.cookieConsent.accept(); }
    reject(): void { this.cookieConsent.reject(); }
}
