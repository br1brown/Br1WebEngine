import { Component, input } from '@angular/core';
import { TranslatePipe } from '../../../core/engine/pipes/translate.pipe';

@Component({
    selector: 'app-loading',
    imports: [TranslatePipe],
    template: `
        @if (loading()) {
            <div class="d-flex justify-content-center align-items-center py-4"
                 role="status"
                 aria-live="polite">
                <div class="spinner-border" aria-hidden="true"></div>
                <span class="visually-hidden">{{ 'caricamentoStato' | translate }}</span>
            </div>
        } @else {
            <ng-content />
        }
    `
})
export class LoadingComponent {
    readonly loading = input.required<boolean>();
}
