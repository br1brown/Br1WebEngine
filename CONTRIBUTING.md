# Contributing

Br1WebEngine è un template personale. Le contribuzioni esterne sono benvenute, ma il progetto ha obiettivi di design precisi — leggi questa guida prima di aprire una PR.

---

## Come contribuire

### Segnalare un bug

Apri una issue con:
- Cosa ti aspettavi che succedesse
- Cosa è successo invece
- Passi per riprodurre il problema
- Ambiente (Node version, .NET version, OS)

### Proporre una funzionalità

Apri una issue con:
- Descrizione chiara di cosa vorresti aggiungere
- Perché sarebbe utile al template in generale (non solo al tuo caso d'uso)
- Esempio d'uso, se applicabile

### Contribuire con codice

1. **Fork e branch** — crea un branch descrittivo (`git checkout -b fix/navbar-overflow`)
2. **Setup sviluppo locale**:
   ```bash
   npm install
   ./start-frontend-dev.sh  # frontend con hot reload
   cd backend && dotnet run # backend
   ```
3. **Segui i pattern esistenti** — le guide di riferimento sono:
   - [`frontend/DEVELOPMENT.md`](frontend/DEVELOPMENT.md) per Angular
   - [`backend/DEVELOPMENT.md`](backend/DEVELOPMENT.md) per ASP.NET Core
4. **Commit chiari** — descrivi cosa cambia e perché, non come
5. **Pull request** — spiega il problema risolto o la funzionalità aggiunta

### Documentazione

Correzioni e miglioramenti a README, DEVELOPMENT.md o SECURITY.md sono sempre ben accetti.

---

## Linee guida

- **Scope piccolo** — le PR piccole e mirate hanno più probabilità di essere integrate
- **Discuti prima** — per cambiamenti significativi, apri prima una issue per allinearsi
- **Commenti in inglese** — anche se il resto del progetto è in italiano, i commenti nel codice restano in inglese per accessibilità

---

## Cosa non verrà accettato

- Riscritture architetturali o refactor non richiesti
- Rimozione di funzionalità core del template
- Cambi di dipendenze significativi senza discussione preliminare
- Qualsiasi cosa incompatibile con i principi del progetto:
  - configurazione dichiarativa da un solo file (`site.ts`)
  - boilerplate minimo per chi deriva il template
  - SSR-first per le pagine pubbliche
  - sicurezza pre-cablata, non opzionale

---

## Domande?

Apri una issue o consulta [`frontend/DEVELOPMENT.md`](frontend/DEVELOPMENT.md) e [`backend/DEVELOPMENT.md`](backend/DEVELOPMENT.md).
