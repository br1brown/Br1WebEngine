import { booleanAttribute, Component, computed, inject, input } from '@angular/core';
import { Profile } from '../../../core/engine/dto/profile.dto';
import { TranslateService } from '../../../core/engine/services/translate.service';
import { TranslatePipe } from '../../../core/engine/pipes/translate.pipe';
import { PhoneContactComponent } from '../contact/phone-contact/phone-contact.component';
import { MailContactComponent, MailContactConfig } from '../contact/mail-contact/mail-contact.component';

/** Tono Bootstrap del badge (suffisso di `text-bg-*`). */
type BadgeTone = 'success' | 'secondary' | 'warning' | 'danger' | 'info' | 'primary';

type ProfileItem =
    | { kind: 'text'; label: string; value: string; itemClass?: string }
    | { kind: 'code'; label: string; value: string; itemClass?: string }
    | { kind: 'bool'; label: string; value: string; tone: BadgeTone; itemClass?: string };

interface ProfileSection {
    titleKey: string;
    items: ProfileItem[];
}

/** Canale di contatto cliccabile, reso come badge dai componenti contatto. */
type ContactChannel =
    | { kind: 'phone'; key: string; label: string; number: string }
    | { kind: 'mail'; key: string; label: string; config: MailContactConfig };

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
    imports: [TranslatePipe, PhoneContactComponent, MailContactComponent],
    templateUrl: './profile-render.component.html',
})
export class ProfileRenderComponent {
    private readonly translate = inject(TranslateService);

    readonly profile = input.required<Profile | null>();
    readonly inColonna = input(false, { transform: booleanAttribute });

    readonly sections = computed<ProfileSection[]>(() => {
        const profile = this.profile();
        if (!profile) return [];

        // Numero imprecisato di sezioni-dati dinamiche. La sezione "Contatti" è
        // invece dedicata e renderizzata a parte (testo + badge impilati).
        return this.compactSections([
            {
                titleKey: 'datiSocietariAzienda',
                items: this.identifierItems(profile),
            },
            {
                titleKey: 'datiLegaliAzienda',
                items: this.legalItems(profile),
            },
        ]);
    });

    /** Voci testuali della sezione Contatti (nome, sede, rappresentante, orari). */
    readonly contactItems = computed<ProfileItem[]>(() => {
        const profile = this.profile();
        if (!profile) return [];
        return this.compactItems([
            this.createTextItem(profile.ragioneSociale, this.label('ragioneSocialeAzienda')),
            this.createTextItem(this.formatAddress(profile), this.label('sedeLegaleAzienda')),
            this.createTextItem(profile.metadatiAggiuntivi?.['rappresentanteLegaleAzienda'], this.label('rappresentanteLegaleAzienda')),
            this.createTextItem(profile.metadatiAggiuntivi?.['orariContattoAzienda'], this.label('orariContattoAzienda')),
        ]);
    });

    /** Indica se la colonna Contatti ha qualcosa da mostrare (testo o badge). */
    readonly hasContacts = computed<boolean>(() => this.contactItems().length > 0 || this.contacts().length > 0);

    /**
     * Identificativi dell'entità — ciò che serve per verificare che esista:
     * P.IVA, Codice Fiscale, Registro Imprese, REA, SDI. Se CF e P.IVA
     * coincidono mostra una sola voce "Codice Fiscale / P.IVA" per non
     * ripetere due volte lo stesso dato.
     */
    private identifierItems(profile: Profile): ProfileItem[] {
        const piva = profile.partitaIva?.trim();
        const cf = profile.codiceFiscale?.trim();
        const ds = profile.datiSocietari;

        const idCodes: Array<ProfileItem | null> = this.hasText(piva) && piva === cf
            ? [this.createCodeItem(`${this.label('codiceFiscaleAzienda')} / ${this.label('partitaIvaAzienda')}`, piva)]
            : [
                this.createCodeItem(this.label('partitaIvaAzienda'), profile.partitaIva),
                this.createCodeItem(this.label('codiceFiscaleAzienda'), profile.codiceFiscale),
            ];

        return this.compactItems([
            ...idCodes,
            this.createTextItem(ds?.registroImprese, this.label('registroImpreseAzienda')),
            this.createCodeItem(this.label('numeroReaAzienda'), ds?.numeroRea),
            this.createCodeItem(this.label('codiceSdiAzienda'), ds?.codiceSdi),
        ]);
    }

    /**
     * Canali di contatto cliccabili (telefono, email, PEC) estratti dal profilo
     * e resi come badge dai componenti contatto in cima, fuori dalle due colonne.
     */
    readonly contacts = computed<ContactChannel[]>(() => {
        const c = this.profile()?.contatti;
        if (!c) return [];

        const list: ContactChannel[] = [];
        if (this.hasText(c.telefono)) {
            list.push({ kind: 'phone', key: 'telefono', label: this.label('telefonoAzienda'), number: c.telefono.trim() });
        }
        if (this.hasText(c.email)) {
            list.push({ kind: 'mail', key: 'email', label: this.label('emailAzienda'), config: { to: c.email.trim() } });
        }
        if (this.hasText(c.pec)) {
            list.push({ kind: 'mail', key: 'pec', label: this.label('pecAzienda'), config: { to: c.pec.trim() } });
        }
        return list;
    });

    /**
     * Dati legali/finanziari (capitale sociale, capitale versato, socio unico,
     * liquidazione): mostrati come colonna a sé per trasparenza e accessibilità,
     * non più relegati in piccolo a fondo pagina.
     */
    private legalItems(profile: Profile): ProfileItem[] {
        const ds = profile.datiSocietari;
        if (!ds) return [];
        return this.compactItems([
            this.createTextItem(this.formatCurrency(ds.capitaleSociale), this.label('capitaleSocialeAzienda')),
            this.createBoolItem(this.label('capitaleVersatoAzienda'), ds.capitaleInteramenteVersato),
            this.createBoolItem(this.label('socioUnicoAzienda'), ds.isSocioUnico),
            // Flag "negativo": essere in liquidazione è un campanello → Sì in warning.
            this.createBoolItem(this.label('inLiquidazioneAzienda'), ds.inLiquidazione, { onTrue: 'warning', onFalse: 'secondary' }),
        ]);
    }

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

    private createCodeItem(label: string, value: string | null | undefined, itemClass?: string): ProfileItem | null {
        if (!this.hasText(value)) return null;
        return { kind: 'code', label, value: value.trim(), itemClass };
    }

    private label(key: string): string {
        return this.translate.translate(key);
    }

    /**
     * Voce booleana resa come badge. `tones` mappa il valore al tono Bootstrap
     * in modo generico: di default Sì→verde / No→grigio, ma un campo può
     * dichiarare toni diversi (es. un flag negativo: Sì→warning).
     */
    private createBoolItem(
        label: string,
        value: boolean | null | undefined,
        tones: { onTrue: BadgeTone; onFalse: BadgeTone } = { onTrue: 'success', onFalse: 'secondary' },
        itemClass?: string,
    ): ProfileItem | null {
        if (typeof value !== 'boolean') return null;
        return {
            kind: 'bool',
            label,
            value: this.translate.translate(value ? 'siAzione' : 'noAzione'),
            tone: value ? tones.onTrue : tones.onFalse,
            itemClass,
        };
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
