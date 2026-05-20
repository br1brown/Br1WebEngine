import { Injectable, NgZone, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { SwUpdate } from '@angular/service-worker';
import { Subscription, filter } from 'rxjs';
import { NotificationService } from './notification.service';
import { TranslateService } from './translate.service';

/** Intervallo di controllo: 10 minuti. */
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

/**
 * VERSION CHECK SERVICE
 *
 * Sorgente di verità per la versione corrente: `ContestoSito.config.version`
 * dichiarata in `site.ts`. Il valore viene scritto a build time in tre posti
 * dallo script `generate-statics.ts`:
 *   - meta tag `app-version` (usato come baseline da questo servizio)
 *   - `manifest.webmanifest` (usato dal polling per il tab browser)
 *   - hash di NGSW (usato da SwUpdate per la PWA installata)
 *
 * Quando rileva un aggiornamento (da una delle due fonti) propone il reload
 * all'utente. Entrambe le fonti sono attive in parallelo perché coprono
 * scenari diversi:
 *   - tab browser normale: SwUpdate è disabilitato → polling sul manifest
 *   - PWA installata: il SW intercetta e cache-a il manifest → solo SwUpdate
 *     vede davvero gli aggiornamenti tramite gli hash in ngsw.json
 */
@Injectable({ providedIn: 'root' })
export class VersionCheckService implements OnDestroy {
    private readonly document = inject(DOCUMENT);
    private readonly translate = inject(TranslateService);
    private readonly notify = inject(NotificationService);
    private readonly ngZone = inject(NgZone);
    private readonly swUpdate = inject(SwUpdate);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    private currentVersion: string | null = null;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private swSub: Subscription | null = null;
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

        // PWA: aggancia SwUpdate. Quando il SW finisce di scaricare una nuova
        // versione, emette VERSION_READY. Il polling sul manifest non funziona
        // dentro la PWA perché il SW serve il manifest dalla cache.
        if (this.swUpdate.isEnabled) {
            this.swSub = this.swUpdate.versionUpdates
                .pipe(filter(e => e.type === 'VERSION_READY'))
                .subscribe(() => void this.showUpdateDialog('sw'));
        }
    }

    /**
     * Polling: confronta la versione del manifest con quella in memoria.
     * Funziona nel tab browser normale; dentro la PWA è SwUpdate a prendere il sopravvento.
     */
    private async check(): Promise<void> {
        // Evita di mostrare più dialog contemporaneamente se l'utente non ha ancora risposto
        if (this.updateShown) return;

        try {
            /**
             * Scarica il manifest dell'app (webmanifest o un file JSON dedicato).
             * 'cache: no-store' è CRITICO: forza il browser a ignorare la cache locale
             * e chiedere al server l'effettiva ultima versione disponibile.
             * Nota: dentro la PWA il SW intercetta comunque — qui ci affidiamo a SwUpdate.
             */
            const response = await fetch('/manifest.webmanifest', { cache: 'no-store' });
            if (!response.ok) return;

            const manifest = await response.json() as { version?: string };

            // Se la versione nel manifest è diversa da quella caricata in memoria...
            if (manifest.version && manifest.version !== this.currentVersion) {
                void this.showUpdateDialog('manifest');
            }
        } catch {
            // Silenzioso in caso di errori di rete (es. utente offline)
        }
    }

    /**
     * Mostra un popup all'utente informandolo dell'aggiornamento.
     * @param source 'sw' se l'evento arriva da SwUpdate (PWA), 'manifest' se dal polling.
     *               In 'sw' attiva esplicitamente la nuova versione prima del reload,
     *               altrimenti il SW continuerebbe a servire l'app cached.
     */
    private async showUpdateDialog(source: 'sw' | 'manifest'): Promise<void> {
        if (this.updateShown) return;
        this.updateShown = true;

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
            if (source === 'sw') {
                try { await this.swUpdate.activateUpdate(); } catch { /* fallback al reload */ }
            }
            // Hard-reload per portare la nuova versione attiva
            window.location.reload();
        } else {
            // Se l'utente rifiuta, permettiamo un nuovo controllo al prossimo intervallo
            this.updateShown = false;
        }
    }

    /** Pulizia del timer e della sottoscrizione SwUpdate alla distruzione. */
    ngOnDestroy(): void {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
        }
        this.swSub?.unsubscribe();
    }
}