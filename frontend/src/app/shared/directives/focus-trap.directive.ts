import { Directive, ElementRef, HostListener, OnInit, inject } from '@angular/core';

/**
 * Imprigiona il focus Tab/Shift+Tab all'interno dell'elemento host.
 * Usare su dialog, drawer e overlay che richiedono focus trap WCAG 2.1 (2.1.2).
 *
 * Uso: <div role="dialog" appFocusTrap> ... </div>
 */
@Directive({
    selector: '[appFocusTrap]',
    standalone: true,
})
export class FocusTrapDirective implements OnInit {
    private readonly el = inject(ElementRef<HTMLElement>);

    ngOnInit(): void {
        requestAnimationFrame(() => this.getFocusable()[0]?.focus());
    }

    @HostListener('keydown', ['$event'])
    onKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Tab') return;

        const items = this.getFocusable();
        if (items.length === 0) { event.preventDefault(); return; }

        const first = items[0];
        const last = items[items.length - 1];

        if (event.shiftKey) {
            if (document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }

    private getFocusable(): HTMLElement[] {
        const selector =
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
            'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        return (Array.from(this.el.nativeElement.querySelectorAll(selector)) as HTMLElement[])
            .filter(el => !el.closest('[hidden]') && !el.closest('[aria-hidden="true"]'));
    }
}
