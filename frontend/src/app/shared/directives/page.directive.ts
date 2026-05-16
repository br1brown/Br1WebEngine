import { Directive, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContestoSito, PageType } from '../../site';

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
 */
@Directive({
    selector: '[appPage]',
    standalone: true,
    hostDirectives: [RouterLink],
})
export class PageDirective {
    private readonly routerLink = inject(RouterLink);

    readonly appPage = input.required<PageType>();

    constructor() {
        effect(() => {
            this.routerLink.routerLink = ContestoSito.getPath(this.appPage()) ?? '/';
        });
    }
}
