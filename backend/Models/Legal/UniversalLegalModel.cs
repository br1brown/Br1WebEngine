namespace Br1WebEngine.Models.Legal;

/// <summary>
/// Modello aggregato con tutte le informazioni legali e anagrafiche dell'organizzazione.
/// </summary>
public class UniversalLegalModel
{
    /// <summary>
    /// Ragione sociale o denominazione completa dell'organizzazione.
    /// </summary>
    public string? RagioneSociale { get; set; }

    /// <summary>
    /// Partita IVA dell'organizzazione.
    /// </summary>
    public string? PartitaIva { get; set; }

    /// <summary>
    /// Codice fiscale dell'organizzazione, se distinto dalla partita IVA.
    /// </summary>
    public string? CodiceFiscale { get; set; }

    /// <summary>
    /// Indirizzo della sede legale.
    /// </summary>
    public Address? SedeLegale { get; set; }

    /// <summary>
    /// Recapiti generali dell'organizzazione.
    /// </summary>
    public ContactInfo? Contatti { get; set; }

    /// <summary>
    /// Dati societari aggiuntivi richiesti nelle pagine istituzionali.
    /// </summary>
    public CompanyDetails? DatiSocietari { get; set; }

    /// <summary>
    /// Social network esposti nel profilo, in formato nome logico - URL.
    /// </summary>
    public Dictionary<string, string>? Social { get; set; }

    /// <summary>
    /// Collezione opzionale di metadati custom aggiuntivi.
    /// </summary>
    public Dictionary<string, string>? MetadatiAggiuntivi { get; set; }
}

/// <summary>
/// Rappresenta un indirizzo postale.
/// </summary>
public class Address
{
    /// <summary>
    /// Nome della via o piazza.
    /// </summary>
    public string? Via { get; set; }

    /// <summary>
    /// Numero civico dell'indirizzo.
    /// </summary>
    public string? Civico { get; set; }

    /// <summary>
    /// CAP o codice postale.
    /// </summary>
    public string? Cap { get; set; }

    /// <summary>
    /// Citta' della sede.
    /// </summary>
    public string? Citta { get; set; }

    /// <summary>
    /// Provincia o area amministrativa equivalente.
    /// </summary>
    public string? Provincia { get; set; }

    /// <summary>
    /// Nazione dell'indirizzo.
    /// </summary>
    public string? Nazione { get; set; }
}

/// <summary>
/// Raccoglie i principali canali di contatto dell'organizzazione.
/// </summary>
public class ContactInfo
{
    /// <summary>
    /// Numero di telefono principale.
    /// </summary>
    public string? Telefono { get; set; }

    /// <summary>
    /// Indirizzo email ordinario.
    /// </summary>
    public string? Email { get; set; }

    /// <summary>
    /// Indirizzo PEC.
    /// </summary>
    public string? Pec { get; set; }
}

/// <summary>
/// Dati societari e amministrativi aggiuntivi dell'organizzazione.
/// </summary>
public class CompanyDetails
{
    /// <summary>
    /// Numero o riferimento del registro imprese.
    /// </summary>
    public string? RegistroImprese { get; set; }

    /// <summary>
    /// Numero REA dell'azienda.
    /// </summary>
    public string? NumeroRea { get; set; }

    /// <summary>
    /// Capitale sociale dichiarato.
    /// </summary>
    public decimal? CapitaleSociale { get; set; }

    /// <summary>
    /// Indica se il capitale sociale risulta interamente versato.
    /// </summary>
    public bool? CapitaleInteramenteVersato { get; set; }

    /// <summary>
    /// Indica se la societa' ha un socio unico.
    /// </summary>
    public bool? IsSocioUnico { get; set; }

    /// <summary>
    /// Indica se la societa' e' in liquidazione.
    /// </summary>
    public bool? InLiquidazione { get; set; }

    /// <summary>
    /// Codice SDI per la fatturazione elettronica.
    /// </summary>
    public string? CodiceSdi { get; set; }
}
