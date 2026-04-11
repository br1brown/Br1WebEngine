import {
    AfterViewInit,
    Component,
    ElementRef,
    ViewChild,
    inject,
    signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { ShareService } from '../../core/services/share.service';
import { ThemeService } from '../../core/services/theme.service';
import { renderToCanvas } from '../../core/services/img-builder.service';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { ContextMenuOption } from '../../shared/components/context-menu/context-menu.models';
import { ContextMenuDirective } from '../../shared/directives/context-menu.directive';
import { PageBaseComponent } from '../page-base.component';
import { ContestoSito } from '../../site';

@Component({
    selector: 'app-home',
    imports: [TranslatePipe, FormsModule, ContextMenuDirective],
    templateUrl: './home.component.html',
    styleUrl: './home.component.css'
})
export class HomeComponent extends PageBaseComponent implements AfterViewInit {
    readonly theme = inject(ThemeService);
    readonly share = inject(ShareService);
    readonly appName = ContestoSito.config.appName;

    @ViewChild('homeImageCanvas') homeImageCanvasRef!: ElementRef<HTMLCanvasElement>;

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

    // --- Risoluzione asset ---
    assetId = 'favIcon';
    readonly assetUrl = signal('');

    // --- Demo menu contestuale ---
    readonly contextMenuLastAction = signal('');
    readonly clipboardContent = signal('');
    contextDemoText = '';

    readonly contextMenuOptions: ContextMenuOption[] = [
        {
            label: 'Copia',
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
            label: 'Taglia',
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
            label: 'Incolla',
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
            label: 'Informazioni',
            icon: 'fa-solid fa-circle-info',
            action: () => {
                this.contextMenuLastAction.set('info');
                this.notify.success(this.translate.translate('contextMenuTitle'));
            }
        }
    ];

    // --- Demo modali ---
    readonly modalResult = signal('');

    constructor() {
        super();
        this.contextDemoText = '';
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

    async showConfirm(): Promise<void> {
        const ok = await this.notify.confirm(
            this.translate.translate('modalConfirmTitle'),
            this.translate.translate('modalConfirmBody')
        );

        this.modalResult.set(
            ok
                ? this.translate.translate('modalResultConfirmed')
                : this.translate.translate('modalResultCancelled')
        );
    }

    showFormModal(): void {
        import('sweetalert2').then(({ default: Swal }) => {
            Swal.fire({
                title: this.translate.translate('modalFormTitle'),
                input: 'text',
                inputLabel: this.translate.translate('modalFormNameLabel'),
                inputPlaceholder: this.translate.translate('modalFormNameLabel'),
                showCancelButton: true,
                confirmButtonText: this.translate.translate('modalFormSubmit'),
                cancelButtonText: this.translate.translate('annulla'),
            }).then(result => {
                if (result.isConfirmed && result.value) {
                    this.modalResult.set(
                        `${this.translate.translate('modalResultSubmitted')}: ${result.value}`
                    );
                    this.notify.toast(this.translate.translate('modalResultSubmitted'), 'success');
                }
            });
        });
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
        const url = await firstValueFrom(this.asset.getUrl(this.assetId));
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
