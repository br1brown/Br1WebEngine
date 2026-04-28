import { Component, computed, effect, inject, input, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { PageBaseComponent } from '../page-base.component';
import { PolicyContentService } from './policy-content.service';

/**
 * Componente riusabile per tutte le pagine legali.
 *
 * Il contenuto iniziale arriva da un resolver dichiarato in site.ts che usa
 * PolicyContentService — questo permette il render lato server (SEO sui testi
 * legali). Sul client un effect riallinea il contenuto al cambio lingua senza
 * dover rinavigare; gira solo dopo l'idratazione, mai durante l'SSR.
 */
@Component({
    selector: 'app-policy',
    imports: [MarkdownPipe],
    templateUrl: './policy.component.html',
    styleUrl: './policy.component.css'
})
export class PolicyComponent extends PageBaseComponent {
    private readonly policyService = inject(PolicyContentService);
    private readonly platformId = inject(PLATFORM_ID);

    readonly content = input<string>('');

    private readonly liveContent = signal<string | null>(null);

    readonly displayContent = computed(() => this.liveContent() ?? this.content());

    constructor() {
        super();

        // Eccezione consapevole alla regola "no effect()" di PageBaseComponent:
        // l'effect e' guardato da isPlatformBrowser, quindi non viene mai
        // registrato durante l'SSR e non puo' bloccarne la stabilizzazione.
        if (isPlatformBrowser(this.platformId)) {
            effect(() => {
                const lang = this.translate.currentLang();
                this.policyService.load(this.pageType(), lang)
                    .then(text => this.liveContent.set(text));
            });
        }
    }
}
