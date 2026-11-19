# Prognostica

🇬🇧 English · 🇮🇹 [versione italiana](README.it.md)

**The name.** *Prognostica* is the title of the Latin translation in which **Cicero** rendered the part of **Aratus'** *Phaenomena*
devoted to the signs that foretell the weather: the first “weather-forecasting handbook” of Latin literature.
The project belongs to a family: **Prognostica** (weather, front end) · **Columella** (agriculture, front end, after the *De re rustica*) ·
**Torricelli** (atmosphere and atmospheric correction, back end, after the inventor of the barometer) · **Census** (usage monitoring, private).

**Website:** https://francescorossi3.github.io/prognostica/ (English, with Italian translation)

## What it does

Weather forecasts for any place, and the atmosphere for the correction of satellite images:

- **Combined forecast with uncertainty.** All numerical models covering the place (ItaliaMeteo ICON-2I, ECMWF IFS/AIFS, ICON, GFS, ARPEGE,
  UKMO, GEM via Open-Meteo) are verified every day against synoptic stations. They are combined into ★ *Best*, ⚖ *Weighted mean* and
  ◆ *GPR* (Gaussian-process regression giving value and uncertainty). Hourly, 6-hourly and daily; lead times 0–7 days; past days with observations.
- **Place search** with suggestions while typing (Photon/OpenStreetMap), coordinates, device location, Nominatim fallback.
- **Atmosphere at the point**: water vapour, AOD and dust (CAMS), radiation, profiles 1000–200 hPa, air density; radiative-transfer parameters
  from 6S (VNIR–SWIR) or libRadtran (VNIR–SWIR and thermal).
- **High-resolution atmospheric maps** for a past date and hour: water vapour and AOD corrected by a gradient-boosting model validated on AERONET
  and GNSS measurements, and the radiative-transfer quantities in the band of any sensor (spectral response from a library, from the metadata of an
  imported image, or custom). The map can take the grid of an imported GeoTIFF/ENVI image and is exported in the units of the product.
- **Model accuracy**: rankings, significant-event verification and GPR back-test.
- **Calibration sites**: RadCalNet and HYPERNETS. Model forecasts are archived every day.

Everything runs for free on GitHub Actions (Python back end) and in the browser (JavaScript front end). Data are stored as CSV/Excel in `data/csv`.
Technical documentation (in Italian): [README.it.md](README.it.md) and [CONTESTO.md](CONTESTO.md).

## Licence

© 2026 Francesco Rossi. **Code: all rights reserved.** **Data: CC BY-NC 4.0.** See [LICENSE](LICENSE). Third-party data remain under their own licences
(Open-Meteo CC BY 4.0, non-commercial free API; Meteostat CC BY-NC 4.0; OpenStreetMap ODbL; Copernicus/EEA with attribution).

## Come citare / How to cite

Rossi, F. (2026). *Prognostica: verified weather forecasts and atmospheric parameters* [web application]. CNR – Istituto di Metodologie
Integrate per l'Osservazione della Terra (IMIOT). https://francescorossi3.github.io/prognostica/

Vedi anche `CITATION.cff` (GitHub mostra "Cite this repository") e cita le fonti dei dati (Open-Meteo, Meteostat, ECMWF, CAMS, AERONET, GNSS…).
