import {
    Component,
    ElementRef,
    HostListener,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ContextMenuOption } from './context-menu.models';

/**
 * Componente overlay interno usato dalla directive ContextMenuDirective.
 * Non va usato direttamente nei template — viene creato dinamicamente.
 */
@Component({
    selector: 'app-context-menu-overlay',
    standalone: true,
    imports: [TranslatePipe],
    templateUrl: './context-menu-overlay.component.html',
    styleUrl: './context-menu.component.css'
})
export class ContextMenuOverlayComponent {
    readonly options = input<ContextMenuOption[]>([]);
    readonly presentation = input<'popover' | 'sheet'>('popover');
    readonly optionSelected = output<ContextMenuOption>();
    /** Emesso quando il menu va chiuso senza selezione (es. Tab). */
    readonly menuDismissed = output<void>();

    readonly menuEl = viewChild<ElementRef<HTMLElement>>('menuEl');

    readonly menuX = signal(0);
    readonly menuY = signal(0);

    /** Posiziona il menu vicino al cursore, adattandolo ai bordi del viewport */
    adjustPosition(clientX: number, clientY: number): void {
        requestAnimationFrame(() => {
            const menuWidth = this.menuEl()?.nativeElement?.offsetWidth ?? 160;
            const menuHeight = this.menuEl()?.nativeElement?.offsetHeight ?? 200;

            this.menuX.set(Math.max(0, Math.min(clientX, window.innerWidth - menuWidth - 8)));
            this.menuY.set(Math.max(0, Math.min(clientY, window.innerHeight - menuHeight - 8)));
        });
    }

    /** Sposta il focus al primo menuitem abilitato */
    focusFirst(): void {
        requestAnimationFrame(() => this.getFocusableItems()[0]?.focus());
    }

    onSelect(option: ContextMenuOption): void {
        if (!option.disabled) {
            this.optionSelected.emit(option);
        }
    }

    @HostListener('keydown', ['$event'])
    onKeydown(event: KeyboardEvent): void {
        const items = this.getFocusableItems();
        if (items.length === 0) return;

        const idx = items.indexOf(document.activeElement as HTMLButtonElement);

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                items[(idx + 1) % items.length].focus();
                break;
            case 'ArrowUp':
                event.preventDefault();
                items[(idx - 1 + items.length) % items.length].focus();
                break;
            case 'Home':
                event.preventDefault();
                items[0].focus();
                break;
            case 'End':
                event.preventDefault();
                items[items.length - 1].focus();
                break;
            case 'Tab':
                event.preventDefault();
                this.menuDismissed.emit();
                break;
        }
    }

    private getFocusableItems(): HTMLButtonElement[] {
        return Array.from(
            this.menuEl()?.nativeElement?.querySelectorAll<HTMLButtonElement>(
                'button[role="menuitem"]:not([disabled]):not(.disabled)'
            ) ?? []
        );
    }
}
