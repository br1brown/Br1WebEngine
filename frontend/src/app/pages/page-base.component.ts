import { computed, Directive, effect, inject, input, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ApiService } from '../core/services/api.service';
import { AssetService } from '../core/services/asset.service';
import { NotificationService } from '../core/services/notification.service';
import { TranslateService } from '../core/services/translate.service';
import { PageType } from '../site';
import { ContentResolver } from './content.resolver';

/**
 * Base comune per le pagine con resolver: espone pageContent (aggiornato ad ogni cambio lingua),
 * translate, api, asset, notify già pronti. Per nuove sorgenti dati aggiungere un case in ContentResolver.
 * Per titoli dinamici usare PageMetaService; vedi DEVELOPMENT.md → "Meta SEO e SSR".
 */
@Directive()
export abstract class PageBaseComponent {
    private readonly contentResolverService = inject(ContentResolver);
    private readonly platformId = inject(PLATFORM_ID);
    readonly translate = inject(TranslateService);
    readonly api = inject(ApiService);
    readonly asset = inject(AssetService);
    readonly notify = inject(NotificationService);

    /** Tipo logico della pagina. Iniettato via route.data con withComponentInputBinding. */
    protected readonly pageType = input.required<PageType>();

    /** Dati grezzi dal resolver al momento della navigazione (SSR + client). */
    protected readonly contentByResolve = input<any>(null);

    /** Aggiornato dal browser ad ogni cambio lingua tramite ContentResolverService. */
    private readonly _liveContent = signal<any>(null);

    /**
     * Contenuto sempre aggiornato della pagina corrente.
     * SSR / primo render → contentByResolve() dal router.
     * Browser dopo idratazione → _liveContent() aggiornato ad ogni cambio lingua.
     * Castare al tipo atteso nel componente: computed(() => this.pageContent() as MioTipo).
     */
    protected readonly pageContent = computed(() => this._liveContent() ?? this.contentByResolve());

    constructor() {
        if (isPlatformBrowser(this.platformId)) {
            effect(() => {
                const lang = this.translate.currentLang();
                this.contentResolverService.loadResolved(this.pageType(), lang)
                    .then(data => this._liveContent.set(data));
            });
        }
    }
}
