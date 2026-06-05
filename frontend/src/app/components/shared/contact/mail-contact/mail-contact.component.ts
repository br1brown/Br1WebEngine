import { Component, Signal, computed, input } from '@angular/core';
import { BaseContactComponent } from '../base-contact.component';
import { LinkBadgeComponent } from '../../link-badge/link-badge.component';
import { ContactUrl } from '../../utils/contact-url.util';

export interface MailContactConfig {
    to: string;
    subject?: string;
    body?: string;
}

@Component({
    selector: 'app-mail-contact',
    standalone: true,
    imports: [LinkBadgeComponent],
    templateUrl: './mail-contact.component.html',
})
export class MailContactComponent extends BaseContactComponent {
    readonly config = input.required<MailContactConfig>();

    protected readonly defaultLabelKey = 'inviaMailAzione';

    readonly glyph: Signal<string> = computed(() => 'fa-solid fa-envelope');
    readonly color: Signal<string | null> = computed(() => null);
    readonly content: Signal<string> = computed(() => this.config().to.trim());
    readonly href: Signal<string> = computed(() => {
        const { to, subject, body } = this.config();
        return ContactUrl.mail(to, subject, body);
    });
}
