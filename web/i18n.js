// Traduzione italiana dell'interfaccia (lingua principale: inglese).
// Si traducono i nodi di testo e gli attributi che corrispondono esattamente a una voce del dizionario
// (spazi normalizzati) o a una delle regole con espressioni regolari; il contenuto aggiunto dopo viene
// tradotto al volo (MutationObserver). La scelta resta memorizzata nel browser.
// Input:  testi della pagina (index.html e contenuto generato da app.js, atmos.js, hires.js), pulsante EN/IT.
// Output: testi tradotti nel DOM, oggetto globale I18N (t, lang); chiama onLang() di app.js al cambio lingua.
"use strict";
const I18N = (() => {
  const D = {
    "One band per line: centre, FWHM — e.g. 865, 30 (nm) or 10.9, 0.6 (µm)\nor a table: wavelength, response band 1, response band 2, …": "Una banda per riga: centro, FWHM — es. 865, 30 (nm) o 10.9, 0.6 (µm)\noppure una tabella: lunghezza d'onda, risposta banda 1, risposta banda 2, …",
    "automatic (below 30 = µm)": "automatica (sotto 30 = µm)",
    "Before February 2024 ECMWF IFS 0.25° is not archived: values from the ERA5 reanalysis (0.25°), without the vertical profile.": "Prima di febbraio 2024 ECMWF IFS 0,25° non è in archivio: valori della rianalisi ERA5 (0,25°), senza il profilo verticale.",
    "Radiative transfer code of the tables (the same choice as in the Atmosphere tab)": "Codice di trasferimento radiativo delle tabelle (la stessa scelta della scheda Atmosfera)",
    "Radiative transfer": "Trasferimento radiativo",
    "Regression kriging: the model value plus its residual predicted pixel by pixel by the gradient boosting trained on AERONET and GNSS measurements. The best estimate: use this one": "Regression kriging: il valore del modello più il suo residuo previsto pixel per pixel dal gradient boosting addestrato sulle misure AERONET e GNSS. La stima migliore: usa questa",
    "Residual of the model (measurement − model) predicted in each pixel from the covariates: positive where the model underestimates": "Residuo del modello (misura − modello) previsto in ogni pixel dalle covariate: positivo dove il modello sottostima",
    "The original model value (cells of 25–45 km) at the same hour: for comparison": "Il valore originale del modello (celle di 25–45 km) alla stessa ora: per confronto",
    "Model": "Modello",
    "Table grid (10 nm; LWIR 0.1 µm)": "Passo delle tabelle (10 nm; LWIR 0,1 µm)",
    "Every wavelength of the tables, or the bands of a sensor through its spectral response": "Ogni lunghezza d'onda delle tabelle, o le bande di un sensore tramite la sua risposta spettrale",
    "VNIR–SWIR (0.4–2.5 µm)": "VNIR–SWIR (0,4–2,5 µm)",
    "LWIR (8–13 µm)": "LWIR (8–13 µm)",
    "6S does not cover the LWIR: choose libRadtran.": "6S non copre il LWIR: scegli libRadtran.",
    "This sensor has no thermal bands.": "Questo sensore non ha bande termiche.",
    "The radiative transfer tables are not available.": "Le tabelle di trasferimento radiativo non sono disponibili.",
    "Transmittance τ": "Trasmittanza τ",
    "L↑ path [W m⁻² sr⁻¹ µm⁻¹]": "L↑ di percorso [W m⁻² sr⁻¹ µm⁻¹]",
    "L↓ sky [W m⁻² sr⁻¹ µm⁻¹]": "L↓ del cielo [W m⁻² sr⁻¹ µm⁻¹]",
    "Wavelength [µm]": "Lunghezza d'onda [µm]",
    "Radiance": "Radianza",
    "Transmittance of the atmosphere from the ground to the sensor, mostly set by water vapour": "Trasmittanza dell'atmosfera dal suolo al sensore, decisa soprattutto dal vapore acqueo",
    "Thermal radiance emitted by the atmosphere towards the sensor (upwelling path radiance)": "Radianza termica emessa dall'atmosfera verso il sensore (radianza di percorso verso l'alto)",
    "Thermal radiance emitted by the sky towards the ground (downwelling), partly reflected by the surface": "Radianza termica emessa dal cielo verso il suolo (verso il basso), in parte riflessa dalla superficie",
    "★ Best is chosen in advance for each lead time, as the provider with the lowest error in the 90 days before, and then tested on the following days: so it can be slightly worse than the provider that turns out best afterwards, which nobody can know in advance. All rows are computed on the same days.": "★ Best si sceglie in anticipo per ogni anticipo, come il fornitore con l'errore più basso nei 90 giorni precedenti, e poi si prova sui giorni successivi: per questo può essere un po' peggiore del fornitore che risulta migliore dopo, cosa che nessuno può sapere in anticipo. Tutte le righe sono calcolate sugli stessi giorni.",
    "Acquisition date of the satellite image": "Data di acquisizione dell'immagine satellitare",
    "Local time of the place": "Ora locale del luogo",
    "Water vapour column from ECMWF IFS (0.25°, about 25 km) at that hour [kg m⁻²]: the coarse value to be brought to high resolution": "Vapore acqueo in colonna di ECMWF IFS (0,25°, circa 25 km) a quell'ora [kg m⁻²]: il valore grossolano da portare ad alta risoluzione",
    "Aerosol optical depth at 550 nm from CAMS global (0.4°, about 45 km) at that hour: the coarse value to be brought to high resolution": "Spessore ottico degli aerosol a 550 nm di CAMS globale (0,4°, circa 45 km) a quell'ora: il valore grossolano da portare ad alta risoluzione",
    "Dust concentration near the ground from CAMS [µg m⁻³]": "Concentrazione di polveri vicino al suolo di CAMS [µg m⁻³]",
    "Air temperature at 2 m from ECMWF IFS [°C]": "Temperatura dell'aria a 2 m di ECMWF IFS [°C]",
    "Relative humidity at 2 m from ECMWF IFS [%]": "Umidità relativa a 2 m di ECMWF IFS [%]",
    "Surface pressure from ECMWF IFS [hPa]: lower over high ground, where there is less air and water vapour above": "Pressione al suolo di ECMWF IFS [hPa]: più bassa in quota, dove sopra c'è meno aria e meno vapore",
    "Ground elevation, mean within 100 m (Copernicus DEM) [m]": "Quota del terreno, media entro 100 m (Copernicus DEM) [m]",
    "Topographic position within 500 m: elevation minus the mean elevation around [m]; positive on ridges and hilltops, negative in valleys": "Posizione topografica entro 500 m: quota meno la quota media intorno [m]; positiva su creste e colline, negativa nelle valli",
    "Relief within 500 m: standard deviation of the elevation around [m]; high where the terrain is rugged": "Rilievo entro 500 m: deviazione standard della quota intorno [m]; alta dove il terreno è accidentato",
    "Topographic position within 2 km: elevation minus the mean elevation around [m]; positive on ridges and hilltops, negative in valleys": "Posizione topografica entro 2 km: quota meno la quota media intorno [m]; positiva su creste e colline, negativa nelle valli",
    "Relief within 2 km: standard deviation of the elevation around [m]; high where the terrain is rugged": "Rilievo entro 2 km: deviazione standard della quota intorno [m]; alta dove il terreno è accidentato",
    "Hour, UTC: the model error changes during the day": "Ora, UTC: l'errore del modello cambia durante il giorno",
    "Season: sine of the day of the year (with the cosine, 31 December and 1 January are close)": "Stagione: seno del giorno dell'anno (con il coseno, 31 dicembre e 1° gennaio risultano vicini)",
    "Season: cosine of the day of the year (with the sine, 31 December and 1 January are close)": "Stagione: coseno del giorno dell'anno (con il seno, 31 dicembre e 1° gennaio risultano vicini)",
    "Ground elevation used for the terrain covariates and for the radiative transfer": "Quota del terreno usata per le covariate del terreno e per il trasferimento radiativo",
    "· Atmosphere: ECMWF IFS and CAMS via Open-Meteo, 6S, libRadtran · Validation: AERONET (NASA), GNSS (Nevada Geodetic Laboratory) · Elevation: Copernicus DEM / EU-DEM (Mapzen Terrarium tiles) · Maps & geocoding: ©": "· Atmosfera: ECMWF IFS e CAMS tramite Open-Meteo, 6S, libRadtran · Validazione: AERONET (NASA), GNSS (Nevada Geodetic Laboratory) · Quota: Copernicus DEM / EU-DEM (tasselli Mapzen Terrarium) · Mappe e geocodifica: ©",
    "Water vapour, aerosol optical depth and radiative transfer quantities at high resolution, for a past date and hour: ECMWF IFS and CAMS interpolated to fine spatial resolution by regression kriging, with the model validated on AERONET and GNSS measurements (below).": "Vapore acqueo, spessore ottico degli aerosol e grandezze di trasferimento radiativo ad alta risoluzione, per una data e un'ora passate: ECMWF IFS e CAMS interpolati ad alta risoluzione spaziale con il regression kriging, con il modello validato sulle misure AERONET e GNSS (sotto).",
    "The map will have exactly the extent, pixels and coordinate system of the image, so the values can be used pixel by pixel. Band wavelengths and acquisition time are read from the metadata when present.": "La mappa avrà esattamente estensione, pixel e sistema di riferimento dell'immagine, così i valori si usano pixel per pixel. Lunghezze d'onda delle bande e ora di acquisizione si leggono dai metadati se presenti.",
    "Hour (UTC)": "Ora (UTC)",
    "Hour of the satellite overpass, UTC": "Ora del passaggio del satellite, UTC",
    "Sensor": "Sensore",
    "Band": "Banda",
    "Spectral response function used to convert the radiative transfer tables to the band": "Funzione di risposta spettrale usata per convertire le tabelle di trasferimento radiativo alla banda",
    "or load a CSV": "oppure carica un CSV",
    "Format": "Formato",
    "Units": "Unità",
    "Scale": "Scala",
    "Units of the exported values, to match the product you are correcting": "Unità dei valori esportati, per adattarli al prodotto da correggere",
    "Multiply the values, e.g. 10000 for scaled integer products": "Moltiplica i valori, ad esempio 10000 per prodotti interi scalati",
    "Single wavelength (table grid)": "Singola lunghezza d'onda (passo delle tabelle)",
    "Bands of the imported image": "Bande dell'immagine importata",
    "Custom (centre and FWHM, or SRF table)": "Personalizzata (centro e FWHM, o tabella della SRF)",
    "The imported image has no wavelengths in its metadata for this range.": "L'immagine importata non ha lunghezze d'onda nei metadati per questo intervallo.",
    "No band in this range.": "Nessuna banda in questo intervallo.",
    "LWIR transmittance τ": "Trasmittanza LWIR τ",
    "LWIR upwelling path radiance L↑ [W m⁻² sr⁻¹ µm⁻¹]": "Radianza di percorso LWIR verso l'alto L↑ [W m⁻² sr⁻¹ µm⁻¹]",
    "LWIR downwelling radiance L↓ [W m⁻² sr⁻¹ µm⁻¹]": "Radianza LWIR verso il basso L↓ [W m⁻² sr⁻¹ µm⁻¹]",
    "Elevation [m]": "Quota [m]",
    "Validation against measurements (AERONET, GNSS)": "Validazione con le misure (AERONET, GNSS)",
    "Water vapour (ECMWF IFS, about 25 km) and aerosol optical depth (CAMS, about 45 km) are brought to fine spatial resolution by regression kriging: a gradient boosting trend on covariates that exist for every pixel and hour: the model values themselves, terrain (mean elevation within 100 m, position in the relief within 500 m and 2 km), hour and season (not latitude and longitude, which would give straight steps in the maps). Each site is tested while left out of the training, together with every site in its 0.5° cell: the errors are against real sun-photometer (AERONET) and GNSS measurements.": "Vapore acqueo (ECMWF IFS, circa 25 km) e spessore ottico degli aerosol (CAMS, circa 45 km) sono portati ad alta risoluzione spaziale con il regression kriging: un trend gradient boosting su covariate che esistono per ogni pixel e ora: i valori stessi del modello, il terreno (quota media entro 100 m, posizione nel rilievo entro 500 m e 2 km), ora e stagione (non latitudine e longitudine, che darebbero gradini dritti nelle mappe). Ogni sito è provato escludendolo dall'addestramento, insieme a tutti i siti della sua cella di 0,5°: gli errori sono rispetto a misure vere di fotometri solari (AERONET) e GNSS.",
    "Model values.": "Valori del modello.",
    "Covariates.": "Covariate.",
    "Trend.": "Trend.",
    "Radiative transfer.": "Trasferimento radiativo.",
    "Water vapour, temperature, humidity and pressure from ECMWF IFS (0.25°) and AOD and dust from CAMS (0.4°) at the chosen hour, from the Open-Meteo archive.": "Vapore acqueo, temperatura, umidità e pressione da ECMWF IFS (0,25°) e AOD e polveri da CAMS (0,4°) all'ora scelta, dall'archivio Open-Meteo.",
    "On a 30 m lattice: terrain from the elevation tiles (mean elevation within 100 m, its difference from the mean elevation and the spread within 500 m and 2 km), hour and day of the year.": "Su un reticolo di 30 m: terreno dai tasselli di quota (quota media entro 100 m, sua differenza dalla quota media e dispersione entro 500 m e 2 km), ora e giorno dell'anno.",
    "The gradient boosting trained on AERONET and GNSS measurements (validation above) gives the residual of the model every 30 m (90 m for large areas); the map pixels take the bilinear value.": "Il gradient boosting addestrato sulle misure AERONET e GNSS (validazione sopra) dà il residuo del modello ogni 30 m (90 m per aree grandi); i pixel della mappa prendono il valore bilineare.",
    "For transmittances, path radiance, irradiances and spherical albedo the high-resolution water vapour and AOD enter the 6S or libRadtran tables with the solar angle and the elevation of each pixel. The tables (every 10 nm, and every 0.1 µm in the thermal) are weighted with the spectral response of the chosen band: measured curves for Sentinel-2, Landsat, Sentinel-3, MODIS, PROBA-V; band limits or Gaussian shapes for the others; the wavelengths of an imported image; or your own.": "Per trasmittanze, radianza di percorso, irradianze e albedo sferico, vapore e AOD ad alta risoluzione entrano nelle tabelle 6S o libRadtran con l'angolo solare e la quota di ogni pixel. Le tabelle (ogni 10 nm, e ogni 0,1 µm nel termico) sono pesate con la risposta spettrale della banda scelta: curve misurate per Sentinel-2, Landsat, Sentinel-3, MODIS, PROBA-V; limiti di banda o forme gaussiane per gli altri; le lunghezze d'onda di un'immagine importata; o le tue.",
    "The kriging of the residuals is not applied to the map: it needs measurements at the same hour and, in the validation, it does not improve the water vapour.": "Il kriging dei residui non si applica alla mappa: servono misure della stessa ora e, nella validazione, non migliora il vapore acqueo.",
    "Dashed border = GNSS station": "Bordo tratteggiato = stazione GNSS",
    "Map": "Mappa",
    "Validation RMSE": "RMSE di validazione",
    "choose a past date (at least one day ago)": "scegli una data passata (almeno di ieri)",
    "choose a spectral band": "scegli una banda spettrale",
    "the validated model is not published yet": "il modello validato non è ancora pubblicato",
    "0/4 · elevation…": "0/4 · quota…",
    "1/4 · terrain and model values…": "1/4 · terreno e valori del modello…",
    "3/4 · applying the validated model…": "3/4 · applico il modello validato…",
    "4/4 · values on the map pixels…": "4/4 · valori sui pixel della mappa…",
    "LWIR tables need libRadtran: choose it in the Atmosphere tab": "le tabelle LWIR richiedono libRadtran: sceglilo nella scheda Atmosfera",
    "area too large for the browser (max about 110 × 110 km)": "area troppo grande per il browser (al massimo circa 110 × 110 km)",

    "Date": "Data", "Build map": "Crea mappa",
    "Download": "Scarica", "Selected layer, same pixels and coordinate system as the grid": "Layer selezionato, stessi pixel e sistema di riferimento della griglia",
    "GeoTIFF (Float32, values)": "GeoTIFF (Float32, valori)", "PNG as shown + world file": "PNG come mostrato + world file", "JPEG as shown + world file": "JPEG come mostrato + world file",
    "ESRI ASCII grid (.asc)": "Griglia ASCII ESRI (.asc)", "ENVI (.img + .hdr)": "ENVI (.img + .hdr)", "CSV (lon, lat, value)": "CSV (lon, lat, valore)",
    "Use the grid of an image": "Usa la griglia di un'immagine", "GeoTIFF / COG, or ENVI .hdr together with its .img": "GeoTIFF / COG, oppure ENVI .hdr insieme al suo .img",
    "Back to the square grid": "Torna alla griglia quadrata",
    "CSV is limited to 1.5 million pixels: choose GeoTIFF, ENVI or ASCII grid.": "Il CSV è limitato a 1,5 milioni di pixel: scegli GeoTIFF, ENVI o griglia ASCII.",
    "Radiative transfer model": "Modello di trasferimento radiativo", "6S · VNIR–SWIR only": "6S · solo VNIR–SWIR",
    "libRadtran · VNIR–SWIR and LWIR (tables in preparation)": "libRadtran · VNIR–SWIR e LWIR (tabelle in preparazione)",
    "libRadtran · VNIR–SWIR and LWIR": "libRadtran · VNIR–SWIR e LWIR", "With 6S the thermal (LWIR) part is greyed out.": "Con 6S la parte termica (LWIR) è ingrigita.",
    "Thermal (LWIR)": "Termico (LWIR)", "not covered by 6S: choose libRadtran": "non coperto da 6S: scegli libRadtran", "tables not available yet": "tabelle non ancora disponibili",
    "6S does not cover the LWIR: τ, L↑ and L↓ come from libRadtran.": "6S non copre il LWIR: τ, L↑ e L↓ vengono da libRadtran.",

    // validazione AERONET in Atmosphere RK
    "Method on the map": "Metodo sulla mappa", "Errors at the sites": "Errori ai siti", "Which covariates matter": "Quali covariate contano",
    "Model of the map above": "Modello della mappa qui sopra", "How the map is made": "Come si costruisce la mappa",
    "Covariate": "Covariata", "Method": "Metodo",
    "Model (ECMWF / CAMS)": "Modello (ECMWF / CAMS)",
    "Gradient boosting": "Gradient boosting", "Gradient boosting + kriging": "Gradient boosting + kriging",
    "Size = RMSE at the site": "Dimensione = RMSE al sito", "Better than the model": "Meglio del modello", "Worse than the model": "Peggio del modello",
    "Validation not available yet.": "Validazione non ancora disponibile.", "Water vapour column": "Colonna di vapore acqueo",
    "Aerosol optical depth 550 nm": "Spessore ottico degli aerosol a 550 nm",

    "Area side": "Lato dell'area", "Side of the square map centred on the place": "Lato della mappa quadrata centrata sul luogo",
    "Size of a map cell": "Dimensione di una cella della mappa", "Selected place": "Luogo scelto",
    // download, Atmosphere (modelli RT, equazioni, glossario), Atmosphere RK con sola quota
    "CSV": "CSV", "Download the data of this chart (CSV)": "Scarica i dati di questo grafico (CSV)", "Download this table (CSV)": "Scarica questa tabella (CSV)",
    "Selected layer at the period shown": "Layer selezionato al periodo mostrato",
    "Nadir view, continental aerosol. Hover over a legend entry to see what it is.": "Vista al nadir, aerosol continentale. Passa con il mouse su una voce della legenda per sapere cos'è.",
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
    // schede raggruppate, grafico scorrevole, Atmosphere RK (validazione e avanzamento)
    "Accuracy": "Accuratezza", "Atmosphere RK": "Atmosfera RK", "How to read the GPR tables": "Come leggere le tabelle GPR",
    "Scroll the chart sideways with the bar, the mouse wheel (Shift + wheel) or a swipe.": "Scorri il grafico di lato con la barra, la rotella del mouse (Maiusc + rotella) o con un dito.",
    // nuovo layout, pannelli Layers / Style (mapstyle.js)
    "The name comes from Cicero's": "Il nome viene dai", "How to cite:": "Come citare:", "Please also cite the data sources listed above.": "Cita anche le fonti dei dati elencate sopra.", "Language": "Lingua",
    "Table of values": "Tabella dei valori",
    "Choose a place with the search above (or a map click, or a calibration site).": "Scegli un luogo con la ricerca in alto (o con un clic sulla mappa, o un sito di calibrazione).",
    "Choose a place with the search above: the map is built around it.": "Scegli un luogo con la ricerca in alto: la mappa viene costruita intorno a esso.",
    "Green = event forecast, red = missed.": "Verde = evento previsto, rosso = mancato.",
    "Add layer": "Aggiungi layer", "+ Add": "+ Aggiungi", "Add the chosen layer to the map": "Aggiungi alla mappa il layer scelto",
    "Layers": "Layer", "Style": "Stile", "OpenStreetMap": "OpenStreetMap",
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
    "Forecasts for any place from weather models checked against stations and combined by machine learning (GPR), with their uncertainty; water vapour, aerosols and radiative transfer for the atmospheric correction of satellite images":
      "Previsioni per qualsiasi luogo dai modelli meteo verificati sulle stazioni e combinati con il machine learning (GPR), con la loro incertezza; vapore acqueo, aerosol e trasferimento radiativo per la correzione atmosferica delle immagini satellitari",
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
    "Whole record": "Intero archivio", "Metric": "Metrica",
    "RMSE (root mean square error)": "RMSE (errore quadratico medio)", "MAE (mean absolute error)": "MAE (errore assoluto medio)",
    "Bias (forecast − observed)": "Bias (previsto − osservato)", "Correlation": "Correlazione", "R² (explained variance)": "R² (varianza spiegata)",
    "Error versus lead time": "Errore in funzione dell'anticipo", "Monthly trend": "Andamento mensile", "Provider": "Fornitore",
    "★ Best": "★ Migliore", "⚖ Weighted mean": "⚖ Media pesata", "⚖ Weighted": "⚖ Pesata",
    // eventi
    "Event": "Evento", "Lead time": "Anticipo", "Events caught (CSI) versus lead time": "Eventi colti (CSI) in funzione dell'anticipo",
    "Latest observed events": "Ultimi eventi osservati",
    // mappe
    "GPR error at stations": "Errore GPR alle stazioni",
    "Click on the map to see the value and open the detailed forecast.": "Clicca sulla mappa per vedere il valore e aprire la previsione dettagliata.",
    // atmosfera
    "Hour": "Ora", "Past dates only, from the archive of the models: the image to correct has already been acquired. Proposed: the hour with the highest sun (close to the ~10:30 overpass of Sentinel-2 / Landsat).": "Solo date passate, dall'archivio dei modelli: l'immagine da correggere è già stata acquisita. Proposta: l'ora con il sole più alto (vicina al passaggio delle ~10:30 di Sentinel-2 / Landsat).",
    "Surface and column": "Superficie e colonna", "Vertical profile": "Profilo verticale",
    "Day before, day and day after": "Giorno prima, giorno scelto e giorno dopo",
    "Downloading atmospheric data…": "Scarico i dati atmosferici…",
    "Solar zenith angle": "Angolo zenitale solare",
    "Surface pressure": "Pressione al suolo", "Air temperature 2 m · dew point": "Temperatura dell'aria 2 m · punto di rugiada",
    "Air density at the surface": "Densità dell'aria al suolo", "Cloud cover": "Copertura nuvolosa", "Irradiance (hour mean)": "Irradianza (media oraria)",
    "T↓ scattering": "T↓ diffusione", "T↑ scattering": "T↑ diffusione", "T gas": "T gas",
    "Path radiance [W m⁻² sr⁻¹ µm⁻¹]": "Radianza di percorso [W m⁻² sr⁻¹ µm⁻¹]", "E direct [W m⁻² µm⁻¹]": "E diretta [W m⁻² µm⁻¹]",
    "Spherical albedo": "Albedo sferico", "Height [km]": "Quota [km]",
    "Temperature [°C]": "Temperatura [°C]", "Relative humidity [%] /4": "Umidità relativa [%] /4", "Air density [kg m⁻³] ×20": "Densità dell'aria [kg m⁻³] ×20",
    "value (scaled as in legend)": "valore (scalato come in legenda)", "Water vapour column [kg m⁻² = mm]": "Vapore acqueo in colonna [kg m⁻² = mm]",
    "Global irradiance [W m⁻²] /100": "Irradianza globale [W m⁻²] /100",
    // Atmosphere RK
    "Water vapour column [kg m⁻²]": "Vapore acqueo in colonna [kg m⁻²]",
    "Atmosphere": "Atmosfera", "Resolution": "Risoluzione",
    "Spectral radiative transfer": "Trasferimento radiativo spettrale",
    "Sun below 10° elevation at this hour: no VNIR-SWIR spectrum.": "Sole sotto i 10° a quest'ora: nessuno spettro VNIR-SWIR.",
    "Wavelength [nm]": "Lunghezza d'onda [nm]", "Path radiance": "Radianza di percorso",
    "Irradiance": "Irradianza", "E diffuse [W m⁻² µm⁻¹]": "E diffusa [W m⁻² µm⁻¹]",
    "(change the place with the search above)": "(cambia il luogo con la ricerca in alto)",
    "Cell": "Cella",
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
    "contributors, Photon (komoot), Nominatim · anonymous usage statistics without cookies (GoatCounter) · © 2026 Francesco Rossi · code: all rights reserved · data:":
      "e collaboratori, Photon (komoot), Nominatim · statistiche d'uso anonime senza cookie (GoatCounter) · © 2026 Francesco Rossi · codice: tutti i diritti riservati · dati:",
    "· part of a family with": "· fa parte di una famiglia con", "(agriculture) and": "(agricoltura) e", "(atmosphere)": "(atmosfera)",
  };
  const R = [
    [/^no water vapour values for (.+) UTC in the archive$/, "nessun valore di vapore acqueo per le $1 UTC in archivio"],
    [/^no CAMS aerosol values for (.+) UTC \(the CAMS archive starts in August 2022\)$/, "nessun valore di aerosol CAMS per le $1 UTC (l'archivio CAMS inizia ad agosto 2022)"],
    [/^Predicted residual \(RK − (.+)\)$/, "Residuo previsto (RK − $1)"],
    [/^0\/4 · elevation… · (\d+) s$/, "0/4 · quota… · $1 s"], [/^1\/4 · terrain and model values… · (\d+) s$/, "1/4 · terreno e valori del modello… · $1 s"],
    [/^2\/4 · covariates at ([\d.,]+) points… · (\d+) s$/, "2/4 · covariate in $1 punti… · $2 s"],
    [/^3\/4 · applying the validated model…(.*) · (\d+) s$/, "3/4 · applico il modello validato…$1 · $2 s"],
    [/^4\/4 · values on the map pixels…(.*) · (\d+) s$/, "4/4 · valori sui pixel della mappa…$1 · $2 s"],
    [/^Done in (\d+) s · (\d+) × (\d+) cells of (.+) \((EPSG:.+)\) · model applied every (\d+) m(.*)$/, (m, t, w, h, c, e, k, rest) => `Fatto in ${t} s · ${w} × ${h} celle da ${c} (${e}) · modello applicato ogni ${k} m`
      + rest.replace(" · band outside the tables: nearest wavelength used", " · banda fuori dalle tabelle: usata la lunghezza d'onda più vicina")
        .replace(" · before February 2024 ECMWF IFS 0.25° is not archived: ERA5 reanalysis used, the trend was trained on IFS", " · prima di febbraio 2024 ECMWF IFS 0,25° non è in archivio: usata la rianalisi ERA5, il trend è stato addestrato su IFS")],
    [/^(\d+) AERONET sites(?: and (\d+) GNSS stations)? · ([\d.,]+) hourly measurements · (.+) · each site left out of training when it is tested$/,
      (m, a, g, n, p) => `${a} siti AERONET${g ? ` e ${g} stazioni GNSS` : ""} · ${n} misure orarie · ${p} · ogni sito escluso dall'addestramento quando viene provato`],
    [/^(.+) bands with wavelengths$/, "$1 bande con lunghezze d'onda"],
    [/^\+(\d+) days$/, "+$1 giorni"], [/^\+(\d+)d$/, "+$1g"],
    [/^Verified up to (.+) · updated (.+) UTC$/, "Verificato fino al $1 · aggiornato $2 UTC"],
    [/^No archived model values for (.+) yet: choose an earlier date\.$/, "Nessun valore dei modelli in archivio per il $1: scegli una data precedente."],
    [/^Every (\d+) nm \((\d+) wavelengths\)$/, "Ogni $1 nm ($2 lunghezze d'onda)"],
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
    for (const a of ["placeholder", "title", "data-tip"]) if (n.hasAttribute?.(a)) {
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
  return { t, get lang() { return lang; } };
})();
