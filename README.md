# Prognostica

🇬🇧 English · 🇮🇹 [versione italiana](README.it.md)

**The name.** *Prognostica* is the title of the Latin translation in which **Cicero** rendered the part of **Aratus'** *Phaenomena*
devoted to the signs that foretell the weather: the first “weather-forecasting handbook” of Latin literature.
The project belongs to a family: **Prognostica** (weather, front end) · **Columella** (agriculture, front end, after the *De re rustica*) ·
**Torricelli** (atmosphere and atmospheric correction, back end, after the inventor of the barometer) · **Census** (usage monitoring, private).

**Website:** https://francescorossi3.github.io/prognostica/ (English, with Italian translation)

## What it does

An accurate weather forecast for any place:

- **Combined forecast with uncertainty.** All numerical models covering the place (ItaliaMeteo ICON-2I, ECMWF IFS/AIFS, ICON, GFS, ARPEGE,
  UKMO, GEM via Open-Meteo) are verified every day against synoptic stations. They are combined into ★ *Best*, ⚖ *Weighted mean* and
  ◆ *GPR* (Gaussian-process regression giving value and uncertainty). Hourly, 6-hourly and daily; lead times 0–7 days; past days with observations.
- **Place search** with suggestions while typing (Photon/OpenStreetMap), coordinates, device location, Nominatim fallback.
- **Atmosphere at the point**:
  - water vapour, AOD and dust (CAMS), radiation;
  - profiles 1000–200 hPa and air density;
  - 6S radiative-transfer parameters for the Sentinel-2 bands;
  - TIR transmittance and radiances for Landsat 8/9 band 10.
- **10 m maps** around the point: regression kriging on Copernicus covariates (DEM, slope, northness, HRL imperviousness and tree cover).
  Includes the kriging standard-deviation map and leave-one-out validation (RMSE, MAE, bias, R², 95% coverage) against trend-only and ordinary kriging.
- **Model accuracy**: rankings, significant-event verification and GPR back-test.
- **Calibration sites**: RadCalNet and HYPERNETS. Model forecasts are archived every day.

Everything runs for free on GitHub Actions (Python back end) and in the browser (JavaScript front end). Data are stored as CSV/Excel in `data/csv`.
Technical documentation (in Italian): [README.it.md](README.it.md) and [CONTESTO.md](CONTESTO.md).

## Licence

© 2026 Francesco Rossi. **Code: all rights reserved.** **Data: CC BY-NC 4.0.** See [LICENSE](LICENSE). Third-party data remain under their own licences
(Open-Meteo CC BY 4.0, non-commercial free API; Meteostat CC BY-NC 4.0; OpenStreetMap ODbL; Copernicus/EEA with attribution).
