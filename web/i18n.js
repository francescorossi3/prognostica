// Traduzione italiana dell'interfaccia (lingua principale: inglese).
// Si traducono i nodi di testo e gli attributi che corrispondono esattamente a una voce del dizionario
// (spazi normalizzati) o a una delle regole con espressioni regolari; il contenuto aggiunto dopo viene
// tradotto al volo (MutationObserver). La scelta resta memorizzata nel browser.
"use strict";

const I18N = (() => {
  const D = {
    // intestazione e schede
    "The most accurate forecast for any place: verified models combined by machine learning (GPR) with uncertainty, 10 m maps and the atmospheric parameters for satellite data correction":
      "La previsione più accurata per qualsiasi luogo: modelli verificati combinati con il machine learning (GPR) con incertezza, mappe a 10 m e parametri atmosferici per la correzione dei dati satellitari",
    "· from Cicero's": "· dai", ", his Latin version of the weather signs in Aratus'": " di Cicerone, la sua versione latina dei segni del tempo dei",
    "Phaenomena": "Fenomeni di Arato",
    "Region": "Regione", "Forecast": "Previsione", "Maps": "Mappe", "Model accuracy": "Accuratezza dei modelli", "Events": "Eventi",
    "GPR reliability": "Affidabilità GPR", "Data & method": "Dati e metodo",
    // previsione
    "Place": "Luogo", "Address, town, place name — or “41.90, 12.50”": "Indirizzo, comune, località — oppure “41.90, 12.50”",
    "Search": "Cerca", "◎ My location": "◎ La mia posizione", "Use my location": "Usa la mia posizione", "Calibration site": "Sito di calibrazione",
    "— choose —": "— scegli —", "Get forecast": "Calcola previsione", "Variable": "Variabile", "Aggregation": "Aggregazione",
    "Past days": "Giorni passati", "none": "nessuno", "3 days": "3 giorni", "7 days": "7 giorni", "14 days": "14 giorni", "30 days": "30 giorni",
    "Click on the map to choose the point.": "Clicca sulla mappa per scegliere il punto.",
    "Search an address, pick a site, or enter coordinates and press “Get forecast”.": "Cerca un indirizzo, scegli un sito o inserisci le coordinate e premi “Calcola previsione”.",
    "Downloading model forecasts…": "Scarico le previsioni dei modelli…", "Point": "Punto", "Region / time zone": "Regione / fuso orario",
    "Next period": "Prossimo periodo", "GPR estimate": "Stima GPR", "Best": "Migliore", "Weighted mean": "Media pesata", "Model mean": "Media dei modelli",
    "Period": "Periodo", "Lead": "Anticipo", "Observed": "Osservato", "past": "passato", "Model forecasts downloaded now from Open-Meteo; weights and GPR model from the latest verification.":
      "Previsioni dei modelli scaricate ora da Open-Meteo; pesi e modello GPR dall'ultima verifica.",
    "No place found: try adding the town or the country.": "Nessun luogo trovato: prova ad aggiungere il comune o il paese.",
    "coordinates (lat, lon)": "coordinate (lat, lon)", "My location": "La mia posizione",
    // variabili e periodi
    "Mean temperature": "Temperatura media", "Maximum temperature": "Temperatura massima", "Minimum temperature": "Temperatura minima",
    "Precipitation": "Precipitazione", "Hourly": "Oraria", "6-hourly": "6 ore", "Daily": "Giornaliera", "Today": "Oggi", "Tomorrow (+1 d)": "Domani (+1 g)",
    "Last 30 days": "Ultimi 30 giorni", "Last 90 days": "Ultimi 90 giorni", "Last 365 days": "Ultimi 365 giorni", "Whole record": "Intero archivio",
    "Last 14 days + combinations": "Ultimi 14 giorni + combinazioni", "Metric": "Metrica",
    "RMSE (root mean square error)": "RMSE (errore quadratico medio)", "MAE (mean absolute error)": "MAE (errore assoluto medio)",
    "Bias (forecast − observed)": "Bias (previsto − osservato)", "Correlation": "Correlazione", "R² (explained variance)": "R² (varianza spiegata)",
    "Error versus lead time": "Errore in funzione dell'anticipo", "Monthly trend": "Andamento mensile", "Provider": "Fornitore",
    "★ Best": "★ Migliore", "⚖ Weighted mean": "⚖ Media pesata", "⚖ Weighted": "⚖ Pesata",
    // eventi
    "Event": "Evento", "Lead time": "Anticipo", "Events caught (CSI) versus lead time": "Eventi colti (CSI) in funzione dell'anticipo",
    "Latest observed events": "Ultimi eventi osservati", "· green = event forecast, red = missed": "· verde = evento previsto, rosso = mancato",
    "heavy rain": "pioggia forte", "very heavy rain": "pioggia molto forte", "heat": "caldo", "frost": "gelo",
    // mappe
    "Layer": "Strato", "GPR error at stations": "Errore GPR alle stazioni",
    "Click on the map to see the value and open the detailed forecast.": "Clicca sulla mappa per vedere il valore e aprire la previsione dettagliata.",
    // atmosfera
    "Atmosphere at the point": "Atmosfera nel punto",
    "· water vapour, aerosols, radiation, profiles, air density and radiative-transfer parameters for atmospheric correction":
      "· vapore acqueo, aerosol, radiazione, profili, densità dell'aria e parametri di trasferimento radiativo per la correzione atmosferica",
    "Hour": "Ora", "Proposed: the next hour with the highest sun (close to the ~10:30 overpass of Sentinel-2 / Landsat).":
      "Proposta: la prossima ora con il sole più alto (vicina al passaggio delle ~10:30 di Sentinel-2 / Landsat).",
    "Surface and column": "Superficie e colonna", "Vertical profile": "Profilo verticale", "Pressure levels": "Livelli di pressione",
    "VNIR–SWIR radiative transfer, Sentinel-2 bands": "Trasferimento radiativo VNIR–SWIR, bande Sentinel-2",
    "· 6S, nadir view, continental aerosol": "· 6S, vista al nadir, aerosol continentale", "Next days": "Prossimi giorni",
    "Downloading atmospheric data…": "Scarico i dati atmosferici…", "Water vapour column": "Vapore acqueo in colonna",
    "Aerosol optical depth 550 nm": "Spessore ottico degli aerosol 550 nm", "Solar zenith angle": "Angolo zenitale solare",
    "Surface pressure": "Pressione al suolo", "Air temperature 2 m · dew point": "Temperatura dell'aria 2 m · punto di rugiada",
    "Air density at the surface": "Densità dell'aria al suolo", "Cloud cover": "Copertura nuvolosa", "Irradiance (hour mean)": "Irradianza (media oraria)",
    "TIR Landsat 8/9 B10 (10.9 µm)": "TIR Landsat 8/9 B10 (10,9 µm)", "Level [hPa]": "Livello [hPa]", "Height [m]": "Quota [m]",
    "Wind [km/h]": "Vento [km/h]", "Density [kg m⁻³]": "Densità [kg m⁻³]", "Sentinel-2 band [nm]": "Banda Sentinel-2 [nm]",
    "T↓ scattering": "T↓ diffusione", "T↑ scattering": "T↑ diffusione", "T gas": "T gas", "Total T (↓·↑·gas)": "T totale (↓·↑·gas)",
    "Path radiance [W m⁻² sr⁻¹ µm⁻¹]": "Radianza di percorso [W m⁻² sr⁻¹ µm⁻¹]", "E direct [W m⁻² µm⁻¹]": "E diretta [W m⁻² µm⁻¹]",
    "E diffuse": "E diffusa", "Spherical albedo": "Albedo sferico", "Height [km]": "Quota [km]",
    "Radiative-transfer table (6S) not available yet.": "Tabella di trasferimento radiativo (6S) non ancora disponibile.",
    "Sun below 10° elevation at this hour: VNIR-SWIR parameters not computed.": "Sole sotto i 10° di elevazione a quest'ora: parametri VNIR-SWIR non calcolati.",
    "Temperature [°C]": "Temperatura [°C]", "Relative humidity [%] /4": "Umidità relativa [%] /4", "Air density [kg m⁻³] ×20": "Densità dell'aria [kg m⁻³] ×20",
    "value (scaled as in legend)": "valore (scalato come in legenda)", "Water vapour column [kg m⁻² = mm]": "Vapore acqueo in colonna [kg m⁻² = mm]",
    "Global irradiance [W m⁻²] /100": "Irradianza globale [W m⁻²] /100",
    // mappa 10 m
    "10 m map around the point": "Mappa a 10 m intorno al punto", "· regression kriging on Copernicus covariates": "· regression kriging su covariate Copernicus",
    "Period / hour": "Periodo / ora", "Area": "Area", "Build 10 m map": "Crea mappa a 10 m", "Download CSV": "Scarica CSV",
    "The forecast is computed at 49 sample points around the place (with the GPR where available, otherwise the model mean), then interpolated to 10 m: a linear trend on Copernicus covariates (elevation, slope and northness from the EU-DEM/Copernicus DEM, imperviousness and tree-cover density HRL 2018) plus ordinary kriging of the residuals. Leave-one-out validation compares it with the trend alone and with plain kriging.":
      "La previsione è calcolata in 49 punti campione intorno al luogo (con la GPR dove disponibile, altrimenti media dei modelli) e poi interpolata a 10 m: trend lineare su covariate Copernicus (quota, pendenza ed esposizione nord dal DEM EU-DEM/Copernicus, impermeabilizzazione e densità della copertura arborea HRL 2018) più kriging ordinario dei residui. La validazione leave-one-out lo confronta con il solo trend e con il kriging semplice.",
    "Validation (leave-one-out)": "Validazione (leave-one-out)", "Model": "Modello",
    "Forecast variable shown above (GPR)": "Variabile di previsione mostrata sopra (GPR)", "Water vapour column [kg m⁻²]": "Vapore acqueo in colonna [kg m⁻²]",
    "Air temperature 2 m [°C]": "Temperatura dell'aria 2 m [°C]", "Air density [kg m⁻³]": "Densità dell'aria [kg m⁻³]",
    "Global irradiance [W m⁻²]": "Irradianza globale [W m⁻²]", "TIR L8/9 B10 transmittance": "TIR L8/9 B10 trasmittanza",
    "TIR L8/9 B10 upwelling radiance": "TIR L8/9 B10 radianza in salita", "TIR L8/9 B10 downwelling radiance": "TIR L8/9 B10 radianza in discesa",
    "Estimate (trend + kriged residual)": "Stima (trend + residuo krigato)", "Kriging standard deviation": "Deviazione standard del kriging",
    "Trend only": "Solo trend", "Covariate: imperviousness": "Covariata: impermeabilizzazione", "Covariate: elevation": "Covariata: quota",
    "◆ Regression kriging": "◆ Regression kriging", "Trend only (regression on Copernicus covariates)": "Solo trend (regressione su covariate Copernicus)",
    "Ordinary kriging only (no covariates)": "Solo kriging ordinario (senza covariate)", "RK 95% interval coverage": "Copertura dell'intervallo RK al 95%",
    "Target": "Variabile", "Residual variogram": "Variogramma dei residui", "Trend coefficients": "Coefficienti del trend",
    "(per 1 SD of the covariate)": "(per 1 DS della covariata)",
    "1/4 · downloading Copernicus covariates (DEM, imperviousness, tree cover)…": "1/4 · scarico le covariate Copernicus (DEM, impermeabilizzazione, copertura arborea)…",
    "3/4 · fitting trend + variogram, leave-one-out validation…": "3/4 · stima di trend e variogramma, validazione leave-one-out…",
    "4/4 · predicting on the 10 m grid…": "4/4 · previsione sulla griglia a 10 m…",
    // affidabilità GPR
    "Historical back-test": "Back-test storico", "Latest 14 days": "Ultimi 14 giorni",
    "Does the GPR really beat the individual providers? It is checked in two independent ways, always on data": "La GPR batte davvero i singoli fornitori? Lo si controlla in due modi indipendenti, sempre su dati",
    "never used for training": "mai usati per l'addestramento",
    "(weekly): the record is split into 14-day test blocks; for each block the GPR is trained only on the previous 45 days, and the “Best” provider and the weights are also chosen only from those days, exactly as it happens in real time. The table shows the error over all blocks and how often the GPR beat the Best provider.":
      "(settimanale): l'archivio è diviso in blocchi di prova di 14 giorni; per ogni blocco la GPR è addestrata solo sui 45 giorni precedenti, e anche il fornitore “Migliore” e i pesi sono scelti solo su quei giorni, esattamente come avviene in tempo reale. La tabella mostra l'errore su tutti i blocchi e quante volte la GPR ha battuto il Migliore.",
    "Latest days": "Ultimi giorni", "(daily): the same test on the most recent 14 days.": "(giornaliero): lo stesso test sui 14 giorni più recenti.",
    "If the uncertainty is correct, the observed value falls inside the 68% interval about 68 times out of 100 and inside the 95% interval about 95 times out of 100. Green cells: well-calibrated uncertainty; amber/red: use with care. “Best ex post” is the model that, in hindsight, did best on those days: a reference no method can know in advance.":
      "Se l'incertezza è corretta, il valore osservato cade nell'intervallo al 68% circa 68 volte su 100 e in quello al 95% circa 95 volte su 100. Celle verdi: incertezza ben calibrata; ambra/rosso: usare con cautela. “Migliore ex post” è il modello che, a posteriori, è andato meglio in quei giorni: un riferimento che nessun metodo può conoscere in anticipo.",
    // piè di pagina
    "Model forecasts:": "Previsioni dei modelli:", "(CC BY 4.0) · Observations:": "(CC BY 4.0) · Osservazioni:",
    "· Atmosphere: ECMWF IFS and CAMS via Open-Meteo, 6S · Covariates: Copernicus DEM / EU-DEM (Mapzen Terrarium tiles), EEA HRL 2018 (© European Union, Copernicus Land Monitoring Service) · Maps & geocoding: ©":
      "· Atmosfera: ECMWF IFS e CAMS tramite Open-Meteo, 6S · Covariate: Copernicus DEM / EU-DEM (tasselli Mapzen Terrarium), EEA HRL 2018 (© Unione Europea, Copernicus Land Monitoring Service) · Mappe e geocodifica: ©",
    "contributors, Photon (komoot), Nominatim · © 2026 Francesco Rossi · code: all rights reserved · data:": "e collaboratori, Photon (komoot), Nominatim · © 2026 Francesco Rossi · codice: tutti i diritti riservati · dati:",
    "· part of a family with": "· fa parte di una famiglia con", "(agriculture) and": "(agricoltura) e", "(atmosphere)": "(atmosfera)",
  };
  const R = [
    [/^\+(\d+) days$/, "+$1 giorni"], [/^\+(\d+)d$/, "+$1g"],
    [/^Verified up to (.+) · updated (.+) UTC$/, "Verificato fino al $1 · aggiornato $2 UTC"],
    [/^Done · (\d+) × (\d+) cells of 10 m · (\d+) sample points$/, "Fatto · $1 × $2 celle da 10 m · $3 punti campione"],
    [/^2\/4 · downloading the forecast at (\d+) sample points…$/, "2/4 · scarico la previsione in $1 punti campione…"],
    [/^(\d+) × (\d+) km \((.+)\)$/, "$1 × $2 km ($3)"],
    [/^Path radiance S2 (.+) nm$/, "Radianza di percorso S2 $1 nm"], [/^Total transmittance S2 (.+) nm$/, "Trasmittanza totale S2 $1 nm"],
    [/^Direct irradiance S2 (.+) nm$/, "Irradianza diretta S2 $1 nm"], [/^Diffuse irradiance S2 (.+) nm$/, "Irradianza diffusa S2 $1 nm"],
    [/^Observed – (.+)$/, "Osservato – $1"],
  ];
  let lang = "en";
  try { lang = localStorage.getItem("lang") || (navigator.language || "").slice(0, 2) === "it" && "it" || "en"; } catch { /* nessuna memoria */ }

  function t(x) {
    if (lang !== "it" || x == null) return x;
    const k = String(x).replace(/\s+/g, " ").trim();
    if (!k) return x;
    let y = D[k];
    if (y == null) for (const [re, rep] of R) if (re.test(k)) { y = k.replace(re, rep); break; }
    if (y == null) return x;
    const m = String(x).match(/^(\s*)[\s\S]*?(\s*)$/);
    return m[1] + y + m[2];
  }
  function node(n) {
    if (n.nodeType === 3) {
      if (n.parentNode && /^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) return;
      if (n._en == null) n._en = n.nodeValue;
      const v = lang === "it" ? t(n._en) : n._en;
      if (n.nodeValue !== v) n.nodeValue = v;
      return;
    }
    if (n.nodeType !== 1) return;
    for (const a of ["placeholder", "title"]) if (n.hasAttribute?.(a)) {
      const key = "_en_" + a; if (n[key] == null) n[key] = n.getAttribute(a);
      n.setAttribute(a, lang === "it" ? t(n[key]) : n[key]);
    }
    n.childNodes.forEach(node);
  }
  let busy = false;
  const obs = new MutationObserver(ms => {
    if (busy) return; busy = true;
    for (const m of ms) {
      if (m.type === "characterData") { if (m.target._en != null && m.target.nodeValue !== t(m.target._en)) m.target._en = m.target.nodeValue; node(m.target); }
      m.addedNodes.forEach(node);
    }
    busy = false;
  });
  function set(l) {
    lang = l;
    try { localStorage.setItem("lang", l); } catch { /* niente */ }
    document.documentElement.lang = l;
    document.querySelectorAll(".lang button").forEach(b => b.classList.toggle("on", b.id === "lang-" + l));
    busy = true; node(document.body); busy = false;
    if (typeof onLang === "function") onLang(l);
  }
  document.addEventListener("DOMContentLoaded", () => {
    $("#lang-en").onclick = () => set("en");
    $("#lang-it").onclick = () => set("it");
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    set(lang);
  });
  return { t, set, get lang() { return lang; } };
})();
