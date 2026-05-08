import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NotificationService } from './notification.service';
import { TranslateService } from './translate.service';

/**
 * SHARE SERVICE
 *
 * Servizio centralizzato per:
 * - copia negli appunti
 * - condivisione nativa (Web Share API)
 * - download locale di file e canvas
 *
 * Gerarchia interna:
 * download:  downloadCanvas → downloadBlob (core)
 * share:     shareCanvas → shareBlob → shareFile (core)
 *
 * Le funzioni wrapper si occupano solo della conversione dei dati.
 */
@Injectable({ providedIn: 'root' })
export class ShareService {
    private readonly notify = inject(NotificationService);
    private readonly translate = inject(TranslateService);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    // ───────────────────────────────────────────────────────────────
    // Utility interna
    // ───────────────────────────────────────────────────────────────

    /**
     * Converte un canvas in Blob PNG.
     */
    private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
        return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }

    // ─── CLIPBOARD ─────────────────────────────────────────────────

    /**
     * Copia testo negli appunti tramite Clipboard API.
     * Mostra un toast di conferma o errore.
     */
    async copyText(text: string, notify: boolean = true): Promise<boolean> {
        if (!this.isBrowser || !text) return false;

        try {
            await navigator.clipboard.writeText(text);
            if (notify) this.notify.toast(this.translate.translate('clipboardCopied'), 'success');
            return true;
        } catch {
            if (notify) this.notify.toast(this.translate.translate('clipboardError'), 'error');
            return false;
        }
    }

    /** 
     * Legge il contenuto testuale dagli appunti del sistema.
     * Richiede solitamente l'interazione esplicita dell'utente e permessi browser.
     */
    async readText(): Promise<string> {
        if (!this.isBrowser) return "";
        try {
            return await navigator.clipboard.readText();
        } catch {
            return '';

        }
    }

    // ─── SHARE CHAIN ───────────────────────────────────────────────

    /**
     * Condivide un canvas convertendolo prima in Blob.
     */
    async shareCanvas(canvas: HTMLCanvasElement, filename = 'immagine.png', title?: string): Promise<void> {
        const blob = await this.canvasToBlob(canvas);
        if (blob) await this.shareBlob(blob, filename, title);
    }

    /**
     * Condivide un Blob convertendolo prima in File.
     */
    async shareBlob(blob: Blob, filename: string, title?: string): Promise<void> {
        const file = new File([blob], filename, { type: blob.type });
        return this.shareFile(file, title);
    }

    /**
     * CORE SHARE
     *
     * Usa la Web Share API se disponibile.
     * In caso di errore o mancanza di supporto, effettua il fallback al download.
     */
    async shareFile(file: File, title?: string, notify: boolean = true): Promise<void> {
        if (this.isBrowser && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: title || file.name,
                    files: [file]
                });
                return;
            } catch (err) {
                if ((err as Error).name === 'AbortError') return;
            if (notify) this.notify.toast(this.translate.translate('shareError'), 'error');
            }
        }

        // Fallback automatico
        this.downloadBlob(file, file.name);
    }

    // ─── DOWNLOAD CHAIN ────────────────────────────────────────────

    /**
     * Converte un canvas in Blob e lo scarica localmente.
     */
    async downloadCanvas(canvas: HTMLCanvasElement, filename = 'immagine.png'): Promise<void> {
        const blob = await this.canvasToBlob(canvas);
        if (blob) this.downloadBlob(blob, filename);
    }

    /**
     * CORE DOWNLOAD
     *
     * Crea un URL temporaneo e simula il click su un anchor invisibile.
     */
    downloadBlob(blob: Blob, filename: string): void {
        if (!this.isBrowser) return;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }
}
