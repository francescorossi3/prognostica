// Atmosfera nel punto: vapore acqueo, aerosol, radiazione, profili, densità dell'aria
// e parametri di trasferimento radiativo per la correzione atmosferica (LUT 6S Sentinel-2 + TIR Landsat).
// Input:  punto scelto (S.point di app.js), Open-Meteo Forecast (ECMWF IFS) e Air Quality (CAMS) API,
//         LUT 6S data/rt/lut_s2.json e lut_hyper.json (da Torricelli, con copia locale di riserva).
// Output: scheda Atmosphere (riepilogo e grafici, CSV dei grafici con export.js); oggetto globale ATM usato da hires.js.
"use strict";

const ATM = (() => {
  const LEVELS = [1000, 925, 850, 700, 500, 300, 200];
  const SURF = ["total_column_integrated_water_vapour", "surface_pressure", "temperature_2m", "relative_humidity_2m",
    "dew_point_2m", "cloud_cover", "shortwave_radiation", "direct_radiation", "diffuse_radiation", "direct_normal_irradiance",
    "terrestrial_radiation"];
  const PROF = LEVELS.flatMap(p => [`temperature_${p}hPa`, `relative_humidity_${p}hPa`, `geopotential_height_${p}hPa`, `wind_speed_${p}hPa`]);
  const RD = 287.05;
  const S2NAME = { "01": "B1 443", "02": "B2 490", "03": "B3 560", "04": "B4 665", "05": "B5 705", "06": "B6 740", "07": "B7 783",
    "08": "B8 842", "8A": "B8A 865", "09": "B9 945", "10": "B10 1375", "11": "B11 1610", "12": "B12 2190" };

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

  // ---------------------------------------------------------------- download
  // locs: [{lat, lon}]; restituisce per ogni punto {times, h: {var: []}, aod: []}
  async function fetchMulti(locs, pastDays = 1, days = 3, withProfiles = true) {
    const la = locs.map(p => p.lat.toFixed(4)).join(","), lo = locs.map(p => p.lon.toFixed(4)).join(",");
    const vars = withProfiles ? [...SURF, ...PROF] : SURF;
    const u1 = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=${vars.join(",")}`
      + `&models=ecmwf_ifs025&past_days=${pastDays}&forecast_days=${days}&timeformat=unixtime&timezone=GMT`;
    const u2 = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${la}&longitude=${lo}&hourly=aerosol_optical_depth,dust`
      + `&past_days=${pastDays}&forecast_days=${Math.min(days, 5)}&timeformat=unixtime&timezone=GMT`;
    const [a, b] = await Promise.all([fetch(u1).then(r => r.json()), fetch(u2).then(r => r.json()).catch(() => null)]);
    if (a.error) throw new Error(a.reason);
    const A = Array.isArray(a) ? a : [a], B = b && !b.error ? (Array.isArray(b) ? b : [b]) : [];
    return A.map((x, i) => {
      const times = x.hourly.time.map(t => t * 1000), aq = B[i]?.hourly;
      const amap = new Map((aq?.time || []).map((t, k) => [t * 1000, [aq.aerosol_optical_depth[k], aq.dust[k]]]));
      return { times, h: x.hourly, elev: x.elevation, aod: times.map(t => amap.get(t)?.[0] ?? null), dust: times.map(t => amap.get(t)?.[1] ?? null) };
    });
  }

  // tutte le grandezze derivate in un'ora (k) di un punto
  function derive(d, k, lat, lon, elevM, L, only = null) {
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
    o.rt = null;
    o.tir = S.rtm !== "6s" && TL && Number.isFinite(w) ? tirBand(TL, "L8_B10", w, Math.max(0, (elevM || 0) / 1000), lat, d.times[k]) : null;
    if (L && Number.isFinite(w) && z < 80) {
      const a = Number.isFinite(aod) ? aod : 0.1, alt = Math.max(0, (elevM || 0) / 1000);
      o.rt = Object.fromEntries((only || Object.keys(L.bands)).map(b => [b, rtBand(L, b, w, a, z, alt)]));
      o.rtIn = { w, aot: a, sza: z, alt };
    }
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
  async function render(P) {
    const box = $("#a-box");
    $("#a-point").innerHTML = `<b>${P.label || "Point"}</b> · ${P.lat.toFixed(4)}, ${P.lon.toFixed(4)} · ${fmt(P.elev, 0)} m · local time ${P.tz}
      <span class="hint">(change the place with the search above)</span>`;
    box.innerHTML = '<p class="hint">Downloading atmospheric data…</p>';
    let d, L, H;
    try { [[d], L, H] = await Promise.all([fetchMulti([{ lat: P.lat, lon: P.lon }], 1, 3, true), lut("s2"), lut("hyper"), S.rtm === "6s" ? null : lut("tir")]); }
    catch (e) { box.innerHTML = `<p class="error">Atmosphere download error: ${e.message}</p>`; return; }
    box.innerHTML = "";
    ATM.cur = { d, L, H, P };
    const sets = [...(H ? [["hyper", `6S every ${Math.round((H.bands[Object.keys(H.bands)[1]].wl_um - H.bands[Object.keys(H.bands)[0]].wl_um) * 1000)} nm (${Object.keys(H.bands).length} wavelengths)`]] : []),
      ["s2", "Sentinel-2 bands (13)"]];
    opts($("#a-specset"), sets, $("#a-specset").value && sets.some(x => x[0] === $("#a-specset").value) ? $("#a-specset").value : sets[0][0]);
    $("#a-specnote").textContent = H ? "" : "The hyperspectral 6S table is not available yet: Sentinel-2 bands for now.";
    $("#a-specset").onchange = () => renderHour(+$("#a-hour").value);
    // ora proposta: la prossima con il sole più alto (circa il passaggio dei satelliti eliosincroni ~10:30 locali)
    const now = Date.now();
    const idx = d.times.map((t, k) => k).filter(k => d.times[k] >= now - 3600000);
    let best = idx[0];
    for (const k of idx.slice(0, 24)) if (sza(d.times[k] - 1800000, P.lat, P.lon) < sza(d.times[best] - 1800000, P.lat, P.lon)) best = k;
    const tz = P.tz;
    opts($("#a-hour"), d.times.map((t, k) => { const l = localParts(t, tz); return [k, `${l.date} ${String(l.hour).padStart(2, "0")}:00`]; }), best);
    $("#a-hour").onchange = () => renderHour(+$("#a-hour").value);
    renderHour(best);
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
    const { d, L, H, P } = ATM.cur;
    const o = derive(d, k, P.lat, P.lon, P.elev, L);
    ATM.hour = o;
    renderSpectrum(d, k, P, $("#a-specset").value === "hyper" ? H : L);
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
  // spettro di trasmittanze, radianza di percorso e irradianze all'ora scelta
  function spectrum(d, k, P, LL) {
    const o = derive(d, k, P.lat, P.lon, P.elev, LL);
    if (!o.rt) return { o, rows: [] };
    const rows = Object.entries(o.rt).map(([b, r]) => ({ band: b, wl: LL.bands[b].wl_um ? LL.bands[b].wl_um * 1000 : S2WL[b.replace("S2_", "")], ...r,
      t_tot: r.t_down * r.t_up * r.t_gas })).sort((a, b) => a.wl - b.wl);
    return { o, rows };
  }
  function renderSpectrum(d, k, P, LL) {
    ATM.spec = null;
    if (!LL) return;
    const { o, rows } = spectrum(d, k, P, LL);
    ATM.spec = { o, rows, time: d.times[k], P };
    if (!rows.length) {
      $("#a-specnote").textContent = "Sun below 10° elevation at this hour: no VNIR-SWIR spectrum.";
      ["a-spec-t", "a-spec-l"].forEach(id => drawChart(id, { type: "line", data: { datasets: [] } })); $("#a-leg-t").innerHTML = $("#a-leg-l").innerHTML = "";
      return;
    }
    const lp = localParts(d.times[k], P.tz), i = o.rtIn;
    const csvName = `spectrum_${P.lat.toFixed(3)}_${P.lon.toFixed(3)}_${lp.date}_${String(lp.hour).padStart(2, "0")}h`;
    const csvHead = [`Prognostica - 6S at ${P.lat.toFixed(4)}, ${P.lon.toFixed(4)} (${fmt(P.elev, 0)} m), ${lp.date} ${String(lp.hour).padStart(2, "0")}:00 ${P.tz}`,
      `inputs: water vapour ${i.w.toFixed(3)} g cm-2, AOD550 ${i.aot.toFixed(3)}, solar zenith ${i.sza.toFixed(2)} deg, altitude ${i.alt.toFixed(3)} km; nadir view, continental aerosol, ozone 0.30 cm-atm`];
    const xy = key => rows.map(r => ({ x: r.wl, y: r[key] }));
    const line = (label, key, color, extra = {}) => ({ label, data: xy(key), borderColor: color, backgroundColor: color, pointRadius: rows.length < 20 ? 3 : 0, borderWidth: 1.6, showLine: true, ...extra });
    const xs = { type: "linear", min: 400, max: 2500, title: { display: true, text: "Wavelength [nm]" } };
    const ct = drawChart("a-spec-t", { type: "scatter", data: { datasets: [line("T↓ scattering", "t_down", "#1f6feb"), line("T↑ scattering", "t_up", "#17becf"),
      line("T gas", "t_gas", "#9467bd"), line("Total T (↓·↑·gas)", "t_tot", "#111827", { borderWidth: 2.4 }),
      line("Spherical albedo S", "s_alb", "#8c564b", { borderDash: [4, 3] })] },
      options: { animation: false, csvName: csvName + "_transmittance", csvHead, plugins: { legend: { display: false } },
        scales: { x: xs, y: { min: 0, max: 1, title: { display: true, text: "Transmittance · spherical albedo" } } } } });
    const cl = drawChart("a-spec-l", { type: "scatter", data: { datasets: [line("Path radiance [W m⁻² sr⁻¹ µm⁻¹]", "l_path", "#c4661f", { yAxisID: "y" }),
      line("E direct [W m⁻² µm⁻¹]", "e_dir", "#d62728", { yAxisID: "y1" }), line("E diffuse [W m⁻² µm⁻¹]", "e_dif", "#2ca02c", { yAxisID: "y1" }) ] },
      options: { animation: false, csvName: csvName + "_radiance_irradiance", csvHead, plugins: { legend: { display: false } },
        scales: { x: xs, y: { title: { display: true, text: "Path radiance" }, min: 0 },
          y1: { position: "right", min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: "Irradiance" } } } } });
    htmlLegend(ct, $("#a-leg-t"), TIPS.slice(0, 5));
    htmlLegend(cl, $("#a-leg-l"), TIPS.slice(5));
  }
  const S2WL = { "01": 443, "02": 490, "03": 560, "04": 665, "05": 705, "06": 740, "07": 783, "08": 842, "8A": 865, "09": 945, "10": 1375, "11": 1610, "12": 2190 };

  return { LEVELS, S2NAME, S2WL, fetchMulti, derive, render, lut, available, sza, rho, rtBand };
})();
