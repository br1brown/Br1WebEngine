import { computed, Directive, inject, input } from '@angular/core';
import { AssetService } from '../../core/services/asset.service';
import { type AssetWidth } from '../../app.config';

/**
 * ASSET DIRECTIVE
 *
 * Applica src a un <img> a partire dall'id dell'asset e da una width opzionale,
 * senza wrapper di elemento. Il src si aggiorna reattivamente se gli input cambiano.
 *
 *   <img appAsset="img4k" [appAssetWidth]="320" alt="..." class="img-fluid">
 *
 * Selector scoped a img[appAsset]: errore a compile time se usata su altro elemento.
 */
@Directive({
    selector: 'img[appAsset]',
    standalone: true,
    host: { '[src]': 'src()' },
})
export class AssetDirective {
    private readonly asset = inject(AssetService);

    readonly appAsset = input.required<string>();
    readonly appAssetWidth = input<AssetWidth>();

    protected readonly src = computed(() => this.asset.getUrl(this.appAsset(), this.appAssetWidth()));
}
