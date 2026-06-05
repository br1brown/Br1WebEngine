import { Component, Signal, computed, input } from '@angular/core';
import { BaseContactComponent } from '../base-contact.component';
import { LinkBadgeComponent } from '../../link-badge/link-badge.component';
import { ContactUrl } from '../../utils/contact-url.util';

export interface WhatsappContactConfig {
    phone: string;
    text?: string;
}

@Component({
    selector: 'app-whatsapp-contact',
    standalone: true,
    imports: [LinkBadgeComponent],
    templateUrl: './whatsapp-contact.component.html',
})
export class WhatsappContactComponent extends BaseContactComponent {
    readonly config = input.required<WhatsappContactConfig>();

    protected readonly defaultLabelKey = 'whatsappAzione';

    readonly glyph: Signal<string> = computed(() => 'fa-brands fa-whatsapp');
    readonly color: Signal<string | null> = computed(() => '#25D366');
    readonly content: Signal<string> = computed(() => this.config().phone.trim());
    readonly href: Signal<string> = computed(() => {
        const { phone, text } = this.config();
        return ContactUrl.whatsapp(phone, text);
    });
}
