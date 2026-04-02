import { Directive, inject, input } from '@angular/core';
import { PageType } from '../app.routes';
import { ApiService } from '../core/services/api.service';
import { AssetService } from '../core/services/asset.service';
import { NotificationService } from '../core/services/notification.service';
import { TranslateService } from '../core/services/translate.service';

/**
 * Base comune per le pagine instradate tramite il modello centrale app.routes.
 * Espone il contesto di pagina e i servizi piu' usati dai page component.
 * I meta route-based vengono sincronizzati centralmente da AppComponent,
 * quindi i componenti pagina non dipendono da lifecycle hook condivisi.
 */
@Directive()
export abstract class PageBaseComponent {
    readonly translate = inject(TranslateService);
    readonly api = inject(ApiService);
    readonly asset = inject(AssetService);
    readonly notify = inject(NotificationService);

    protected readonly pageType = input<PageType>();

    /** Valore della signal pageType (helper per i componenti figli) */
    protected get PageType(): PageType {
        const value = this.pageType();
        if (value === undefined) {
            throw new Error('PageType non definito per questa pagina');
        }
        return value;
    }
}
