# Come funziona Prognostica

Prognostica è un sito statico pubblicato su GitHub Pages che fornisce una previsione meteo accurata per qualsiasi luogo.
Ogni modello Open-Meteo viene verificato sulle osservazioni delle stazioni. I modelli vengono poi combinati con una
regressione a processi gaussiani (GPR), che restituisce anche l'incertezza della previsione.
Il back end in Python gira su GitHub Actions; il front end in JavaScript esegue nel browser i calcoli rimanenti.

*Versione inglese: [HOW_IT_WORKS.md](HOW_IT_WORKS.md)*

## 1. Flusso dei dati

```mermaid
flowchart LR
  subgraph Fonti
    OM[Open-Meteo<br>Previous Runs API]
    MS[Meteostat<br>osservazioni delle stazioni]
    OMlive[Open-Meteo forecast<br>e air quality API]
    GEO[Photon / Nominatim<br>ricerca luoghi]
  end
  subgraph "Back end (Python, GitHub Actions)"
    S[script 00-09<br>+ meteoita/]
    D[(data/<br>parquet + CSV)]
  end
  subgraph "Front end (browser)"
    W[web/*.js]
  end
  T[Torricelli<br>LUT 6S, archivio atmosferico]
  C[Census<br>statistiche d'uso]
  OM --> S
  MS --> S
  S <--> D
  S -->|build/site: JSON, modelli GPR, mappe| W
  OMlive --> W
  GEO --> W
  T -->|file LUT| W
  W -->|eventi GoatCounter| C
```

## 2. Script della pipeline 00-09

```mermaid
flowchart TD
  s00[00_setup_stations<br>scelta stazioni] --> s01[01_fetch_forecasts<br>previsioni dei modelli alle stazioni]
  s01 --> s02[02_fetch_observations<br>dati orari Meteostat]
  s02 --> s03[03_verify<br>coppie, classifiche, migliore, pesi, eventi]
  s03 --> s04[04_train_gpr<br>GPR per variabile x aggregazione x lead day]
  s04 --> s07[07_backtest_gpr<br>backtest storico, al massimo settimanale]
  s07 --> s05[05_build_maps<br>mappe su griglia: migliore, media pesata, GPR, incertezza]
  s05 --> s06[06_build_site<br>assembla build/site]
  s08[08_backfill_window<br>prossimo blocco di storico] -.-> s01
  s09[09_reuse_published_maps<br>copia le mappe dal sito online] -.->|site_only| s06
```

## 3. Schede e file JavaScript

```mermaid
flowchart LR
  idx[index.html] --> app[app.js<br>interfaccia principale]
  app --> F[Forecast]
  app --> M[Maps]
  app --> R[Accuracy<br>modelli + affidabilità GPR]
  app --> E[Events]
  app --> DM[Data & method]
  atm[atmos.js] --> A[Atmosphere]
  hr[hires.js] --> H[Atmosphere RK<br>regression kriging 10 m]
  gp[gp.js<br>predizione GPR] --> F
  gp --> M
  gp --> H
  i18n[i18n.js<br>dizionario EN-IT] --> app
  ms[mapstyle.js<br>pannelli Layer e Stile] --> M
  ms --> H
  ex[export.js<br>download CSV e GeoTIFF] --> app
```

Le schede sono in tre gruppi: previsione e sua verifica (Forecast, Maps, Accuracy, Events), atmosfera (Atmosphere, Atmosphere RK) e Data & method.

| Scheda | Cosa mostra | File |
|---|---|---|
| Forecast | Previsione GPR con incertezza e singoli modelli per il luogo scelto nella barra di ricerca (grafico e tabella scorrevoli) | `app.js`, `gp.js` |
| Atmosphere | Riepilogo dell'ora, grafici (profilo verticale, prossimi giorni, spettro 6S con spiegazioni al passaggio del mouse), scelta del modello di trasferimento radiativo, equazioni della radianza al sensore per VNIR–SWIR e LWIR | `atmos.js` |
| Atmosphere RK | Mappa a 10 m con regression kriging, barra di avanzamento, punti di validazione leave-one-out sulla mappa, pannelli Layer e Stile, download GeoTIFF/CSV | `hires.js`, `mapstyle.js`, `gp.js` |
| Maps | Mappe regionali: migliore, media pesata, GPR, incertezza, probabilità di pioggia; pannelli Layer e Stile | `app.js`, `mapstyle.js` |
| Accuracy | Errore di ogni modello per anticipo e andamento mensile; holdout e backtest storico del GPR | `app.js` |
| Events | Rilevamento di eventi di pioggia e temperatura (CSI) | `app.js` |
| Data & method | Download, metodo, crediti | `app.js` |

## 4. Collegamenti con Torricelli e Census

```mermaid
flowchart LR
  P[Prognostica<br>front end, pubblico]
  Co[Columella<br>agricoltura, pubblico]
  T[Torricelli<br>back end atmosfera, pubblico]
  C[Census<br>monitoraggio d'uso, privato]
  T -->|LUT 6S e archivio orario<br>site.atmos_url| P
  T --> Co
  P -->|eventi GoatCounter<br>site.goatcounter| C
  Co --> C
```

