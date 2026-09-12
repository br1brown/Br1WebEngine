import { Injectable, PLATFORM_ID, inject, isDevMode, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

/**
 * WEB VITALS SERVICE
 *
 * Raccoglie le Core Web Vitals reali (LCP, INP, CLS, più FCP/TTFB) di chi visita davvero il sito
 * — non un audit sintetico come Lighthouse in CI, la user experience effettiva.
 *
 * Deliberatamente senza destinazione di default: DOVE mandare questi dati (un endpoint proprio,
 * GA4, un altro RUM) è una decisione di progetto, non dell'Engine — che offre solo la raccolta.
 * Zero chiamate di rete aggiunte da questo servizio: `metrics()` è un signal che chi vuole può
 * osservare con un `effect()` nel proprio `AppComponent` e spedire dove preferisce, es.:
 * ```ts
 * effect(() => {
 *     const m = this.webVitals.metrics();
 *     if (m.length) this.api.post('metrics/vitals', m.at(-1));
 * });
 * ```
 * In sviluppo le metriche finiscono anche in console (`console.debug`) per un riscontro immediato
 * senza dover collegare nulla.
 */
@Injectable({ providedIn: 'root' })
export class WebVitalsService {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private started = false;

    private readonly _metrics = signal<readonly Metric[]>([]);
    /** Cronologia delle metriche ricevute finora (si allunga nel tempo, mai troncata: sul totale
     *  di una singola sessione utente sono al più una manciata di valori). */
    readonly metrics = this._metrics.asReadonly();

    /** Avvia la raccolta. No-op su server (le Web Vitals sono per definizione lato browser) e se
     *  chiamato più di una volta (i listener di `web-vitals` non sono pensati per essere riattaccati). */
    init(): void {
        if (!this.isBrowser || this.started) return;
        this.started = true;

        const record = (metric: Metric): void => {
            this._metrics.update(list => [...list, metric]);
            if (isDevMode()) console.debug(`[web-vitals] ${metric.name}`, metric.value, metric.rating);
        };

        onLCP(record);
        onINP(record);
        onCLS(record);
        onFCP(record);
        onTTFB(record);
    }
}
