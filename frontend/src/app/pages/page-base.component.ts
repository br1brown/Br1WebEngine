import { Directive, inject, input } from '@angular/core';
import { ApiService } from '../core/services/api.service';
import { AssetService } from '../core/services/asset.service';
import { NotificationService } from '../core/services/notification.service';
import { TranslateService } from '../core/services/translate.service';
import { PageType } from '../site';

/**
 * Base comune per le pagine instradate tramite il modello centrale app.routes.
 * Espone il contesto di pagina e i servizi piu' usati dai page component.
 * I meta route-based vengono sincronizzati centralmente da AppComponent,
 * quindi i componenti pagina non dipendono da lifecycle hook condivisi.
 *
 * ── Pattern SSR ──────────────────────────────────────────────────────────
 * Le pagine con renderMode: 'server' dichiarano in site.ts un resolver
 * esplicito e tipizzato:
 *
 *   resolve: { nomeInput: () => inject(ApiService).getSomething() }
 *
 * Il componente dichiara l'input con lo stesso nome e tipo corretto:
 *
 *   readonly nomeInput = input<MioTipo>();
 *
 * Angular (withComponentInputBinding) inietta automaticamente il valore
 * risolto nell'input. Il componente legge da `this.nomeInput()` senza
 * sapere né curarsi del renderMode.
 *
 * Usare computed() per derivare stato dai dati risolti — mai effect(),
 * che crea macrotask Zone.js e può bloccare la stabilizzazione SSR.
 *
 * Eccezione: è lecito registrare un effect() guardato da isPlatformBrowser()
 * quando serve reagire a stato locale del client dopo l'idratazione (es.
 * cambio lingua su pagine SSR senza rinavigare), purché l'effect non venga
 * mai creato durante l'SSR. Vedi PolicyComponent per il pattern di riferimento.
 */
@Directive()
export abstract class PageBaseComponent {
    readonly translate = inject(TranslateService);
    readonly api = inject(ApiService);
    readonly asset = inject(AssetService);
    readonly notify = inject(NotificationService);

    /**
     * Tipo logico della pagina corrente.
     * Sempre presente: il builder lo inietta via route.data con withComponentInputBinding.
     */
    protected readonly pageType = input.required<PageType>();
}
