import { Component, PLATFORM_ID, inject } from '@angular/core';
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

    protected onClick(): void {
        if (this.isBrowser) window.print();
    }
}
