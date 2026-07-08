import type { Type } from '@angular/core';
import type { PageBaseComponent } from '../pages/page-base.component';
import type { PageType } from '../../../site';
import type { LegalPagesConfig, ParentPageInput, ResolvedLegalPages, SitePageInput } from '../siteBuilder';

/** Forma fissa di una pagina legale: tutto tranne l'identità (il PageType, dato dallo slot del figlio). */
interface LegalPageSpec {
    slot: keyof LegalPagesConfig;
    /** Segmento sotto `policy/` (es. 'privacy' → /policy/privacy). */
    path: string;
    titleKey: string;
    descriptionKey: string;
    /** Basename del Markdown in assets/legal (`<slug>.<lang>.md`). */
    markdownSlug: string;
}

/** Registry delle pagine legali di sistema. L'ordine determina l'ordine delle rotte. */
const LEGAL_PAGES: readonly LegalPageSpec[] = [
    { slot: 'privacy',       path: 'privacy',       titleKey: 'privacyPolicyMenu',       descriptionKey: 'privacyPolicyDescrizione',       markdownSlug: 'privacy' },
    { slot: 'cookie',        path: 'cookie',         titleKey: 'cookiePolicyMenu',       descriptionKey: 'cookiePolicyDescrizione',        markdownSlug: 'cookie' },
    { slot: 'tos',           path: 'termini',        titleKey: 'terminiPolicyMenu',      descriptionKey: 'terminiPolicyDescrizione',       markdownSlug: 'TOS' },
    { slot: 'legal',         path: 'legal',          titleKey: 'noteLegaliPolicyMenu',   descriptionKey: 'noteLegaliPolicyDescrizione',    markdownSlug: 'legal' },
    { slot: 'accessibility', path: 'accessibilita',  titleKey: 'accessibilitaPolicyMenu', descriptionKey: 'accessibilitaPolicyDescrizione', markdownSlug: 'accessibility' },
];

// import dinamico → nessun arco statico Engine→dominio; un solo chunk condiviso per le policy.
const loadPolicyComponent = (): Promise<Type<PageBaseComponent<string>>> =>
    import('../../../pages/policy/policy.component').then(m => m.PolicyComponent);

/**
 * Nodo `policy/` con le pagine legali valorizzate; `null` se nessuno slot lo è.
 * Iniettato automaticamente da `buildSite`: il figlio valorizza solo gli slot in `legalPages`.
 */
export function buildPolicySection(legalPages: ResolvedLegalPages): ParentPageInput | null {
    const children: SitePageInput[] = [];
    for (const spec of LEGAL_PAGES) {
        const pageType = legalPages[spec.slot];
        if (pageType == null) continue;
        children.push({ path: spec.path, title: spec.titleKey, description: spec.descriptionKey, pageType, component: loadPolicyComponent });
    }
    return children.length > 0 ? { path: 'policy', title: 'policies', children } : null;
}

/** Slug del Markdown legale per un PageType valorizzato, o `null` se non è una pagina legale. */
export function legalSlugFor(legalPages: ResolvedLegalPages, type: PageType): string | null {
    for (const spec of LEGAL_PAGES) {
        const ref = legalPages[spec.slot];
        if (ref != null && ref === type) return spec.markdownSlug;
    }
    return null;
}
