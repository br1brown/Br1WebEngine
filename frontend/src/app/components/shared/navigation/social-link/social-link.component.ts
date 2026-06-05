import { Component, Signal, computed, input } from '@angular/core';
import { BaseLinkComponent } from '../../base/base-link.component';
import { LinkBadgeComponent } from '../../link-badge/link-badge.component';
import { ContactUrl } from '../../utils/contact-url.util';

@Component({
    selector: 'app-social-link',
    standalone: true,
    imports: [LinkBadgeComponent],
    templateUrl: './social-link.component.html',
})
export class SocialLinkComponent extends BaseLinkComponent {
    readonly type = input.required<string>();
    readonly value = input.required<string>();

    readonly socialConfig = computed(() => {
        const key = this.type().trim().toLowerCase();
        return SOCIAL_MAP[key] ?? DEFAULT_SOCIAL_CONFIG;
    });

    readonly glyph: Signal<string> = computed(() => this.socialConfig().icon);
    readonly color: Signal<string | null> = computed(() => this.socialConfig().color);
    readonly content: Signal<string> = computed(() => this.value().trim());

    readonly displayLabel: Signal<string> = computed(() =>
        this.label()?.trim() || capitalize(this.type().trim())
    );

    /**
     * URL finale. Se `value` è già un URL completo (http/mailto/tel) lo usa
     * così com'è; altrimenti lo costruisce dal `type` (handle/numero → URL
     * completo) riusando i builder condivisi in contact-url.util.
     */
    readonly href: Signal<string> = computed(() => {
        const raw = this.value().trim();
        if (!raw) return '';
        if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;

        switch (this.type().trim().toLowerCase()) {
            case 'whatsapp': return ContactUrl.whatsapp(raw);
            case 'telegram': return ContactUrl.telegram(raw);
            case 'email':
            case 'mail':     return ContactUrl.mail(raw);
            case 'phone':
            case 'tel':      return ContactUrl.phone(raw);
            default: {
                const base = this.socialConfig().urlBase;
                return base ? base + raw.replace(/^@/, '') : raw;
            }
        }
    });
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

type SocialConfig = {
    icon: string;
    color: string | null;
    /** Base URL del profilo: se presente, un handle nudo diventa `urlBase + handle`. */
    urlBase?: string;
};

const DEFAULT_SOCIAL_CONFIG: SocialConfig = {
    icon: 'fa-solid fa-link',
    color: null
};

const SOCIAL_MAP: Record<string, SocialConfig> = {
    facebook: {
        icon: 'fa-brands fa-facebook',
        color: '#1877F2',
        urlBase: 'https://facebook.com/'
    },
    instagram: {
        icon: 'fa-brands fa-instagram',
        color: '#E4405F',
        urlBase: 'https://instagram.com/'
    },
    twitter: {
        icon: 'fa-brands fa-x-twitter',
        color: '#000000',
        urlBase: 'https://x.com/'
    },
    linkedin: {
        icon: 'fa-brands fa-linkedin',
        color: '#0A66C2',
        urlBase: 'https://linkedin.com/in/'
    },
    tumblr: {
        icon: 'fa-brands fa-tumblr',
        color: '#36465D'
    },
    pinterest: {
        icon: 'fa-brands fa-pinterest',
        color: '#BD081C',
        urlBase: 'https://pinterest.com/'
    },
    snapchat: {
        icon: 'fa-brands fa-snapchat',
        color: '#FFFC00'
    },
    tiktok: {
        icon: 'fa-brands fa-tiktok',
        color: '#000000',
        urlBase: 'https://tiktok.com/@'
    },
    quora: {
        icon: 'fa-brands fa-quora',
        color: '#B92B27'
    },
    foursquare: {
        icon: 'fa-brands fa-foursquare',
        color: '#F94877'
    },
    youtube: {
        icon: 'fa-brands fa-youtube',
        color: '#FF0000',
        urlBase: 'https://youtube.com/@'
    },
    twitch: {
        icon: 'fa-brands fa-twitch',
        color: '#9146FF'
    },
    spotify: {
        icon: 'fa-brands fa-spotify',
        color: '#1DB954'
    },
    deezer: {
        icon: 'fa-brands fa-deezer',
        color: '#FEAA2D'
    },
    soundcloud: {
        icon: 'fa-brands fa-soundcloud',
        color: '#FF5500'
    },
    itunes: {
        icon: 'fa-brands fa-itunes',
        color: '#FB5BC5'
    },
    vimeo: {
        icon: 'fa-brands fa-vimeo',
        color: '#1AB7EA'
    },
    dribbble: {
        icon: 'fa-brands fa-dribbble',
        color: '#EA4C89'
    },
    telegram: {
        icon: 'fa-brands fa-telegram',
        color: '#26A5E4'
    },
    whatsapp: {
        icon: 'fa-brands fa-whatsapp',
        color: '#25D366'
    },
    skype: {
        icon: 'fa-brands fa-skype',
        color: '#00AFF0'
    },
    google: {
        icon: 'fa-brands fa-google',
        color: '#4285F4'
    },
    chromecast: {
        icon: 'fa-brands fa-chromecast',
        color: null
    },
    chrome: {
        icon: 'fa-brands fa-chrome',
        color: null
    },
    android: {
        icon: 'fa-brands fa-android',
        color: '#3DDC84'
    },
    apple: {
        icon: 'fa-brands fa-apple',
        color: '#000000'
    },
    playstation: {
        icon: 'fa-brands fa-playstation',
        color: '#003791'
    },
    amazon: {
        icon: 'fa-brands fa-amazon',
        color: '#FF9900'
    },
    airbnb: {
        icon: 'fa-brands fa-airbnb',
        color: '#FF5A5F'
    },
    btc: {
        icon: 'fa-brands fa-bitcoin',
        color: '#F7931A'
    },
    yahoo: {
        icon: 'fa-brands fa-yahoo',
        color: '#6001D2'
    },
    audible: {
        icon: 'fa-brands fa-audible',
        color: '#F8991C'
    },
    threads: {
        icon: 'fa-brands fa-threads',
        color: '#000000',
        urlBase: 'https://threads.net/@'
    },
    discord: {
        icon: 'fa-brands fa-discord',
        color: '#5865F2'
    },
    reddit: {
        icon: 'fa-brands fa-reddit',
        color: '#FF4500',
        urlBase: 'https://reddit.com/user/'
    },
    github: {
        icon: 'fa-brands fa-github',
        color: '#181717',
        urlBase: 'https://github.com/'
    },
    mastodon: {
        icon: 'fa-brands fa-mastodon',
        color: '#6364FF'
    }
};
