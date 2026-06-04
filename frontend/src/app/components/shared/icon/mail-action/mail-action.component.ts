import { Component, computed, input, inject } from '@angular/core';
import { TranslateService } from '../../../../core/engine/services/translate.service';

export interface MailActionConfig {
    to: string;
    subject?: string;
    body?: string;
}

@Component({
    selector: 'app-mail-action',
    standalone: true,
    imports: [],
    templateUrl: './mail-action.component.html',
    styleUrl: './mail-action.component.css',
    host: { class: 'd-inline-block' }
})
export class MailActionComponent {
    private readonly translate = inject(TranslateService);

    readonly config = input.required<MailActionConfig>();
    readonly label = input<string>();
    readonly showLabel = input(false);

    readonly displayLabel = computed(() =>
        this.translate.translate(this.label() ?? 'inviaMailAzione')
    );

    readonly mailtoHref = computed(() => {
        const { to, subject, body } = this.config();
        const params = new URLSearchParams();
        if (subject) params.set('subject', subject);
        if (body) params.set('body', body);
        const query = params.toString();
        return `mailto:${to}${query ? '?' + query : ''}`;
    });
}
