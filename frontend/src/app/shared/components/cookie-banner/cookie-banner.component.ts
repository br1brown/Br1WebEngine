import { Component, ViewEncapsulation, computed, inject, input, signal } from '@angular/core';
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

    /** Stato locale dei pending — inizializzati dal consenso già salvato, se presente. */
    readonly pendingTechnical = signal(this.cookieConsent.technicalAccepted());
    readonly pendingAnalytics = signal(this.cookieConsent.analyticsAccepted());
    readonly pendingProfiling = signal(this.cookieConsent.profilingAccepted());

    /** True quando è attiva almeno una categoria non tecnica: mostra toggle e layout esteso. */
    readonly hasDetailedCategories = computed(() =>
        this.cookieConsent.isAnalyticsNeeded() || this.cookieConsent.isProfilingNeeded()
    );

    /** True quando sono attive 2+ categorie non tecniche: ha senso la selezione mista. */
    readonly hasMixedCategories = computed(() =>
        this.cookieConsent.isAnalyticsNeeded() && this.cookieConsent.isProfilingNeeded()
    );

    readonly bannerText = computed(() => {
        const path = ContestoSito.getPath(PageType.CookiePolicy) ?? '';
        const key = this.hasDetailedCategories() ? 'cookieBannerIntro' : 'cookieBannerText';
        return this.translate.translate(key, path);
    });

    reopen(): void { this.cookieConsent.reopen(); }

    accept(): void {
        if (this.cookieConsent.isTechnicalNeeded()) this.pendingTechnical.set(true);
        if (this.cookieConsent.isAnalyticsNeeded()) this.pendingAnalytics.set(true);
        if (this.cookieConsent.isProfilingNeeded()) this.pendingProfiling.set(true);
        this.saveSelected();
    }

    reject(): void {
        if (this.cookieConsent.isTechnicalNeeded()) this.pendingTechnical.set(false);
        if (this.cookieConsent.isAnalyticsNeeded()) this.pendingAnalytics.set(false);
        if (this.cookieConsent.isProfilingNeeded()) this.pendingProfiling.set(false);
        this.saveSelected();
    }

    saveSelected(): void {
        this.cookieConsent.saveSelected(
            this.pendingTechnical(),
            this.pendingAnalytics(),
            this.pendingProfiling(),
        );
    }
}
