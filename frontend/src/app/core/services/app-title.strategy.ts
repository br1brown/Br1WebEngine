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
        const title = this.formatTitle(snapshot);
        const rawDesc = leaf.data['pageDescription'] as string | null | undefined;
        const description = this.resolveDescription(rawDesc);

        this.pageMeta.setTitle(title, description);
    }

    /**
     * Traduce la chiave descrizione della pagina corrente.
     *
     * Priorità:
     *   1. Chiave i18n dichiarata nella pagina (es. 'socialDesc')
     *   2. Chiave 'siteDesc' — descrizione del sito tradotta (addon.*.json)
     *   3. Stringa statica di fallback dalla configurazione del sito
     *
     * Usare 'siteDesc' come fallback invece della stringa hardcoded garantisce che
     * anche la descrizione globale sia localizzata quando l'utente cambia lingua.
     */
    private resolveDescription(rawKey: string | null | undefined): string {
        if (rawKey) {
            const translated = this.translate.translate(rawKey);
            // translate() restituisce la chiave stessa se non trovata — scartarla come valida
            if (translated !== rawKey) return translated;
        }

        const siteDesc = this.translate.translate('siteDesc');
        return siteDesc !== 'siteDesc' ? siteDesc : ContestoSito.config.description;
    }

    /** Riesegue title + meta senza una navigazione (es. cambio lingua). */
    refresh(snapshot: RouterStateSnapshot): void {
        this.updateTitle(snapshot);
    }

    private formatTitle(snapshot: RouterStateSnapshot): string {
        const titleKey = this.buildTitle(snapshot);
        if (!titleKey) return ContestoSito.config.appName;

        const pageTitle = this.translate.translate(titleKey).trim();
        if (!pageTitle || pageTitle === ContestoSito.config.appName) return ContestoSito.config.appName;

        return `${pageTitle} | ${ContestoSito.config.appName}`;
    }
}
