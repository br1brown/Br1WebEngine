import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '../../core/services/translate.service';

/**
 * TranslatePipe — Pipe per tradurre testi nei template HTML.
 *
 * USO NEI TEMPLATE:
 *   {{ 'chiave.di.traduzione' | translate }}
 *   {{ 'benvenuto' | translate: nomeUtente }}
 *
 * PURE: FALSE
 *   La pipe e' impura (pure: false) perche' le traduzioni cambiano quando
 *   l'utente cambia lingua. Una pipe pura non rileverebbe il cambio
 *   (il valore della chiave non cambia, cambia il dizionario interno).
 *   Angular ri-esegue le pipe impure ad ogni ciclo di change detection.
 *
 *   Nota: in un'app con pochi template tradotti il costo e' trascurabile.
 *   Se in futuro servisse ottimizzare, si puo' passare a un approccio
 *   signal-first chiamando translate.t() direttamente nei computed().
 */
@Pipe({
    name: 'translate',
    pure: false
})
export class TranslatePipe implements PipeTransform {
    private readonly translateService = inject(TranslateService);

    transform(key: string, ...args: any[]): string {
        return this.translateService.translate(key, ...args);
    }
}
