import { Injectable, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { NotificationService } from './notification.service';
import { TranslateService } from './translate.service';

const CHECK_INTERVAL_MS = 10 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class VersionCheckService implements OnDestroy {
    private readonly document = inject(DOCUMENT);
    private readonly translate = inject(TranslateService);
    private readonly notify = inject(NotificationService);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    private currentVersion: string | null = null;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private updateShown = false;

    init(): void {
        // setInterval crea una macrotask Zone.js che impedisce all'SSR di completarsi.
        // Il controllo versione ha senso solo nel browser: in SSR non serve e causerebbe hang.
        if (!this.isBrowser) return;

        this.currentVersion = this.document
            .querySelector('meta[name="app-version"]')
            ?.getAttribute('content') ?? null;

        if (!this.currentVersion) return;

        this.intervalId = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
    }

    private async check(): Promise<void> {
        if (this.updateShown) return;

        try {
            const response = await fetch('/manifest.webmanifest', { cache: 'no-store' });
            if (!response.ok) return;

            const manifest = await response.json() as { version?: string };
            if (manifest.version && manifest.version !== this.currentVersion) {
                this.updateShown = true;
                this.showUpdateDialog();
            }
        } catch {
            // rete non disponibile: silent fail, riprova al prossimo ciclo
        }
    }

    private showUpdateDialog(): void {
        this.notify.confirm(
            this.translate.translate('nuovaVersioneTitle'),
            this.translate.translate('nuovaVersioneDesc'),
            {
                onConfirm: () => window.location.reload(),
                onCancel: () => { this.updateShown = false; },
            },
            {
                icon: 'info',
                confirmText: this.translate.translate('aggiornaApp'),
                allowOutsideClick: false,
            }
        );
    }

    ngOnDestroy(): void {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
        }
    }
}
