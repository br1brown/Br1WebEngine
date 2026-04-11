import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, resource } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Profile } from '../../core/dto/profile.dto';
import { ApiService } from '../../core/services/api.service';
import { TranslateService } from '../../core/services/translate.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { SocialLinkComponent } from '../../shared/components/social-link/social-link.component';
import { ContestoSito } from '../../site';
import { NavLink } from '../../siteBuilder';

type FooterItem =
    | { kind: 'text'; label: string; value: string; itemClass?: string }
    | { kind: 'link'; label: string; value: string; href: string; itemClass?: string }
    | { kind: 'code'; label: string; value: string; itemClass?: string };

interface FooterSection {
    titleKey: string;
    items: FooterItem[];
}

interface SocialLinkVm {
    type: string;
    value: string;
}

@Component({
    selector: 'app-footer',
    imports: [NgTemplateOutlet, RouterLink, TranslatePipe, SocialLinkComponent],
    templateUrl: './footer.component.html',
    styleUrl: './footer.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FooterComponent {
    protected readonly Math = Math;

    private readonly api = inject(ApiService);
    private readonly router = inject(Router);
    private readonly translate = inject(TranslateService);
    private readonly platformId = inject(PLATFORM_ID);

    private readonly profileState = resource({
        request: () => isPlatformBrowser(this.platformId) ? this.translate.currentLang() : undefined,
        loader: () => this.api.getProfile()
    });
    readonly profile = computed<Profile | null>(() => this.profileState.value() ?? null);
    readonly isLoading = computed(() => this.profileState.isLoading());
    readonly error = computed(() => this.profileState.error());

    readonly appName = ContestoSito.config.appName;
    readonly description = ContestoSito.config.description;
    readonly currentYear = new Date().getFullYear();
    readonly footerNavLinks = ContestoSito.linkFooter;

    /**
     * Riconosce se l'elemento della DSL è un gruppo (ha dei figli) o un link singolo.
     */
    isGroup(item: NavLink): item is NavLink & { children: NavLink[] } {
        return Array.isArray(item.children) && item.children.length > 0;
    }

    readonly socialLinks = computed<SocialLinkVm[]>(() => {
        const social = this.profile()?.social;
        if (!social) return [];

        return Object.entries(social)
            .filter((entry): entry is [string, string] => {
                const value = entry[1];
                return typeof value === 'string' && value.trim().length > 0;
            })
            .map(([type, value]) => ({
                type: type.toLowerCase(),
                value
            }));
    });

    readonly contactItems = computed<FooterItem[]>(() => {
        const profile = this.profile();
        if (!profile) return [];

        return this.compactItems([
            this.createTextItem(profile.ragioneSociale, this.label('ragioneSociale')),
            this.createTextItem(this.formatAddress(profile), this.label('sedeLegale')),
            this.createLinkItem(this.label('telefono'), profile.contatti?.telefono, 'tel:'),
            this.createLinkItem(this.label('PEC'), profile.contatti?.pec, 'mailto:'),
            this.createLinkItem(this.label('mail'), profile.contatti?.email, 'mailto:'),
            this.createTextItem(profile.metadatiAggiuntivi?.['rappresentanteLegale'], this.label('rappresentanteLegale')),
            this.createTextItem(profile.metadatiAggiuntivi?.['orariContatto'], this.label('orariContatto'), 'mt-3')
        ]);
    });

    readonly companyItems = computed<FooterItem[]>(() => {
        const profile = this.profile();
        if (!profile) return [];

        return this.compactItems([
            this.createCodeItem(this.label('partitaiva'), profile.partitaIva),
            this.createCodeItem(this.label('codiceFiscale'), profile.codiceFiscale),
            this.createTextItem(profile.datiSocietari?.registroImprese, this.label('registroimprese')),
            this.createCodeItem(this.label('numerorea'), profile.datiSocietari?.numeroRea),
            this.createTextItem(this.formatCurrency(profile.datiSocietari?.capitaleSociale), this.label('capitaleSociale')),
            this.createTextItem(
                this.formatBoolean(profile.datiSocietari?.capitaleInteramenteVersato),
                this.label('capitaleInteramenteVersato')
            ),
            this.createTextItem(this.formatBoolean(profile.datiSocietari?.isSocioUnico), this.label('isSocioUnico')),
            this.createTextItem(this.formatBoolean(profile.datiSocietari?.inLiquidazione), this.label('inLiquidazione')),
            this.createCodeItem(this.label('codicesdi'), profile.datiSocietari?.codiceSdi)
        ]);
    });

    readonly footerSections = computed<FooterSection[]>(() =>
        this.compactSections([
            {
                titleKey: 'contatti',
                items: this.contactItems()
            },
            {
                titleKey: 'dati_societari',
                items: this.companyItems()
            }
        ])
    );

    private compactItems(items: Array<FooterItem | null>): FooterItem[] {
        return items.filter((item): item is FooterItem => item !== null);
    }

    private compactSections(sections: FooterSection[]): FooterSection[] {
        return sections.filter(section => section.items.length > 0);
    }

    isRouteActive(path: string): boolean {
        return this.router.isActive(path, { paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' });
    }

    private createTextItem(value?: string | null, label = '', itemClass?: string): FooterItem | null {
        if (!this.hasText(value)) return null;
        return { kind: 'text', label, value: value.trim(), itemClass };
    }

    private createLinkItem(label: string, value?: string | null, hrefPrefix = '', itemClass?: string): FooterItem | null {
        if (!this.hasText(value)) return null;
        const normalizedValue = value.trim();
        return {
            kind: 'link',
            label,
            value: normalizedValue,
            href: `${hrefPrefix}${normalizedValue}`,
            itemClass
        };
    }

    private createCodeItem(label: string, value?: string | null, itemClass?: string): FooterItem | null {
        if (!this.hasText(value)) return null;
        return { kind: 'code', label, value: value.trim(), itemClass };
    }

    private label(key: string): string {
        return this.translate.translate(key);
    }

    private formatBoolean(value?: boolean | null): string | null {
        if (typeof value !== 'boolean') return null;
        return this.translate.translate(value ? 'si' : 'no');
    }

    private formatCurrency(value?: number | null): string | null {
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;

        const locale = this.translate.currentLang() === 'en' ? 'en-US' : 'it-IT';
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: 'EUR'
        }).format(value);
    }

    private hasText(value?: string | null): value is string {
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

        const parts = [streetLine, cityLine, address.nazione]
            .filter(this.isNonEmptyString);

        return parts.length > 0 ? parts.join(' - ') : null;
    }

    private isNonEmptyString(value: unknown): value is string {
        return typeof value === 'string' && value.trim().length > 0;
    }
}

