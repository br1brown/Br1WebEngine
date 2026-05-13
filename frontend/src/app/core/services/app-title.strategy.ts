import { inject, Injectable } from '@angular/core';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { ContestoSito } from '../../site';
import { PageMetaService } from './page-meta.service';
import { TranslateService } from './translate.service';

@Injectable()
export class AppTitleStrategy extends TitleStrategy {
    private readonly pageMeta = inject(PageMetaService);
    private readonly translate = inject(TranslateService);

    override updateTitle(snapshot: RouterStateSnapshot): void {
        const leaf = PageMetaService.getLeaf(snapshot);

        // Titolo grezzo: traduce la chiave i18n dalla route. Stringa vuota se la rotta
        // non dichiara un titolo o se il titolo tradotto coincide con il nome dell'app
        // (home page) — PageMetaService usa appName come fallback in quel caso.
        const titleKey = this.buildTitle(snapshot);
        const pageTitle = titleKey ? this.translate.translate(titleKey).trim() : '';

        // Descrizione: chiave i18n della pagina → fallback sulla descrizione globale del sito.
        // Usare la chiave i18n garantisce che la descrizione si aggiorni al cambio lingua.
        const description = leaf.data['pageDescription']
            ? this.translate.translate(leaf.data['pageDescription'] as string)
            : ContestoSito.config.description;

        this.pageMeta.setTitle(pageTitle, description, leaf.data['ogImage'] as string | false | null);
    }

    /** Riesegue title + meta senza navigazione (es. cambio lingua). */
    refresh(snapshot: RouterStateSnapshot): void {
        this.updateTitle(snapshot);
    }
}
