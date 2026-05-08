import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import * as QRCode from 'qrcode';
import { ThemeService } from './theme.service';
import { TranslateService } from './translate.service';

/**
 * Configurazioni supportate per la generazione del QR Code.
 * Copre i casi d'uso comuni: WhatsApp, Email, WiFi, Bonifici SEPA e Testo libero.
 */
export type QrConfig =
    | { type: 'whatsapp'; phone: string; text?: string }
    | { type: 'email'; to: string; subject?: string; body?: string }
    | { type: 'wifi'; ssid: string; password?: string; encryption?: 'WPA' | 'WEP' | 'nopass' }
    | { type: 'sepa'; iban: string; name: string; amount: number; remittance?: string }
    | { type: 'text'; content: string };

/** Codici di errore standardizzati per il modulo QR. */
export const enum QrError {
    INVALID_INPUT = 'INVALID_INPUT',           // Fallimento validazione (es. IBAN o Email errati)
    PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',   // Testo troppo lungo per gli standard QR
    CONVERSION_ERROR = 'CONVERSION_ERROR',     // Errore nel passaggio Canvas -> Blob
    GENERATION_FAILED = 'GENERATION_FAILED',   // Fallimento generico della libreria qrcode
    NOT_IN_BROWSER = 'NOT_IN_BROWSER',         // Chiamata effettuata lato server (SSR)
}

/** Risposta del servizio: restituisce un file binario (Blob) o un errore con messaggio tradotto. */
export type QrResponse =
    | { success: true; blob: Blob }
    | { success: false; error: QrError; message: string };

/**
 * QR CODE SERVICE
 * Fornisce logica per generare codici QR in formato PNG o SVG.
 * Integra la gestione dei colori del tema e la traduzione automatica dei messaggi d'errore.
 */
@Injectable({ providedIn: 'root' })
export class QrCodeService {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly theme = inject(ThemeService);
    private readonly translate = inject(TranslateService);

    /**
     * Cache LRU per evitare calcoli ridondanti su QR identici. Insertion-order
     * della Map = ordine di accesso (aggiornato da cacheGet/cacheSet).
     * Cap fisso per evitare crescita indefinita su sessioni lunghe.
     */
    private readonly cache = new Map<string, Blob>();
    private static readonly CACHE_MAX_SIZE = 32;

    private cacheGet(key: string): Blob | undefined {
        const blob = this.cache.get(key);
        if (blob === undefined) return undefined;
        // Touch: re-inserisce per spostare l'entry in coda (most recently used)
        this.cache.delete(key);
        this.cache.set(key, blob);
        return blob;
    }

