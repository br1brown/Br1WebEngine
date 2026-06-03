import { Component, computed, effect, inject, signal } from '@angular/core';
import { MarkdownPipe } from '../../core/engine/pipes/markdown.pipe';
import { PageBaseComponent } from '../page-base.component';
import { CookieConsentService } from '../../core/engine/services/cookie-consent.service';
import { CookieCategory } from '../../core/engine/services/cookie/cookie-type';
import { PrintCookieService } from '../../core/engine/services/cookie/print-cookie.service';
import { ProfileRenderComponent } from '../../components/shared/profile-render/profile-render.component';
import type { Profile } from '../../core/engine/dto/profile.dto';

@Component({
    selector: 'app-policy',
    imports: [MarkdownPipe, ProfileRenderComponent],
    templateUrl: './policy.component.html',
    styleUrl: './policy.component.css'
})
export class PolicyComponent extends PageBaseComponent<string> {
    private readonly cookieConsent = inject(CookieConsentService);
    private readonly printCookie = inject(PrintCookieService);

    readonly CookieCategory = CookieCategory;

    /** Profilo originale per il ProfileRenderComponent */
    readonly rawProfile = signal<Profile | null>(null);

    /** Flag per evitare fetch multipli in caso di errore */
    private readonly profileLoaded = signal(false);

    readonly cookieCategories = computed(() =>
        this.printCookie.getCategories(k => this.translate.translate(k))
    );

    readonly cookieList = computed(() =>
        this.printCookie.getCookies(k => this.translate.translate(k))
    );

    readonly segments = computed(() => {
        const profile = this.rawProfile();
        let content = this.pageContent() ?? '';
        if (!content) return [];

        if (profile) {
            const fields: (keyof Profile)[] = ['ragioneSociale', 'partitaIva', 'codiceFiscale'];
            for (const field of fields) {
                const val = profile[field];
                if (typeof val === 'string') {
                    content = content.replaceAll(`{{${field}}}`, val);
                }
            }
        }

        const result: ({ type: 'markdown'; content: string } | { type: 'categories' } | { type: 'cookieList' } | { type: 'profile' })[] = [];
        let remaining = content;

        while (remaining) {
            const catIdx = remaining.indexOf('{{cookieCategories}}');
            const listIdx = remaining.indexOf('{{cookieList}}');
            const profIdx = remaining.indexOf('{{companyProfile}}');

            const indices = [
                { type: 'categories' as const, idx: catIdx, len: '{{cookieCategories}}'.length },
                { type: 'cookieList' as const, idx: listIdx, len: '{{cookieList}}'.length },
                { type: 'profile' as const, idx: profIdx, len: '{{companyProfile}}'.length }
            ].filter(x => x.idx !== -1).sort((a, b) => a.idx - b.idx);

            if (indices.length === 0) {
                result.push({ type: 'markdown', content: remaining });
                break;
            }

            const first = indices[0];
            if (first.idx > 0) {
                result.push({ type: 'markdown', content: remaining.slice(0, first.idx) });
            }
            result.push({ type: first.type });
            remaining = remaining.slice(first.idx + first.len);
        }

        return result;
    });

    constructor() {
        super();
        effect(() => {
            const content = this.pageContent();
            const needsProfile = content != null && (
                content.includes('{{companyProfile}}') ||
                content.includes('{{ragioneSociale}}') ||
                content.includes('{{partitaIva}}') ||
                content.includes('{{codiceFiscale}}')
            );
            if (needsProfile && !this.profileLoaded()) {
                this.api.getProfile()
                    .then(p => {
                        this.rawProfile.set(p);
                        this.profileLoaded.set(true);
                    })
                    .catch(() => this.profileLoaded.set(true));
            }
        });
    }


}
