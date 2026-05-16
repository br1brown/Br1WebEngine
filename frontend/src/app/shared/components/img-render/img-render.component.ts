import {
    Component,
    computed,
    effect,
    inject,
    input,
    PLATFORM_ID,
    signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ImgBuilderService, ImgBuildOptions } from '../../../core/services/img-builder.service';

/**
 * Configurazione completa per renderizzare un'immagine generata da ImgBuilderService:
 * estende le opzioni del builder col testo obbligatorio e un alt opzionale.
 * Passare tutto in un solo oggetto rende il consumer piu' compatto e centralizza
 * le evoluzioni future del contratto in un singolo punto.
 */
export interface ImgRenderConfig extends ImgBuildOptions {
    text: string;
    alt?: string;
}

/**
 * IMG RENDER COMPONENT
 *
 * Componente puramente presentazionale: riceve una configurazione e mostra l'<img>
 * generato internamente da ImgBuilderService (canvas -> PNG dataURL). Nessuna UI
 * di controllo, nessun manager esterno: si passa quello che il service richiede
 * e il componente si occupa del rendering.
 *
 * Un effect ricostruisce l'immagine ogni volta che `options` cambia; un token
 * monotono protegge da race condition quando piu' build asincrone si accavallano.
 */
@Component({
    selector: 'app-img-render',
    standalone: true,
    imports: [],
    template: `
        @if (src()) {
            <img [src]="src()" [alt]="alt()" />
        }
    `,
})
export class ImgRenderComponent {
    private readonly imgBuilder = inject(ImgBuilderService);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    readonly options = input.required<ImgRenderConfig>();

    readonly src = signal<string | null>(null);
    readonly alt = computed(() => this.options().alt ?? this.options().text);

    // Incrementato a ogni nuova richiesta: solo l'ultima build vince la set() finale
    private renderToken = 0;

    constructor() {
        effect(() => {
            const cfg = this.options();
            if (!this.isBrowser) return;
            void this.render(cfg);
        });
    }

    private async render(cfg: ImgRenderConfig): Promise<void> {
        const token = ++this.renderToken;
        const { text, alt: _alt, ...opts } = cfg;
        const canvas = await this.imgBuilder.buildCanvas(text, opts);
        if (token !== this.renderToken) return;
        if (!canvas) { this.src.set(null); return; }
        this.src.set(canvas.toDataURL('image/png'));
    }
}
