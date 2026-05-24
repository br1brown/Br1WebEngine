import { Directive, effect, inject, input, output, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SafeUrl } from '@angular/platform-browser';
import { QrCodeService, QrConfig } from '../services/qr-code.service';
import { AssetService } from '../services/asset.service';

/**
 * QR RENDER DIRECTIVE
 *
 * Trasforma un <img> nel render di un QR code: la directive genera il QR
 * via QrCodeService a partire dalla `qrContent` config e ne aggiorna `src`
 * automaticamente. Niente wrapper, niente classi proprie — l'<img> e' il
 * QR e accetta tutte le classi/attributi standard.
 *
 *   <img [qrContent]="config"
 *        (blobChange)="qrBlob.set($event)"
 *        (errorChange)="qrError.set($event)"
 *        alt="QR Code WhatsApp"
 *        class="img-fluid">
 *
 * Il `blob` originale e il messaggio di errore tradotto vengono emessi
 * come output: il consumer li raccoglie in signal locali per pilotare
 * pulsanti di download/condivisione e alert di errore, anche se vivono
 * in un altro ramo del template.
 *
 * Su SSR e quando la generazione fallisce, l'attributo `src` viene rimosso:
 * il browser mostra il testo `alt` come fallback HTML standard.
 *
 * Selector vincolato a img[qrContent]: errore a compile time se usata su
 * altro elemento. Un token monotono evita che build asincrone sovrapposte
 * si "sorpassino" lasciando in mostra un QR ormai obsoleto.
 */
@Directive({
    selector: 'img[qrContent]',
    standalone: true,
    host: { '[src]': 'src()' },
})
export class QrRenderDirective {
    private readonly qrCode = inject(QrCodeService);
    private readonly asset = inject(AssetService);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    readonly qrContent = input<QrConfig | null>(null);

    readonly blobChange = output<Blob | null>();
    readonly errorChange = output<string | null>();

    protected readonly src = signal<SafeUrl | null>(null);

    private renderToken = 0;

    constructor() {
        effect(() => {
            const cfg = this.qrContent();
            if (!this.isBrowser || !cfg) {
                this.reset();
                return;
            }
            void this.render(cfg);
        });
    }

    private async render(cfg: QrConfig): Promise<void> {
        const token = ++this.renderToken;
        const result = await this.qrCode.create(cfg);
        if (token !== this.renderToken) return;
        if (!result.success) {
            this.src.set(null);
            this.blobChange.emit(null);
            this.errorChange.emit(result.message);
            return;
        }
        this.errorChange.emit(null);
        this.blobChange.emit(result.blob);
        this.src.set(this.asset.getUrlFromBlob(result.blob).angularUrl);
    }

    private reset(): void {
        this.src.set(null);
        this.blobChange.emit(null);
        this.errorChange.emit(null);
    }
}
