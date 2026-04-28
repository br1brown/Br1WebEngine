/**
 * Validazione e normalizzazione di language tag BCP 47 (RFC 5646).
 *
 * Usa Intl.getCanonicalLocales come oracolo: la stessa libreria che il browser
 * usa per Accept-Language, Intl.* e l'attributo lang del documento. Se passa
 * questa validazione, il tag e' accettato anche dal backend e da qualsiasi
 * consumer compatibile.
 *
 * Le chiavi del catalogo traduzioni sono lowercase, quindi la forma normalizzata
 * restituita e' lowercase ("zh-hant-tw" invece di "zh-Hant-TW"). La validita'
 * BCP 47 e' indipendente dal case.
 */
export function tryNormalizeBcp47(tag: string | null | undefined): string | null {
    if (typeof tag !== 'string') return null;

    const trimmed = tag.trim();
    if (trimmed.length === 0) return null;

    try {
        const [canonical] = Intl.getCanonicalLocales(trimmed);
        return canonical ? canonical.toLowerCase() : null;
    } catch {
        return null;
    }
}

/** Comodita': true se il tag e' un BCP 47 well-formed. */
export function isValidBcp47Tag(tag: string | null | undefined): boolean {
    return tryNormalizeBcp47(tag) !== null;
}
