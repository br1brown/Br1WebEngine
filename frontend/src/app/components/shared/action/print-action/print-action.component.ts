import { Component, PLATFORM_ID, inject, input } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BaseActionComponent } from '../../base/base-action.component';

@Component({
    selector: 'app-print-action',
    standalone: true,
    imports: [],
    templateUrl: './print-action.component.html',
})
export class PrintActionComponent extends BaseActionComponent {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    protected readonly defaultLabelKey = 'stampaAzione';

    /** Variante visiva "FAB" (cerchio, icona sola — come back-to-top) invece del bottone
     *  outline di default. Pensata per un uso fisso/globale (icona sola): non combinarla con
     *  `showLabel`/`fullWidth`, pensati per il bottone di default. Il posizionamento (fixed,
     *  z-index) resta a carico di chi la usa: il componente si occupa solo della forma. */
    readonly fab = input(false);

    protected onClick(): void {
        if (this.isBrowser) window.print();
    }
}
