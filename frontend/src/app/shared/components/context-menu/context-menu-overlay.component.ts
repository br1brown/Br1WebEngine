import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    Output,
    ViewChild,
    signal
} from '@angular/core';
import { ContextMenuOption } from './context-menu.models';

/**
 * Componente overlay interno usato dalla directive ContextMenuDirective.
 * Non va usato direttamente nei template — viene creato dinamicamente.
 */
@Component({
    selector: 'app-context-menu-overlay',
    templateUrl: './context-menu-overlay.component.html',
    styleUrl: './context-menu.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContextMenuOverlayComponent {
    @Input() options: ContextMenuOption[] = [];
    @Input() presentation: 'popover' | 'sheet' = 'popover';
    @Output() optionSelected = new EventEmitter<ContextMenuOption>();

    @ViewChild('menuEl') menuEl?: ElementRef<HTMLElement>;

    readonly menuX = signal(0);
    readonly menuY = signal(0);

    /** Posiziona il menu vicino al cursore, adattandolo ai bordi del viewport */
    adjustPosition(clientX: number, clientY: number): void {
        requestAnimationFrame(() => {
            const menuWidth = this.menuEl?.nativeElement?.offsetWidth ?? 160;
            const menuHeight = this.menuEl?.nativeElement?.offsetHeight ?? 200;

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
