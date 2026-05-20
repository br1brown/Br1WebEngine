/**
 * Cifratura simmetrica del payload di `/cdn-cgi/preview`.
 *
 * Usa `node:crypto` (sincrono) — utilizzabile solo in contesto Node.js:
 * SSR (via `app.config.server.ts`) e `server.ts`.
 * Il browser bundle non importa mai questo file.
 *
 * Schema:
 *  - Chiave: SHA-256 di `${appName}:${version}` di ContestoSito. Bumpare la
 *    `version` in site.ts invalida automaticamente i blob esistenti.
 *  - Algoritmo: AES-GCM 256 con IV deterministico (primi 12 byte di SHA-256 del payload).
 *    Stesso payload → stesso blob → URL stabile e cacheable da browser/CDN.
 *  - Output: base64url di `IV ‖ ciphertext ‖ auth_tag` (senza padding `=`).
 */

import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { ContestoSito } from './app/site';
import { serverEnv } from './server-env';

export class PreviewCrypto {

    private static readonly IV_LEN = 12;
    private static readonly TAG_LEN = 16;

    /** Chiave derivata da PREVIEW_CRYPTO_SECRET o appName:version — cachata dopo il primo calcolo. */
    private static cachedKey: Buffer | null = null;
    private static getKey(): Buffer {
        if (!PreviewCrypto.cachedKey) {
            const material = serverEnv.previewCryptoSecret || `${ContestoSito.config.appName}:${ContestoSito.config.version}`;
            PreviewCrypto.cachedKey = createHash('sha256').update(material).digest();
        }
        return PreviewCrypto.cachedKey;
    }

    /**
     * Cifra il payload in un blob URL-safe (sincrono).
     * Uso: `?p=${PreviewCrypto.encrypt({ title, subtitle, id })}`
     */
    static encrypt(payload: Record<string, string>): string {
        const key = PreviewCrypto.getKey();
        const plaintext = Buffer.from(JSON.stringify(payload));

        // IV deterministico = primi 12 byte di SHA-256(payload).
        const iv = createHash('sha256').update(plaintext).digest().subarray(0, PreviewCrypto.IV_LEN);

        const cipher = createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const tag = cipher.getAuthTag();

        const combined = Buffer.concat([iv, encrypted, tag]);
        return combined.toString('base64url');
    }

    /**
     * Decifra il blob e ritorna il payload originale (sincrono).
     * Throw se il blob è stato manomesso (auth tag AES-GCM invalido) o malformato.
     */
    static decrypt(blob: string): Record<string, string> {
        const key = PreviewCrypto.getKey();
        const combined = Buffer.from(blob, 'base64url');

        if (combined.length <= PreviewCrypto.IV_LEN + PreviewCrypto.TAG_LEN) {
            throw new Error('blob too short');
        }

        const iv = combined.subarray(0, PreviewCrypto.IV_LEN);
        const tagStart = combined.length - PreviewCrypto.TAG_LEN;
        const ct = combined.subarray(PreviewCrypto.IV_LEN, tagStart);
        const tag = combined.subarray(tagStart);

        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const plain = Buffer.concat([decipher.update(ct), decipher.final()]);

        return JSON.parse(plain.toString('utf-8'));
    }
}
