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

Il template include una pipeline di sicurezza pre-cablata. I progetti che derivano da Br1WebEngine la ereditano automaticamente — è sufficiente configurarla in `global-settings.json`.

### Backend

- **API Key** obbligatoria su tutti gli endpoint
- **JWT** opzionale: attivato solo se `Security.Token.SecretKey` è valorizzato; vuoto, nessun middleware viene caricato
- **CORS** con origini configurabili
- **Rate limiting**: 100 req/min globali per IP, 5 req/min sull'endpoint di login
- **Gestione errori strutturata**: le eccezioni escono come ProblemDetails RFC 9457, senza stack trace
- **Security headers** applicati anche dal backend quando esposto (`backend.public`): legge gli stessi `Security.Headers` del frontend e li applica a tutte le risposte, così l'esposizione diretta è sicura a prescindere dal reverse proxy. Salta `Content-Security-Policy` (serve solo JSON, su cui la CSP non ha effetto nel browser)

> Gli header di sicurezza rivolti al browser sono definiti **una sola volta** in `Security.Headers` di `global-settings.json` e condivisi dai due layer. Nel default il backend è interno alla rete Docker e parla solo col Node SSR, quindi è il frontend a proteggere il browser; ma se esponi il backend, anche lui applica gli stessi header.

### Frontend

- **Security headers** applicati dal Node SSR su ogni risposta (è il layer rivolto al browser), letti da `Security.Headers`: `X-Frame-Options`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` restrittiva e **CSP con nonce per-request** sull'HTML in produzione (il placeholder `{SCRIPT_NONCE_PLACEHOLDER}` viene sostituito a ogni richiesta)
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
