import { Component, computed, inject } from '@angular/core';
import { Profile } from '../../../core/dto/profile.dto';
import { ApiService } from '../../../core/services/api.service';
import { TranslatePipe } from '../../../core/engine/pipes/translate.pipe';
import { SocialLinkComponent } from '../../shared/social-link/social-link.component';
import { LoadingComponent } from '../../shared/loading/loading.component';
import { ProfileRenderComponent } from '../../shared/profile-render/profile-render.component';
import { FooterNavComponent } from '../../shared/footer-nav/footer-nav.component';
import { ContestoSito } from '../../../site';

interface SocialLinkVm {
    type: string;
    value: string;
}

@Component({
    selector: 'app-footer',
    imports: [TranslatePipe, SocialLinkComponent, LoadingComponent, ProfileRenderComponent, FooterNavComponent],
    templateUrl: './footer.component.html',
    host: { class: 'd-block mt-auto' }
})
export class FooterComponent {
    private readonly api = inject(ApiService);

    private readonly profileResource = this.api.getProfileResource();
    readonly profile = computed<Profile | null>(() => this.profileResource.value() ?? null);
    readonly profileLoading = this.profileResource.isLoading;

    readonly appName = ContestoSito.config.appName;
    readonly description = ContestoSito.config.description;
    readonly currentYear = new Date().getFullYear();
    readonly footerNavLinks = ContestoSito.linkFooter;

    readonly socialLinks = computed<SocialLinkVm[]>(() => {
        const social = this.profile()?.social;
        if (!social) return [];

        return Object.entries(social)
            .filter((entry): entry is [string, string] => {
                const value = entry[1];
                return typeof value === 'string' && value.trim().length > 0;
            })
            .map(([type, value]) => ({
                type: type.toLowerCase(),
                value
            }));
    });
}
