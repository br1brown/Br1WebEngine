import type { LegalPagesConfig } from '../core/engine/siteBuilder';

// ═══════════════════════════════════════════════════════════════════════
// AREA "legal" — pagine legali del progetto
// ═══════════════════════════════════════════════════════════════════════
//
// Tutto ciò che il figlio deve compilare per il legale sta qui, non in
// site.ts: gli ID, quali pagine esistono (slot valorizzato = pagina
// creata, omesso = pagina assente — utile es. per una vetrina con solo i
// cookie) e le date di "ultimo aggiornamento". Il builder (Engine) crea
// le rotte /policy/* da questi slot; se il sito usa cookie (vedi
// `cookie-registry.ts` → COOKIE_MAP, o multilingua, o PWA) lo slot
// `cookie` è obbligatorio — ometterlo è un errore al build.
//
export const LegalPages = {
    PrivacyPolicy: 'legal.privacy',
    CookiePolicy: 'legal.cookie',
    TermsOfService: 'legal.tos',
    LegalNotice: 'legal.notice',
    AccessibilityStatement: 'legal.accessibility',
} as const;

type LegalPageId = (typeof LegalPages)[keyof typeof LegalPages];

/** Slot dell'Engine → PageType del figlio. Assemblato in site.ts → legalPages. */
export const legalSlots: LegalPagesConfig = {
    privacy: LegalPages.PrivacyPolicy,
    cookie: LegalPages.CookiePolicy,
    tos: LegalPages.TermsOfService,
    legal: LegalPages.LegalNotice,
    accessibility: LegalPages.AccessibilityStatement,
};

/**
 * Data di "ultimo aggiornamento" per pagina legale (formato ISO `YYYY-MM-DD`), consumata da
 * `PolicyComponent`. Volutamente NON da git/filesystem (la mtime non sopravvive a clone/Docker →
 * varrebbe la data di build). Un ID senza data → nessuna riga mostrata.
 *
 * ⚠️ COOKIE: aggiorna la data di `CookiePolicy` ogni volta che modifichi `COOKIE_MAP`
 *    (`core/services/cookie-registry.ts`) — l'elenco cambia → la policy è "aggiornata".
 */
export const legalUpdated: Partial<Record<LegalPageId, Date>> = {
    [LegalPages.PrivacyPolicy]: new Date('2026-07-03'),
    [LegalPages.CookiePolicy]: new Date('2026-07-03'),
    [LegalPages.TermsOfService]: new Date('2026-07-03'),
    [LegalPages.LegalNotice]: new Date('2026-07-03'),
    [LegalPages.AccessibilityStatement]: new Date('2026-07-08'),
};
