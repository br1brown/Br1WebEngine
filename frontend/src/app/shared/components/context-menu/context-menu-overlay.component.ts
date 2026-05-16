import {
    Component,
    ElementRef,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { ContextMenuOption } from './context-menu.models';

/**
 * Componente overlay interno usato dalla directive ContextMenuDirective.
 * Non va usato direttamente nei template — viene creato dinamicamente.
 */
@Component({
    selector: 'app-context-menu-overlay',
    standalone: true,
    imports: [],
    templateUrl: './context-menu-overlay.component.html',
    styleUrl: './context-menu.component.css'
})
export class ContextMenuOverlayComponent {
    readonly options = input<ContextMenuOption[]>([]);
    readonly presentation = input<'popover' | 'sheet'>('popover');
    readonly optionSelected = output<ContextMenuOption>();

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

    onSelect(option: ContextMenuOption): void {
        if (!option.disabled) {
            this.optionSelected.emit(option);
        }
    }
}
