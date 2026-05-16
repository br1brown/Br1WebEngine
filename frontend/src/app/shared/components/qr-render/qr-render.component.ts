import {
    Component,
    effect,
    inject,
    input,
    PLATFORM_ID,
    signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SafeUrl } from '@angular/platform-browser';
import { QrCodeService, QrConfig } from '../../../core/services/qr-code.service';
import { AssetService } from '../../../core/services/asset.service';

/**
 * QR RENDER COMPONENT
 *
 * Componente puramente presentazionale: riceve una QrConfig e mostra l'<img>
 * del QR code generato. Validazione del payload, rendering su canvas e
 * conversione in Blob sono tutti dentro QrCodeService — qui si tratta solo
 * di mostrare il risultato.
 *
 * In caso di errore restituito dal service, `src` resta null e `error` espone
 * il messaggio tradotto: il consumer decide se mostrarlo o ignorarlo.
 *
 * Un token monotono evita che build asincrone sovrapposte si "sorpassino"
 * fra loro lasciando in mostra un QR ormai obsoleto.
 */
@Component({
    selector: 'app-qr-render',
    standalone: true,
    imports: [],
    template: `
        @if (src()) {
            <img [src]="src()" [alt]="alt()" />
        }
    `,
})
export class QrRenderComponent {
    private readonly qr = inject(QrCodeService);
    private readonly asset = inject(AssetService);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    readonly config = input.required<QrConfig>();
    readonly alt = input<string>('QR Code');

    readonly src = signal<SafeUrl | null>(null);
    readonly error = signal<string | null>(null);

    private renderToken = 0;

    constructor() {
        effect(() => {
            const cfg = this.config();
            if (!this.isBrowser) return;
            void this.render(cfg);
        });
    }

    private async render(cfg: QrConfig): Promise<void> {
        const token = ++this.renderToken;
        const result = await this.qr.create(cfg);
        if (token !== this.renderToken) return;
        if (!result.success) {
            this.src.set(null);
            this.error.set(result.message);
            return;
        }
        this.error.set(null);
        this.src.set(this.asset.getUrlFromBlob(result.blob).angularUrl);
    }
}
