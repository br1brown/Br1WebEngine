import {
    AfterViewInit,
    Component,
    ElementRef,
    ViewChild,
    inject,
    signal,
    effect,
    computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { ShareService } from '../../core/services/share.service';
import { ThemeService } from '../../core/services/theme.service';
import { renderToCanvas } from '../../core/services/img-builder.service';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { ContextMenuOption } from '../../shared/components/context-menu/context-menu.models';
import { ContextMenuDirective } from '../../shared/directives/context-menu.directive';
import { PageBaseComponent } from '../page-base.component';
import { ContestoSito } from '../../site';
import { SpeechService } from '../../core/services/speech.service';
import { ALLOWED_WIDTHS, type AssetWidth } from '../../app.config';

@Component({
    selector: 'app-home',
    imports: [TranslatePipe, FormsModule, CommonModule, ContextMenuDirective],
    templateUrl: './home.component.html',
    styleUrl: './home.component.css'
})
export class HomeComponent extends PageBaseComponent implements AfterViewInit {
    readonly theme = inject(ThemeService);
    readonly share = inject(ShareService);
    readonly appName = ContestoSito.config.appName;
    readonly speech = inject(SpeechService);



    @ViewChild('homeImageCanvas') homeImageCanvasRef!: ElementRef<HTMLCanvasElement>;

    // --- Inizializza con una traduzione ---
    speechDemoText = this.translate.translate('speechPlaceholder');

    // --- Laboratorio Markdown ---
    markdownInput = '';
    markdownPreview = '';
    markdownHtml = '';
    autoPreview = true;

    // --- Demo immagini integrata nella home ---
    imgText = 'Hello World';
    imgBgColor = this.theme.colorTema();
    imgTextColor = this.theme.isDarkTextPreferred() ? '#000000' : '#ffffff';
    imgFontSize = 48;

    // --- Sistema & API ---
    socialFilter = '';
    readonly socialResult = signal('');

    // --- Risoluzione asset + playground resize ---
    assetId = 'favIcon';
    readonly assetUrl = signal('');
    readonly assetResizeWidth = signal<number | null>(null);
    readonly assetWidths = ALLOWED_WIDTHS;

    // --- Demo menu contestuale ---
    readonly contextMenuLastAction = signal('');
    readonly clipboardContent = signal('');
    contextDemoText = '';

    readonly contextMenuOptions = computed<ContextMenuOption[]>(() => [
        {
            label: this.translate.translate('contextMenuCopy'),
            icon: 'fa-solid fa-copy',
            action: async () => {
                this.contextMenuLastAction.set('copy');
                const selected = window.getSelection()?.toString() || this.contextDemoText;
                if (selected) {
                    await this.share.copyText(selected);
                    this.clipboardContent.set(selected);
                }
            }
        },
        {
            label: this.translate.translate('contextMenuCut'),
            icon: 'fa-solid fa-scissors',
            action: async () => {
                this.contextMenuLastAction.set('cut');
                const selected = window.getSelection()?.toString() || '';
                if (selected) {
                    await this.share.copyText(selected);
                    this.clipboardContent.set(selected);
                    this.contextDemoText = this.contextDemoText.replace(selected, '');
                    this.notify.toast(this.translate.translate('clipboardCut'), 'info');
                }
            }
        },
        {
            label: this.translate.translate('contextMenuPaste'),
            icon: 'fa-solid fa-paste',
            action: async () => {
                this.contextMenuLastAction.set('paste');
                const text = await this.share.readText() || this.clipboardContent();
                if (text) {
                    this.contextDemoText += text;
                    this.notify.toast(this.translate.translate('clipboardPasted'), 'success');
                } else {
                    this.notify.toast(this.translate.translate('clipboardEmpty'), 'warning');
                }
            }
        },
        { separator: true, label: '' },
        {
            label: this.translate.translate('contextMenuInfo'),
            icon: 'fa-solid fa-circle-info',
            action: () => {
                this.contextMenuLastAction.set('info');
                this.notify.success(this.translate.translate('contextMenuTitle'));
            }
        }
    ]);

    // --- Demo modali ---
    readonly modalResult = signal('');

    constructor() {
        super();
        this.contextDemoText = '';

        effect(() => {
            this.translate.currentLang(); // traccia cambio lingua
            this.speechDemoText = this.translate.translate('speechPlaceholder');
        });
    }

    ngAfterViewInit(): void {
        this.renderHomeImage();
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

    renderHomeImage(): void {
        const canvas = this.homeImageCanvasRef?.nativeElement;
        if (!canvas) return;

        renderToCanvas(canvas, {
            text: this.imgText || 'Hello World',
            bgColor: this.imgBgColor,
            textColor: this.imgTextColor,
            fontSize: this.imgFontSize,
            canvasWidth: 600,
            fontFamily: 'Arial',
            margin: 24
        });
    }

    resetHomeImage(): void {
        this.imgText = 'Hello World';
        this.applyThemeImageDefaults();
        this.imgFontSize = 48;
        this.renderHomeImage();
    }

    private applyThemeImageDefaults(): void {
        this.imgBgColor = this.theme.colorTema();
        this.imgTextColor = this.theme.isDarkTextPreferred() ? '#000000' : '#ffffff';
    }

    downloadHomeImage(): void {
        const canvas = this.homeImageCanvasRef?.nativeElement;
        if (!canvas) return;
        this.share.downloadCanvas(canvas);
    }

    shareHomeImage(): void {
        const canvas = this.homeImageCanvasRef?.nativeElement;
        if (!canvas) return;
        const filename = `${this.appName.toLowerCase().replace(/\s+/g, '-')}-image.png`;
        this.share.shareCanvas(canvas, this.appName, filename);
    }

    // ==================== Demo modali ====================

    showAlert(): void {
        this.notify.success(this.translate.translate('modalAlertBody'));
    }

    showConfirm(): void {
        this.notify.confirm(
            this.translate.translate('modalConfirmTitle'),
            this.translate.translate('modalConfirmBody'),
            {
                onConfirm: () => this.modalResult.set(this.translate.translate('confirmed')),
                onCancel: () => this.modalResult.set(this.translate.translate('cancelled')),
            }
        );
    }

    showFormModal(): void {
        this.notify.prompt(
            this.translate.translate('modalFormTitle'),
            this.translate.translate('modalFormNameLabel'),
            {
                onSubmit: (value) => {
                    this.modalResult.set(
                        `${this.translate.translate('modalResultSubmitted')}: ${value}`
                    );
                    this.notify.toast(this.translate.translate('modalResultSubmitted'), 'success');
                },
            },
            {
                confirmText: this.translate.translate('modalFormSubmit'),
                cancelText: this.translate.translate('annulla'),
            }
        );
    }

    toggleSpeech(): void {
        if (this.speech.isSpeaking()) {
            this.speech.stop();
        } else {
            this.speech.speak(this.speechDemoText);
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

    async resolveAsset(): Promise<void> {
        this.assetResizeWidth.set(null);
        const url = await firstValueFrom(this.asset.getUrl(this.assetId));
        this.assetUrl.set(url);
    }

    async resolveAssetResized(width: AssetWidth): Promise<void> {
        this.assetResizeWidth.set(width);
        const url = await firstValueFrom(this.asset.getUrl(this.assetId, width));
        this.assetUrl.set(url);
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
