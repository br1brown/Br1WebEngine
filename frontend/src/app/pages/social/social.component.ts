import { Component, computed, resource } from '@angular/core';
import { SocialLinkComponent } from '../../shared/components/social-link/social-link.component';
import { PageBaseComponent } from '../page-base.component';

/**
 * Pagina Social: carica l'elenco dei social network dal backend (GET /social)
 */
@Component({
    selector: 'app-social',
    imports: [SocialLinkComponent],
    templateUrl: './social.component.html'
})
export class SocialComponent extends PageBaseComponent {
    private readonly socialResource = resource({
        loader: () => this.api.getSocial()
    });

    readonly socialLinks = computed(() => {
        const data = this.socialResource.value() ?? {};
        return Object.entries(data).map(([type, url]) => ({ type, url }));
    });
}
