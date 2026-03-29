export interface Address {
    via?: string;
    civico?: string;
    cap?: string;
    citta?: string;
    provincia?: string;
    nazione?: string;
}

export interface ContactInfo {
    telefono?: string;
    email?: string;
    pec?: string;
}

export interface CompanyDetails {
    registroImprese?: string;
    numeroRea?: string;
    capitaleSociale?: number;
    capitaleInteramenteVersato?: boolean;
    isSocioUnico?: boolean;
    inLiquidazione?: boolean;
    codiceSdi?: string;
}

/** Profilo legale completo restituito da GET /profile. */
export interface Profile {
    ragioneSociale?: string;
    partitaIva?: string;
    codiceFiscale?: string;
    sedeLegale?: Address;
    contatti?: ContactInfo;
    datiSocietari?: CompanyDetails;
    social?: Record<string, string>;
    metadatiAggiuntivi?: Record<string, string>;
}
