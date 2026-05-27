import { Component, computed, effect, inject, signal } from '@angular/core';
import { MarkdownPipe } from '../../core/engine/pipes/markdown.pipe';
import { PageBaseComponent } from '../page-base.component';
import { CookieConsentService, CookieCategory } from '../../core/engine/services/cookie-consent.service';
import type { Profile } from '../../core/dto/profile.dto';

type ProfileData = Record<string, string | undefined>;

@Component({
    selector: 'app-policy',
    imports: [MarkdownPipe],
    templateUrl: './policy.component.html',
    styleUrl: './policy.component.css'
})
export class PolicyComponent extends PageBaseComponent<string> {
    private readonly cookieConsent = inject(CookieConsentService);

    readonly CookieCategory = CookieCategory;

    /** null = non ancora caricato, {} = errore (previene retry), Record = dati disponibili */
    private readonly profileData = signal<ProfileData | null>(null);

    readonly cookieCategories = computed(() =>
        this.cookieConsent.legal.getCategories(k => this.translate.translate(k))
    );

    readonly cookieList = computed(() =>
        this.cookieConsent.legal.getCookies(k => this.translate.translate(k))
    );

    readonly segments = computed(() => {
        const content = this.pageContent() ?? '';
        if (!content) return [];

        // placeholder profilo — asincrono, risolti quando profileData è disponibile
        let interpolated = content;
        const profile = this.profileData();
        if (interpolated.includes('{{') && profile) {
            interpolated = this.interpolate(interpolated, profile);
        }

        const result: ({ type: 'markdown'; content: string } | { type: 'categories' } | { type: 'cookieList' })[] = [];
        let remaining = interpolated;

        while (remaining) {
            const catIdx = remaining.indexOf('{{cookieCategories}}');
            const listIdx = remaining.indexOf('{{cookieList}}');

            if (catIdx === -1 && listIdx === -1) {
                result.push({ type: 'markdown', content: remaining });
                break;
            }

            if (catIdx !== -1 && (listIdx === -1 || catIdx < listIdx)) {
                if (catIdx > 0) {
                    result.push({ type: 'markdown', content: remaining.slice(0, catIdx) });
                }
                result.push({ type: 'categories' });
                remaining = remaining.slice(catIdx + '{{cookieCategories}}'.length);
            } else {
                if (listIdx > 0) {
                    result.push({ type: 'markdown', content: remaining.slice(0, listIdx) });
                }
                result.push({ type: 'cookieList' });
                remaining = remaining.slice(listIdx + '{{cookieList}}'.length);
            }
        }

        return result;
    });

    constructor() {
        super();
        effect(() => {
            const content = this.pageContent();
            // Cerca placeholder profilo escludendo {{cookieList}} e {{cookieCategories}} (già gestiti in displayContent)
            const hasProfilePlaceholders = content != null && /\{\{(?!cookieList\}\}|cookieCategories\}\})/.test(content);
            if (hasProfilePlaceholders && !this.profileData()) {
                this.api.getProfile()
                    .then(p => this.profileData.set(this.buildProfileData(p)))
                    .catch(() => this.profileData.set({}));
            }
        });
    }

    private buildProfileData(profile: Profile): ProfileData {
        const sede = profile.sedeLegale;
        const indirizzo = sede
            ? `${sede.via ?? ''}, ${sede.civico ?? ''}\n${sede.cap ?? ''} ${sede.citta ?? ''} (${sede.provincia ?? ''})\n${sede.nazione ?? ''}`.trim()
            : undefined;

        return {
            ragioneSociale: profile.ragioneSociale,
            partitaIva: profile.partitaIva,
            codiceFiscale: profile.codiceFiscale,
            numeroRea: profile.datiSocietari?.numeroRea,
            registroImprese: profile.datiSocietari?.registroImprese,
            telefono: profile.contatti?.telefono,
            email: profile.contatti?.email,
            pec: profile.contatti?.pec,
            indirizzo,
            rappresentanteLegale: profile.metadatiAggiuntivi?.['rappresentanteLegale'],
            citta: sede?.citta
        };
    }

    private interpolate(content: string, data: ProfileData): string {
        return content.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? '');
    }
}
