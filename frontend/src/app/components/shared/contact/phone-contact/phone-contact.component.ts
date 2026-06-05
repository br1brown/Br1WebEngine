import { Component, Signal, computed, input } from '@angular/core';
import { BaseContactComponent } from '../base-contact.component';
import { LinkBadgeComponent } from '../../link-badge/link-badge.component';
import { ContactUrl } from '../../utils/contact-url.util';

@Component({
    selector: 'app-phone-contact',
    standalone: true,
    imports: [LinkBadgeComponent],
    templateUrl: './phone-contact.component.html',
})
export class PhoneContactComponent extends BaseContactComponent {
    /** Numero di telefono (con eventuale prefisso internazionale). */
    readonly number = input.required<string>();

    protected readonly defaultLabelKey = 'chiamaAzione';

    readonly glyph: Signal<string> = computed(() => 'fa-solid fa-phone');
    readonly color: Signal<string | null> = computed(() => null);
    readonly content: Signal<string> = computed(() => this.number().trim());
    readonly href: Signal<string> = computed(() => ContactUrl.phone(this.number()));
}
