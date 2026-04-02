export type TranslationDictionary = Record<string, string>;

type TranslationModule = {
    default: TranslationDictionary;
};

type TranslationCatalogLoader = () => Promise<TranslationDictionary[]>;

const translationCatalogLoaders: Record<string, TranslationCatalogLoader> = {
    it: async () => {
        const [basic, addon] = await Promise.all([
            import('../../../assets/i18n/basic.it.json'),
            import('../../../assets/i18n/addon.it.json')
        ]) as [TranslationModule, TranslationModule];

        return [basic.default, addon.default];
    },
    en: async () => {
        const [basic, addon] = await Promise.all([
            import('../../../assets/i18n/basic.en.json'),
            import('../../../assets/i18n/addon.en.json')
        ]) as [TranslationModule, TranslationModule];

        return [basic.default, addon.default];
    }
};

export const hasTranslationCatalogs = (language: string): boolean =>
    typeof translationCatalogLoaders[language] === 'function';

export const loadTranslationCatalogs = async (
    language: string
): Promise<TranslationDictionary[] | undefined> => {
    const loader = translationCatalogLoaders[language];
    return loader ? loader() : undefined;
};
