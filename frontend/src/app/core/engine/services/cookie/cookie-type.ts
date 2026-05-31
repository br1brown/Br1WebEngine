export enum CookieCategory {
    Technical,
    Analytics,
    Profiling,
}

export interface CookieConfig {
    category: CookieCategory;
    descriptionKey?: string;
}
