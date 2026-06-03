import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/engine/pipes/translate.pipe';
import { TranslateService } from '../../../core/engine/services/translate.service';

/**
 * Form di selezione file riusabile (click o drag-and-drop).
 *
 * È un componente UI puro (dumb component).
 * Emette `fileConfirmed` con il file selezionato quando l'utente preme il pulsante,
 * lasciando al contenitore genitore la responsabilità di fare l'upload vero e proprio.
 */
@Component({
    selector: 'app-upload-form',
    imports: [TranslatePipe],
    templateUrl: './upload-form.component.html',
})
export class UploadFormComponent {
    private readonly translate = inject(TranslateService);

    /** Emesso quando l'utente conferma il file (preme il bottone); contiene il File nativo. */
    readonly fileConfirmed = output<File>();

    /** Emesso non appena un file viene selezionato o rimosso. */
    readonly fileSelected = output<File | null>();

    /** Estensioni o tipi MIME accettati passati come array (es. ['.pdf', 'image/*']). */
    readonly accept = input<string[]>([]);
    
    /** Dimensione massima in byte del file accettato (0 = nessun limite). */
    readonly maxSize = input<number>(0);

    /** Stato di caricamento gestito dal padre (disabilita il form e mostra lo spinner). */
    readonly isLoading = input<boolean>(false);

    /** Eventuale messaggio di errore passato dal padre (es. errore API). */
    readonly externalError = input<string | null>(null);

    /** Stringa generata per l'attributo nativo HTML. */
    protected readonly acceptAttr = computed(() => {
        const arr = this.accept();
        return arr.length > 0 ? arr.join(',') : null;
    });

    protected readonly errorMessage = signal<string | null>(null);
    protected readonly selectedFile = signal<File | null>(null);
    protected readonly isDragging = signal(false);

    protected onFileSelected(event: Event): void {
        const file = (event.target as HTMLInputElement).files?.[0] ?? null;
        this.setFile(file);
    }

    protected onDragOver(event: DragEvent): void {
        event.preventDefault();
        if (!this.isLoading()) {
            this.isDragging.set(true);
        }
    }

    protected onDragLeave(event: DragEvent): void {
        // Ignora i leave verso figli interni dell'area (il relatedTarget è ancora dentro).
        const area = (event.currentTarget as HTMLElement);
        if (area.contains(event.relatedTarget as Node)) return;
        this.isDragging.set(false);
    }

    protected onDrop(event: DragEvent): void {
        event.preventDefault();
        this.isDragging.set(false);
        if (this.isLoading()) return;

        const file = event.dataTransfer?.files[0] ?? null;
        
        if (file && !this.isExtensionAllowed(file)) {
            this.errorMessage.set(this.translate.translate('uploadFileNonAmmesso'));
            this.setFile(null);
            return;
        }

        this.setFile(file);
    }

    private setFile(file: File | null): void {
        if (file && this.maxSize() > 0 && file.size > this.maxSize()) {
            this.errorMessage.set(this.translate.translate('uploadFileTroppoGrande'));
            this.selectedFile.set(null);
            this.fileSelected.emit(null);
            return;
        }
        this.selectedFile.set(file);
        this.fileSelected.emit(file);
        this.errorMessage.set(null);
    }

    private isExtensionAllowed(file: File): boolean {
        const allowed = this.accept();
        if (allowed.length === 0) return true; // Nessun filtro applicato

        const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
        const fileMime = file.type.toLowerCase();

        return allowed.some(p => {
            p = p.trim().toLowerCase();
            if (p.startsWith('.')) {
                return p === fileExt;
            }
            if (p.endsWith('/*')) {
                const baseMime = p.replace('/*', '');
                return fileMime.startsWith(baseMime);
            }
            return p === fileMime;
        });
    }

    protected onSubmit(): void {
        const file = this.selectedFile();
        if (!file) {
            this.errorMessage.set(this.translate.translate('uploadNessunFile'));
            return;
        }

        this.errorMessage.set(null);
        this.fileConfirmed.emit(file);
    }
}
