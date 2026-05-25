import { Directive, effect, inject, input, output, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ImgBuilderService, ImgBuildOptions } from '../services/img-builder.service';

/**
 * Configurazione per renderizzare un'immagine via ImgBuilderService:
 * estende ImgBuildOptions col testo da disegnare. L'`alt` non e' qui dentro
 * — va sull'<img> come attributo HTML standard.
 */
export interface ImgRenderConfig extends ImgBuildOptions {
    text: string;
}

/**
 * IMG RENDER DIRECTIVE
 *
 * Trasforma un <img> nel render di un'immagine generata da ImgBuilderService:
 * la directive costruisce il canvas a partire dalla `imgRender` config e
 * ne aggiorna `src` (data URL PNG) automaticamente. Niente wrapper, niente
 * classi proprie — l'<img> e' l'immagine e accetta tutti gli attributi
 * standard (alt, class, style…).
 *
 *   <img [imgRender]="config"
 *        (canvasChange)="canvas.set($event)"
 *        alt="Anteprima logo"
 *        class="img-fluid rounded">
 *
 * Il canvas raw viene emesso come output: il consumer lo memorizza per
 * pilotare download/condivisione, anche se la live di interesse sta in
 * un altro ramo del template.
 *
 * Su SSR e quando la generazione fallisce, l'attributo `src` viene rimosso:
 * il browser mostra il testo `alt` come fallback HTML standard.
 *
 * Selector vincolato a img[imgRender]: errore a compile time se usata su
 * altro elemento. Un token monotono evita che build asincrone sovrapposte
 * si "sorpassino" lasciando in mostra un'immagine ormai obsoleta.
 */
@Directive({
    selector: 'img[imgRender]',
    standalone: true,
    host: { '[src]': 'src()' },
})
export class ImgRenderDirective {
    private readonly imgBuilder = inject(ImgBuilderService);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    readonly imgRender = input<ImgRenderConfig | null>(null);

    readonly canvasChange = output<HTMLCanvasElement | null>();

    protected readonly src = signal<string | null>(null);

    private renderToken = 0;

    constructor() {
        effect(() => {
            const cfg = this.imgRender();
            if (!this.isBrowser || !cfg) {
                this.reset();
                return;
            }
            void this.render(cfg);
        });
    }

    private async render(cfg: ImgRenderConfig): Promise<void> {
        const token = ++this.renderToken;
        const { text, ...opts } = cfg;
        const canvas = await this.imgBuilder.buildCanvas(text, opts);
        if (token !== this.renderToken) return;
        if (!canvas) {
            this.reset();
            return;
        }
        this.canvasChange.emit(canvas);
        this.src.set(canvas.toDataURL('image/png'));
    }

    private reset(): void {
        this.src.set(null);
        this.canvasChange.emit(null);
    }
}
