# Prognostica (ex Meteo Accuracy) – contesto per riprendere il lavoro (anche in una nuova chat)

> Da incollare all'inizio di una nuova conversazione con Claude, oppure chiedergli:
> «aggiungi i repository `francescorossi3/prognostica` e `francescorossi3/torricelli` e leggi `CONTESTO.md`».
> Ultimo aggiornamento di questo file: 16/11/2026.

## Famiglia di progetti (nomi dalla letteratura latina/italiana)
| Repository | Ruolo | Linguaggio | Visibilità | Sito |
|---|---|---|---|---|
| **prognostica** (ex meteo-accuracy) | front end meteo: previsione accurata, mappe 10 m, atmosfera nel punto | JS (sito) + Python (pipeline verifica) | pubblico | https://francescorossi3.github.io/prognostica/ |
| **columella** (ex campi-aperti) | front end agricoltura | JS | pubblico | https://francescorossi3.github.io/columella/ |
| **torricelli** | back end atmosferico: LUT 6S, database orario per correzione atmosferica | Python | pubblico | https://francescorossi3.github.io/torricelli/ |
| **census** | back end privato: statistiche d'uso (GoatCounter → CSV + REPORT.md) | Python | **privato** | – |

Comunicazione: Torricelli legge da Prognostica `data/stations.csv` e `config.yaml` (siti di calibrazione); Prognostica legge da Torricelli
`data/rt/lut_s2.json` (con copia locale di riserva in `web/data/rt/`); i siti mandano eventi anonimi a GoatCounter (`site.goatcounter`
in config.yaml, vuoto = spento) che Census scarica ogni notte. Significato dei nomi nei README.
Lingua: **inglese principale** con traduzione italiana (pulsante EN/IT; `web/i18n.js` in Prognostica traduce per dizionario + regex).
Licenza: © 2026 Francesco Rossi, **codice tutti i diritti riservati, dati CC BY-NC 4.0** (`LICENSE`).

## Dove sta tutto
- **Repository**: https://github.com/francescorossi3/prognostica (pubblico; l'app GitHub di Claude è installata e può fare push).
- **Sito**: https://francescorossi3.github.io/prognostica/ (GitHub Pages, inglese + italiano).
- **Copia locale**: `C:\Users\franc\Desktop\meteo-accuracy` (può essere indietro: fa fede GitHub; `git remote set-url origin https://github.com/francescorossi3/prognostica` e `git pull`).
- Proprietario: Francesco (CNR-IMIOT). Script Python in stile lineare, adatti a Spyder (niente `main()`).

## Schede del sito (16/11/2026 sera)
Forecast · **Atmosphere** (superficie, profili, spettri 6S 400–2500 nm ogni 10 nm da `lut_hyper.json` o bande S2, CSV dello spettro) ·
**10 m map** (regression kriging; variabili: previsione GPR, grandezze atmosferiche, grandezze spettrali a una lunghezza d'onda scelta;
area 2/5/10/30 km, celle 10/20/30 m, punti campione 7×7…11×11, DEM Terrarium z14 fino a 10 km poi z13; GeoTIFF Float32 EPSG:4326; CSV fino a 1,5 M celle;
30×30 km a 10 m = 9 M celle, circa 1 minuto nel browser) · Maps · Model accuracy · Events · GPR reliability · Data & method.
CSV/Excel con nomi inglesi: `rankings.csv`, `rankings_holdout.csv`, `best_and_weights.csv`, `gpr_validation.csv`, `gpr_backtest(_summary).csv`,
`monthly_trend.csv`, `event_scores.csv`, `event_list.csv`, `daily_pairs/`, `stations.csv`, `summary.xlsx`.
LUT iperspettrale: workflow Torricelli «Tabella RT 6S» con `hyper` (6 macchine in parallelo, ~1 h; `scripts/01b_merge_lut.py` unisce le parti).

