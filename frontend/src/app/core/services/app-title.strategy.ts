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
        const description = this.resolveDescription(leaf.data['pageDescription']);
        const ogImage = leaf.data['ogImage'] as string | null | undefined;

        this.pageMeta.setTitle(title, description, ogImage);
    }

    /**
     * Risolve la descrizione della pagina corrente.
     *
     * Priorità:
     * - Traduzione della chiave `description` della pagina (es. 'socialDesc')
     * - Valore letterale di `description` se non è una chiave i18n riconosciuta
     * - (es. description: 'Genera il tuo incel di fiducia' → usato direttamente)
     * - Chiave 'siteDesc' — descrizione globale tradotta
     * - Stringa statica di fallback dalla configurazione del sito
     *
     * Usare 'siteDesc' come fallback garantisce che anche la descrizione globale
     * sia localizzata quando l'utente cambia lingua.
     */
    private resolveDescription(rawKey: string | null | undefined): string {
        if (rawKey) {
            return this.translate.translate(rawKey);
        }
        return ContestoSito.config.description;
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
