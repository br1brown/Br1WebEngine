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
 *   - "errore{codice}Info" → titolo breve (es. "errore404Info" → "Pagina non trovata")
 *   - "errore{codice}Desc" → descrizione estesa
 *   Se la chiave non esiste nei file di traduzione, vengono usati messaggi di ripiego
 *   generici "errore" e "erroreImprevisto".
 *
 * Per gestire un nuovo codice errore basta aggiungere le chiavi di traduzione
 * corrispondenti (es. "errore403Info" e "errore403Desc") nei file JSON delle lingue.
 */
@Component({
    selector: 'app-error',
    imports: [TranslatePipe, PageDirective],
    templateUrl: './error.component.html',
    styleUrl: './error.component.css'
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

    readonly errorInfo = computed(() => {
        const code = this.errorCode();
        const infoKey = `errore${code}Info`;
        const info = this.translate.translate(infoKey);
        if (info === infoKey) {
            return this.translate.translate('errore') + ' ' + code;
        }
        return code + ': ' + info;
    });

    readonly errorMessage = computed(() => {
        const code = this.errorCode();
        const descKey = `errore${code}Desc`;
        const desc = this.translate.translate(descKey);
        if (desc === descKey) {
            return this.translate.translate('erroreImprevisto');
        }
        return desc;
    });
}
