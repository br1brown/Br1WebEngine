import { Component, computed, inject, input } from '@angular/core';
import { TranslateService } from '../../core/engine/services/translate.service';
import { TranslatePipe } from '../../core/engine/pipes/translate.pipe';
import { PageDirective } from '../../core/engine/directives/page.directive';
import { PageType } from '../../site';

/**
 * Pagina di errore generica, usata per qualsiasi codice HTTP (404, 500, ecc.).
 *
 * Il codice errore viene passato come path param (es. `error/:errorCode`) e letto
 * tramite component input binding, grazie a `withComponentInputBinding()` nel router.
 *
 * Le chiavi di traduzione seguono questo pattern:
 *   - "errore{codice}Titolo" → titolo breve (es. "errore404Titolo" → "Pagina non trovata")
 *   - "errore{codice}Descrizione" → descrizione estesa
 *   Se la chiave non esiste nei file di traduzione, vengono usati messaggi di ripiego
 *   generici "genericoErrore" e "imprevistoErrore".
 *
 * Per gestire un nuovo codice errore basta aggiungere le chiavi di traduzione
 * corrispondenti (es. "errore403Titolo" e "errore403Descrizione") nei file JSON delle lingue.
 */
@Component({
    selector: 'app-error',
    imports: [TranslatePipe, PageDirective],
    templateUrl: './error.component.html',
    host: { class: 'd-flex align-items-center justify-content-center', style: 'min-height: 60vh;' }
})
export class ErrorComponent {
    private readonly translate = inject(TranslateService);

    protected readonly PageType = PageType;

    /** Codice errore HTTP, letto dalla route (param o data) tramite input binding. Predefinito: 404 */
    readonly errorCode = input(404, {
        transform: (v: string | number) => {
            const n = Number(v);
            return isNaN(n) ? 404 : n;
        }
    });

    private getTranslationKeys(code: number): { titleKey: string; descKey: string } {
        let titleKey = `errore${code}Titolo`;
        let descKey = `errore${code}Descrizione`;

        // NOTA BENE: Questo switch serve SOLO per mappare gli errori di PAGINA
        // generati dal routing (es. l'utente naviga manualmente verso una route protetta).
        // 
        // Gli errori legati alle RISORSE (chiamate API che falliscono) vengono gestiti 
        // e mappati dinamicamente dentro `base-api.service.ts` usando le chiavi `risorsaXXX`.
        //
        // Questa separazione permette di avere messaggi diversi:
        // - "Pagina non trovata" (Router) vs "Risorsa non trovata" (API)
        // - "Accesso vietato alla pagina" (Router) vs "Non hai privilegi su questo elemento" (API)
        
        switch (code) {
            case 401:
                titleKey = 'errore401Titolo';
                descKey = 'errore401Descrizione';
                break;
            case 403:
                titleKey = 'errore403Titolo';
                descKey = 'errore403Descrizione';
                break;
            case 404:
                // Pagina non trovata (routing)
                titleKey = 'errore404Titolo';
                descKey = 'errore404Descrizione';
                break;
            // Aggiungi qui altri override specifici per la pagina se necessario in futuro
        }

        return { titleKey, descKey };
    }

    readonly errorInfo = computed(() => {
        const code = this.errorCode();
        const { titleKey } = this.getTranslationKeys(code);
        const info = this.translate.translate(titleKey);
        if (info === titleKey) {
            return this.translate.translate('erroreGenerico') + ' ' + code;
        }
        return code + ': ' + info;
    });

    readonly errorMessage = computed(() => {
        const code = this.errorCode();
        const { descKey } = this.getTranslationKeys(code);
        const desc = this.translate.translate(descKey);
        if (desc === descKey) {
            return this.translate.translate('erroreImprevisto');
        }
        return desc;
    });
}
