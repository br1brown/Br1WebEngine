import { Component, computed, effect, inject, signal } from '@angular/core';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { PageBaseComponent } from '../page-base.component';
import { CookieConsentService } from '../../core/services/cookie-consent.service';
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

    /** null = non ancora caricato, {} = errore (previene retry), Record = dati disponibili */
    private readonly profileData = signal<ProfileData | null>(null);

    readonly displayContent = computed(() => {
        let content = this.pageContent() ?? '';
        if (!content) return content;

        // {{cookieList}} — sincrono, reattivo al cambio lingua tramite pageContent()
        if (content.includes('{{cookieList}}')) {
            const table = this.cookieConsent.listMarkdown(k => this.translate.translate(k));
            content = content.replace(/\{\{cookieList\}\}/g, table);
        }

        // placeholder profilo — asincrono, risolti quando profileData è disponibile
        const profile = this.profileData();
        if (content.includes('{{') && profile) {
            content = this.interpolate(content, profile);
        }

        return content;
    });

    constructor() {
        super();
        effect(() => {
            const content = this.pageContent();
            // Cerca placeholder profilo escludendo {{cookieList}} (già gestito in displayContent)
            const hasProfilePlaceholders = content != null && /\{\{(?!cookieList\}\})/.test(content);
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
