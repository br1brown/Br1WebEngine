import { Injectable, inject } from '@angular/core';
import { NotificationService } from './notification.service';
import { TranslateService } from './translate.service';

/**
 * Servizio centralizzato per copia, condivisione e download.
 *
 * Astrae le API del browser (Clipboard API, Web Share API, download via blob)
 * dietro metodi semplici con gestione errori e notifiche integrate.
 * Utilizzabile da qualsiasi componente del template.
 */
@Injectable({ providedIn: 'root' })
export class ShareService {
    private readonly notify = inject(NotificationService);
    private readonly translate = inject(TranslateService);

    // ─── Clipboard ──────────────────────────────────────────────────────

    /** Copia testo nella clipboard e mostra una notifica di successo */
    async copyText(text: string): Promise<boolean> {
        try {
            await navigator.clipboard.writeText(text);
            this.notify.toast(this.translate.t('clipboardCopied'), 'success');
            return true;
        } catch {
            this.notify.toast(this.translate.t('clipboardEmpty'), 'warning');
            return false;
        }
    }

    /** Legge testo dalla clipboard. Ritorna stringa vuota se non disponibile */
    async readText(): Promise<string> {
        try {
            return await navigator.clipboard.readText();
        } catch {
            return '';
        }
    }

    // ─── Web Share API ──────────────────────────────────────────────────

    /** true se il browser supporta la Web Share API */
    get canShare(): boolean {
        return typeof navigator !== 'undefined' && !!navigator.share;
    }

    /** Condivide testo tramite Web Share API. Ritorna false se non supportato o annullato */
    async shareText(text: string, title?: string): Promise<boolean> {
        if (!this.canShare) return false;
        try {
            await navigator.share({ title, text });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Condivide un file (es. immagine) tramite Web Share API.
     * Se non supportato, esegue il download come ripiego.
     */
    async shareFile(blob: Blob, filename: string, title?: string): Promise<void> {
        if (this.canShare) {
            try {
                const file = new File([blob], filename, { type: blob.type });
                await navigator.share({ title, files: [file] });
                return;
            } catch {
                // Condivisione annullata: ripiega sul download
            }
        }
        this.downloadBlob(blob, filename);
    }

    /**
     * Condivide il contenuto di un canvas come immagine PNG.
     * Se Web Share non è disponibile, scarica il file.
     */
    async shareCanvas(canvas: HTMLCanvasElement, title?: string, filename = 'immagine.png'): Promise<void> {
        return new Promise<void>((resolve) => {
            canvas.toBlob(async (blob) => {
                if (blob) {
                    await this.shareFile(blob, filename, title);
                }
                resolve();
            }, 'image/png');
        });
    }

    // ─── Download ───────────────────────────────────────────────────────

    /** Scarica un blob come file */
    downloadBlob(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    }

    /** Scarica il contenuto di un canvas come file PNG */
    downloadCanvas(canvas: HTMLCanvasElement, filename = 'immagine.png'): void {
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }
}
