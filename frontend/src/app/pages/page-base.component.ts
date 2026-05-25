import { computed, Directive, effect, inject, input, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ApiService } from '../core/services/api.service';
import { AssetService } from '../core/engine/services/asset.service';
import { NotificationService } from '../core/engine/services/notification.service';
import { TranslateService } from '../core/engine/services/translate.service';
import { PageMetaService } from '../core/engine/services/page-meta.service';
import { PageType } from '../site';
import { ContentResolver, ResolvedPage } from './content.resolver';

/**
 * Base comune per tutte le pagine.
 *
 * Il generic T descrive il tipo del contenuto caricato dal resolver:
 *   class ArticoloComponent extends PageBaseComponent<ArticoloDTO> { ... }
 *
 * pageContent() è già tipizzato come T | null — nessun cast nei componenti figli.
 *
 * I meta tag SEO (titolo, descrizione, og:image) vengono aggiornati automaticamente
 * via effect() ogni volta che il contenuto cambia, incluso il cambio lingua.
 */
@Directive()
export abstract class PageBaseComponent<T> {
    private readonly contentResolverService = inject(ContentResolver);
    private readonly pageMeta = inject(PageMetaService);
    private readonly platformId = inject(PLATFORM_ID);
    readonly translate = inject(TranslateService);
    readonly api = inject(ApiService);
    readonly asset = inject(AssetService);
    readonly notify = inject(NotificationService);

    /** Tipo logico della pagina. Iniettato via route.data con withComponentInputBinding. */
    protected readonly pageType = input.required<PageType>();

    /** Dati grezzi dal resolver al momento della navigazione (SSR + client). */
    protected readonly contentByResolve = input<ResolvedPage<T> | null>(null);

    /** Aggiornato dal browser ad ogni cambio lingua tramite ContentResolverService. */
    private readonly _liveResolved = signal<ResolvedPage<unknown> | null>(null);

    private readonly _resolved = computed(() => this._liveResolved() ?? this.contentByResolve());

    /**
     * Contenuto sempre aggiornato della pagina corrente, tipizzato come T.
     * SSR / primo render → contentByResolve() dal router.
     * Browser dopo idratazione aggiornato ad ogni cambio lingua.
     */
    protected readonly pageContent = computed<T | null>(() =>
        (this._resolved()?.content ?? null) as T | null
    );

    constructor() {
        effect(() => {
            const info = this._resolved()?.info;
            if (!info) return;
            const title = info.title ? this.translate.translate(info.title) : '';
            const description = info.description ? this.translate.translate(info.description) : null;
            this.pageMeta.setPageMeta(title, description, info.ogImage, info.ogType, info.structuredDataType);
        });

        if (isPlatformBrowser(this.platformId)) {
            effect(() => {
                const lang = this.translate.currentLang();
                this.contentResolverService.loadResolved(this.pageType(), lang)
                    .then(data => this._liveResolved.set(data));
            });
        }
    }
}
