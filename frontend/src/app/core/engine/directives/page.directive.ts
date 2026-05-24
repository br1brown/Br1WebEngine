import { computed, Directive, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContestoSito, PageType } from '../../../site';

/**
 * PAGE DIRECTIVE
 *
 * Traduce un PageType nel path corrispondente e lo passa a RouterLink,
 * eliminando il boilerplate `[routerLink]="ContestoSito.getPath(PageType.X) ?? '/'"`.
 *
 *   <a [appPage]="PageType.Home">Home</a>
 *   <a [appPage]="PageType.PrivacyPolicy" class="footer-link">Privacy</a>
 *
 * RouterLink è applicato come hostDirective: l'elemento host si comporta
 * esattamente come con [routerLink] (SPA navigation, keyboard, right-click).
 * Se il PageType non è registrato nel sito, naviga verso '/'.
 *
 * `href` è bindato esplicitamente perché RouterLink come hostDirective non
 * aggiorna il proprio @HostBinding('attr.href') quando routerLink viene
 * impostato programmaticamente via effect — risultando in href=null e cursore testo.
 */
@Directive({
    selector: '[appPage]',
    standalone: true,
    hostDirectives: [RouterLink],
    host: { '[attr.href]': '_path()' },
})
export class PageDirective {
    private readonly routerLink = inject(RouterLink);

    readonly appPage = input.required<PageType>();
    protected readonly _path = computed(() => ContestoSito.getPath(this.appPage()) ?? '/');

    constructor() {
        effect(() => {
            this.routerLink.routerLink = this._path();
        });
    }
}
