import { Component, Signal, computed, input } from '@angular/core';
import { BaseContactComponent } from '../base-contact.component';
import { LinkBadgeComponent } from '../../link-badge/link-badge.component';
import { ContactUrl } from '../../utils/contact-url.util';

@Component({
    selector: 'app-telegram-contact',
    standalone: true,
    imports: [LinkBadgeComponent],
    templateUrl: './telegram-contact.component.html',
})
export class TelegramContactComponent extends BaseContactComponent {
    /** Username Telegram (con o senza @). */
    readonly handle = input.required<string>();

    protected readonly defaultLabelKey = 'telegramAzione';

    readonly glyph: Signal<string> = computed(() => 'fa-brands fa-telegram');
    readonly color: Signal<string | null> = computed(() => '#26A5E4');
    readonly content: Signal<string> = computed(() => this.handle().trim());
    readonly href: Signal<string> = computed(() => ContactUrl.telegram(this.handle()));
}
