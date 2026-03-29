import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { ContestoSito } from '../../site';
import { TranslateService } from './translate.service';

@Injectable()
export class AppTitleStrategy extends TitleStrategy {
    private readonly title = inject(Title);
    private readonly translate = inject(TranslateService);

    override updateTitle(snapshot: RouterStateSnapshot): void {
        this.title.setTitle(this.formatTitle(snapshot));
    }

    private formatTitle(snapshot: RouterStateSnapshot): string {
        const titleKey = this.buildTitle(snapshot);
        if (!titleKey) {
            return ContestoSito.config.appName;
        }

        const pageTitle = this.translate.t(titleKey).trim();
        if (!pageTitle || pageTitle === ContestoSito.config.appName) {
            return ContestoSito.config.appName;
        }

        return `${pageTitle} | ${ContestoSito.config.appName}`;
    }
}
