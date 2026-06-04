import {
    Component,
    inject,
    signal,
    computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MarkdownPipe } from '../../core/engine/pipes/markdown.pipe';
import { ShareService } from '../../core/engine/services/share.service';
import { ThemeService } from '../../core/engine/services/theme.service';
import { QrConfig } from '../../core/engine/services/qr-code.service';
import { AuthService } from '../../core/services/auth.service';

import { TranslatePipe } from '../../core/engine/pipes/translate.pipe';
import { ContextMenuOption } from '../../core/engine/components/context-menu/context-menu.models';
import { ContextMenuDirective } from '../../core/engine/directives/context-menu.directive';
import { QrRenderDirective } from '../../core/engine/directives/qr-render.directive';
import { ImgRenderDirective, ImgRenderConfig } from '../../core/engine/directives/img-render.directive';
import { AssetDirective } from '../../core/engine/directives/asset.directive';
import { PageBaseComponent } from '../page-base.component';
import { ContestoSito } from '../../site';
import { ALLOWED_WIDTHS, type AssetWidth } from '../../app.config';
import { CopyActionComponent } from '../../components/shared/icon/copy-action/copy-action.component';
import { SpeechActionComponent } from '../../components/shared/icon/speech-action/speech-action.component';
import { DownloadActionComponent } from '../../components/shared/icon/download-action/download-action.component';
import { ShareActionComponent } from '../../components/shared/icon/share-action/share-action.component';
import { PdfActionComponent, PdfActionConfig } from '../../components/shared/icon/pdf-action/pdf-action.component';
import { MailActionComponent, MailActionConfig } from '../../components/shared/icon/mail-action/mail-action.component';

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
        CopyActionComponent,
        SpeechActionComponent,
        DownloadActionComponent,
        ShareActionComponent,
        PdfActionComponent,
        MailActionComponent,
    ],
    templateUrl: './home.component.html',
    styleUrl: './home.component.css'
})
export class HomeComponent extends PageBaseComponent<void> {
    readonly theme = inject(ThemeService);
    readonly share = inject(ShareService);
    readonly appName = ContestoSito.config.appName;
    readonly auth = inject(AuthService);

    /** Canvas raw emesso dalla [imgRender] directive: serve a download/share. */
    readonly imgCanvas = signal<HTMLCanvasElement | null>(null);

    readonly getMarkdownHtml = () => this.markdownHtml;
    readonly demoActionText = signal('Testo di esempio per copia e condivisione.');
    readonly getDemoText = () => this.demoActionText();
    readonly getDemoBlob = () => new Blob([this.demoActionText()], { type: 'text/plain' });

    readonly demoPdfOpen: PdfActionConfig = { url: 'https://www.w3.org/WAI/WCAG21/wcag21.pdf', openInTab: true };
    readonly demoPdfDownload: PdfActionConfig = { url: 'https://www.w3.org/WAI/WCAG21/wcag21.pdf', openInTab: false };
    readonly demoMail: MailActionConfig = { to: 'info@esempio.it', subject: 'Contatto dal sito', body: 'Salve,\n\n' };

