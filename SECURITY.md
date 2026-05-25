# Security Policy

## Segnalare una vulnerabilità

Se trovi una vulnerabilità di sicurezza in Br1WebEngine, **non aprire una issue pubblica**.

Scrivi a **br1brown@hotmail.it** con:
- Descrizione della vulnerabilità
- Passi per riprodurla (se applicabile)
- Impatto potenziale stimato
- Eventuale fix suggerito (opzionale)

La segnalazione verrà esaminata e, se confermata, sarà menzionata nelle note di rilascio (con credito, se desiderato).

---

## Funzionalità di sicurezza incluse nel template

Il template include una pipeline di sicurezza pre-cablata. I progetti che derivano da Br1WebEngine la ereditano automaticamente — è sufficiente configurarla in `appsettings.json`.

### Backend

- **API Key** obbligatoria su tutti gli endpoint
- **JWT** opzionale: attivato solo se `Security.Token.SecretKey` è valorizzato; vuoto, nessun middleware viene caricato
- **CORS** con origini configurabili
- **Rate limiting**: 100 req/min globali per IP, 5 req/min sull'endpoint di login
- **Security headers** iniettati prima della risposta, presenti anche sugli errori (X-Frame-Options, CSP, X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy)
- **Gestione errori strutturata**: le eccezioni escono come ProblemDetails RFC 9457, senza stack trace

### Frontend

- **XSS nel Markdown**: qualsiasi HTML raw nel sorgente viene ignorato dal renderer
- **Path traversal** bloccato nel serving dei file (`/api/blob/{slug}`)
- **JSON-LD**: i dati strutturati sono generati lato server da campi controllati — nessun input utente raggiunge il blocco `<script>`
- **Tag lingua BCP 47**: `availableLanguages` in `site.ts` è validato a build time con `Intl.getCanonicalLocales`; tag malformati causano un errore prima del deploy

---

## Checklist per il deploy in produzione

Prima di esporre un progetto derivato da questo template:

- Usa HTTPS (reverse proxy: Nginx, Caddy, Traefik o il proxy del provider)
- Imposta `Security.ApiKeys` con chiavi robuste — non usare quelle di esempio
- Imposta `Security.Token.SecretKey` con almeno 32 caratteri (altrimenti il server non si avvia); lascialo vuoto se non usi il login
- Abilita `Security.BehindProxy: true` se stai usando un reverse proxy (necessario per il rate limiting per IP reale)
- Configura `Security.CorsOrigins` con i domini del tuo frontend
- Aggiorna le dipendenze regolarmente: `npm audit`, `dotnet list package --outdated --vulnerable`

---

## Versioni supportate

| Versione | Supporto |
|---|---|
| Latest (`main`) | Sì |
| Versioni precedenti | Best effort |

---

## Dipendenze principali

- **Angular 19** — aggiornato regolarmente
- **ASP.NET Core 9** — supporto LTS
- **Bootstrap 5** — stabile

Le versioni esatte si trovano in `package.json` e nel file `.csproj` del backend.