## Piano per la prossima chat (dal 18/11/2026)
Scopo del regression kriging: interpolare e aumentare la risoluzione spaziale di vapore e AOD (non "correggere" il modello).
1. **ERA5 + IFS + CAMS insieme (Torricelli 05, 07; Prognostica rkmap.js, atmos.js)**: in 05 aggiungere ERA5 (Open-Meteo archive: tcwv, t2m, rh, ps) ai siti;
   in 07 covariate di tutti i modelli (IFS NaN prima del 3/2/2024: HGB gestisce i mancanti), residuo (misura − modello) rispetto a ERA5 (IFS se ERA5 non c'è ancora, ultimi ~5 giorni);
   due validazioni: con tutti i modelli e con IFS tolto. Nel browser scaricare ERA5 e, se la data lo permette, IFS.
2. **Più GNSS (04b)**: stazioni NGL una ogni 0,5° su tutta l'area (non solo Italia a 1°).
3. **AERONET MAN** (navi) per l'AOD sul mare.
4. Poi, con account Copernicus CDS/ADS (chiave nei GitHub Secrets): profili ERA5 per la scheda Atmosphere, CAMS EAC4 per l'AOD prima del 2022,
   libRadtran con il profilo ERA5 del punto invece delle atmosfere AFGL; MAIAC (NASA Earthdata) come covariata dell'AOD.
5. Possibili assi in più nelle LUT: angolo di vista (PRISMA/EnMAP fino a 30°), tipo di aerosol (da polveri CAMS).
Vincoli: limite di richieste Open-Meteo (05 salva il parziale e riprende), file CSV < 100 MB (validazione divisa per mese), date solo passate.

## Novità 18/11/2026
- **Atmosphere RK** riscritta: un solo metodo. Per una data e un'ora passate, vapore (ECMWF IFS) e AOD (CAMS) interpolati ad alta risoluzione con regression kriging (trend gradient boosting)
  addestrato da Torricelli su misure orarie AERONET e GNSS con covariate che esistono per ogni pixel (modello, terreno a 500/2000 m, posizione, ora):
  niente Sentinel-2, niente trend sulla quota, niente random forest. Validazione per celle di 0,5°: vapore RMSE 2,30 → 1,98 kg m⁻², AOD 0,078 → 0,072.
- Grandezze RT nella banda di qualsiasi sensore (`web/srf.js`): libreria Torricelli `srf.json` (curve misurate da Py6S, gaussiane LWIR),
  lunghezze d'onda dai metadati dell'immagine importata (ENVI, GeoTIFF/GDAL), SRF personalizzate; export con unità e fattore di scala.
- 6S o libRadtran a scelta (LWIR solo con libRadtran; con 6S la parte termica è ingrigita). Sito leggibile su telefono e tablet.

## Novità 16/11/2026
- Scheda **Forecast** prima: ricerca luoghi con suggerimenti (Photon, distorsione verso il centro mappa, frecce/Invio), coordinate “lat, lon”,
  posizione del dispositivo, Nominatim di riserva.
- **Atmosfera nel punto** (`web/atmos.js`): TCWV, AOD/polveri CAMS, radiazione, profili 1000–200 hPa, densità ρ=p/(Rd·Tv), RT 6S bande S2
  (interpolazione 4D della LUT), TIR L8/9 B10 (Jiménez-Muñoz 2014: τ=1/ψ1, Ld=ψ3, Lu=−(ψ2+ψ3)/ψ1).
- **Mappa 10 m con regression kriging** (`web/hires.js`): 49 punti campione (7×7) su riquadro 2/5/10 km (+10% margine), valore = GPR (o media
  modelli) o grandezza atmosferica; covariate DEM Terrarium z14 (quota, pendenza, northness), EEA HRL 2018 imperviousness e tree cover
  (ImageServer exportImage TIFF non compresso, lettore TIFF interno); trend OLS standardizzato + kriging ordinario dei residui (variogramma
  esponenziale, minimi quadrati pesati); deviazione standard del kriging; LOOCV RK vs solo trend vs solo OK (RMSE, MAE, bias, R², copertura 95%); CSV.
- Regione **HYPERNETS** (solo archivio, come RadCalNet): GHNA, DEGE, JAES, LOBE (coordinate da Frontiers 2024), WWUK, PEAN, IFAR, AAOT, ZEBE (approssimate “~”).

## Cosa fa
- Confronta l'accuratezza dei provider di previsioni per **temperatura** (media, max, min) e **pioggia**,
  aggregazione **oraria / 6 ore / giornaliera** (ora locale), anticipo **0–7 giorni**.
- **Provider**:
  - modelli Open-Meteo: ItaliaMeteo ICON-2I (3 giorni), ECMWF IFS 0.25°, ECMWF AIFS, DWD ICON-EU (5 giorni),
    ICON Global, NOAA GFS, ARPEGE Europe (4 giorni), UKMO 10 km, GEM;
  - KNMI Harmonie è disattivato perché la Previous Runs API risponde 400;
  - MET Norway, archiviato ogni giorno ("snapshot");
  - OpenWeatherMap, WeatherAPI, Tomorrow.io e Visual Crossing sono predisposti ma attivi solo con le chiavi
    API nei Secrets (oggi non ci sono).
- **Osservazioni**: circa 60 stazioni sinottiche italiane da Meteostat, scelte automaticamente e ben distribuite
  (alcune in montagna).
- **Metriche**:
  - bias, MAE, RMSE, correlazione, **R²**;
  - per la pioggia anche POD, FAR, CSI, ETS e frequency bias a tre soglie;
  - **eventi significativi**: pioggia ≥20 e ≥50 mm/giorno, Tmax ≥35 °C, Tmin ≤0 °C.
- **Stime combinate**:
  - ★ **Best**: il provider con l'errore più basso negli ultimi 90 giorni per variabile, aggregazione e anticipo;
    se in un punto manca, si usa il successivo;
  - ⚖ **Weighted mean**: pesi proporzionali a 1/MSE;
  - ◆ **GPR**: un modello per variabile × aggregazione × anticipo. Kernel `C·RBF(ARD) + DotProduct + White`;
    feature: posizione sulla sfera (x, y, z), quota e previsioni dei modelli; pioggia in radice quadrata.
    Esportato in JSON e calcolato anche nel browser (`web/gp.js`, identico a `meteoita/gp.py`, testato).
- **Validazione del GPR** (scheda "GPR reliability"):
  1. ogni giorno, sugli ultimi 14 giorni esclusi dall'addestramento: RMSE, MAE, **R²**, bias, CRPS e copertura
     degli intervalli 68% e 95%;
  2. ogni settimana, **backtest storico** (`07_backtest_gpr.py`): blocchi di 14 giorni, addestramento sui 45
     precedenti, Best e pesi scelti anch'essi ex-ante. Confronto con Best ex-ante, Weighted e "best ex-post";
     RMSE, **R²**, percentuale di blocchi vinti dal GPR, copertura.
     Serve uno storico ≥ 59 giorni: il primo risultato vero arriva pochi giorni dopo il 14/11/2026.
- **Regioni** (`config.yaml → regions`):
  - `italia`: verificata, mappe su griglia di 0,35° (276 punti);
  - `radcalnet`: Railroad Valley RVUS, Gobabeb GONA, La Crau LCFR, Baotou BSCN/BTCN, con `verify: false`.
    Sul sito solo i dati dei modelli (media e dispersione). Previsioni orarie di ogni modello archiviate in
    `data/csv/radcalnet/AAAA-MM.csv` per il confronto futuro con le misure dei siti;
  - `mondo`: pronta ma `enabled: false` (troppe chiamate per il piano gratuito Open-Meteo, ~10.000 al giorno).
- **Classifiche**: oltre ai provider includono ★ Best, ⚖ Weighted e ◆ GPR, sempre **fuori campione**
  (holdout giornaliero + blocchi del backtest salvati nello storico `daily_stats`; il GPR è su un campione di righe).
- **Sito**: Rankings, Events, Maps (best / weighted / GPR / incertezza / probabilità di pioggia / singoli modelli),
  Point forecast (ricerca **indirizzo** con OpenStreetMap Nominatim, click, lat/lon, siti RadCalNet;
  selettore **Past days** 0–30: valori recenti dei modelli + GPR a 0 giorni per il passato e **osservazioni della stazione
  più vicina** entro 25 km da `data/obs_recent.json`, ultimi 35 giorni, generato da `06_build_site.py`),
  GPR reliability, Data & method.

## Struttura del codice
```
config.yaml                 tutto configurabile (provider, regioni, eventi, soglie, GPR, backfill)
meteoita/                   config, storage (parquet Int16 x10), providers, observations, verify (metriche, R²),
                            gp, regions, grid, events, demo (dati sintetici)
scripts/00_setup_stations   01_fetch_forecasts   02_fetch_observations   03_verify   04_train_gpr
        05_build_maps       06_build_site        07_backtest_gpr         08_backfill_window
        09_reuse_published_maps   demo_generate
web/                        index.html, app.js, gp.js, style.css, vendor (Leaflet, Chart.js)
data/                       forecasts/, observations/, stats/daily_stats.parquet, csv/ (CSV + summary.xlsx)
tests/test_gp_consistency   sklearn = export JSON = gp.js
```
I nomi dei CSV sono in inglese (rinominati il 16/11/2026): `rankings.csv`, `rankings_holdout.csv`, `best_and_weights.csv`,
`gpr_validation.csv`, `gpr_backtest(_summary).csv`, `monthly_trend.csv`, `event_*.csv`,
`daily_pairs/`, `radcalnet/`, `stations.csv`.

## Automazione (GitHub Actions, nessun intervento necessario)
- `daily.yml`, 06:17 UTC, con **avvio di riserva alle 10:37 UTC** che parte solo se quello del mattino non ha
  aggiornato i dati. Fa: dati → verifica → GPR → backtest (se l'ultimo ha più di 7 giorni) → mappe → sito → commit → Pages.
- `backfill_auto.yml`, 13:43 UTC: aggiunge 20 giorni di storico più vecchio al giorno, fino a `backfill.start`
  (2025-06-01); stato in `data/backfill_state.json`.
- `backfill.yml`: backfill manuale su un intervallo a scelta.
- `site_only.yml` "Ricostruisci sito (senza API)": rigenera classifiche, GPR, backtest e pagine dai dati del
  repository, riusando le mappe già pubblicate (`09_reuse_published_maps.py`): **zero chiamate alle API meteo**.
- I workflow condividono `concurrency: data-writes`, quindi non scrivono mai i dati in contemporanea.

## Storia e note
- 13/11/2026: creato il progetto, primo run reale riuscito. Lo storico parte dal 21/10/2026 e cresce ogni giorno.
- 14/11/2026: il cron del mattino è partito in ritardo e l'ho lanciato a mano. Aggiunti l'avvio di riserva e l'R².
- Vincoli: Open-Meteo gratuito solo per uso non commerciale. Con un piano a pagamento la chiave va nel Secret
  `OPENMETEO_API_KEY` e il codice usa da solo gli endpoint `customer-`.
- Limiti noti: stazioni quasi tutte in pianura o costa; RadCalNet non verificato (mancano le misure dei siti).

## Possibili sviluppi
- Aggiungere le misure meteo dei siti RadCalNet come osservazioni e mettere `verify: true`.
- Aggiungere le stazioni delle reti ARPA regionali (più stazioni e montagna).
- Attivare la regione `mondo` o una regione `europa` (meglio con la chiave Open-Meteo).
- Aggiungere le chiavi API dei servizi commerciali per includerli nelle classifiche.
