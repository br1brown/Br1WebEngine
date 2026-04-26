import { Component, computed, input } from '@angular/core';
import { SocialLinkComponent } from '../../shared/components/social-link/social-link.component';
import { PageBaseComponent } from '../page-base.component';

/**
 * Pagina Social: mostra i link social provenienti dal backend.
 *
 * I dati arrivano dal route resolver dichiarato in site.ts:
 *   resolve: { social: () => inject(ApiService).getSocial() }
 *
 * Angular SSR attende la risoluzione prima di renderizzare, poi
 * withComponentInputBinding inietta il valore in `social` input.
 * Il componente usa computed() per derivare lo stato — mai effect(),
 * che creerebbe macrotask Zone.js incompatibili con la stabilizzazione SSR.
 */
@Component({
    selector: 'app-social',
    imports: [SocialLinkComponent],
    templateUrl: './social.component.html'
})
export class SocialComponent extends PageBaseComponent {
    readonly social = input<Record<string, string>>();

    readonly socialLinks = computed(() =>
        Object.entries(this.social() ?? {}).map(([type, url]) => ({ type, url }))
    );
}
