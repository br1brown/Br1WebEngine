import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * LINK BADGE — presentazionale.
 *
 * Unico posto in cui vive il template di un link "a badge": un `<a>` che apre
 * in nuova scheda, con icona-pastiglia (IconComponent) e testo opzionale.
 * Le famiglie "contatti" e "navigazione" (social) gli passano solo i dati
 * (href/glyph/color/text) — nessuna logica vive qui.
 */
@Component({
    selector: 'app-link-badge',
    standalone: true,
    imports: [IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './link-badge.component.html',
    host: {
        '[class.d-inline-block]': '!fullWidth()',
        '[class.d-block]': 'fullWidth()',
    },
})
export class LinkBadgeComponent {
    readonly href = input.required<string>();
    readonly glyph = input.required<string>();
    readonly color = input<string | null>(null);
    /** Stile visivo: 'badge' (icona tonda, testo a fianco) o 'button' (pill button unico) */
    readonly variant = input<'badge' | 'button'>('badge');
    /** Testo visibile accanto all'icona (label oppure contenuto). */
    readonly text = input<string>('');
    /** Se rendere il testo. */
    readonly showText = input(false);
    /** Etichetta descrittiva per title/aria-label (es. "PEC"), distinta dal testo. */
    readonly ariaLabel = input<string>('');
    readonly fullWidth = input(false);
    /** Disposizione di icona e testo. 'responsive' (default): colonna su mobile, riga su sm+. 'row': sempre riga. */
    readonly layout = input<'responsive' | 'row'>('responsive');

    /** Override opzionale: se presente, sostituisce la navigazione al click. */
    readonly action = input<() => void | Promise<void>>();

    protected handleClick(event: MouseEvent): void {
        const fn = this.action();
        if (!fn) return; // nessun override: naviga normalmente via href
        event.preventDefault();
        const result = fn();
        if (result instanceof Promise) result.catch(() => { /* gestione a carico del chiamante */ });
    }
}
