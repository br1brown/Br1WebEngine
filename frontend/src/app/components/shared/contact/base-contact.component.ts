import { Directive, Signal, computed, inject } from '@angular/core';
import { BaseLinkComponent } from '../base/base-link.component';
import { TranslateService } from '../../../core/engine/services/translate.service';

/**
 * BASE CONTACT COMPONENT
 *
 * Specializza BaseLinkComponent per i canali di contatto, che condividono la
 * stessa logica di label: una chiave i18n di default tradotta (es. "chiamaAzione").
 * Il componente concreto dichiara solo `defaultLabelKey`, `glyph`, `color` e `href`.
 */
@Directive()
export abstract class BaseContactComponent extends BaseLinkComponent {
    protected readonly translate = inject(TranslateService);

    /** Chiave i18n di default per label e aria-label. */
    protected abstract readonly defaultLabelKey: string;

    readonly displayLabel: Signal<string> = computed(() =>
        this.translate.translate(this.label() ?? this.defaultLabelKey)
    );
}
