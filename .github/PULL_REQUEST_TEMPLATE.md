## Descrizione
<!--- Descrivi i tuoi cambiamenti in dettaglio -->
<!--- Se risolve un issue aperto, per favore linkalo qui. -->

## Tipo di cambiamento
<!--- Che tipi di cambiamenti introduce il tuo codice? Metti una `x` in tutte le caselle applicabili: -->
- [ ] Bug fix (cambiamento non distruttivo che risolve un problema)
- [ ] Nuova funzionalità (cambiamento non distruttivo che aggiunge una funzionalità)
- [ ] Breaking change (fix o funzionalità che causerebbe il malfunzionamento di una logica preesistente)
- [ ] Aggiornamento documentazione

## Checklist Architetturale
<!--- Rivedi tutti i seguenti punti e metti una `x` in tutte le caselle applicabili. -->
<!--- Questo progetto impone un pattern architetturale rigido per mantenere la semplicità. -->
- [ ] Il mio codice segue la filosofia del progetto (Pragmatismo > Pura Astrazione).
- [ ] (Backend) Non ho aggiunto logica di business all'interno della cartella `Engine/`.
- [ ] (Backend) I miei controller ereditano da `EngineApiController` o `EngineProtectedController`.
- [ ] (Frontend) Non ho manipolato manualmente il DOM (garantendo il funzionamento dell'idratazione SSR).
- [ ] (Frontend) Le nuove pagine sono dichiarate rigorosamente in `site.ts` usando l'enum `PageType`.

## Testing
<!--- Per favore descrivi i test che hai eseguito per verificare i tuoi cambiamenti. -->
- [ ] Ho testato le API sia con `LoginEnabled: true` che `false`.
- [ ] Ho verificato che il frontend compili correttamente con il supporto SSR (`npm run build`).
