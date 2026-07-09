# Contribuire a Br1WebEngine

Grazie per il tuo interesse nel contribuire a Br1WebEngine! Questo progetto è progettato per essere un motore pragmatico e ad alte prestazioni per la costruzione rapida di applicazioni web senza il peso del boilerplate.

Per garantire che i tuoi contributi siano in linea con la visione del progetto, ti preghiamo di rivedere le seguenti linee guida.

## Filosofia
**Pragmatismo sulla Pura Astrazione.**
Br1WebEngine preferisce codice che sia facile da leggere, facile da eliminare e veloce da eseguire. Non imponiamo una rigida "Clean Architecture" o astrazioni massive (come CQRS o Redux) a meno che non siano strettamente necessarie.

## Linee Guida per lo Sviluppo

Prima di scrivere codice, ti preghiamo di leggere le guide di sviluppo interne:
- [Guida allo Sviluppo Backend](../backend/README.md)
- [Guida allo Sviluppo Frontend](../frontend/README.md)

### Regole d'Oro

1. **L'Engine è Sacro**: Le directory `backend/Engine/`, `frontend/src/app/core/engine/` e `frontend/src/styles/engine/` contengono le astrazioni centrali (sicurezza, parser DSL, routing, tema). Non aggiungere logica di business o funzionalità specifiche del cliente in queste cartelle. La regola pratica è il path: se è sotto un `engine/`, lo consumi, non lo modifichi.
2. **Guidato dalla Configurazione (Frontend)**: Non aggiungere rotte manualmente in Angular. Tutte le nuove pagine, i metadati SEO e gli elementi di navigazione devono essere pilotati da `site.ts` usando `PageType`.
3. **Guidato dall'Ereditarietà (Backend)**: Non ereditare dai controller standard di ASP.NET. Usa `EngineApiController` o `EngineProtectedController` per attivare automaticamente le funzionalità di sicurezza e rate-limiting.
4. **Nessuna Manipolazione Diretta del DOM**: Il frontend è costruito rigorosamente con il Server-Side Rendering (SSR) in mente. Modifiche stile `document.getElementById` o manipolazioni jQuery-like romperanno il processo di Idratazione (Hydration) di Angular.

## Processo di Pull Request

1. Fai un fork della repository e crea il tuo branch partendo da `main`.
2. Se hai aggiunto codice che dovrebbe essere testato, aggiungi i test.
3. Assicurati che la test suite passi con successo.
4. Aggiorna i file `README.md` se il tuo cambiamento altera significativamente il "Come si usa" dell'engine.
5. Invia una Pull Request compilando il template fornito.

### Controlli di qualità

I controlli girano in due posti: la **CI** a ogni push/PR (il gate ufficiale) e, **on-demand in locale**, `./scripts/test/run-all.sh` dalla root (i test live a11y/Lighthouse girano solo se è attivo un server da testare).

**In CI** (`.github/workflows/`) ogni push e pull request esegue questi job:

- **Compila backend** — `dotnet build` Release + scan dei pacchetti NuGet vulnerabili (`dotnet list package --vulnerable`)
- **Compila frontend** — `npm audit` (blocca solo su critical, prod), ESLint, type-check, dipendenze circolari, generazione asset statici/icone, build di produzione Angular
- **Completezza i18n** — simmetria delle chiavi di traduzione tra tutte le lingue
- **Sicurezza (gitleaks)** — secret scanning del repo (solo in CI)
- **Test live** — alza lo stack dietro reverse proxy (`public-test.sh`) ed esegue gli audit di accessibilità e Lighthouse (dipende da backend + frontend verdi)

## Segnalazioni di Problemi e Bug

Usiamo le issue di GitHub per tracciare bug e richieste pubbliche. Per favore assicurati che la tua descrizione sia chiara e abbia istruzioni sufficienti per poter riprodurre il problema. Utilizza i Template delle Issue forniti per bug e richieste di funzionalità.
