import { Component, computed, effect, signal } from '@angular/core';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { PageBaseComponent } from '../page-base.component';
import type { Profile } from '../../core/dto/profile.dto';

type ProfileData = Record<string, string | undefined>;

@Component({
    selector: 'app-policy',
    imports: [MarkdownPipe],
    templateUrl: './policy.component.html',
    styleUrl: './policy.component.css'
})
export class PolicyComponent extends PageBaseComponent<string> {
    /** null = non ancora caricato, {} = errore (previene retry), Record = dati disponibili */
    private readonly profileData = signal<ProfileData | null>(null);

    readonly displayContent = computed(() => {
        const content = this.pageContent() ?? '';
        const profile = this.profileData();
        if (!content.includes('{{') || !profile) return content;
        return this.interpolate(content, profile);
    });

    constructor() {
        super();
        effect(() => {
            const content = this.pageContent();
            if (content?.includes('{{') && !this.profileData()) {
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
        let result = content;
        for (const [key, value] of Object.entries(data)) {
            result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
        }
        return result;
    }
}
