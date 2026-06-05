/**
 * CONTACT URL BUILDERS
 *
 * Funzioni pure che costruiscono gli URL dei canali di contatto/navigazione.
 * Rispecchiano i formati standard usati anche da `QrCodeService.builders`
 * (vedi core/engine/services/qr-code.service.ts), così l'app produce lo stesso
 * link sia nel QR sia nei bottoni di contatto.
 */

/** Tiene solo cifre (rimuove spazi, trattini, parentesi e il + iniziale). */
function digitsOnly(phone: string): string {
    return phone.replace(/[^\d]/g, '');
}

export const ContactUrl = {
    /** mailto: con subject/body opzionali. */
    mail: (to: string, subject = '', body = ''): string => {
        const params = new URLSearchParams();
        if (subject) params.set('subject', subject);
        if (body) params.set('body', body);
        const query = params.toString();
        return `mailto:${to.trim()}${query ? '?' + query : ''}`;
    },

    /** tel: mantenendo l'eventuale prefisso internazionale. */
    phone: (number: string): string => `tel:${number.replace(/[^\d+]/g, '')}`,

    /** https://wa.me/<cifre> con testo precompilato opzionale. */
    whatsapp: (phone: string, text = ''): string =>
        `https://wa.me/${digitsOnly(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`,

    /** https://t.me/<handle> (rimuove la @ iniziale). */
    telegram: (handle: string): string =>
        `https://t.me/${handle.trim().replace(/^@/, '')}`,
} as const;
