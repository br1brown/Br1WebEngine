import { Injectable, NgZone, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { NotificationService } from './notification.service';
import { TranslateService } from './translate.service';

/** Intervallo di controllo: 10 minuti. */
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

/**
 * VERSION CHECK SERVICE
 * Monitora periodicamente se � stata rilasciata una nuova versione dell'applicazione.
 * Se viene rilevato un aggiornamento, invita l'utente a ricaricare la pagina.
 */
@Injectable({ providedIn: 'root' })
export class VersionCheckService implements OnDestroy {
    private readonly document = inject(DOCUMENT);
    private readonly translate = inject(TranslateService);
    private readonly notify = inject(NotificationService);
    private readonly ngZone = inject(NgZone);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    private currentVersion: string | null = null;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private updateShown = false;

    /**
     * Inizializza il monitoraggio.
     * Deve essere chiamato nel costruttore di app.component o tramite un initializer.
     */
    init(): void {
        /**
         * SICUREZZA PER SSR (Server Side Rendering):
         * setInterval crea una macrotask che impedirebbe ad Angular Universal di terminare
         * il rendering della pagina, causando il timeout del server. 
         * Inoltre, il controllo versione ha senso solo nel client.
         */
        if (!this.isBrowser) return;

        // Recupera la versione attuale iniettata nel meta tag dell'index.html
        this.currentVersion = this.document
            .querySelector('meta[name="app-version"]')
            ?.getAttribute('content') ?? null;

        if (!this.currentVersion) return;

        // Avvia il timer fuori dalla zona Angular: setInterval dentro NgZone
        // mantiene l'app perennemente "instabile", bloccando l'idratazione SSR (NG0506).
        this.ngZone.runOutsideAngular(() => {
            this.intervalId = setInterval(
                () => this.ngZone.run(() => void this.check()),
                CHECK_INTERVAL_MS
            );
        });
    }

    /**
     * Esegue il controllo confrontando la versione locale con quella sul server.
     */
    private async check(): Promise<void> {
        // Evita di mostrare pi� dialog contemporaneamente se l'utente non ha ancora risposto
        if (this.updateShown) return;

        try {
            /**
             * Scarica il manifest dell'app (webmanifest o un file JSON dedicato).
             * 'cache: no-store' � CRITICO: forza il browser a ignorare la cache locale
             * e chiedere al server l'effettiva ultima versione disponibile.
             */
            const response = await fetch('/manifest.webmanifest', { cache: 'no-store' });
            if (!response.ok) return;

            const manifest = await response.json() as { version?: string };

            // Se la versione nel manifest � diversa da quella caricata in memoria...
            if (manifest.version && manifest.version !== this.currentVersion) {
                this.updateShown = true;
                this.showUpdateDialog();
            }
        } catch {
            // Silenzioso in caso di errori di rete (es. utente offline)
        }
    }

    /**
     * Mostra un popup all'utente informandolo dell'aggiornamento.
     */
    private async showUpdateDialog(): Promise<void> {
        const confirmed = await this.notify.confirm(
            this.translate.translate('nuovaVersioneTitle'),
            this.translate.translate('nuovaVersioneDesc'),
            {
                icon: 'info',
                confirmText: this.translate.translate('aggiornaApp'),
                allowOutsideClick: false, // Forza l'interazione per garantire che l'app si aggiorni
            }
        );

        if (confirmed) {
            // Esegue un hard-reload per scaricare i nuovi asset dal server
            window.location.reload();
        } else {
            // Se l'utente rifiuta, permettiamo un nuovo controllo al prossimo intervallo
            this.updateShown = false;
        }
    }

    /** Pulizia del timer alla distruzione del servizio per evitare memory leak. */
    ngOnDestroy(): void {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
        }
    }
}