import { Component, computed, inject, input } from '@angular/core';
import { Profile } from '../../../core/dto/profile.dto';
import { TranslateService } from '../../../core/services/translate.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

type ProfileItem =
    | { kind: 'text'; label: string; value: string; itemClass?: string }
    | { kind: 'link'; label: string; value: string; href: string; itemClass?: string }
    | { kind: 'code'; label: string; value: string; itemClass?: string };

interface ProfileSection {
    titleKey: string;
    items: ProfileItem[];
}

/**
 * PROFILE RENDER COMPONENT
 *
 * Riceve un Profile (es. la risposta di GET /profile) e lo rende in due
 * sezioni a colonne: "Contatti" e "Dati societari". Ogni voce viene
 * mostrata solo se valorizzata (skip-empty), con label tradotta, classe
 * contestuale opzionale e markup adeguato al tipo (testo / link tel|mailto /
 * codice).
 *
 * Tiene insieme tutta la logica di formato (currency, boolean, indirizzo)
 * e la regola "se manca il dato non lo vedi": cosi' il consumer (footer,
 * pagina chi-siamo, ecc.) si limita a passare il profilo e la composizione
 * non si perde a ogni refactor del layout esterno.
 */
@Component({
    selector: 'app-profile-render',
    standalone: true,
    imports: [TranslatePipe],
    templateUrl: './profile-render.component.html',
})
export class ProfileRenderComponent {
    protected readonly Math = Math;
    private readonly translate = inject(TranslateService);

    readonly profile = input.required<Profile | null>();

    readonly sections = computed<ProfileSection[]>(() => {
        const profile = this.profile();
        if (!profile) return [];

        return this.compactSections([
            {
                titleKey: 'contatti',
                items: this.compactItems([
                    this.createTextItem(profile.ragioneSociale, this.label('ragioneSociale')),
                    this.createTextItem(this.formatAddress(profile), this.label('sedeLegale')),
                    this.createLinkItem(this.label('telefono'), profile.contatti?.telefono, 'tel:'),
                    this.createLinkItem(this.label('PEC'), profile.contatti?.pec, 'mailto:'),
                    this.createLinkItem(this.label('mail'), profile.contatti?.email, 'mailto:'),
                    this.createTextItem(profile.metadatiAggiuntivi?.['rappresentanteLegale'], this.label('rappresentanteLegale')),
                    this.createTextItem(profile.metadatiAggiuntivi?.['orariContatto'], this.label('orariContatto'), 'mt-3'),
                ]),
            },
            {
                titleKey: 'dati_societari',
                items: this.compactItems([
                    this.createCodeItem(this.label('partitaiva'), profile.partitaIva),
                    this.createCodeItem(this.label('codiceFiscale'), profile.codiceFiscale),
                    this.createTextItem(profile.datiSocietari?.registroImprese, this.label('registroimprese')),
                    this.createCodeItem(this.label('numerorea'), profile.datiSocietari?.numeroRea),
                    this.createTextItem(this.formatCurrency(profile.datiSocietari?.capitaleSociale), this.label('capitaleSociale')),
                    this.createTextItem(
                        this.formatBoolean(profile.datiSocietari?.capitaleInteramenteVersato),
                        this.label('capitaleInteramenteVersato'),
                    ),
                    this.createTextItem(this.formatBoolean(profile.datiSocietari?.isSocioUnico), this.label('isSocioUnico')),
                    this.createTextItem(this.formatBoolean(profile.datiSocietari?.inLiquidazione), this.label('inLiquidazione')),
                    this.createCodeItem(this.label('codicesdi'), profile.datiSocietari?.codiceSdi),
                ]),
            },
        ]);
    });

    private compactItems(items: Array<ProfileItem | null>): ProfileItem[] {
        return items.filter((item): item is ProfileItem => item !== null);
    }

    private compactSections(sections: ProfileSection[]): ProfileSection[] {
        return sections.filter(section => section.items.length > 0);
    }

    private createTextItem(value: string | null | undefined, label = '', itemClass?: string): ProfileItem | null {
        if (!this.hasText(value)) return null;
        return { kind: 'text', label, value: value.trim(), itemClass };
    }

    private createLinkItem(label: string, value: string | null | undefined, hrefPrefix = '', itemClass?: string): ProfileItem | null {
        if (!this.hasText(value)) return null;
        const normalizedValue = value.trim();
        return {
            kind: 'link',
            label,
            value: normalizedValue,
            href: `${hrefPrefix}${normalizedValue}`,
            itemClass,
        };
    }

    private createCodeItem(label: string, value: string | null | undefined, itemClass?: string): ProfileItem | null {
        if (!this.hasText(value)) return null;
        return { kind: 'code', label, value: value.trim(), itemClass };
    }

    private label(key: string): string {
        return this.translate.translate(key);
    }

    private formatBoolean(value: boolean | null | undefined): string | null {
        if (typeof value !== 'boolean') return null;
        return this.translate.translate(value ? 'si' : 'no');
    }

    private formatCurrency(value: number | null | undefined): string | null {
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;

        // it -> it-IT, en -> en-GB. Fallback it-IT per lingue non mappate.
        const LOCALE_MAP: Record<string, string> = { it: 'it-IT', en: 'en-GB' };
        const locale = LOCALE_MAP[this.translate.currentLang()] ?? 'it-IT';
        return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value);
    }

    private hasText(value: string | null | undefined): value is string {
        return typeof value === 'string' && value.trim().length > 0;
    }

    private formatAddress(profile: Profile): string | null {
        const address = profile.sedeLegale;
        if (!address) return null;

        const streetLine = [address.via, address.civico]
            .filter(this.isNonEmptyString)
            .join(', ');

        const cityLine = [address.cap, address.citta, address.provincia]
            .filter(this.isNonEmptyString)
            .join(' ');

        const parts = [streetLine, cityLine, address.nazione].filter(this.isNonEmptyString);
        return parts.length > 0 ? parts.join(' - ') : null;
    }

    private isNonEmptyString(value: unknown): value is string {
        return typeof value === 'string' && value.trim().length > 0;
    }
}
