import { inject, Injectable, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Router, NavigationEnd } from '@angular/router';
import { Observable, of, filter, Subscription } from 'rxjs';
import { type AssetWidth } from '../../app.config';
import { ContestoSito } from '../../site';

@Injectable({ providedIn: 'root' })
export class AssetService implements OnDestroy {
    private readonly sanitizer = inject(DomSanitizer);
    private readonly router = inject(Router);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    private readonly virtualPath = '/cdn-cgi/asset';
    private readonly blobUrls = new Set<string>();
    private readonly routerSub: Subscription;

    constructor() {
        // Pulizia automatica al cambio pagina per non saturare la RAM
        this.routerSub = this.router.events.pipe(
            filter(event => event instanceof NavigationEnd)
        ).subscribe(() => this.revokeAll());
    }

    /** URL da ID per risorse su server. */
    getUrl(id: string, width?: AssetWidth): string {
        let url = `${this.virtualPath}?id=${id}`;
        if (width) url += `&w=${width}`;
        if (ContestoSito.config.version) url += `&v=${ContestoSito.config.version}`;
        return url;
    }

    /** * Genera URL da Blob (scaricati da API esterne o prodotti da Canvas). 
     * Restituisce sia la stringa "cruda" che quella "sanitizzata".
     */
    getUrlFromBlob(blob: Blob): { rawUrl: string, angularUrl: SafeUrl } {
        if (!this.isBrowser) {
            return { rawUrl: '', angularUrl: this.sanitizer.bypassSecurityTrustUrl('') };
        }

        const rawUrl = URL.createObjectURL(blob);
        this.blobUrls.add(rawUrl);

        return {
            rawUrl,
            angularUrl: this.sanitizer.bypassSecurityTrustUrl(rawUrl)
        };
    }

    /** Libera esplicitamente la memoria. */
    revokeAll(): void {
        this.blobUrls.forEach(url => URL.revokeObjectURL(url));
        this.blobUrls.clear();
    }

    ngOnDestroy(): void {
        this.revokeAll();
        this.routerSub.unsubscribe();
    }
}