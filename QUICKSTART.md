# ⚡ Quickstart

Zero teoria: i comandi per avere un progetto in piedi. Per il *perché* delle cose, la mappa completa è in [README.md](README.md).

## 1. Battezza il progetto

```bash
node setup.mjs "Nome Progetto"
```

Risponde `[s/N]`: `N` tiene la demo (comoda per esplorare), `s` parte puliti (*eject*). Se non sai cosa scegliere, `N`.

## 2. Modifica questi 4 file

| File | Cosa ci metti |
| :--- | :--- |
| `global-settings.json` | Nome, lingue, colore tema |
| `global-settings.local.json` | Porte e segreti (già generato da `setup.mjs`); valorizza `Security.Token.SecretKey` (≥32 char) solo se vuoi accendere il login |
| `frontend/src/app/site.ts` | Le tue pagine, il menu, le rotte |
| `backend/data/identity.json` | Dati legali e social del sito (servito su `GET /identity`) |

## 3. Su

```bash
./deploy.sh
```

*(valida la configurazione e fa lui `docker compose up` con gli health check — se preferisci farlo a mano, `docker compose up --build -d` funziona uguale una volta che `global-settings.local.json` esiste.)*

## Fatto

Frontend su `http://localhost:3000` (o la porta scelta in `global-settings.local.json`).

Da qui in poi, il primo task guidato passo-passo (non il README intero):
- Frontend → [Developer Journey: Aggiungere una Pagina](frontend/README.md#developer-journey-aggiungere-una-pagina)
- Backend → [Developer Journey: Aggiungere un Endpoint](backend/README.md#developer-journey-aggiungere-un-endpoint)

Riferimento completo quando serve: [frontend/README.md](frontend/README.md), [backend/README.md](backend/README.md), [DOCKER_README.md](DOCKER_README.md) per deploy e configurazione approfondita.
