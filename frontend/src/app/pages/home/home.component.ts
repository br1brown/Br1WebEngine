import {
    Component,
    inject,
    signal,
    effect,
    computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { ShareService } from '../../core/services/share.service';
import { ThemeService } from '../../core/services/theme.service';
import { QrConfig } from '../../core/services/qr-code.service';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { ContextMenuOption } from '../../shared/components/context-menu/context-menu.models';
import { ContextMenuDirective } from '../../shared/directives/context-menu.directive';
import { QrRenderDirective } from '../../shared/directives/qr-render.directive';
import { ImgRenderDirective, ImgRenderConfig } from '../../shared/directives/img-render.directive';
import { AssetDirective } from '../../shared/directives/asset.directive';
import { PageBaseComponent } from '../page-base.component';
import { ContestoSito } from '../../site';
import { SpeechService } from '../../core/services/speech.service';
import { ALLOWED_WIDTHS, type AssetWidth } from '../../app.config';

@Component({
    selector: 'app-home',
    imports: [
        TranslatePipe,
        FormsModule,
        CommonModule,
        ContextMenuDirective,
        QrRenderDirective,
        ImgRenderDirective,
        AssetDirective,
    ],
    templateUrl: './home.component.html',
    styleUrl: './home.component.css'
})
export class HomeComponent extends PageBaseComponent<void> {
    readonly theme = inject(ThemeService);
    readonly share = inject(ShareService);
    readonly appName = ContestoSito.config.appName;
    readonly speech = inject(SpeechService);

    /** Canvas raw emesso dalla [imgRender] directive: serve a download/share. */
    readonly imgCanvas = signal<HTMLCanvasElement | null>(null);

    // --- Signal scrivibile: aggiornato al cambio lingua, modificabile dall'utente ---
    readonly speechDemoText = signal(this.translate.translate('speechPlaceholder'));

    // --- Laboratorio Markdown ---
    markdownInput = '';
    markdownPreview = '';
    markdownHtml = '';
    autoPreview = true;

    // --- Demo immagini integrata nella home ---
    imgText = 'Hello World';
    imgFontSize = 60;

    /** Config corrente del builder: aggiornata da ngModelChange e letta dalla
     *  directive [imgRender] sull'<img> di anteprima. */
    readonly imgConfig = signal<ImgRenderConfig>(this.buildImgConfig());

    // --- QR Code playground ---
    qrType: QrConfig['type'] = 'text';
    qrText = 'https://example.com';
    qrPhone = '';
    qrWhatsappText = '';
    qrEmail = '';
    qrEmailSubject = '';
    qrEmailBody = '';
    qrSsid = '';
    qrWifiPassword = '';
    qrWifiEncryption: 'WPA' | 'WEP' | 'nopass' = 'WPA';
    qrIban = '';
    qrBeneficiaryName = '';
    qrAmount = 10;
    qrRemittance = '';

    /** Config corrente del QR: settata da `generateQr()`. La directive
     *  [qrContent] sull'<img> reagisce a questa signal e emette blob/error. */
    readonly qrConfig = signal<QrConfig | null>(null);
    readonly qrBlob = signal<Blob | null>(null);
    readonly qrError = signal<string | null>(null);

    // --- Sistema & API ---
    socialFilter = '';
    readonly socialResult = signal('');

    // --- Risoluzione asset + playground resize ---
    assetId = 'img4k';
    /** Asset effettivamente applicato dopo click su Originale/Resize. La directive
     *  [appAsset] sull'<img> si attiva solo quando questa signal e' valorizzata. */
    readonly appliedAssetId = signal<string | null>(null);
    readonly assetResizeWidth = signal<AssetWidth | null>(null);
    readonly assetWidths = ALLOWED_WIDTHS;

    // --- Context menu per immagini generate ---
    readonly imgContextMenuOptions = computed<ContextMenuOption[]>(() => [
        {
            label: this.translate.translate('scarica'),
            icon: 'fa-solid fa-download',
            action: () => this.downloadHomeImage()
        },
        {
            label: this.translate.translate('condividi'),
            icon: 'fa-solid fa-share-nodes',
            action: () => this.shareHomeImage()
        }
    ]);

    readonly qrContextMenuOptions = computed<ContextMenuOption[]>(() => {
        const blob = this.qrBlob();
        return blob ? [
            {
                label: this.translate.translate('scarica'),
                icon: 'fa-solid fa-download',
                action: () => void this.share.downloadBlob(blob, 'qrcode.png')
            },
            {
                label: this.translate.translate('condividi'),
                icon: 'fa-solid fa-share-nodes',
                action: () => void this.share.shareBlob(blob, 'qrcode.png', 'QR Code')
            }
        ] : [];
    });

    // --- Demo modali ---
    readonly modalResult = signal('');

    constructor() {
        super();

        effect(() => {
            this.speechDemoText.set(this.translate.translate('speechPlaceholder'));
        });
    }

    // ==================== Laboratorio Markdown ====================

    onMarkdownChange(): void {
        if (this.autoPreview && this.markdownInput.trim()) {
            this.renderMarkdown();
        }
    }

    renderMarkdown(): void {
        const html = MarkdownPipe.render(this.markdownInput);
        this.markdownHtml = html;
        this.markdownPreview = html;
    }

    setPreset(type: 'base' | 'table'): void {
        if (type === 'base') {
            this.markdownInput =
                '# Titolo\n\n**Grassetto** e *corsivo*\n\n- Lista 1\n- Lista 2\n\n[Link](https://example.com)\n\n`codice inline`';
        } else {
            this.markdownInput =
                '| Feature | State |\n|---------|-------|\n| Markdown | OK |\n| Tables | OK |\n| Code | OK |';
        }
        this.onMarkdownChange();
    }

    // ==================== Demo immagini ====================

    /** Riemette `imgConfig`: la directive [imgRender] vede il signal cambiare
     *  e rigenera il canvas. Chiamato da ngModelChange / range input. */
    onImageInputChange(): void {
        this.imgConfig.set(this.buildImgConfig());
    }

    resetHomeImage(): void {
        this.imgText = 'Hello World';
        this.imgFontSize = 60;
        this.onImageInputChange();
    }

    private buildImgConfig(): ImgRenderConfig {
        return {
            text: this.imgText || 'Hello World',
            fontSize: this.imgFontSize,
            renderMode: 'wrap',
        };
    }

    downloadHomeImage(): void {
        const canvas = this.imgCanvas();
        if (!canvas) return;
        void this.share.downloadCanvas(canvas, `${this.appName.toLowerCase().replace(/\s+/g, '-')}-image.png`);
    }

    shareHomeImage(): void {
        const canvas = this.imgCanvas();
        if (!canvas) return;
        void this.share.shareCanvas(canvas, `${this.appName.toLowerCase().replace(/\s+/g, '-')}-image.png`, this.appName);
    }

    // ==================== QR Code ====================

    generateQr(): void {
        this.qrConfig.set(this.buildQrConfig());
    }

    private buildQrConfig(): QrConfig | null {
        switch (this.qrType) {
            case 'text':
                return { type: 'text', content: this.qrText };
            case 'whatsapp':
                return { type: 'whatsapp', phone: this.qrPhone, text: this.qrWhatsappText };
            case 'email':
                return { type: 'email', to: this.qrEmail, subject: this.qrEmailSubject, body: this.qrEmailBody };
            case 'wifi':
                return { type: 'wifi', ssid: this.qrSsid, password: this.qrWifiPassword, encryption: this.qrWifiEncryption };
            case 'sepa':
                return { type: 'sepa', iban: this.qrIban, name: this.qrBeneficiaryName, amount: this.qrAmount, remittance: this.qrRemittance };
        }
    }

    onQrTypeChange(): void {
        this.qrConfig.set(null);
        this.qrBlob.set(null);
        this.qrError.set(null);
    }

    // ==================== Demo modali ====================

    showAlert(): void {
        this.notify.success(this.translate.translate('modalAlertBody'));
    }

    async showConfirm(): Promise<void> {
        const confirmed = await this.notify.confirm(
            this.translate.translate('modalConfirmTitle'),
            this.translate.translate('modalConfirmBody')
        );
        this.modalResult.set(this.translate.translate(confirmed ? 'confirmed' : 'cancelled'));
    }

    async showFormModal(): Promise<void> {
        const value = await this.notify.prompt(
            this.translate.translate('modalFormTitle'),
            this.translate.translate('modalFormNameLabel'),
            this.translate.translate('modalFormSubmit'),
            this.translate.translate('annulla'),
        );
        if (value !== null) {
            this.modalResult.set(`${this.translate.translate('modalResultSubmitted')}: ${value}`);
            this.notify.toast(this.translate.translate('modalResultSubmitted'), 'success');
        }
    }

    toggleSpeech(): void {
        if (this.speech.isSpeaking()) {
            this.speech.stop();
        } else {
            this.speech.speak(this.speechDemoText());
        }
    }

    // ==================== Sistema & API ====================

    async callSocialApi(): Promise<void> {
        const nomi = this.socialFilter.trim()
            ? this.socialFilter.split(',').map(s => s.trim()).filter(Boolean)
            : undefined;

        const res = await this.api.getSocial(nomi);
        this.socialResult.set(JSON.stringify(res, null, 2));
    }

    resolveAsset(): void {
        this.assetResizeWidth.set(null);
        this.appliedAssetId.set(this.assetId);
    }

    resolveAssetResized(width: AssetWidth): void {
        this.assetResizeWidth.set(width);
        this.appliedAssetId.set(this.assetId);
    }

    copyToClipboard(text: string): void {
        this.share.copyText(text);
    }

    get apiStatus(): string {
        return this.translate.translate(
            'apiStatus',
            this.translate.translate('online')
        );
    }
}
