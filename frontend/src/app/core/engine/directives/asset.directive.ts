import { computed, Directive, inject, input } from '@angular/core';
import { AssetService } from '../services/asset.service';
import { type AssetWidth } from '../../../app.config';

/**
 * ASSET DIRECTIVE
 *
 * Applica `src` a un elemento HTML che supporta src (img, video, audio,
 * source, iframe, embed) a partire dall'id dell'asset e da una width
 * opzionale. Il src si aggiorna reattivamente al cambio degli input.
 *
 *   <img appAsset="hero" [appAssetWidth]="320" alt="..." class="img-fluid">
 *   <video appAsset="intro" controls></video>
 *   <iframe appAsset="manuale" title="..."></iframe>
 *
 * `appAssetWidth` ha senso solo per immagini raster: il server lo ignora
 * automaticamente per video / pdf / svg restituendo lo stream originale,
 * quindi e' sicuro lasciarlo non valorizzato anche per quei tag.
 *
 * Il selector e' vincolato ai tag elencati: errore a compile time se la
 * directive viene applicata a un elemento privo di `src`.
 */
@Directive({
    selector: 'img[appAsset], video[appAsset], audio[appAsset], source[appAsset], iframe[appAsset], embed[appAsset]',
    standalone: true,
    host: { '[src]': 'src()' },
})
export class AssetDirective {
    private readonly asset = inject(AssetService);

    readonly appAsset = input.required<string>();
    readonly appAssetWidth = input<AssetWidth>();

    protected readonly src = computed(() => this.asset.getUrl(this.appAsset(), this.appAssetWidth()));
}

/**
 * ASSET HREF DIRECTIVE
 *
 * Variante di AssetDirective per gli elementi che usano `href` invece di
 * `src` (link di download, `<link>` di preload, ecc.). Stesso service e
 * stessi input, solo l'attributo target cambia.
 *
 *   <a [appAssetHref]="'manuale'" download="manuale.pdf">Scarica manuale</a>
 *   <link rel="preload" as="image" [appAssetHref]="'hero'" [appAssetWidth]="1024">
 *
 * Selector vincolato a a[appAssetHref] e link[appAssetHref] per evitare
 * usi accidentali su elementi che non supportano href.
 */
@Directive({
    selector: 'a[appAssetHref], link[appAssetHref]',
    standalone: true,
    host: { '[href]': 'href()' },
})
export class AssetHrefDirective {
    private readonly asset = inject(AssetService);

    readonly appAssetHref = input.required<string>();
    readonly appAssetWidth = input<AssetWidth>();

    protected readonly href = computed(() => this.asset.getUrl(this.appAssetHref(), this.appAssetWidth()));
}
