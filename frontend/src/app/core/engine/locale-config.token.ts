import { InjectionToken, makeStateKey } from '@angular/core';

export interface LocaleConfig {
    readonly defaultLang: string;
    readonly availableLanguages: readonly string[];
}

/** Token DI per la configurazione locale — fornito lato server da br1engine.json,
 *  trasferito al browser via Angular TransferState. */
export const LOCALE_CONFIG = new InjectionToken<LocaleConfig>('LOCALE_CONFIG', {
    factory: () => ({ defaultLang: 'it', availableLanguages: ['it'] })
});

/** Chiave TransferState per propagare la config locale server→browser. */
export const LOCALE_STATE_KEY = makeStateKey<LocaleConfig>('br1_locale');
