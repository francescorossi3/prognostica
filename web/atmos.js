// Atmosfera nel punto: vapore acqueo, aerosol, radiazione, profili, densità dell'aria
// e parametri di trasferimento radiativo per la correzione atmosferica (LUT 6S o libRadtran: Sentinel-2, iperspettrale, LWIR Landsat).
// Input:  punto scelto (S.point di app.js), Open-Meteo Forecast (ECMWF IFS) e Air Quality (CAMS) API,
//         LUT data/rt/lut_*.json e lut_libradtran_*.json (da Torricelli, con copia locale di riserva).
// Output: scheda Atmosphere (riepilogo e grafici, CSV dei grafici con export.js); oggetto globale ATM usato da app.js, srf.js e rkmap.js.
"use strict";

const ATM = (() => {
  const LEVELS = [1000, 925, 850, 700, 500, 300, 200];
  const SURF = ["total_column_integrated_water_vapour", "surface_pressure", "temperature_2m", "relative_humidity_2m",
    "dew_point_2m", "cloud_cover", "shortwave_radiation", "direct_radiation", "diffuse_radiation", "direct_normal_irradiance",
    "terrestrial_radiation"];
  const PROF = LEVELS.flatMap(p => [`temperature_${p}hPa`, `relative_humidity_${p}hPa`, `geopotential_height_${p}hPa`, `wind_speed_${p}hPa`]);
  const RD = 287.05;

  // ---------------------------------------------------------------- fisica
  const esat = tc => 6.112 * Math.exp(17.67 * tc / (tc + 243.5));
  function rho(p, tc, rh) {                         // densità dell'aria umida [kg m-3]
    if (![p, tc, rh].every(Number.isFinite)) return null;
    const e = rh / 100 * esat(tc), q = 0.622 * e / (p - 0.378 * e), tv = (tc + 273.15) * (1 + 0.608 * q);
    return p * 100 / (RD * tv);
  }
  function sza(ms, lat, lon) {                      // angolo zenitale solare (NOAA), gradi
    const d = new Date(ms), y0 = Date.UTC(d.getUTCFullYear(), 0, 1);
    const doy = Math.floor((ms - y0) / 86400000) + 1, hr = d.getUTCHours() + d.getUTCMinutes() / 60;
    const g = 2 * Math.PI / 365 * (doy - 1 + (hr - 12) / 24);
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
      + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const ha = ((hr * 60 + eqt + 4 * lon) / 4 - 180) * Math.PI / 180, la = lat * Math.PI / 180;
    const cz = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha);
    return Math.acos(Math.max(-1, Math.min(1, cz))) * 180 / Math.PI;
  }
  // ---------------------------------------------------------------- LUT del modello di trasferimento radiativo scelto
  // S.rtm = "6s" (solo VNIR-SWIR) o "libradtran" (VNIR-SWIR e LWIR); file data/rt/lut_<set>.json o lut_libradtran_<set>.json
  const lutP = {};
  const lutFile = (set, m = S.rtm || "6s") => `data/rt/lut_${m === "6s" ? "" : m + "_"}${set}.json`;
  function lut(set = "s2") {                      // set: "s2" (bande Sentinel-2), "hyper" (400-2500 nm ogni 10 nm), "tir" (LWIR)
    const key = `${S.rtm || "6s"}:${set}`;
    if (!lutP[key]) {
      const f = lutFile(set);
      const urls = [S.meta.atmos_url ? S.meta.atmos_url.replace(/\/?$/, "/") + f : null, DATA + f.replace("data/", "")].filter(Boolean);
      lutP[key] = (async () => { for (const u of urls) { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch { /* prossimo */ } } return null; })()
        .then(j => { if (set === "tir") TL = j; return j; });
    }
    return lutP[key];
  }
  // LWIR (solo modelli che lo coprono, es. libRadtran): tau, L su, L giu' per una banda; atmosfera standard secondo latitudine e stagione
  let TL = null;
  function tirBand(T, band, w, altKm, lat, ms) {
    const m = new Date(ms).getUTCMonth(), summer = lat >= 0 ? m >= 3 && m <= 8 : m <= 2 || m >= 9;
    const atm = Math.abs(lat) < 23 ? "afglt" : Math.abs(lat) > 60 ? (summer ? "afglss" : "afglsw") : summer ? "afglms" : "afglmw";
    const A = T.axes, V = T.bands[band].values, ia = A.atm.indexOf(atm);
    const bw = bracket(A.w_gcm2, w), bz = bracket(A.alt_km, altKm), out = [0, 0, 0];
    for (let c = 0; c < 4; c++) {
      const uw = c & 1, uz = (c >> 1) & 1, wt = (uw ? bw[1] : 1 - bw[1]) * (uz ? bz[1] : 1 - bz[1]);
      if (!wt) continue;
      V[bw[0] + uw][bz[0] + uz][ia].forEach((v, j) => { out[j] += wt * v; });
    }
    return { tau: out[0], lu: out[1], ld: out[2] };
  }

  // il modello ha le sue tabelle pubblicate? (per abilitarlo nel selettore)
  async function available(m) {
    const u = (S.meta.atmos_url || "").replace(/\/?$/, "/") + lutFile("s2", m);
    return fetch(u, { method: "HEAD" }).then(r => r.ok).catch(() => false);
  }
  function bracket(ax, x) {
    x = Math.max(ax[0], Math.min(ax[ax.length - 1], x));
    let i = 0;
    while (i < ax.length - 2 && x > ax[i + 1]) i++;
    const t = ax[i + 1] === ax[i] ? 0 : (x - ax[i]) / (ax[i + 1] - ax[i]);
    return [i, t];
  }
  // interpolazione multilineare 4D -> vettore delle grandezze (t_down, t_up, ...)
  function rtBand(L, band, w, aot, s, altKm) {
    const A = L.axes, V = L.bands[band].values;
    const b = [bracket(A.w_gcm2, w), bracket(A.aot550, aot), bracket(A.sza_deg, s), bracket(A.alt_km, altKm)];
    const nk = L.outputs.length, out = new Array(nk).fill(0);
    for (let c = 0; c < 16; c++) {
      let wt = 1; const ix = [];
      for (let d = 0; d < 4; d++) { const up = (c >> d) & 1; ix.push(b[d][0] + up); wt *= up ? b[d][1] : 1 - b[d][1]; }
      if (!wt) continue;
      const v = V[ix[0]][ix[1]][ix[2]][ix[3]];
      for (let k = 0; k < nk; k++) out[k] += wt * v[k];
    }
    return Object.fromEntries(L.outputs.map((k, j) => [k, out[j]]));
  }

  // ---------------------------------------------------------------- download (archivio: solo date passate)
  // dal giorno start al giorno end (AAAA-MM-GG, UTC): ECMWF IFS dall'archivio delle previsioni, AOD e polveri da CAMS
  async function fetchPast(P, start, end) {
    const q = `latitude=${P.lat.toFixed(4)}&longitude=${P.lon.toFixed(4)}&start_date=${start}&end_date=${end}&timeformat=unixtime&timezone=GMT`;
    const [a, b] = await Promise.all([
      fetch(`https://historical-forecast-api.open-meteo.com/v1/forecast?${q}&hourly=${[...SURF, ...PROF].join(",")}&models=ecmwf_ifs025`).then(r => r.json()),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&hourly=aerosol_optical_depth,dust&domains=cams_global`).then(r => r.json()).catch(() => null)]);
    if (a.error) throw new Error(a.reason);
    const times = a.hourly.time.map(t => t * 1000), aq = b && !b.error ? b.hourly : null;
    const amap = new Map((aq?.time || []).map((t, k) => [t * 1000, [aq.aerosol_optical_depth[k], aq.dust[k]]]));
    return { times, h: a.hourly, elev: a.elevation, aod: times.map(t => amap.get(t)?.[0] ?? null), dust: times.map(t => amap.get(t)?.[1] ?? null) };
  }

  // tutte le grandezze derivate in un'ora (k) di un punto
  function derive(d, k, lat, lon, elevM) {
    const h = d.h, g = v => (h[v] ? h[v][k] : null);
    const w = g("total_column_integrated_water_vapour") / 10, aod = d.aod[k], z = sza(d.times[k] - 1800000, lat, lon);
    const o = { time: d.times[k], tcwv: g("total_column_integrated_water_vapour"), w, aod, dust: d.dust[k], sza: z,
      ps: g("surface_pressure"), t2m: g("temperature_2m"), rh: g("relative_humidity_2m"), td: g("dew_point_2m"),
      cloud: g("cloud_cover"), ghi: g("shortwave_radiation"), dir: g("direct_radiation"), dif: g("diffuse_radiation"),
      dni: g("direct_normal_irradiance"), toa: g("terrestrial_radiation") };
    o.rho = rho(o.ps, o.t2m, o.rh);
    o.prof = LEVELS.map(p => ({ p, t: g(`temperature_${p}hPa`), rh: g(`relative_humidity_${p}hPa`), z: g(`geopotential_height_${p}hPa`),
      ws: g(`wind_speed_${p}hPa`) })).filter(r => r.z != null && (o.ps == null || r.p <= o.ps));
    o.prof.forEach(r => { r.rho = rho(r.p, r.t, r.rh); });
    o.tir = S.rtm !== "6s" && TL && Number.isFinite(w) ? tirBand(TL, "L8_B10", w, Math.max(0, (elevM || 0) / 1000), lat, d.times[k]) : null;
    o.rtIn = Number.isFinite(w) ? { w, aot: Number.isFinite(aod) ? aod : 0.1, sza: z, alt: Math.max(0, (elevM || 0) / 1000) } : null;
    return o;
  }

  // spiegazioni delle grandezze (al passaggio del mouse sulla legenda), nell'ordine delle serie dei due grafici
  const TIPS = ["Downward transmittance (Sun → ground) left by scattering of molecules and aerosols, direct + diffuse",
    "Upward transmittance (ground → sensor) left by scattering, direct + diffuse",
    "Transmittance of gas absorption (water vapour, ozone, O₂, CO₂, CH₄…) along the Sun – ground – sensor path",
    "Share of the surface signal that reaches the sensor: T↓ · T↑ · T gas",
    "Reflectance of the atmosphere for light coming from below: reflections between ground and atmosphere",
    "Light scattered by the atmosphere into the sensor without touching the ground",
    "Solar irradiance reaching a horizontal ground directly from the Sun",
    "Irradiance reaching the ground from the whole sky, after scattering"];

  // ---------------------------------------------------------------- pannello nel punto
  let cur = null;                                   // dati scaricati per il punto: { d, L, H, P }
  async function render(P) {
    const box = $("#a-box");
    $("#a-point").innerHTML = `<b>${P.label || "Point"}</b> · ${P.lat.toFixed(4)}, ${P.lon.toFixed(4)} · ${fmt(P.elev, 0)} m · local time ${P.tz}
      <span class="hint">(change the place with the search above)</span>`;
    box.innerHTML = '<p class="hint">Downloading atmospheric data…</p>';
    // data dell'immagine (passata): si scarica dal giorno prima al giorno dopo, per il grafico e per l'ora locale
    const iso = ms => new Date(ms).toISOString().slice(0, 10), today = iso(Date.now());
    if (!$("#a-date").value) $("#a-date").value = iso(Date.now() - 864e5);
    $("#a-date").max = today;
    $("#a-date").onchange = () => { if ($("#a-date").value) render(P); };
    const day = $("#a-date").value > today ? today : $("#a-date").value, d0 = Date.parse(day);
    let d, H, lib;
    try { [d, H, , lib] = await Promise.all([fetchPast(P, iso(d0 - 864e5), iso(Math.min(d0 + 864e5, Date.now()))), lut("hyper"), S.rtm === "6s" ? null : lut("tir"), SRF.library()]); }
    catch (e) { box.innerHTML = `<p class="error">Atmosphere download error: ${e.message}</p>`; return; }
    box.innerHTML = "";
    cur = { d, H, P };
    // risoluzione degli spettri: passo delle tabelle o bande di un sensore (risposte spettrali, srf.js)
    opts($("#a-specset"), [["grid", "Table grid (10 nm; LWIR 0.1 µm)"], ...Object.keys(lib).map(k => [k, k])], $("#a-specset").value || "grid");
    $("#a-specnote").textContent = H ? "" : "The radiative transfer tables are not available.";
    $("#a-specset").onchange = () => renderHour(+$("#a-hour").value);
    // ore del giorno scelto (ora locale del luogo); proposta: quella con il sole più alto (passaggio dei satelliti eliosincroni ~10:30)
    const tz = P.tz, idx = d.times.map((t, k) => k).filter(k => localParts(d.times[k], tz).date === day && d.h.total_column_integrated_water_vapour[k] != null);
    if (!idx.length) { box.innerHTML = `<p class="error">No archived model values for ${day} yet: choose an earlier date.</p>`; return; }
    const keep = $("#a-hour").selectedOptions[0]?.text.slice(11), same = idx.find(k => localParts(d.times[k], tz).hour === +(keep || "").slice(0, 2));
    let best = idx[0];
    for (const k of idx) if (sza(d.times[k] - 1800000, P.lat, P.lon) < sza(d.times[best] - 1800000, P.lat, P.lon)) best = k;
    const sel = keep && same != null ? same : best;
    opts($("#a-hour"), idx.map(k => { const l = localParts(d.times[k], tz); return [k, `${l.date} ${String(l.hour).padStart(2, "0")}:00`]; }), sel);
    $("#a-hour").onchange = () => renderHour(+$("#a-hour").value);
    renderHour(sel);
    // serie temporali di vapore acqueo e AOD
    const lab = d.times.map(t => { const l = localParts(t, tz); return `${l.date.slice(5)} ${String(l.hour).padStart(2, "0")}h`; });
    drawChart("a-ts", { type: "line", data: { labels: lab, datasets: [
      { label: "Water vapour column [kg m⁻² = mm]", data: d.h.total_column_integrated_water_vapour, borderColor: "#1f6feb", pointRadius: 0, yAxisID: "y" },
      { label: "AOD 550 nm (CAMS)", data: d.aod, borderColor: "#c4661f", pointRadius: 0, yAxisID: "y1" },
      { label: "Global irradiance [W m⁻²] /100", data: d.h.shortwave_radiation.map(v => (v == null ? null : v / 100)), borderColor: "#eab308", pointRadius: 0, borderDash: [4, 3], yAxisID: "y" }] },
      options: { animation: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom" } },
        scales: { y: { title: { display: true, text: "TCWV [mm] · GHI/100" } }, y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "AOD" } },
          x: { ticks: { maxTicksLimit: 12 } } } } });
  }

  function renderHour(k) {
    const { d, H, P } = cur;
    const o = derive(d, k, P.lat, P.lon, P.elev);
    if (H) renderSpectrum(d, k, P, o);
    $("#a-surf").innerHTML = `<dl class="kv">
      <dt>Water vapour column</dt><dd>${fmt(o.tcwv, 1)} kg m⁻² · ${fmt(o.w, 2)} g cm⁻²</dd>
      <dt>Aerosol optical depth 550 nm</dt><dd>${fmt(o.aod, 3)} <span class="hint">· dust ${fmt(o.dust, 0)} µg m⁻³</span></dd>
      <dt>Solar zenith angle</dt><dd>${fmt(o.sza, 1)}°</dd>
      <dt>Surface pressure</dt><dd>${fmt(o.ps, 1)} hPa</dd>
      <dt>Air temperature 2 m · dew point</dt><dd>${fmt(o.t2m, 1)} °C · ${fmt(o.td, 1)} °C · RH ${fmt(o.rh, 0)} %</dd>
      <dt>Air density at the surface</dt><dd>${fmt(o.rho, 4)} kg m⁻³</dd>
      <dt>Cloud cover</dt><dd>${fmt(o.cloud, 0)} %</dd>
      <dt>Irradiance (hour mean)</dt><dd>global ${fmt(o.ghi, 0)} · direct ${fmt(o.dir, 0)} · diffuse ${fmt(o.dif, 0)} · DNI ${fmt(o.dni, 0)} · TOA ${fmt(o.toa, 0)} W m⁻²</dd>
      <dt class="lwir">Thermal (LWIR)</dt><dd class="lwir">${S.rtm === "6s" ? "not covered by 6S: choose libRadtran" : o.tir
        ? `τ ${fmt(o.tir.tau, 3)} · L↑ ${fmt(o.tir.lu, 3)} · L↓ ${fmt(o.tir.ld, 3)} W m⁻² sr⁻¹ µm⁻¹ (Landsat 8/9 B10)` : "tables not available yet"}</dd>
    </dl>`;
    // profilo verticale
    const pr = o.prof;
    drawChart("a-prof", { type: "scatter", data: { datasets: [
      { label: "Temperature [°C]", data: pr.map(r => ({ x: r.t, y: r.z / 1000 })), showLine: true, borderColor: "#d62728", backgroundColor: "#d62728" },
      { label: "Relative humidity [%] /4", data: pr.map(r => ({ x: r.rh / 4, y: r.z / 1000 })), showLine: true, borderColor: "#1f6feb", backgroundColor: "#1f6feb" },
      { label: "Air density [kg m⁻³] ×20", data: pr.map(r => ({ x: r.rho * 20, y: r.z / 1000 })), showLine: true, borderColor: "#2ca02c", backgroundColor: "#2ca02c" }] },
      options: { animation: false, plugins: { legend: { position: "bottom" } },
        scales: { y: { title: { display: true, text: "Height [km]" } }, x: { title: { display: true, text: "value (scaled as in legend)" } } } } });
  }
  // bande dello spettro: passo delle tabelle o bande del sensore scelto; thermal: LWIR (8-13 µm) invece di VNIR-SWIR
  async function specBands(thermal) {
    const set = $("#a-specset").value;
    if (set === "grid") {
      const T = await lut(thermal ? "tir" : "hyper");
      return Object.keys(T.bands).filter(b => b.startsWith("WL_")).map(b => ({ name: b, wl: T.bands[b].wl_um * 1000, L: T, key: b }));
    }
    const bands = Object.entries(((await SRF.library())[set] || {}).bands || {}).filter(([, b]) => (thermal ? b.c > 3000 : b.c < 2550));
    return Promise.all(bands.map(async ([n, b]) => { const v = await SRF.band(b); return { name: n, wl: b.c, L: v.L, key: v.name }; }));
  }
  // spettri all'ora scelta: VNIR-SWIR (trasmittanze, radianza di percorso, irradianze) e LWIR (τ, L↑, L↓; solo libRadtran)
  async function renderSpectrum(d, k, P, o) {
    const lp = localParts(d.times[k], P.tz), i = o.rtIn, set = $("#a-specset").value, sensor = set === "grid" ? "" : `_${set.replace(/\W+/g, "")}`;
    const csvName = `spectrum_${P.lat.toFixed(3)}_${P.lon.toFixed(3)}_${lp.date}_${String(lp.hour).padStart(2, "0")}h${sensor}`;
    const csvHead = [`Prognostica - ${S.rtm === "6s" ? "6S" : "libRadtran"} at ${P.lat.toFixed(4)}, ${P.lon.toFixed(4)} (${fmt(P.elev, 0)} m), ${lp.date} ${String(lp.hour).padStart(2, "0")}:00 ${P.tz}${sensor ? `, bands of ${set}` : ""}`,
      i ? `inputs: water vapour ${i.w.toFixed(3)} g cm-2, AOD550 ${i.aot.toFixed(3)}, solar zenith ${i.sza.toFixed(2)} deg, altitude ${i.alt.toFixed(3)} km; nadir view, continental aerosol, ozone 0.30 cm-atm` : ""];
    const few = n => (n < 40 ? 3 : 0);
    const line = (rows, label, key, color, extra = {}) => ({ label, data: rows.map(r => ({ x: r.wl, y: r[key] })), borderColor: color, backgroundColor: color,
      pointRadius: few(rows.length), borderWidth: 1.6, showLine: set === "grid", ...extra });
    // VNIR-SWIR
    const rows = i && i.sza < 80 ? (await specBands(false)).map(b => { const r = rtBand(b.L, b.key, i.w, i.aot, i.sza, i.alt); return { wl: b.wl, ...r, t_tot: r.t_down * r.t_up * r.t_gas }; })
      .sort((a, b) => a.wl - b.wl) : [];
    $("#a-specnote").textContent = rows.length ? "" : "Sun below 10° elevation at this hour: no VNIR-SWIR spectrum.";
    const xs = { type: "linear", min: 400, max: 2500, title: { display: true, text: "Wavelength [nm]" } };
    const ct = drawChart("a-spec-t", { type: "scatter", data: { datasets: [line(rows, "T↓ scattering", "t_down", "#1f6feb"), line(rows, "T↑ scattering", "t_up", "#17becf"),
      line(rows, "T gas", "t_gas", "#9467bd"), line(rows, "Total T (↓·↑·gas)", "t_tot", "#111827", { borderWidth: 2.4 }),
      line(rows, "Spherical albedo S", "s_alb", "#8c564b", { borderDash: [4, 3] })] },
      options: { animation: false, csvName: csvName + "_transmittance", csvHead, plugins: { legend: { display: false } },
        scales: { x: xs, y: { min: 0, max: 1, title: { display: true, text: "Transmittance · spherical albedo" } } } } });
    const cl = drawChart("a-spec-l", { type: "scatter", data: { datasets: [line(rows, "Path radiance [W m⁻² sr⁻¹ µm⁻¹]", "l_path", "#c4661f", { yAxisID: "y" }),
      line(rows, "E direct [W m⁻² µm⁻¹]", "e_dir", "#d62728", { yAxisID: "y1" }), line(rows, "E diffuse [W m⁻² µm⁻¹]", "e_dif", "#2ca02c", { yAxisID: "y1" })] },
      options: { animation: false, csvName: csvName + "_radiance_irradiance", csvHead, plugins: { legend: { display: false } },
        scales: { x: xs, y: { title: { display: true, text: "Path radiance" }, min: 0 },
          y1: { position: "right", min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: "Irradiance" } } } } });
    htmlLegend(ct, $("#a-leg-t"), TIPS.slice(0, 5));
    htmlLegend(cl, $("#a-leg-l"), TIPS.slice(5));
    // LWIR
    const tir = S.rtm !== "6s" && TL && i ? (await specBands(true)).map(b => ({ wl: b.wl / 1000, ...tirBand(b.L, b.key, i.w, i.alt, P.lat, d.times[k]) })).sort((a, b) => a.wl - b.wl) : [];
    $("#a-tirnote").textContent = S.rtm === "6s" ? "6S does not cover the LWIR: choose libRadtran." : tir.length ? "" : "This sensor has no thermal bands.";
    const cw = drawChart("a-spec-tir", { type: "scatter", data: { datasets: [line(tir, "Transmittance τ", "tau", "#111827", { borderWidth: 2.2, yAxisID: "y" }),
      line(tir, "L↑ path [W m⁻² sr⁻¹ µm⁻¹]", "lu", "#c4661f", { yAxisID: "y1" }), line(tir, "L↓ sky [W m⁻² sr⁻¹ µm⁻¹]", "ld", "#1f6feb", { yAxisID: "y1" })] },
      options: { animation: false, csvName: csvName + "_lwir", csvHead, plugins: { legend: { display: false } },
        scales: { x: { type: "linear", min: 8, max: 13, title: { display: true, text: "Wavelength [µm]" } }, y: { min: 0, max: 1, title: { display: true, text: "Transmittance" } },
          y1: { position: "right", min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: "Radiance" } } } } });
    htmlLegend(cw, $("#a-leg-tir"), TIR_TIPS);
  }
  const TIR_TIPS = ["Transmittance of the atmosphere from the ground to the sensor, mostly set by water vapour",
    "Thermal radiance emitted by the atmosphere towards the sensor (upwelling path radiance)",
    "Thermal radiance emitted by the sky towards the ground (downwelling), partly reflected by the surface"];

  return { render, lut, available, sza, rtBand, tirBand };
})();
