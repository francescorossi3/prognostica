# Prognostica – istruzioni per Claude

**Scopo della famiglia di repository:** infrastruttura per i ricercatori: correzione atmosferica di immagini satellitari, test di algoritmi (es. TES, separazione temperatura/emissività) sui siti di calibrazione, raccolta di dati e mappe (Columella per l'agricoltura).

Front end meteo: previsione accurata (modelli Open-Meteo verificati + GPR), schede in tre gruppi: Forecast / Maps / Accuracy (accuratezza modelli + affidabilità GPR) / Events · Atmosphere / Atmosphere RK (mappe di vapore, AOD e RT con il modello validato su AERONET/GNSS) · Data & method.
Contesto completo e storia: **CONTESTO.md** (leggerlo solo se serve).

## Mappa del codice
- `config.yaml` – provider, regioni (italia, radcalnet, hypernets), soglie eventi, `site.*` (atmos_url = Torricelli, goatcounter).
- `meteoita/` – libreria Python (providers, observations, verify, gp, regions, grid, events, storage).
- `scripts/00…09` – pipeline: stazioni → previsioni → osservazioni → verifica → GPR → mappe → sito → backtest → backfill → riuso mappe.
- `web/` – `index.html`, `app.js` (UI principale), `gp.js` (GPR nel browser), `atmos.js` (atmosfera, LUT 6S e libRadtran), `hires.js` (scheda Atmosphere RK: griglia, import di immagini, download con unità), `rkmap.js` (modello validato applicato ai pixel), `srf.js` (risposte spettrali dei sensori), `mapstyle.js` (pannelli Layers/Style come QGIS), `export.js` (download CSV di grafici/tabelle; mappe in GeoTIFF, PNG/JPEG, ASCII, ENVI), `vendor/` (librerie MIT/BSD, `LICENSES.md`), `i18n.js` (dizionario EN→IT: aggiungere lì ogni nuovo testo).
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
