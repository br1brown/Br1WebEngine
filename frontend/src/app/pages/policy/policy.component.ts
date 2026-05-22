import { Component, computed, effect, signal } from '@angular/core';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { PageBaseComponent } from '../page-base.component';
import type { Profile } from '../../core/dto/profile.dto';

type FormattedProfile = Record<string, string | undefined>;

/**
 * Componente riusabile per tutte le pagine legali.
 * Il contenuto arriva da ContentResolverService (auto-applicato da app.routes.ts):
 * serializzato in SSR, aggiornato sul browser ad ogni cambio lingua da PageBaseComponent.
 *
 * Per le Note Legali, popola dinamicamente i placeholder {{}} con i dati dal profilo API.
 */
@Component({
    selector: 'app-policy',
    imports: [MarkdownPipe],
    templateUrl: './policy.component.html',
    styleUrl: './policy.component.css'
})
export class PolicyComponent extends PageBaseComponent<string> {
    private readonly profileData = signal<FormattedProfile | null>(null);

    readonly displayContent = computed(() => {
        const content = this.pageContent() ?? '';
        const profile = this.profileData();

        if (!profile || !content.includes('{{')) {
            return content;
        }

        return this.interpolatePlaceholders(content, profile);
    });

    constructor() {
        super();
        effect(() => {
            const content = this.pageContent();
            if (content?.includes('{{') && !this.profileData()) {
                this.api.getProfile().then(profile => {
                    this.profileData.set(this.formatProfileData(profile));
                }).catch(() => {
                    this.profileData.set(null);
                });
            }
        });
    }

    private formatProfileData(profile: Profile): FormattedProfile {
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

    private interpolatePlaceholders(content: string, profile: FormattedProfile): string {
        let result = content;
        for (const [key, value] of Object.entries(profile)) {
            const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            const replacement = value !== null && value !== undefined ? String(value) : '';
            result = result.replace(placeholder, replacement);
        }
        return result;
    }
}