    private cacheSet(key: string, blob: Blob): void {
        if (this.cache.has(key)) this.cache.delete(key);
        this.cache.set(key, blob);
        if (this.cache.size > QrCodeService.CACHE_MAX_SIZE) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) this.cache.delete(oldest);
        }
    }

    // ─── VALIDATORI ───────────────────────────────────────────────────────

    private readonly validators = {
        phone: (p: string) => /^\+?[1-9]\d{1,14}$/.test(p),
        email: (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
        iban: (i: string) => /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(i.replace(/\s/g, '')),
    };

    // ─── BUILDER PAYLOAD ──────────────────────────────────────────────────
    // Genera le stringhe nel formato standard per essere interpretate dalle fotocamere.

    private readonly builders = {
        whatsapp: (p: string, t = '') =>
            `https://wa.me/${p.replace(/\+/g, '')}?text=${encodeURIComponent(t)}`,
        email: (to: string, s = '', b = '') =>
            `mailto:${to}?subject=${encodeURIComponent(s)}&body=${encodeURIComponent(b)}`,
        wifi: (ssid: string, pwd = '', enc = 'WPA') =>
            `WIFI:T:${enc};S:${ssid};P:${pwd};;`,
        sepa: (iban: string, name: string, amount: number, remittance = '') =>
            ['BCD', '002', '1', 'SCT', '', name, iban.replace(/\s/g, ''), `EUR${amount.toFixed(2)}`, '', '', remittance].join('\n'),
        text: (c: string) => c,
    };

    /** Genera un QR (PNG) usando i colori del tema globale. */
    async create(config: QrConfig): Promise<QrResponse> {
        return this.createWithColors(config, this.theme.colorPrimaryText(), this.theme.colorPrimary());
    }

    /** 
     * Genera un QR (PNG) con colori personalizzati. 
     * Gestisce la validazione e il controllo dell'ambiente (Browser vs Server).
     */
    async createWithColors(config: QrConfig, fg: string, bg: string): Promise<QrResponse> {
        if (!this.isBrowser) return this.err(QrError.NOT_IN_BROWSER);

        const payload = this.buildPayload(config);
        if (typeof payload !== 'string') return payload; // Restituisce l'oggetto QrResponse di errore

        return this.generate(payload, fg, bg);
    }

    /** Genera la stringa SVG del QR Code con i colori del tema. */
    async toSVG(config: QrConfig): Promise<string | null> {
        return this.toSVGWithColors(config, this.theme.colorPrimaryText(), this.theme.colorPrimary());
    }

    /** Genera la stringa SVG del QR Code. Solo per uso nel browser. */
    async toSVGWithColors(config: QrConfig, fg: string, bg: string): Promise<string | null> {
        if (!this.isBrowser) return null;
        const payload = this.buildPayload(config);
        if (typeof payload !== 'string') return null;

        return QRCode.toString(payload, { type: 'svg', color: { dark: fg, light: bg } });
    }

    /** Trasforma la configurazione in stringa, validando i campi critici. */
    private buildPayload(config: QrConfig): string | QrResponse {
        switch (config.type) {
            case 'whatsapp':
                return this.validators.phone(config.phone)
                    ? this.builders.whatsapp(config.phone, config.text)
                    : this.err(QrError.INVALID_INPUT);
            case 'email':
                return this.validators.email(config.to)
                    ? this.builders.email(config.to, config.subject, config.body)
                    : this.err(QrError.INVALID_INPUT);
            case 'wifi':
                return this.builders.wifi(config.ssid, config.password, config.encryption);
            case 'sepa':
                return this.validators.iban(config.iban)
                    ? this.builders.sepa(config.iban, config.name, config.amount, config.remittance)
                    : this.err(QrError.INVALID_INPUT);
            case 'text':
                return this.builders.text(config.content);
        }
    }

    /**
     * Esegue il rendering fisico del QR su un canvas e lo converte in Blob.
     * Applica caching basato su payload e schema colori.
     */
    private async generate(payload: string, fg: string, bg: string): Promise<QrResponse> {
        const cacheKey = `${payload}|${fg}|${bg}`;
        const cached = this.cacheGet(cacheKey);
        if (cached) return { success: true, blob: cached };

        // Limite tecnico per QR Code versione 40
        if (payload.length > 2953) {
            return this.err(QrError.PAYLOAD_TOO_LARGE);
        }

        try {
            const canvas = document.createElement('canvas');
            await QRCode.toCanvas(canvas, payload, {
                width: 512,
                margin: 2,
                errorCorrectionLevel: 'H', // Alta resilienza: il QR rimane leggibile anche se sporco o coperto
                color: { dark: fg, light: bg },
            });

            return new Promise<QrResponse>(resolve => {
                canvas.toBlob(blob => {
                    if (blob) {
                        this.cacheSet(cacheKey, blob);
                        resolve({ success: true, blob });
                    } else {
                        resolve(this.err(QrError.CONVERSION_ERROR));
                    }
                }, 'image/png');
            });
        } catch {
            return this.err(QrError.GENERATION_FAILED);
        }
    }

    /**
     * Centralizza la creazione degli oggetti di errore.
     * Mappa il tipo di errore (enum) sulla chiave di traduzione corrispondente.
     */
    private err(error: QrError): QrResponse {
        const qrErrorMap: Record<QrError, string> = {
            [QrError.INVALID_INPUT]: 'qrErrorInvalidInput',
            [QrError.PAYLOAD_TOO_LARGE]: 'qrErrorPayloadTooLarge',
            [QrError.CONVERSION_ERROR]: 'qrErrorConversionError',
            [QrError.GENERATION_FAILED]: 'qrErrorGenerationFailed',
            [QrError.NOT_IN_BROWSER]: 'qrErrorSsrNotSupported',
        };
        return {
            success: false,
            error,
            message: this.translate.t(qrErrorMap[error]) // Traduzione dinamica
        };
    }
}