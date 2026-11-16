// Atmosfera nel punto: vapore acqueo, aerosol, radiazione, profili, densità dell'aria
// e parametri di trasferimento radiativo per la correzione atmosferica (LUT 6S Sentinel-2 + TIR Landsat).
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
  // TIR Landsat 8/9 TIRS banda 10 (Jiménez-Muñoz et al. 2014), w in g cm-2
  function tir(w) {
    if (!Number.isFinite(w)) return {};
    const p1 = 0.04019 * w * w + 0.02916 * w + 1.01523, p2 = -0.38333 * w * w - 1.50294 * w + 0.20324,
      p3 = 0.00918 * w * w + 1.36072 * w - 0.27514;
    return { tau: 1 / p1, lu: -(p2 + p3) / p1, ld: p3 };
  }

  // ---------------------------------------------------------------- LUT 6S
  let lutP = null;
  function lut() {
    if (!lutP) {
      const urls = [S.meta.atmos_url ? S.meta.atmos_url.replace(/\/?$/, "/") + "data/rt/lut_s2.json" : null, DATA + "rt/lut_s2.json"].filter(Boolean);
      lutP = (async () => { for (const u of urls) { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch { /* prossimo */ } } return null; })();
    }
    return lutP;
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
  function derive(d, k, lat, lon, elevM, L) {
    const h = d.h, g = v => (h[v] ? h[v][k] : null);
    const w = g("total_column_integrated_water_vapour") / 10, aod = d.aod[k], z = sza(d.times[k] - 1800000, lat, lon);
    const o = { time: d.times[k], tcwv: g("total_column_integrated_water_vapour"), w, aod, dust: d.dust[k], sza: z,
      ps: g("surface_pressure"), t2m: g("temperature_2m"), rh: g("relative_humidity_2m"), td: g("dew_point_2m"),
      cloud: g("cloud_cover"), ghi: g("shortwave_radiation"), dir: g("direct_radiation"), dif: g("diffuse_radiation"),
      dni: g("direct_normal_irradiance"), toa: g("terrestrial_radiation") };
    o.rho = rho(o.ps, o.t2m, o.rh);
    o.tir = tir(w);
    o.prof = LEVELS.map(p => ({ p, t: g(`temperature_${p}hPa`), rh: g(`relative_humidity_${p}hPa`), z: g(`geopotential_height_${p}hPa`),
      ws: g(`wind_speed_${p}hPa`) })).filter(r => r.z != null && (o.ps == null || r.p <= o.ps));
    o.prof.forEach(r => { r.rho = rho(r.p, r.t, r.rh); });
    o.rt = null;
    if (L && Number.isFinite(w) && z < 80) {
      const a = Number.isFinite(aod) ? aod : 0.1;
      o.rt = Object.fromEntries(Object.keys(L.bands).map(b => [b, rtBand(L, b, w, a, z, Math.max(0, (elevM || 0) / 1000))]));
    }
    return o;
  }

  // ---------------------------------------------------------------- pannello nel punto
  async function render(P) {
    const box = $("#a-box");
    box.innerHTML = '<p class="hint">Downloading atmospheric data…</p>';
    let d, L;
    try { [[d], L] = await Promise.all([fetchMulti([{ lat: P.lat, lon: P.lon }], 1, 3, true), lut()]); }
    catch (e) { box.innerHTML = `<p class="error">Atmosphere download error: ${e.message}</p>`; return; }
    ATM.cur = { d, L, P };
    // ora proposta: la prossima con il sole più alto (circa il passaggio dei satelliti eliosincroni ~10:30 locali)
    const now = Date.now();
    const idx = d.times.map((t, k) => k).filter(k => d.times[k] >= now - 3600000);
    let best = idx[0];
    for (const k of idx.slice(0, 24)) if (sza(d.times[k] - 1800000, P.lat, P.lon) < sza(d.times[best] - 1800000, P.lat, P.lon)) best = k;
    const tz = P.tz;
    opts($("#a-hour"), d.times.map((t, k) => [k, (() => { const l = localParts(t, tz); return `${l.date} ${String(l.hour).padStart(2, "0")}:00`; })()]), best);
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
    const { d, L, P } = ATM.cur;
    const o = derive(d, k, P.lat, P.lon, P.elev, L);
    ATM.hour = o;
    const f = (v, n = 2) => fmt(v, n);
    $("#a-surf").innerHTML = `<dl class="kv">
      <dt>Water vapour column</dt><dd>${f(o.tcwv, 1)} kg m⁻² · ${f(o.w, 2)} g cm⁻²</dd>
      <dt>Aerosol optical depth 550 nm</dt><dd>${f(o.aod, 3)} <span class="hint">· dust ${f(o.dust, 0)} µg m⁻³</span></dd>
      <dt>Solar zenith angle</dt><dd>${f(o.sza, 1)}°</dd>
      <dt>Surface pressure</dt><dd>${f(o.ps, 1)} hPa</dd>
      <dt>Air temperature 2 m · dew point</dt><dd>${f(o.t2m, 1)} °C · ${f(o.td, 1)} °C · RH ${f(o.rh, 0)} %</dd>
      <dt>Air density at the surface</dt><dd>${f(o.rho, 4)} kg m⁻³</dd>
      <dt>Cloud cover</dt><dd>${f(o.cloud, 0)} %</dd>
      <dt>Irradiance (hour mean)</dt><dd>global ${f(o.ghi, 0)} · direct ${f(o.dir, 0)} · diffuse ${f(o.dif, 0)} · DNI ${f(o.dni, 0)} · TOA ${f(o.toa, 0)} W m⁻²</dd>
      <dt>TIR Landsat 8/9 B10 (10.9 µm)</dt><dd>τ ${f(o.tir.tau, 3)} · L↑ ${f(o.tir.lu, 3)} · L↓ ${f(o.tir.ld, 3)} W m⁻² sr⁻¹ µm⁻¹</dd>
    </dl>`;
    // profilo verticale
    const pr = o.prof;
    drawChart("a-prof", { type: "scatter", data: { datasets: [
      { label: "Temperature [°C]", data: pr.map(r => ({ x: r.t, y: r.z / 1000 })), showLine: true, borderColor: "#d62728", backgroundColor: "#d62728" },
      { label: "Relative humidity [%] /4", data: pr.map(r => ({ x: r.rh / 4, y: r.z / 1000 })), showLine: true, borderColor: "#1f6feb", backgroundColor: "#1f6feb" },
      { label: "Air density [kg m⁻³] ×20", data: pr.map(r => ({ x: r.rho * 20, y: r.z / 1000 })), showLine: true, borderColor: "#2ca02c", backgroundColor: "#2ca02c" }] },
      options: { animation: false, plugins: { legend: { position: "bottom" } },
        scales: { y: { title: { display: true, text: "Height [km]" } }, x: { title: { display: true, text: "value (scaled as in legend)" } } } } });
    $("#a-proft").innerHTML = `<thead><tr><th>Level [hPa]</th><th>Height [m]</th><th>T [°C]</th><th>RH [%]</th><th>Wind [km/h]</th><th>Density [kg m⁻³]</th></tr></thead><tbody>`
      + pr.map(r => `<tr><td>${r.p}</td><td>${f(r.z, 0)}</td><td>${f(r.t, 1)}</td><td>${f(r.rh, 0)}</td><td>${f(r.ws, 0)}</td><td>${f(r.rho, 4)}</td></tr>`).join("") + "</tbody>";
    // trasferimento radiativo per banda
    if (!L) { $("#a-rt").innerHTML = '<tbody><tr><td class="hint">Radiative-transfer table (6S) not available yet.</td></tr></tbody>'; return; }
    if (!o.rt) { $("#a-rt").innerHTML = '<tbody><tr><td class="hint">Sun below 10° elevation at this hour: VNIR-SWIR parameters not computed.</td></tr></tbody>'; return; }
    $("#a-rt").innerHTML = `<thead><tr><th>Sentinel-2 band [nm]</th><th>T↓ scattering</th><th>T↑ scattering</th><th>T gas</th><th>Total T (↓·↑·gas)</th>
      <th>Path radiance [W m⁻² sr⁻¹ µm⁻¹]</th><th>E direct [W m⁻² µm⁻¹]</th><th>E diffuse</th><th>Spherical albedo</th></tr></thead><tbody>`
      + Object.entries(o.rt).map(([b, r]) => `<tr><td>${S2NAME[b.replace("S2_", "")] || b}</td><td>${f(r.t_down, 4)}</td><td>${f(r.t_up, 4)}</td>
        <td>${f(r.t_gas, 4)}</td><td>${f(r.t_down * r.t_up * r.t_gas, 4)}</td><td>${f(r.l_path, 3)}</td><td>${f(r.e_dir, 1)}</td><td>${f(r.e_dif, 1)}</td><td>${f(r.s_alb, 4)}</td></tr>`).join("") + "</tbody>";
  }

  return { LEVELS, S2NAME, fetchMulti, derive, render, lut, sza, tir, rho, rtBand };
})();
