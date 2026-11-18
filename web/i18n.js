// Traduzione italiana dell'interfaccia (lingua principale: inglese).
// Si traducono i nodi di testo e gli attributi che corrispondono esattamente a una voce del dizionario
// (spazi normalizzati) o a una delle regole con espressioni regolari; il contenuto aggiunto dopo viene
// tradotto al volo (MutationObserver). La scelta resta memorizzata nel browser.
// Input:  testi della pagina (index.html e contenuto generato da app.js, atmos.js, hires.js), pulsante EN/IT.
// Output: testi tradotti nel DOM, oggetto globale I18N (t, set, lang); chiama onLang() di app.js al cambio lingua.
"use strict";

const I18N = (() => {
  const D = {
    "Sentinel-2 + gradient boosting (validated on AERONET / GNSS, past dates)": "Sentinel-2 + gradient boosting (validato su AERONET / GNSS, date passate)",
    "Elevation trend + kriging of model values": "Trend sulla quota + kriging dei valori del modello", "Date": "Data", "Find Sentinel-2 images": "Cerca immagini Sentinel-2",
    "Image": "Immagine", "Build map": "Crea mappa", "Searching Sentinel-2 images…": "Cerco immagini Sentinel-2…", "No Sentinel-2 image within ±5 days": "Nessuna immagine Sentinel-2 entro ±5 giorni",
    "Corrected (Sentinel-2 + gradient boosting)": "Corretto (Sentinel-2 + gradient boosting)", "Model only (ECMWF / CAMS)": "Solo modello (ECMWF / CAMS)",
    "Correction (corrected − model)": "Correzione (corretto − modello)", "find and choose a Sentinel-2 image first": "prima cerca e scegli un'immagine Sentinel-2",
    "Download": "Scarica", "Selected layer, same pixels and coordinate system as the grid": "Layer selezionato, stessi pixel e sistema di riferimento della griglia",
    "GeoTIFF (Float32, values)": "GeoTIFF (Float32, valori)", "PNG as shown + world file": "PNG come mostrato + world file", "JPEG as shown + world file": "JPEG come mostrato + world file",
    "ESRI ASCII grid (.asc)": "Griglia ASCII ESRI (.asc)", "ENVI (.img + .hdr)": "ENVI (.img + .hdr)", "CSV (lon, lat, value)": "CSV (lon, lat, valore)",
    "Use the grid of an image": "Usa la griglia di un'immagine", "GeoTIFF / COG, or ENVI .hdr together with its .img": "GeoTIFF / COG, oppure ENVI .hdr insieme al suo .img",
    "Back to the square grid": "Torna alla griglia quadrata",
    "The map will have exactly the extent, pixels and coordinate system of the image, so the values can be used pixel by pixel.": "La mappa avrà esattamente estensione, pixel e sistema di riferimento dell'immagine, così i valori si usano pixel per pixel.",
    "CSV is limited to 1.5 million pixels: choose GeoTIFF, ENVI or ASCII grid.": "Il CSV è limitato a 1,5 milioni di pixel: scegli GeoTIFF, ENVI o griglia ASCII.",
    "Radiative transfer model": "Modello di trasferimento radiativo", "6S · VNIR–SWIR only": "6S · solo VNIR–SWIR",
    "libRadtran · VNIR–SWIR and LWIR (tables in preparation)": "libRadtran · VNIR–SWIR e LWIR (tabelle in preparazione)",
    "libRadtran · VNIR–SWIR and LWIR": "libRadtran · VNIR–SWIR e LWIR", "With 6S the thermal (LWIR) part is greyed out.": "Con 6S la parte termica (LWIR) è ingrigita.",
    "Thermal (LWIR)": "Termico (LWIR)", "not covered by 6S: choose libRadtran": "non coperto da 6S: scegli libRadtran", "tables not available yet": "tabelle non ancora disponibili",
    "6S does not cover the LWIR: τ, L↑ and L↓ come from libRadtran.": "6S non copre il LWIR: τ, L↑ e L↓ vengono da libRadtran.",
    "LWIR L8/9 B10 transmittance (libRadtran)": "Trasmittanza LWIR L8/9 B10 (libRadtran)", "LWIR L8/9 B10 upwelling radiance (libRadtran)": "Radianza LWIR L8/9 B10 verso l'alto (libRadtran)",
    "LWIR L8/9 B10 downwelling radiance (libRadtran)": "Radianza LWIR L8/9 B10 verso il basso (libRadtran)",
    "A regular grid of 49–121 points covers the area (7 × 7 up to 5 km, 9 × 9 up to 10 km, 11 × 11 above). At each point the value is computed from the Open-Meteo atmosphere (ECMWF IFS, CAMS aerosols) with the 6S tables (or, for the forecast, with the GPR).": "Una griglia regolare di 49–121 punti copre l'area (7 × 7 fino a 5 km, 9 × 9 fino a 10 km, 11 × 11 oltre). In ogni punto il valore si calcola dall'atmosfera di Open-Meteo (ECMWF IFS, aerosol CAMS) con le tabelle 6S (o, per la previsione, con il GPR).",
    // validazione AERONET in Atmosphere RK
    "Validation against measurements (AERONET)": "Validazione con le misure (AERONET)",
    "Water vapour (ECMWF IFS, about 25 km) and aerosol optical depth (CAMS, about 45 km) corrected with covariates at the time of each Sentinel-2 image (Sentinel-2 water vapour and AOT, reflectances and indices at 60, 500 and 2000 m, terrain) by random forest or gradient boosting, with kriging of the residuals. Each site is tested while left out of the training: the errors are against real sun-photometer measurements.":
      "Vapore acqueo (ECMWF IFS, circa 25 km) e spessore ottico degli aerosol (CAMS, circa 45 km) corretti con covariate del momento di ogni immagine Sentinel-2 (vapore e AOT di Sentinel-2, riflettanze e indici a 60, 500 e 2000 m, terreno) con random forest o gradient boosting e kriging dei residui. Ogni sito viene verificato mentre è escluso dall'addestramento: gli errori sono rispetto a misure vere dei fotometri solari.",
    "Method on the map": "Metodo sulla mappa", "Errors at the sites": "Errori ai siti", "Which covariates matter": "Quali covariate contano",
    "Model of the map above": "Modello della mappa qui sopra", "How the map is made": "Come si costruisce la mappa",
    "Covariate": "Covariata", "Importance (random forest)": "Importanza (random forest)", "Method": "Metodo",
    "Model (ECMWF / CAMS)": "Modello (ECMWF / CAMS)", "Random forest": "Random forest", "Random forest + kriging": "Random forest + kriging",
    "Gradient boosting": "Gradient boosting", "Gradient boosting + kriging": "Gradient boosting + kriging",
    "Size = RMSE at the site": "Dimensione = RMSE al sito", "Better than the model": "Meglio del modello", "Worse than the model": "Peggio del modello",
    "Validation not available yet.": "Validazione non ancora disponibile.", "Water vapour column": "Colonna di vapore acqueo",
    "Aerosol optical depth 550 nm": "Spessore ottico degli aerosol a 550 nm", "Value:": "Valore:",
    "This map interpolates model values and is not checked against measurements; the validated correction with Sentinel-2 is shown above.":
      "Questa mappa interpola valori del modello e non è verificata con misure; la correzione validata con Sentinel-2 è mostrata sopra.",
    "3/4 · fitting trend + variogram…": "3/4 · stimo trend e variogramma…",
    "Area side": "Lato dell'area", "Side of the square map centred on the place": "Lato della mappa quadrata centrata sul luogo",
    "Size of a map cell": "Dimensione di una cella della mappa", "Selected place": "Luogo scelto",
    // download, Atmosphere (modelli RT, equazioni, glossario), Atmosphere RK con sola quota
    "CSV": "CSV", "Download the data of this chart (CSV)": "Scarica i dati di questo grafico (CSV)", "Download this table (CSV)": "Scarica questa tabella (CSV)",
    "Selected layer at the period shown": "Layer selezionato al periodo mostrato",
    
    
    "Spectral radiative transfer, VNIR–SWIR": "Trasferimento radiativo spettrale, VNIR–SWIR",
    "6S, nadir view, continental aerosol. Hover over a legend entry to see what it is.": "6S, vista al nadir, aerosol continentale. Passa il mouse su una voce della legenda per sapere cos'è.",
    "Transmittance · spherical albedo": "Trasmittanza · albedo sferica", "Spherical albedo S": "Albedo sferica S", "Total T (↓·↑·gas)": "T totale (↓·↑·gas)",
    "How the terms are related: radiance at the sensor": "Come sono legati i termini: radianza al sensore",
    "VNIR–SWIR (0.4–2.5 µm), Lambertian surface": "VNIR–SWIR (0,4–2,5 µm), superficie lambertiana", "LWIR (8–14 µm)": "LWIR (8–14 µm)",
    "Surface reflectance: what atmospheric correction wants to recover.": "Riflettanza della superficie: ciò che la correzione atmosferica vuole ricavare.",
    "Downward transmittance (Sun → ground) left by scattering of molecules (Rayleigh) and aerosols, direct + diffuse.": "Trasmittanza verso il basso (Sole → suolo) lasciata dallo scattering di molecole (Rayleigh) e aerosol, diretta + diffusa.",
    "Upward transmittance (ground → sensor) left by scattering, direct + diffuse.": "Trasmittanza verso l'alto (suolo → sensore) lasciata dallo scattering, diretta + diffusa.",
    "Transmittance of gas absorption (water vapour, ozone, O₂, CO₂, CH₄…) along the Sun – ground – sensor path.": "Trasmittanza dell'assorbimento dei gas (vapore acqueo, ozono, O₂, CO₂, CH₄…) lungo il percorso Sole – suolo – sensore.",
    "Share of the surface signal that reaches the sensor (without the multiple reflections).": "Quota del segnale della superficie che arriva al sensore (senza le riflessioni multiple).",
    "Light scattered by the atmosphere into the sensor without touching the ground: a veil that is added to the signal, strongest in the blue.": "Luce diffusa dall'atmosfera verso il sensore senza toccare il suolo: un velo che si somma al segnale, più forte nel blu.",
    "Solar irradiance reaching a horizontal ground directly from the Sun.": "Irradianza solare che arriva su un suolo orizzontale direttamente dal Sole.",
    "Irradiance reaching the ground from the whole sky, after scattering.": "Irradianza che arriva al suolo da tutto il cielo, dopo lo scattering.",
    "Reflectance of the atmosphere for light coming from below: the term 1/(1 − S·ρ) counts the reflections back and forth between ground and atmosphere.": "Riflettanza dell'atmosfera per la luce che arriva dal basso: il termine 1/(1 − S·ρ) conta le riflessioni avanti e indietro tra suolo e atmosfera.",
    "Solar irradiance at the top of the atmosphere and solar zenith angle.": "Irradianza solare in cima all'atmosfera e angolo zenitale solare.",
    "Atmospheric transmittance between ground and sensor (mostly water vapour).": "Trasmittanza atmosferica tra suolo e sensore (soprattutto vapore acqueo).",
    "Upwelling path radiance emitted by the atmosphere towards the sensor.": "Radianza di percorso emessa dall'atmosfera verso il sensore.",
    "Downwelling radiance emitted by the atmosphere towards the ground (hemispheric, divided by π), partly reflected by the surface.": "Radianza emessa dall'atmosfera verso il suolo (emisferica, divisa per π), in parte riflessa dalla superficie.",
    "Surface emissivity.": "Emissività della superficie.", "Planck radiance of a black body at the land surface temperature": "Radianza di Planck di un corpo nero alla temperatura della superficie",
    
    "Downward transmittance (Sun → ground) left by scattering of molecules and aerosols, direct + diffuse": "Trasmittanza verso il basso (Sole → suolo) lasciata dallo scattering di molecole e aerosol, diretta + diffusa",
    "Upward transmittance (ground → sensor) left by scattering, direct + diffuse": "Trasmittanza verso l'alto (suolo → sensore) lasciata dallo scattering, diretta + diffusa",
    "Transmittance of gas absorption (water vapour, ozone, O₂, CO₂, CH₄…) along the Sun – ground – sensor path": "Trasmittanza dell'assorbimento dei gas (vapore acqueo, ozono, O₂, CO₂, CH₄…) lungo il percorso Sole – suolo – sensore",
    "Share of the surface signal that reaches the sensor: T↓ · T↑ · T gas": "Quota del segnale della superficie che arriva al sensore: T↓ · T↑ · T gas",
    "Reflectance of the atmosphere for light coming from below: reflections between ground and atmosphere": "Riflettanza dell'atmosfera per la luce dal basso: riflessioni tra suolo e atmosfera",
    "Light scattered by the atmosphere into the sensor without touching the ground": "Luce diffusa dall'atmosfera verso il sensore senza toccare il suolo",
    "Solar irradiance reaching a horizontal ground directly from the Sun": "Irradianza solare che arriva su un suolo orizzontale direttamente dal Sole",
    "Irradiance reaching the ground from the whole sky, after scattering": "Irradianza che arriva al suolo da tutto il cielo, dopo lo scattering",
    "A linear regression of these values on the ground elevation at 10 m (Copernicus DEM / EU-DEM). Elevation is the only 10 m quantity that changes the atmosphere above the ground (less air and water vapour above high ground); land-cover layers are not used because they are not contemporaneous with the atmosphere.":
      "Una regressione lineare di questi valori sulla quota del terreno a 10 m (Copernicus DEM / EU-DEM). La quota è l'unica grandezza a 10 m che cambia l'atmosfera sopra il suolo (meno aria e vapore acqueo sopra i rilievi); gli strati di copertura del suolo non si usano perché non sono contemporanei all'atmosfera.",
    "Input data.": "Dati di partenza.",
    "Water vapour column, pressure and temperature come from ECMWF IFS at 0.25° (about 25 km); the aerosol optical depth at 550 nm from CAMS global at 0.4° (about 45 km). Open-Meteo returns the value of the grid cell of each point, so nearby sample points often share the same values. At each point the 6S look-up table is interpolated in water vapour, AOD, solar zenith angle and the elevation of the point.":
      "Colonna di vapore acqueo, pressione e temperatura vengono da ECMWF IFS a 0,25° (circa 25 km); lo spessore ottico degli aerosol a 550 nm da CAMS globale a 0,4° (circa 45 km). Open-Meteo restituisce il valore della cella di griglia di ogni punto, quindi punti campione vicini spesso hanno gli stessi valori. In ogni punto la tabella 6S viene interpolata in vapore acqueo, AOD, angolo zenitale solare e quota del punto.",
    "1/4 · downloading the elevation (Copernicus DEM)…": "1/4 · scarico la quota (Copernicus DEM)…", "Trend only (elevation)": "Solo trend (quota)",
    // schede raggruppate, grafico scorrevole, Atmosphere RK (validazione e avanzamento)
    "Accuracy": "Accuratezza", "Atmosphere RK": "Atmosfera RK", "How to read the GPR tables": "Come leggere le tabelle GPR",
    "Scroll the chart sideways with the bar, the mouse wheel (Shift + wheel) or a swipe.": "Scorri il grafico di lato con la barra, la rotella del mouse (Maiusc + rotella) o con un dito.",
    "Atmospheric parameters (or the forecast) at high resolution (10 m by default) by regression kriging (RK) around the place.": "Parametri atmosferici (o la previsione) ad alta risoluzione (10 m di base) con regression kriging (RK) intorno al luogo.",
    "Sample points.": "Punti campione.",
    "Trend.": "Trend.",
    "Kriging of the residuals.": "Kriging dei residui.",
    "What the trend does not explain is interpolated with ordinary kriging (exponential variogram fitted on the residuals). Map = trend + kriged residual; the kriging standard deviation is its uncertainty.":
      "Ciò che il trend non spiega viene interpolato con il kriging ordinario (variogramma esponenziale stimato sui residui). Mappa = trend + residuo interpolato; la deviazione standard del kriging è la sua incertezza.",
    "GPR forecast from the Open-Meteo models at this point": "Previsione GPR dai modelli Open-Meteo in questo punto",
    "Mean of the Open-Meteo models at this point": "Media dei modelli Open-Meteo in questo punto",
    "Open-Meteo atmosphere at this point (ECMWF IFS, CAMS aerosols) with the 6S tables for radiative transfer": "Atmosfera Open-Meteo in questo punto (ECMWF IFS, aerosol CAMS) con le tabelle 6S per il trasferimento radiativo",
    // nuovo layout, pannelli Layers / Style (mapstyle.js)
    "The name comes from Cicero's": "Il nome viene dai", "Language": "Lingua",
    "Table of values": "Tabella dei valori",
    "6S, nadir view, continental aerosol.": "6S, vista al nadir, aerosol continentale.", 
    "Choose a place with the search above (or a map click, or a calibration site).": "Scegli un luogo con la ricerca in alto (o con un clic sulla mappa, o un sito di calibrazione).",
    "Choose a place with the search above: the map is built around it.": "Scegli un luogo con la ricerca in alto: la mappa viene costruita intorno a esso.",
    "Green = event forecast, red = missed.": "Verde = evento previsto, rosso = mancato.",
    "Add layer": "Aggiungi layer", "+ Add": "+ Aggiungi", "Add the chosen layer to the map": "Aggiungi alla mappa il layer scelto",
    "Layers": "Layer", "Style": "Stile", "OpenStreetMap": "OpenStreetMap", "Sample points": "Punti campione",
    "Circle size = MAE (hold-out)": "Dimensione del cerchio = MAE (holdout)",
    "Show / hide": "Mostra / nascondi", "Select to change the style": "Seleziona per cambiare lo stile", "Move up": "Sposta su", "Move down": "Sposta giù",
    "Remove layer": "Rimuovi layer", "Select a data layer to change its style.": "Seleziona un layer di dati per cambiarne lo stile.",
    "Build the map to change the style of its layers.": "Costruisci la mappa per cambiare lo stile dei suoi layer.",
    "Colour ramp": "Scala di colori", "Invert ramp": "Inverti la scala", "Min / max": "Min / max", "Classes": "Classi",
    "Number of classes": "Numero di classi", "Opacity": "Opacità", "Values outside min–max transparent": "Valori fuori da min–max trasparenti",
    "Histogram of the values · bars = min and max of the scale": "Istogramma dei valori · barre = minimo e massimo della scala",
    "Default": "Predefinito", "Min – max": "Min – max", "Percentiles 2–98 %": "Percentili 2–98 %", "Mean ± 2 std. dev.": "Media ± 2 dev. std.",
    "Manual": "Manuale", "Continuous": "Continue", "Equal intervals": "Intervalli uguali", "Quantiles": "Quantili",
    // intestazione e schede
    "The most accurate forecast for any place: verified models combined by machine learning (GPR) with uncertainty, 10 m maps and the atmospheric parameters for satellite data correction":
      "La previsione più accurata per qualsiasi luogo: modelli verificati combinati con il machine learning (GPR) con incertezza, mappe a 10 m e parametri atmosferici per la correzione dei dati satellitari",
    ", his Latin version of the weather signs in Aratus'": " di Cicerone, la sua versione latina dei segni del tempo dei",
    "Phaenomena": "Fenomeni di Arato",
    "Region": "Regione", "Forecast": "Previsione", "Maps": "Mappe", "Model accuracy": "Accuratezza dei modelli", "Events": "Eventi",
    "GPR reliability": "Affidabilità GPR", "Data & method": "Dati e metodo",
    // previsione
    "Place": "Luogo", "Address, town, place name — or “41.90, 12.50”": "Indirizzo, comune, località — oppure “41.90, 12.50”",
    "Search": "Cerca", "◎ My location": "◎ La mia posizione", "Use my location": "Usa la mia posizione", "Calibration site": "Sito di calibrazione",
    "— choose —": "— scegli —", "Variable": "Variabile", "Aggregation": "Aggregazione",
    "Past days": "Giorni passati", "none": "nessuno", "3 days": "3 giorni", "7 days": "7 giorni", "14 days": "14 giorni", "30 days": "30 giorni",
    "Search an address or a place, enter coordinates or pick a calibration site.": "Cerca un indirizzo o un luogo, inserisci le coordinate o scegli un sito di calibrazione.",
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
    "Latest observed events": "Ultimi eventi osservati",
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
    "Surface and column": "Superficie e colonna", "Vertical profile": "Profilo verticale", 
    "Next days": "Prossimi giorni",
    "Downloading atmospheric data…": "Scarico i dati atmosferici…", 
    "Solar zenith angle": "Angolo zenitale solare",
    "Surface pressure": "Pressione al suolo", "Air temperature 2 m · dew point": "Temperatura dell'aria 2 m · punto di rugiada",
    "Air density at the surface": "Densità dell'aria al suolo", "Cloud cover": "Copertura nuvolosa", "Irradiance (hour mean)": "Irradianza (media oraria)",
    "TIR Landsat 8/9 B10 (10.9 µm)": "TIR Landsat 8/9 B10 (10,9 µm)", 
    "T↓ scattering": "T↓ diffusione", "T↑ scattering": "T↑ diffusione", "T gas": "T gas", 
    "Path radiance [W m⁻² sr⁻¹ µm⁻¹]": "Radianza di percorso [W m⁻² sr⁻¹ µm⁻¹]", "E direct [W m⁻² µm⁻¹]": "E diretta [W m⁻² µm⁻¹]",
    "E diffuse": "E diffusa", "Spherical albedo": "Albedo sferico", "Height [km]": "Quota [km]",
    "Temperature [°C]": "Temperatura [°C]", "Relative humidity [%] /4": "Umidità relativa [%] /4", "Air density [kg m⁻³] ×20": "Densità dell'aria [kg m⁻³] ×20",
    "value (scaled as in legend)": "valore (scalato come in legenda)", "Water vapour column [kg m⁻² = mm]": "Vapore acqueo in colonna [kg m⁻² = mm]",
    "Global irradiance [W m⁻²] /100": "Irradianza globale [W m⁻²] /100",
    // mappa 10 m
    "10 m map around the point": "Mappa a 10 m intorno al punto", "· regression kriging on Copernicus covariates": "· regression kriging su covariate Copernicus",
    "Period / hour": "Periodo / ora", 
    "Model": "Modello",
    "Water vapour column [kg m⁻²]": "Vapore acqueo in colonna [kg m⁻²]",
    "Air temperature 2 m [°C]": "Temperatura dell'aria 2 m [°C]", "Air density [kg m⁻³]": "Densità dell'aria [kg m⁻³]",
    "Global irradiance [W m⁻²]": "Irradianza globale [W m⁻²]", 
    
    "Estimate (trend + kriged residual)": "Stima (trend + residuo krigato)", "Kriging standard deviation": "Deviazione standard del kriging",
    "Trend only": "Solo trend", 
    "Target": "Variabile", "Residual variogram": "Variogramma dei residui", "Trend coefficients": "Coefficienti del trend",
    "(per 1 SD of the covariate)": "(per 1 DS della covariata)",
    "4/4 · predicting on the 10 m grid…": "4/4 · previsione sulla griglia a 10 m…",
    "Atmosphere": "Atmosfera", "10 m map": "Mappa 10 m", "Resolution": "Risoluzione", 
    "Spectral radiative transfer": "Trasferimento radiativo spettrale", 
    "Sentinel-2 bands (13)": "Bande Sentinel-2 (13)", "The hyperspectral 6S table is not available yet: Sentinel-2 bands for now.": "La tabella 6S iperspettrale non è ancora disponibile: per ora bande Sentinel-2.",
    "Sun below 10° elevation at this hour: no VNIR-SWIR spectrum.": "Sole sotto i 10° a quest'ora: nessuno spettro VNIR-SWIR.",
    "Wavelength [nm]": "Lunghezza d'onda [nm]", "Transmittance": "Trasmittanza", "Total transmittance": "Trasmittanza totale", "Path radiance": "Radianza di percorso",
    "Irradiance": "Irradianza", "E diffuse [W m⁻² µm⁻¹]": "E diffusa [W m⁻² µm⁻¹]",
    "(change the place with the search above)": "(cambia il luogo con la ricerca in alto)",
    "Wavelength": "Lunghezza d'onda", "Cell": "Cella", 
    "Forecast variable shown in the Forecast tab (GPR)": "Variabile di previsione della scheda Previsione (GPR)",
    "Total transmittance (T↓·T↑·T gas)": "Trasmittanza totale (T↓·T↑·T gas)", "Downward scattering transmittance T↓": "Trasmittanza di diffusione in discesa T↓",
    "Upward scattering transmittance T↑": "Trasmittanza di diffusione in salita T↑", "Gaseous transmittance": "Trasmittanza gassosa",
    "Direct irradiance [W m⁻² µm⁻¹]": "Irradianza diretta [W m⁻² µm⁻¹]", "Diffuse irradiance [W m⁻² µm⁻¹]": "Irradianza diffusa [W m⁻² µm⁻¹]",
    
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
    "· Atmosphere: ECMWF IFS and CAMS via Open-Meteo, 6S · Elevation: Copernicus DEM / EU-DEM (Mapzen Terrarium tiles) · Maps & geocoding: ©": "· Atmosfera: ECMWF IFS e CAMS tramite Open-Meteo, 6S · Quota: Copernicus DEM / EU-DEM (tasselli Mapzen Terrarium) · Mappe e geocodifica: ©",
    "contributors, Photon (komoot), Nominatim · anonymous usage statistics without cookies (GoatCounter) · © 2026 Francesco Rossi · code: all rights reserved · data:":
      "e collaboratori, Photon (komoot), Nominatim · statistiche d'uso anonime senza cookie (GoatCounter) · © 2026 Francesco Rossi · codice: tutti i diritti riservati · dati:",
    "· part of a family with": "· fa parte di una famiglia con", "(agriculture) and": "(agricoltura) e", "(atmosphere)": "(atmosfera)",
  };
  const R = [
    [/^\+(\d+) days$/, "+$1 giorni"], [/^\+(\d+)d$/, "+$1g"],
    [/^Verified up to (.+) · updated (.+) UTC$/, "Verificato fino al $1 · aggiornato $2 UTC"],
    [/^Done · (\d+) × (\d+) cells of (\d+) m · (\d+) sample points$/, "Fatto · $1 × $2 celle da $3 m · $4 punti campione"],
    [/^4\/4 · predicting on the (\d+) m grid…(.*)$/, "4/4 · previsione sulla griglia a $1 m…$2"],
    [/^6S every (\d+) nm \((\d+) wavelengths\)$/, "6S ogni $1 nm ($2 lunghezze d'onda)"],
    [/^(.+) at (\d+ nm|Sentinel-2 .+ nm) · (.+)$/, "$1 a $2 · $3"],
    [/^2\/4 · downloading the forecast at (\d+) sample points…$/, "2/4 · scarico la previsione in $1 punti campione…"],
    [/^(\d+) × (\d+) km \((.+)\)$/, "$1 × $2 km ($3)"],
    [/^Path radiance S2 (.+) nm$/, "Radianza di percorso S2 $1 nm"], [/^Total transmittance S2 (.+) nm$/, "Trasmittanza totale S2 $1 nm"],
    [/^Direct irradiance S2 (.+) nm$/, "Irradianza diretta S2 $1 nm"], [/^Diffuse irradiance S2 (.+) nm$/, "Irradianza diffusa S2 $1 nm"],
    [/^Observed – (.+)$/, "Osservato – $1"],
  ];
  let lang = "en";
  try { lang = new URLSearchParams(location.search).get("lang") || localStorage.getItem("lang") || "en"; } catch { /* nessuna memoria */ }   // inglese salvo scelta

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
