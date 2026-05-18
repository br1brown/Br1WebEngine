import {
    ComponentRef,
    DestroyRef,
    Directive,
    HostListener,
    PLATFORM_ID,
    ViewContainerRef,
    inject,
    input,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ContextMenuOption } from '../components/context-menu/context-menu.models';
import { ContextMenuOverlayComponent } from '../components/context-menu/context-menu-overlay.component';

/**
 * Directive per aggiungere un menu contestuale personalizzato a qualsiasi elemento.
 */
@Directive({
    selector: '[appContextMenu]',
    standalone: true,
})
export class ContextMenuDirective {
    readonly options = input<ContextMenuOption[]>([], { alias: 'appContextMenu' });
    readonly content = input<HTMLCanvasElement | Blob | null>(null, { alias: 'appContextMenuContent' });

    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly vcr = inject(ViewContainerRef);

    private overlayRef: ComponentRef<ContextMenuOverlayComponent> | null = null;
    private destroyListeners: (() => void)[] = [];
    private longPressTimer: number | null = null;
    private suppressNextClickTimer: number | null = null;
    private pointerOrigin: { x: number; y: number } | null = null;
    private suppressNextContextMenu = false;
    private suppressNextClick = false;
    private readonly longPressDelayMs = 450;
    private readonly touchMoveThresholdPx = 12;
    /** Finestra di sicurezza per il click sintetico post-pointerup. Oltre questa, il
     *  flag viene azzerato in modo che un click reale successivo non venga ignorato. */
    private readonly suppressClickWindowMs = 600;

    constructor() {
        inject(DestroyRef).onDestroy(() => this.close());
    }

    @HostListener('contextmenu', ['$event'])
    onContextMenu(event: MouseEvent): void {
        if (!this.isBrowser) return;

        if (this.suppressNextContextMenu) {
            this.suppressNextContextMenu = false;
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        // Su dispositivi touch primari (mobile reale, Chrome DevTools device mode)
        // il contextmenu arriva tipicamente da un long-press: presentiamo come bottom
        // sheet a tutta larghezza, più adatto al pollice e ai testi lunghi.
        const isCoarse = window.matchMedia('(pointer: coarse)').matches;
        this.openMenu(event.clientX, event.clientY, isCoarse ? 'sheet' : 'popover');
    }

    /**
     * Pointer Events unificati: gestiscono touch reale, penna e l'emulazione
     * touch di Chrome DevTools (mobile mode) in modo coerente. Il mouse "vero"
     * (pointerType === 'mouse') viene ignorato qui — usa @HostListener('contextmenu').
     */
    @HostListener('pointerdown', ['$event'])
    onPointerDown(event: PointerEvent): void {
        if (!this.isBrowser || this.options().length === 0) return;
        if (event.pointerType === 'mouse') return;

        this.pointerOrigin = { x: event.clientX, y: event.clientY };
        this.clearLongPressTimer();
        this.longPressTimer = window.setTimeout(() => {
            if (!this.pointerOrigin) return;

            this.suppressNextContextMenu = true;
            // Dopo pointerup su touch, il browser emette un click sintetico
            // sull'elemento originale che chiuderebbe subito il menu via
            // onDocClick — lo ignoriamo una volta. Se il click sintetico non
            // arriva (es. utente si stacca fuori), il timer di sicurezza
            // resetta il flag così non blocca click successivi.
            this.armSuppressNextClick();
            this.openMenu(this.pointerOrigin.x, this.pointerOrigin.y, 'sheet');
        }, this.longPressDelayMs);
    }

    @HostListener('pointermove', ['$event'])
    onPointerMove(event: PointerEvent): void {
        if (!this.pointerOrigin || event.pointerType === 'mouse') return;

        const movedX = Math.abs(event.clientX - this.pointerOrigin.x);
        const movedY = Math.abs(event.clientY - this.pointerOrigin.y);
        if (movedX > this.touchMoveThresholdPx || movedY > this.touchMoveThresholdPx) {
            this.clearLongPressState();
        }
    }

    @HostListener('pointerup', ['$event'])
    onPointerUp(event: PointerEvent): void {
        if (event.pointerType === 'mouse') return;
        this.clearLongPressState();
    }

    @HostListener('pointercancel', ['$event'])
    onPointerCancel(event: PointerEvent): void {
        if (event.pointerType === 'mouse') return;
        this.clearLongPressState();
    }

    private openMenu(clientX: number, clientY: number, presentation: 'popover' | 'sheet'): void {
        this.close();

        this.overlayRef = this.vcr.createComponent(ContextMenuOverlayComponent);

        // setInput() è l'API corretta per impostare signal inputs su componenti creati dinamicamente
        this.overlayRef.setInput('options', this.options());
        this.overlayRef.setInput('presentation', presentation);

        // Sposta l'overlay su document.body per evitare clipping da overflow/positioning
        const el = this.overlayRef.location.nativeElement;
        if (this.isBrowser) {
            document.body.appendChild(el);
        }

        this.overlayRef.instance.adjustPosition(clientX, clientY);

        // OutputRef.subscribe() si auto-completa quando il componente viene distrutto
        this.overlayRef.instance.optionSelected.subscribe(option => {
            option.action?.();
            this.close();
        });

        this.addCloseListeners(el);
    }

    private addCloseListeners(overlayEl: HTMLElement): void {
        if (!this.isBrowser) return;

        const onDocClick = (e: MouseEvent) => {
            if (this.suppressNextClick) {
                this.clearSuppressNextClick();
                return;
            }
            if (!overlayEl.contains(e.target as Node)) {
                this.close();
            }
        };

        const onDocContext = (e: MouseEvent) => {
            const target = e.target as Node;
            if ((this.vcr.element.nativeElement as HTMLElement).contains(target)) return;
            if (!overlayEl.contains(target)) {
                this.close();
            }
        };

        const onEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.close();
            }
        };

