# Prognostica – istruzioni per Claude

Front end meteo: previsione accurata (modelli Open-Meteo verificati + GPR), schede in tre gruppi: Forecast / Maps / Accuracy (accuratezza modelli + affidabilità GPR) / Events · Atmosphere / Atmosphere RK (regression kriging 10 m) · Data & method.
Contesto completo e storia: **CONTESTO.md** (leggerlo solo se serve).

## Mappa del codice
- `config.yaml` – provider, regioni (italia, radcalnet, hypernets), soglie eventi, `site.*` (atmos_url = Torricelli, goatcounter).
- `meteoita/` – libreria Python (providers, observations, verify, gp, regions, grid, events, storage).
- `scripts/00…09` – pipeline: stazioni → previsioni → osservazioni → verifica → GPR → mappe → sito → backtest → backfill → riuso mappe.
- `web/` – `index.html`, `app.js` (UI principale), `gp.js` (GPR nel browser), `atmos.js` (atmosfera, LUT 6S), `hires.js` (regression kriging 10 m, GeoTIFF), `mapstyle.js` (pannelli Layers/Style come QGIS), `i18n.js` (dizionario EN→IT: aggiungere lì ogni nuovo testo).
- `.github/workflows/` – `daily.yml` (06:17 UTC), `site_only.yml` (ripubblica senza API), `backfill*.yml`.
- Dati: `data/csv/` (CSV/Excel in inglese), parquet in `data/`.

## Regole comuni (famiglia Prognostica · Columella · Torricelli · Census)
- Proprietario: Francesco Rossi (CNR-IMIOT). Rispondere in italiano.
- Python (back end): script **lineari stile Spyder**, poche funzioni, **niente `main()` / `if __name__`**; file numerati `NN_nome.py`.
- JavaScript (front end): sito statico GitHub Pages, calcolo nel browser, niente build step.
- Lingua dei siti: **inglese** principale + traduzione italiana (pulsante EN/IT). Nomi di file/CSV in inglese.
- Licenza: codice tutti i diritti riservati, dati CC BY-NC 4.0 (`LICENSE`). Non aggiungere dipendenze con licenze copyleft senza chiedere.
- Mai mettere chiavi/token nel codice: solo GitHub Secrets. Open-Meteo gratuito = uso non commerciale.
- Commit piccoli e descrittivi in italiano; dopo modifiche al sito lanciare il workflow di pubblicazione.
- Non aprire file sul PC di Francesco senza permesso; niente controllo di mouse/schermo.
- Risparmio token: leggere solo i file necessari (usare grep), non rileggere file appena modificati, risposte brevi.

## Qualità del codice e documentazione
- Niente codice superfluo (morto, duplicato, commentato).
- Intestazione in ogni file: cosa fa, input, output.
- Aggiornare `docs/` (HOW_IT_WORKS.md, COME_FUNZIONA.md) quando cambia il funzionamento.