- **Torricelli** (`config.yaml → site.atmos_url`): `atmos.js` legge le tabelle 6S da Torricelli e, se non sono disponibili, usa la copia locale in `web/data/`.
- **Dati atmosferici di partenza**: ECMWF IFS 0,25° (~25 km: vapore acqueo, pressione, temperatura) e CAMS globale 0,4° (~45 km: AOD 550 nm) da Open-Meteo, valore della cella di griglia di ogni punto. La tabella 6S viene interpolata in vapore acqueo, AOD, angolo zenitale solare e quota del suolo.
- **Census** (`config.yaml → site.goatcounter`): `app.js` invia eventi anonimi senza cookie a GoatCounter, con prefisso `prognostica/`. Census li legge.

## 5. Workflow e orari (UTC)

```mermaid
gantt
  dateFormat HH:mm
  axisFormat %H:%M
  title Orari giornalieri (UTC)
  section daily.yml
  Aggiornamento giornaliero :06:17, 40m
  Riserva (solo se il mattino è fallito) :10:37, 40m
  section backfill_auto.yml
  Blocco di storico + backtest :13:43, 40m
```

| Workflow | Quando | Cosa fa |
|---|---|---|
| `daily.yml` | 06:17 UTC (riserva alle 10:37), cioè 07:17 o 08:17 ora italiana | Script 00 (solo al primo avvio), 01, 02, 03, 04, 07, 05, 06; salva i dati e pubblica il sito |
| `backfill_auto.yml` | 13:43 UTC | Ricostruisce un blocco di storico più vecchio (08 → 01 → 02 → 03) ed esegue il backtest 07 |
| `backfill.yml` | manuale, con date di inizio e fine | Ricostruisce un periodo di storico a scelta |
| `site_only.yml` | manuale | Ripubblica il sito senza chiamare le API meteo (03, 04, 07, 09, 06) |

## 6. File → cosa fa

| File | Cosa fa |
|---|---|
| `config.yaml` | Provider, regioni (Italia, RadCalNet, HYPERNETS), griglie, soglie degli eventi, impostazioni del sito |
| `scripts/00_setup_stations.py` | Sceglie stazioni Meteostat ben distribuite → `data/stations.csv` |
| `scripts/01_fetch_forecasts.py` | Scarica le previsioni dei modelli su stazioni e siti → `data/forecasts/` |
| `scripts/02_fetch_observations.py` | Scarica le osservazioni orarie → `data/observations/` |
| `scripts/03_verify.py` | Coppie previsione/osservazione, classifiche, migliore e pesi, eventi → `data/stats/`, `data/csv/`, JSON del sito |
| `scripts/04_train_gpr.py` | Addestra e valida i modelli GPR e li esporta in JSON per il browser |
| `scripts/05_build_maps.py` | Mappe di previsione su griglia regolare per ogni regione |
| `scripts/06_build_site.py` | Assembla `build/site` (file web, dati, `meta.json`, osservazioni recenti) |
| `scripts/07_backtest_gpr.py` | Backtest storico a finestre mobili del GPR, confrontato con modelli e combinazioni |
| `scripts/08_backfill_window.py` | Sceglie il prossimo blocco di storico da ricostruire (`data/backfill_state.json`) |
| `scripts/09_reuse_published_maps.py` | Copia le mappe dal sito online, senza chiamate alle API |
| `scripts/demo_generate.py` | Genera dati sintetici per provare tutta la catena senza connessione |
| `meteoita/config.py` | Legge `config.yaml` e definisce i percorsi comuni |
| `meteoita/providers.py` | Scarica le previsioni da Open-Meteo e dai provider opzionali |
| `meteoita/observations.py` | Stazioni e osservazioni Meteostat |
| `meteoita/verify.py` | Accoppiamento, aggregazione (1 h / 6 h / 24 h), punteggi |
| `meteoita/gp.py` | GPR: matrice di progetto, addestramento, export JSON, predizione |
| `meteoita/regions.py` | Regioni e siti puntuali |
| `meteoita/grid.py` | Griglie regolari per le mappe |
| `meteoita/events.py` | Rilevamento degli eventi e punteggi (POD, FAR, CSI) |
| `meteoita/storage.py` | Lettura e scrittura dei file parquet |
| `meteoita/demo.py` | Generatore di dati sintetici |
| `web/index.html` | Struttura della pagina e schede |
| `web/style.css` | Layout e stili |
| `web/app.js` | Interfaccia principale: Forecast, Maps, accuratezza, eventi, GPR, dati |
| `web/gp.js` | Predizione GPR nel browser (stessi risultati di Python) |
| `web/atmos.js` | Scheda Atmosphere e trasferimento radiativo 6S |
| `web/hires.js` | Atmosphere RK: regression kriging a 10 m (valori in 49–121 punti campione da Open-Meteo + 6S, trend sulla sola quota, kriging dei residui, validazione leave-one-out) ed export GeoTIFF |
| `web/mapstyle.js` | Simbologia delle mappe come in QGIS: pannello Layer (mostra/nascondi, ordine) e pannello Stile (scala di colori, min/max, classi, opacità, istogramma, legenda) |
| `web/export.js` | Download in tutte le schede: grafici e tabelle in CSV, mappe in GeoTIFF Float32 (EPSG:4326) |
| `web/i18n.js` | Dizionario inglese → italiano |
| `tests/test_gp_consistency.py` | Controlla che sklearn, `meteoita.gp` e `web/gp.js` diano la stessa predizione GPR |

Aggiornare questo file e `HOW_IT_WORKS.md` quando cambia il funzionamento del progetto.