    readonly heroStats = [
        { value: 8,  label: 'heroStatServices' },
        { value: 4,  label: 'heroStatDirectives' },
        { value: 6,  label: 'heroStatComponents' },
        { value: 5,  label: 'heroStatQrTypes' },
    ] as const;

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
            label: this.translate.translate('scaricaAzione'),
            icon: 'fa-solid fa-download',
            action: () => this.downloadHomeImage()
        },
        {
            label: this.translate.translate('condividiAzione'),
            icon: 'fa-solid fa-share-nodes',
            action: () => this.shareHomeImage()
        }
    ]);

    readonly qrContextMenuOptions = computed<ContextMenuOption[]>(() => {
        const blob = this.qrBlob();
        return blob ? [
            {
                label: this.translate.translate('scaricaAzione'),
                icon: 'fa-solid fa-download',
                action: () => void this.share.downloadBlob(blob, 'qrcode.png')
            },
            {
                label: this.translate.translate('condividiAzione'),
                icon: 'fa-solid fa-share-nodes',
                action: () => void this.share.shareBlob(blob, 'qrcode.png', 'QR Code')
            }
        ] : [];
    });

    // --- Demo modali ---
    readonly modalResult = signal('');

    // --- Snippet di codice per la colonna destra di ogni sezione ---
    readonly snippets = {
        markdown:
`<!-- Pipe nel template -->
<div [innerHTML]="content | markdown"></div>

<!-- Import nel componente -->
imports: [MarkdownPipe]`,

        imgRender:
`// Config
config: ImgRenderConfig = {
  text: 'Testo',
  fontSize: 60,
  renderMode: 'wrap', // 'wrap'|'fit'|'single'
};

// Template
// Nota: $event negli output Angular non è un DOM event
// (come in un click), ma il valore emesso direttamente
// dalla directive — qui HTMLCanvasElement|null.
// Ometti (canvasChange) se non ti serve il canvas raw.
<img [imgRender]="config"
     (canvasChange)="canvas.set($event)"
     alt="Immagine generata">`,

        qrCode:
`// Config (type: text|whatsapp|email|wifi|sepa)
config: QrConfig = {
  type: 'text',
  content: 'https://example.com',
};

// Template
// Nota: $event negli output Angular non è un DOM event
// (come in un click), ma il valore emesso direttamente
// dalla directive — qui Blob|null o string|null.
// Entrambi gli output sono opzionali: omettili se non
// hai bisogno di download/condivisione o messaggi errore.
<img [qrContent]="config"
     (blobChange)="blob.set($event)"
     (errorChange)="err.set($event)"
     alt="QR Code">`,

        speech:
`speech = inject(SpeechService);

// Parla / ferma
speech.speak('Ciao!');
speech.stop();

// Signals
speech.isSpeaking()   // boolean
speech.currentVoice() // SpeechSynthesisVoice`,

        notify:
`notify = inject(NotificationService);

// Toast
notify.toast('Salvato', 'success');

// Alert
await notify.success('Completato');

// Conferma
const ok = await notify.confirm(
  'Titolo', 'Sei sicuro?'
);

// Prompt
const val = await notify.prompt(
  'Titolo', 'Campo', 'OK', 'Annulla'
);`,

        theme:
`/* Token CSS — sempre da variabile */
background: var(--colorSurface);
color:       var(--colorSurfaceText);
border: 1px solid var(--colorSurfaceBorder);

/* Colore brand (WCAG AA garantito) */
background: var(--colorPrimary);
color:       var(--colorPrimaryText);

/* Focus ring (WCAG 2.4.7) */
outline: var(--focusRingWidth)
         solid var(--focusRingColor);`,

        i18n:
`// Template
{{ 'chiave' | translate }}
[attr.aria-label]="'chiave' | translate"
{{ 'msg' | translate : arg1 }}

// TypeScript
translate = inject(TranslateService);
translate.translate('chiave');
translate.currentLang() // Signal<string>

// File: src/assets/i18n/
//   basic.it.json  /  basic.en.json
//   addon.it.json  /  addon.en.json`,

        api:
`// 1. api.service.ts
const API = { items: 'items' } as const;
getItems(): Promise<Item[]> {
  return this.api_get<Item[]>(API.items);
}

// 2. content.resolver.ts
case PageType.Pagina:
  content = await this.api.getItems();
  break;

// 3. Componente (via resolver)
pageContent() // Signal<Item[] | null>

// 4. Chiamata extra
await this.loadData(
  () => this.api.getItems()
);`,

        asset:
`<!-- Originale -->
<img [appAsset]="'nomeAsset'" alt="Foto">

<!-- Ridimensionato (WebP) -->
<img [appAsset]="'nomeAsset'"
     [appAssetWidth]="480"
     alt="Foto">

<!-- URL da TypeScript -->
asset.getUrl('nomeAsset', 480)
// → /assets/.../nomeAsset_480.webp

<!-- Href per link/download -->
<a [appAssetHref]="'documento'">
  Scarica PDF
</a>`,

        actionComponents:
`// Funzioni stabili come proprietà freccia
getText = () => this.myText();
getBlob = () => new Blob([this.myText()], {
  type: 'text/plain'
});

// Copia negli appunti
<app-copy-action [action]="getText"
                 [showLabel]="true" />

// Web Share API
<app-share-action [action]="getText"
                  [showLabel]="true" />

// Sintesi vocale TTS
<app-speech-action [action]="getText"
                   [showLabel]="true"
                   labelStop="speechPlaying" />

// Download file
<app-download-action [action]="getBlob"
                     filename="file.txt"
                     [showLabel]="true" />

// PDF (openInTab: true = nuova scheda)
pdfCfg = { url: '/doc.pdf', openInTab: true };
<app-pdf-action [config]="pdfCfg"
                [showLabel]="true" />

// Email predefinita
mailCfg = { to: 'info@...',
            subject: 'Oggetto',
            body: 'Testo...' };
<app-mail-action [config]="mailCfg"
                 [showLabel]="true" />`,
    } as const;

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
        this.modalResult.set(this.translate.translate(confirmed ? 'confermatoStato' : 'annullatoStato'));
    }

    async showFormModal(): Promise<void> {
        const value = await this.notify.prompt(
            this.translate.translate('modalFormTitle'),
            this.translate.translate('modalFormNameLabel'),
            this.translate.translate('modalFormSubmit'),
            this.translate.translate('annullaAzione'),
        );
        if (value !== null) {
            this.modalResult.set(`${this.translate.translate('modalResultSubmitted')}: ${value}`);
            this.notify.toast(this.translate.translate('modalResultSubmitted'), 'success');
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

    get apiStatus(): string {
        return this.translate.translate(
            'apiStato',
            this.translate.translate('onlineStato')
        );
    }
}