        document.addEventListener('click', onDocClick, true);
        document.addEventListener('contextmenu', onDocContext, true);
        document.addEventListener('keydown', onEscape);

        this.destroyListeners.push(
            () => document.removeEventListener('click', onDocClick, true),
            () => document.removeEventListener('contextmenu', onDocContext, true),
            () => document.removeEventListener('keydown', onEscape),
        );
    }

    private clearLongPressTimer(): void {
        if (this.longPressTimer !== null) {
            window.clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    private armSuppressNextClick(): void {
        this.suppressNextClick = true;
        if (this.suppressNextClickTimer !== null) {
            window.clearTimeout(this.suppressNextClickTimer);
        }
        this.suppressNextClickTimer = window.setTimeout(
            () => this.clearSuppressNextClick(),
            this.suppressClickWindowMs,
        );
    }

    private clearSuppressNextClick(): void {
        this.suppressNextClick = false;
        if (this.suppressNextClickTimer !== null) {
            window.clearTimeout(this.suppressNextClickTimer);
            this.suppressNextClickTimer = null;
        }
    }

    private clearLongPressState(): void {
        this.clearLongPressTimer();
        this.pointerOrigin = null;
    }

    private close(): void {
        this.clearLongPressState();
        if (this.overlayRef) {
            // Reset dei flag di soppressione qui (non in cima a close()): se openMenu
            // sta facendo cleanup precauzionale prima di aprire, i flag appena
            // armati dal timer non devono essere cancellati.
            this.suppressNextContextMenu = false;
            this.clearSuppressNextClick();
            if (this.isBrowser) {
                this.overlayRef.location.nativeElement.remove();
            }
            this.overlayRef.destroy();
            this.overlayRef = null;
        }
        this.destroyListeners.forEach(fn => fn());
        this.destroyListeners = [];
    }
}
