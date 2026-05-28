# 🚀 Br1WebEngine

<div align="center">
  <strong>Il template applicativo definitivo. Pragmatismo sulla purezza, velocità sul boilerplate.</strong>
</div>

<br/>

Br1WebEngine non è un semplice template: è un **patto contro il boilerplate**. Nasce per azzerare le settimane tipicamente spese per configurare routing, SEO, SSR, CORS, Rate Limiting, JWT e Gestione Errori all'inizio di un nuovo progetto.

---

## 🧭 La Filosofia: Pragmatismo > Purezza

L'industria è spesso ossessionata dall'esasperazione architetturale (Clean Architecture forzate, CQRS o Redux ovunque). Questo Engine prende una posizione netta: il codice è progettato per essere **robusto come un prodotto Enterprise, ma agile come uno script**.

| Quello che eviti ❌ | Quello che ottieni con Br1WebEngine ✅ |
| :--- | :--- |
| Configurare N file per il routing e la SEO | Un singolo file DSL (`site.ts`) gestisce rotte, menu e meta-tag. |
| Dimenticare la sicurezza sugli endpoint | Tutti gli endpoint ereditano Rate Limiter e CORS in automatico. |
| Configurare DB relazionali per testare | `FileContentStore` usa JSON in RAM con localizzazione integrata. |
| Leak di stack trace in produzione | Middleware globale per errori `RFC 9457` Problem Details. |
| Redux boilerplate per il frontend | Uso nativo di `Signals` e `withFetch` di Angular 19. |

---

## 🏗️ Architettura del Sistema

I due progetti (Frontend e Backend) sono totalmente disaccoppiati, ma condividono la stessa filosofia: **Nascondere la noia nell'Engine, esporre solo il Dominio**.

```text
┌──────────────────────────────────────────────────────┐
│  Frontend — Node SSR (Angular 19 + Express)          │
│  porta 80                                            │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ Angular SSR  │  │/api/* proxy│  │/cdn-cgi/asset│  │
│  │  (pagine)    │  │ → backend  │  │ Sharp + cache│  │
│  └──────────────┘  └────────────┘  └──────────────┘  │
└───────────────────────────┬──────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────┐
│  Backend (ASP.NET Core 9)                    │
│  porta 8080                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Base API │ │ Auth API │ │ Protected API│  │
│  │(api key) │ │(transito)│ │  (riservato) │  │
│  └──────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────────────────────────────────────┐│
│  │ Security: API Key + JWT + CORS + Rate    ││
│  │ Limiting + Security Headers              ││
│  └──────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

### Struttura delle Cartelle

| Directory | Ruolo | Regola d'Oro |
| :--- | :--- | :--- |
| 📁 `backend/` | Web API .NET 9 | Non ereditare mai da `ControllerBase` di ASP.NET. Usa lo scudo `Engine`. |
| ├── ⚙️ `Engine/` | Core Sicurezza & Errori | **Intoccabile.** Nasconde il Rate Limiter, CORS e il parsing JWT. |
| ├── 🧠 `Controllers/` | Thin Controllers | Non mettere logica qui. Delega tutto ai `Services/`. |
| └── 🗄️ `data/` | Database JSON | Usa file JSON tradotti letti a runtime tramite il `FileContentStore`. |
| | | |
| 📁 `frontend/` | Angular 19 (Standalone) | Niente manipolazioni DOM dirette. Preserva l'Idratazione SSR. |
| ├── ⚙️ `core/engine/` | Parser del DSL (`site.ts`) | **Intoccabile.** Elabora le rotte e inietta dinamicamente la SEO. |
| ├── 🖼️ `pages/` | Schermate Intere | Ereditano da `PageBaseComponent`. Dichiarate tramite enum `PageType`. |
| └── 🧱 `components/` | UI Condivisa | Componenti "stupidi". Ricevono `@Input()` ed emettono eventi. |

---

## 💡 I Vantaggi per il Business

1. **Time to Market Fulmineo**: Al Giorno 1 sei già pronto per sviluppare la logica. Il prodotto esce prima.
2. **SEO Perfetta "Di Fabbrica"**: L'Engine frontend gestisce dinamicamente tag OpenGraph, JSON-LD e Server-Side Rendering granulare in base a `site.ts`.
3. **Sicurezza Preventiva**: Bot bloccati, attacchi brute-force mitigati e API Key inforcate. L'infrastruttura del cliente è sicura fin dal primo commit.

---

## 🚀 Quick Start

Ti invitiamo a leggere le documentazioni specifiche direttamente all'interno delle rispettive cartelle:
- 📖 [Documentazione Backend](backend/README.md)
- 📖 [Documentazione Frontend](frontend/README.md)

### Avvio Veloce in Locale

**Avvio Backend (.NET 9):**
```bash
cd backend
dotnet run
```
*Espone di default `/health`.*

**Avvio Frontend (Angular 19):**
```bash
cd frontend
npm install
npm run start
```
*Si connette automaticamente al backend sulla porta di default tramite proxy.*
