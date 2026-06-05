import { Component, computed } from '@angular/core';
import { SocialLinkComponent } from '../../components/shared/navigation/social-link/social-link.component';
import { PageBaseComponent } from '../page-base.component';

@Component({
    selector: 'app-social',
    imports: [SocialLinkComponent],
    templateUrl: './social.component.html'
})
export class SocialComponent extends PageBaseComponent<Record<string, string>> {
    readonly socialLinks = computed(() =>
        Object.entries(this.pageContent() ?? {}).map(([type, url]) => ({ type, url }))
    );
}
