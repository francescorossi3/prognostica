// Mappa ad alta risoluzione (10 m) intorno al punto con regression kriging.
//   trend:   regressione lineare (OLS) del valore su covariate Copernicus a 10 m
//            (quota del DEM Copernicus: l'unica grandezza a 10 m che cambia l'atmosfera sopra il suolo)
//   residui: kriging ordinario con variogramma esponenziale stimato sui residui
//   verifica: leave-one-out sui punti campione (RK vs solo trend vs solo kriging)
// Input:  punto e righe della previsione (S.point, HR.rows da app.js), grandezze atmosferiche (ATM), modelli GPR (GP),
//         Open-Meteo Forecast API nei punti campione, DEM Terrarium (AWS).
// Output: scheda "Atmosphere RK" (mappa, legenda, punti di validazione), download CSV e GeoTIFF Float32 (EPSG:4326, con export.js).
"use strict";

const HR = (() => {
  let CELL = 10;                                    // m (scelto dall'utente: 10, 20, 30)
  let NS = 7;                                       // punti campione per lato (7 x 7 = 49 ... 11 x 11 = 121)

  // ---------------------------------------------------------------- DEM (tasselli Terrarium: EU-DEM/Copernicus in Europa)
  async function dem(bb, z = 14) {
    const tile = (lat, lon) => { const n = 2 ** z, la = lat * Math.PI / 180;
      return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n]; };
    const [x0, y0] = tile(bb.n, bb.w), [x1, y1] = tile(bb.s, bb.e);
    const tiles = new Map(), jobs = [];
    for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let y = Math.floor(y0); y <= Math.floor(y1); y++) {
      jobs.push((async () => {
        const blob = await (await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`)).blob();
        const img = await createImageBitmap(blob), c = new OffscreenCanvas(256, 256), g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        const px = g.getImageData(0, 0, 256, 256).data, e = new Float32Array(65536);
        for (let i = 0; i < 65536; i++) e[i] = px[4 * i] * 256 + px[4 * i + 1] + px[4 * i + 2] / 256 - 32768;
        tiles.set(`${x}/${y}`, e);
      })());
    }
    await Promise.all(jobs);
    // mosaico unico dei tasselli (accesso veloce, senza chiavi testuali)
    const tx0 = Math.floor(x0), ty0 = Math.floor(y0), ntx = Math.floor(x1) - tx0 + 1, nty = Math.floor(y1) - ty0 + 1, MW = ntx * 256, MH = nty * 256;
    const M = new Float32Array(MW * MH).fill(NaN);
    for (let tx = 0; tx < ntx; tx++) for (let ty = 0; ty < nty; ty++) {
      const t = tiles.get(`${tx0 + tx}/${ty0 + ty}`); if (!t) continue;
      for (let r = 0; r < 256; r++) M.set(t.subarray(r * 256, r * 256 + 256), (ty * 256 + r) * MW + tx * 256);
    }
    const n2 = 2 ** z * 256, D2R = Math.PI / 180;
    return (lat, lon) => {                           // bilineare sul mosaico
      const la = lat * D2R, u = (lon + 180) / 360 * n2 - tx0 * 256 - 0.5,
        v = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n2 - ty0 * 256 - 0.5;
      let i = Math.floor(u), j = Math.floor(v); const a = u - i, b = v - j;
      i = Math.max(0, Math.min(MW - 2, i)); j = Math.max(0, Math.min(MH - 2, j));
      const o = j * MW + i;
      return (1 - a) * (1 - b) * M[o] + a * (1 - b) * M[o + 1] + (1 - a) * b * M[o + MW] + a * b * M[o + MW + 1];
    };
  }

  // ---------------------------------------------------------------- algebra
  function solve(A, b) {                             // eliminazione di Gauss con pivot (A copiata)
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      if (Math.abs(M[c][c]) < 1e-12) M[c][c] = 1e-12;
      for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
    return x;
  }
  function invert(A) { const n = A.length; return A.map((_, j) => solve(A, A.map((_, i) => (i === j ? 1 : 0)))).reduce((I, col, j) => { col.forEach((v, i) => { I[i][j] = v; }); return I; }, A.map(() => new Array(n).fill(0))); }
  function ols(X, y, lambda = 1e-6) {                // X con colonna di 1; piccola ridge sulle covariate
    const p = X[0].length, XtX = Array.from({ length: p }, () => new Array(p).fill(0)), Xty = new Array(p).fill(0);
    X.forEach((r, i) => { for (let a = 0; a < p; a++) { Xty[a] += r[a] * y[i]; for (let b = 0; b < p; b++) XtX[a][b] += r[a] * r[b]; } });
    for (let a = 1; a < p; a++) XtX[a][a] += lambda * X.length;
    return solve(XtX, Xty);
  }
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

  // ---------------------------------------------------------------- variogramma esponenziale
  function variogram(xy, r) {
    const n = r.length, pairs = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]), 0.5 * (r[i] - r[j]) ** 2]);
    const dmax = Math.max(...pairs.map(p => p[0])), NB = 10, bins = Array.from({ length: NB }, () => [0, 0, 0]);
    pairs.forEach(([d, g]) => { if (d > dmax * 0.7) return; const k = Math.min(NB - 1, Math.floor(d / (dmax * 0.7) * NB)); bins[k][0] += d; bins[k][1] += g; bins[k][2]++; });
    const emp = bins.filter(b => b[2]).map(b => ({ h: b[0] / b[2], g: b[1] / b[2], n: b[2] }));
    const varr = r.reduce((s, v) => s + v * v, 0) / n;
    let best = { nug: varr, sill: 0, a: dmax, sse: Infinity };
    for (let k = 1; k <= 40; k++) {
      const a = dmax * 0.02 * k ** 1.3;
      // minimi quadrati pesati non negativi per nugget e sill parziale
      let s11 = 0, s12 = 0, s22 = 0, t1 = 0, t2 = 0;
      emp.forEach(e => { const f = 1 - Math.exp(-e.h / a), w = e.n; s11 += w; s12 += w * f; s22 += w * f * f; t1 += w * e.g; t2 += w * e.g * f; });
      const det = s11 * s22 - s12 * s12;
      let nug = det ? (t1 * s22 - t2 * s12) / det : t1 / s11, sill = det ? (s11 * t2 - s12 * t1) / det : 0;
      if (nug < 0) { nug = 0; sill = t2 / s22; }
      if (sill < 0) { sill = 0; nug = t1 / s11; }
      const sse = emp.reduce((s, e) => s + e.n * (e.g - nug - sill * (1 - Math.exp(-e.h / a))) ** 2, 0);
      if (sse < best.sse) best = { nug, sill, a, sse };
    }
    best.emp = emp;
    best.nug = Math.max(best.nug, 1e-9 * (varr || 1));
    return best;
  }
  const cov = (vg, h) => (h === 0 ? vg.nug + vg.sill : vg.sill * Math.exp(-h / vg.a));

  // kriging ordinario: sistema [C 1; 1 0]
  function okSystem(xy, vg) {
    const n = xy.length, A = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(1));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) A[i][j] = cov(vg, Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]));
    A[n][n] = 0;
    return A;
  }
  function okPredict(xy, r, vg, pts) {
    const A = okSystem(xy, vg), n = xy.length;
    return pts.map(p => {
      const k = xy.map(q => cov(vg, Math.hypot(q[0] - p[0], q[1] - p[1])));
      const w = solve(A, [...k, 1]);
      return { est: dot(w.slice(0, n), r), var: Math.max(0, vg.nug + vg.sill - dot(w.slice(0, n), k) - w[n]) };
    });
  }

  // ---------------------------------------------------------------- covariate
  const NAMES = ["elevation [m]"];
  const covariates = (z, lat, lon) => [z(lat, lon)];

  // ---------------------------------------------------------------- regression kriging completo
  function fit(F, y, xy) {
    const p = F[0].length, mu = [], sd = [];
    for (let j = 0; j < p; j++) { const c = F.map(r => r[j]), m = c.reduce((a, b) => a + b, 0) / c.length;
      mu.push(m); sd.push(Math.sqrt(c.reduce((a, b) => a + (b - m) ** 2, 0) / c.length) || 0); }
    const use = sd.map(s => s > 1e-6);                       // covariate costanti escluse
    const row = f => [1, ...f.map((v, j) => (use[j] ? (v - mu[j]) / sd[j] : 0)).filter((_, j) => use[j])];
    const X = F.map(row), beta = ols(X, y), tr = X.map(r => dot(r, beta)), res = y.map((v, i) => v - tr[i]);
    const vg = variogram(xy, res);
    // trend veloce: b0 + somma di c_j * f_j sulle sole covariate usate
    const cj = new Float64Array(p); let c0 = beta[0], kk = 1;
    for (let j = 0; j < p; j++) if (use[j]) { cj[j] = beta[kk] / sd[j]; c0 -= cj[j] * mu[j]; kk++; }
    const trend = f => { let t = c0; for (let j = 0; j < p; j++) t += cj[j] * f[j]; return t; };
    return { mu, sd, use, beta, row, res, vg, trend };
  }

  function metrics(obs, pred) {
    const n = obs.length, m = obs.reduce((a, b) => a + b, 0) / n;
    const e = pred.map((p, i) => p - obs[i]), sse = e.reduce((s, v) => s + v * v, 0), sst = obs.reduce((s, v) => s + (v - m) ** 2, 0);
    return { rmse: Math.sqrt(sse / n), mae: e.reduce((s, v) => s + Math.abs(v), 0) / n, bias: e.reduce((a, b) => a + b, 0) / n, r2: sst > 0 ? 1 - sse / sst : null, n };
  }

  function loocv(F, y, xy) {
    const rk = [], tr = [], ok = [], cover = [];
    for (let i = 0; i < y.length; i++) {
      const keep = y.map((_, j) => j !== i), Fi = F.filter((_, j) => keep[j]), yi = y.filter((_, j) => keep[j]), xyi = xy.filter((_, j) => keep[j]);
      const m = fit(Fi, yi, xyi), t = m.trend(F[i]), k = okPredict(xyi, m.res, m.vg, [xy[i]])[0];
      tr.push(t); rk.push(t + k.est);
      cover.push(Math.abs(y[i] - t - k.est) <= 1.96 * Math.sqrt(k.var + 1e-12));
      const mean = yi.reduce((a, b) => a + b, 0) / yi.length, vg0 = variogram(xyi, yi.map(v => v - mean));
      ok.push(mean + okPredict(xyi, yi.map(v => v - mean), vg0, [xy[i]])[0].est);
    }
    return { rk: metrics(y, rk), trend: metrics(y, tr), ok: metrics(y, ok), cover95: 100 * cover.filter(Boolean).length / cover.length,
      pred: { rk, trend: tr, ok } };
  }

  // ---------------------------------------------------------------- valori bersaglio nei punti campione
  // restituisce {values:[], unit, label} con la stessa lunghezza di samples
  async function targets(kind, samples, opt, Z) {
    if (kind === "forecast") {
      const P = S.point, agg = opt.agg, v = opt.v, key = opt.period;
      const grid = S.meta.providers.filter(p => p.gridded && Object.keys(P.raw).includes(p.id));
      const la = samples.map(s => s.lat.toFixed(5)).join(","), lo = samples.map(s => s.lon.toFixed(5)).join(",");
      const el = samples.map(s => Math.round(Z(s.lat, s.lon))).join(",");
      const url = `${S.meta.openmeteo_url}?latitude=${la}&longitude=${lo}&elevation=${el}&hourly=temperature_2m,precipitation`
        + `&models=${grid.map(p => p.model).join(",")}&forecast_days=8&past_days=${P.past}&timezone=GMT&timeformat=unixtime`;
      const js = await (await fetch(url)).json();
      if (js.error) throw new Error(js.reason);
      const lead = Math.max(0, dayDiff(key.slice(0, 10), localParts(Date.now(), P.tz).date));
      const ver = !!P.region && regionOf(P.region).verify !== false;
      const m = ver ? await GP.load(`${DATA}gp/${P.region}/${v}_${agg}_d${lead}.json`) : null;
      const vals = (Array.isArray(js) ? js : [js]).map((x, i) => {
        const h = x.hourly, times = h.time.map(t => t * 1000), per = {};
        for (const p of grid) {
          const kt = h[`temperature_2m_${p.model}`] ? `temperature_2m_${p.model}` : grid.length === 1 ? "temperature_2m" : null;
          if (!kt) continue;
          const kp = h[`precipitation_${p.model}`] ? `precipitation_${p.model}` : "precipitation";
          per[p.id] = aggregateSeries(times, h[kt], h[kp] || h[kt].map(() => null), agg, P.tz)[key]?.[v] ?? null;
        }
        if (m) { const g = GP.predict(m, { lat: samples[i].lat, lon: samples[i].lon, elev: Z(samples[i].lat, samples[i].lon), ...per }); if (g) return g.est; }
        const ok = Object.values(per).filter(x => x != null && isFinite(x));
        return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : NaN;
      });
      return { values: vals, unit: VAR_UNIT[v], label: `${m ? "GPR" : "Model mean"} · ${VAR_LABEL[v]} · ${AGG_LABEL[agg]} ${key.replace("T", " ")}`,
        source: m ? "GPR forecast from the Open-Meteo models at this point" : "Mean of the Open-Meteo models at this point" };
    }
    // grandezze atmosferiche all'ora scelta
    const [name, qty] = kind.split(":"), band = opt.band;
    const L = await ATM.lut(band && band.startsWith("WL_") ? "hyper" : "s2");
    const d = await ATM.fetchMulti(samples, 1, 3, false), t = opt.time;
    const vals = d.map((x, i) => {
      const k = x.times.indexOf(t);
      if (k < 0) return NaN;
      const o = ATM.derive(x, k, samples[i].lat, samples[i].lon, Z(samples[i].lat, samples[i].lon), L, band && L?.bands[band] ? [band] : []);
      if (name === "tcwv") return o.tcwv;
      if (name === "aod") return o.aod;
      if (name === "rho") return o.rho;
      if (name === "t2m") return o.t2m;
      if (name === "ghi") return o.ghi;
      if (name === "tirtau") return o.tir.tau;
      if (name === "tirlu") return o.tir.lu;
      if (name === "tirld") return o.tir.ld;
      if (name !== "spec" || !o.rt || !o.rt[band]) return NaN;
      const r = o.rt[band];
      return qty === "t_tot" ? r.t_down * r.t_up * r.t_gas : r[qty];
    });
    const lab = $("#h-target").selectedOptions[0].textContent + (name === "spec" ? ` at ${$("#h-wl").selectedOptions[0].textContent}` : "");
    return { values: vals, unit: "", label: `${lab} · ${$("#h-period").selectedOptions[0].textContent}`,
      source: "Open-Meteo atmosphere at this point (ECMWF IFS, CAMS aerosols) with the 6S tables for radiative transfer" };
  }

  // ---------------------------------------------------------------- interfaccia
  function targetOptions() {
    return [["forecast", "Forecast variable shown in the Forecast tab (GPR)"], ["tcwv", "Water vapour column [kg m⁻²]"], ["aod", "AOD 550 nm"],
      ["t2m", "Air temperature 2 m [°C]"], ["rho", "Air density [kg m⁻³]"], ["ghi", "Global irradiance [W m⁻²]"],
      ["tirtau", "TIR L8/9 B10 transmittance"], ["tirlu", "TIR L8/9 B10 upwelling radiance"], ["tirld", "TIR L8/9 B10 downwelling radiance"],
      ["spec:t_tot", "Total transmittance (T↓·T↑·T gas)"], ["spec:t_down", "Downward scattering transmittance T↓"], ["spec:t_up", "Upward scattering transmittance T↑"],
      ["spec:t_gas", "Gaseous transmittance"], ["spec:l_path", "Path radiance [W m⁻² sr⁻¹ µm⁻¹]"], ["spec:e_dir", "Direct irradiance [W m⁻² µm⁻¹]"],
      ["spec:e_dif", "Diffuse irradiance [W m⁻² µm⁻¹]"], ["spec:s_alb", "Spherical albedo"]];
  }
  async function wavelengths() {
    const H = await ATM.lut("hyper"), L = await ATM.lut("s2"), o = [];
    if (H) Object.entries(H.bands).forEach(([b, v]) => o.push([b, `${Math.round(v.wl_um * 1000)} nm`]));
    if (L) Object.keys(L.bands).forEach(b => o.push([b, `Sentinel-2 ${ATM.S2NAME[b.slice(3)]} nm`]));
    opts($("#h-wl"), o, $("#h-wl").value || (H ? "WL_550" : "S2_04"));
  }
  function init() {
    opts($("#h-target"), targetOptions(), "spec:t_tot");
    opts($("#h-size"), [[2, "2 × 2 km"], [5, "5 × 5 km"], [10, "10 × 10 km"], [30, "30 × 30 km"]], 30);
    opts($("#h-cell"), [[10, "10 m"], [20, "20 m"], [30, "30 m"]], 10);
    const tg = () => { $("#h-wl-wrap").style.display = $("#h-target").value.startsWith("spec:") ? "" : "none"; periods(); };
    $("#h-target").onchange = tg;
    $("#h-go").onclick = run;
    $("#h-csv").onclick = csv;
    $("#h-tif").onclick = geotiff;
    S.hmap = L.map("hmap");
    const pane = id => { S.hmap.createPane(id); return id; };
    const base = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap", pane: pane("hl-base") }).addTo(S.hmap);
    // layer della mappa a 10 m: in alto = disegnato sopra (pannello Layers come in QGIS)
    const raster = (key, name, ramp, visible) => ({ id: key, key, name, kind: "raster", visible, pane: pane("hl-" + key),
      style: MapStyle.create(ramp, 0.67), values: () => HR.out ? rasterOf(key) : [] });
    S.hl = [
      { id: "samples", name: "Validation points", kind: "samples", visible: true, pane: pane("hl-samples"), group: L.layerGroup().addTo(S.hmap) },
      raster("est", "Estimate (trend + kriged residual)", "RdYlBu", true),
      raster("sd", "Kriging standard deviation", "OrRd", false),
      raster("trend", "Trend only (elevation)", "RdYlBu", false),
      { id: "base", name: "OpenStreetMap", kind: "base", visible: true, pane: "hl-base", group: base },
    ];
    S.hsel = "est";
    S.hmap.setView([41.9, 12.5], 10);
    panels();
    tg(); wavelengths();
  }
  // periodi disponibili per il bersaglio scelto
  async function periods() {
    const kind = $("#h-target").value;
    if (kind === "forecast") {
      const rows = HR.rows || [];
      opts($("#h-period"), rows.filter(r => !r.past).map(r => [r.period, r.period.replace("T", " ")]), rows.find(r => !r.past)?.period);
    } else if (ATM.cur) {
      const { d, P } = ATM.cur;
      opts($("#h-period"), d.times.map(t => { const l = localParts(t, P.tz); return [t, `${l.date} ${String(l.hour).padStart(2, "0")}:00`]; }),
        +$("#a-hour").value >= 0 ? d.times[+$("#a-hour").value] : d.times[0]);
    }
  }

  async function run() {
    const P = S.point; if (!P) return;
    track("map-10m-" + $("#h-target").value.split(":")[0]);
    const st = $("#h-status"), size = +$("#h-size").value * 1000, kind = $("#h-target").value;
    CELL = +$("#h-cell").value;
    NS = size <= 5000 ? 7 : size <= 10000 ? 9 : 11;
    const mlat = 111320, mlon = 111320 * Math.cos(P.lat * Math.PI / 180);
    const half = size / 2, pad = size * 0.1;
    const bb = { s: P.lat - (half + pad) / mlat, n: P.lat + (half + pad) / mlat, w: P.lon - (half + pad) / mlon, e: P.lon + (half + pad) / mlon };
    const bar = $("#h-progress"), t0 = performance.now();
    const step = (pct, text) => { bar.hidden = false; bar.value = pct; st.textContent = `${text} · ${((performance.now() - t0) / 1000).toFixed(0)} s`; };
    try {
      step(2, "1/4 · downloading the elevation (Copernicus DEM)…");
      const Z = await dem(bb, size <= 10000 ? 14 : 13);
      // punti campione: griglia regolare NS x NS sul riquadro
      const samples = [];
      for (let i = 0; i < NS; i++) for (let j = 0; j < NS; j++)
        samples.push({ lat: bb.s + (bb.n - bb.s) * (i + 0.5) / NS, lon: bb.w + (bb.e - bb.w) * (j + 0.5) / NS });
      step(20, `2/4 · downloading the values at ${samples.length} sample points…`);
      const opt = { agg: $("#p-agg").value, v: $("#p-var").value, period: $("#h-period").value, time: +$("#h-period").value, band: $("#h-wl").value };
      const T = await targets(kind, samples, opt, Z);
      const good = T.values.map((v, i) => (Number.isFinite(v) ? i : -1)).filter(i => i >= 0);
      if (good.length < 12) throw new Error("too few valid sample values for this variable and period (VNIR-SWIR parameters need the sun above 10°: choose a daytime hour)");
      const xyOf = (lat, lon) => [(lon - P.lon) * mlon, (lat - P.lat) * mlat];
      const F = good.map(i => covariates(Z, samples[i].lat, samples[i].lon));
      const y = good.map(i => T.values[i]), xy = good.map(i => xyOf(samples[i].lat, samples[i].lon));
      step(35, "3/4 · fitting trend + variogram, leave-one-out validation…");
      await new Promise(r => setTimeout(r, 20));
      const M = fit(F, y, xy), cv = loocv(F, y, xy);
      step(45, `4/4 · predicting on the ${CELL} m grid…`);
      await new Promise(r => setTimeout(r, 20));
      const N = Math.round(size / CELL), est = new Float32Array(N * N), trd = new Float32Array(N * N), sd = new Float32Array(N * N),
        elev = new Float32Array(N * N);
      const A = okSystem(xy, M.vg), n = xy.length, alpha = solve(A, [...M.res, 0]);
      const Ainv = invert(A), lat0 = P.lat + half / mlat, lon0 = P.lon - half / mlon;
      const SD_STEP = Math.max(5, Math.round(50 / CELL)), qx = Float64Array.from(xy, q => q[0]), qy = Float64Array.from(xy, q => q[1]);
      const k = new Float64Array(n + 1), sill = M.vg.nug + M.vg.sill;
      for (let r = 0; r < N; r++) {
        const lat = lat0 - (r + 0.5) * CELL / mlat;
        for (let c = 0; c < N; c++) {
          const lon = lon0 + (c + 0.5) * CELL / mlon, f = covariates(Z, lat, lon);
          const px = (lon - P.lon) * mlon, py = (lat - P.lat) * mlat;
          let kr = alpha[n];
          for (let j = 0; j < n; j++) { const h = Math.hypot(qx[j] - px, qy[j] - py); k[j] = h === 0 ? sill : M.vg.sill * Math.exp(-h / M.vg.a); kr += k[j] * alpha[j]; }
          const t = M.trend(f), i = r * N + c;
          trd[i] = t; est[i] = t + kr; elev[i] = f[0];
          if (r % SD_STEP === 0 && c % SD_STEP === 0) {
            k[n] = 1; let q = 0;
            for (let a2 = 0; a2 <= n; a2++) { let s2 = 0; const row = Ainv[a2]; for (let b2 = 0; b2 <= n; b2++) s2 += row[b2] * k[b2]; q += k[a2] * s2; }
            sd[i] = Math.sqrt(Math.max(0, sill - q));
          } else sd[i] = sd[Math.floor(r / SD_STEP) * SD_STEP * N + Math.floor(c / SD_STEP) * SD_STEP];
        }
        if (r % 20 === 19) { step(45 + 55 * (r + 1) / N, `4/4 · predicting on the ${CELL} m grid… ${Math.round(100 * (r + 1) / N)} %`); await new Promise(res => setTimeout(res, 0)); }
      }
      HR.out = { N, cell: CELL, est, trd, sd, elev, lat0, lon0, mlat, mlon, half, T, M, cv, samples: good.map(i => samples[i]), y, P };
      draw(true); report();
      bar.hidden = true;
      st.textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(0)} s · ${N} × ${N} cells of ${CELL} m · ${good.length} sample points`;
      $("#h-csv").disabled = N * N > 1500000;
    } catch (e) { bar.hidden = true; st.innerHTML = `<span class="error">${e.message}</span>`; console.error(e); }
  }

  const rasterOf = key => ({ est: HR.out.est, sd: HR.out.sd, trend: HR.out.trd }[key]);
  // layer scelto nel pannello per GeoTIFF/legenda: quello selezionato, altrimenti la stima
  const selRaster = () => S.hl.find(l => l.id === S.hsel && l.kind === "raster") || S.hl.find(l => l.key === "est");

  async function rasterImage(l, bounds) {
    const o = HR.out, C = MapStyle.classify(l.style, l.values());
    const c = document.createElement("canvas"); c.width = c.height = o.N;
    const g = c.getContext("2d"), im = g.createImageData(o.N, o.N), a = l.values();
    for (let i = 0; i < a.length; i++) { const col = C.color(a[i]); if (col) im.data.set(col, 4 * i); }
    g.putImageData(im, 0, 0);
    if (l.overlay) S.hmap.removeLayer(l.overlay);
    if (l.url) URL.revokeObjectURL(l.url);
    l.url = URL.createObjectURL(await new Promise(res => c.toBlob(res)));
    l.overlay = L.imageOverlay(l.url, bounds, { pane: l.pane }).addTo(S.hmap);
    l.overlay.getElement().style.imageRendering = "pixelated";
    const lab = ["est", "trend", "sd"].includes(l.key) ? `${l.name} · ${o.T.label}` : l.name;
    return MapStyle.legend(lab, "", C);
  }

  async function draw(fit = false, keepPanels = false) {
    const o = HR.out;
    if (!o) return panels();
    const bounds = [[o.P.lat - o.half / o.mlat, o.P.lon - o.half / o.mlon], [o.P.lat + o.half / o.mlat, o.P.lon + o.half / o.mlon]];
    const legends = [];
    for (const [n, l] of S.hl.entries()) {
      S.hmap.getPane(l.pane).style.zIndex = 450 - 5 * n;
      if (l.kind === "base") { l.visible ? l.group.addTo(S.hmap) : S.hmap.removeLayer(l.group); continue; }
      if (l.kind === "samples") {
        l.group.clearLayers();
        if (l.visible) {
          const p = o.cv.pred, err = o.y.map((v, i) => p.rk[i] - v), mx = Math.max(...err.map(Math.abs), 1e-12);
          o.samples.forEach((s, i) => L.circleMarker([s.lat, s.lon], { pane: l.pane, radius: 3 + 9 * Math.abs(err[i]) / mx,
            color: "#15233b", weight: 1, fillColor: err[i] > 0 ? "#d49a3a" : "#23707e", fillOpacity: .85 })
            .bindPopup(`<b>Sample point ${i + 1}</b> · ${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}<br>
              Value at the point: <b>${fmt(o.y[i], 4)}</b><br><span class="hint">${o.T.source}</span><br>
              Leave-one-out prediction (point left out):<br>RK ${fmt(p.rk[i], 4)} (error ${fmt(err[i], 4)}) · trend only ${fmt(p.trend[i], 4)} · kriging only ${fmt(p.ok[i], 4)}`)
            .addTo(l.group));
          legends.push(`<div class="lg"><b>Validation points</b> <span>(${o.samples.length})</span>
            <div class="lg-row"><span class="dot"></span><span>Size = leave-one-out error of RK</span><span>(max ${fmt(mx, 4)})</span></div>
            <div class="lg-row"><span class="sw" style="background:#d49a3a"></span><span>RK too high</span></div>
            <div class="lg-row"><span class="sw" style="background:#23707e"></span><span>RK too low</span></div></div>`);
        }
        continue;
      }
      if (!l.visible) { if (l.overlay) { S.hmap.removeLayer(l.overlay); l.overlay = null; } continue; }
      legends.push(await rasterImage(l, bounds));
    }
    $("#h-legend").innerHTML = legends.join("");
    if (fit) S.hmap.fitBounds(bounds);
    if (!keepPanels) panels();
    S.hmap.off("click"); S.hmap.on("click", e => {
      const r = Math.floor((o.lat0 - e.latlng.lat) * o.mlat / o.cell), cc = Math.floor((e.latlng.lng - o.lon0) * o.mlon / o.cell);
      if (r < 0 || cc < 0 || r >= o.N || cc >= o.N) return;
      const i = r * o.N + cc;
      L.popup().setLatLng(e.latlng).setContent(`<b>${fmt(o.est[i], 3)}</b> ± ${fmt(o.sd[i], 3)} (kriging SD)<br>trend ${fmt(o.trd[i], 3)} · elevation ${fmt(o.elev[i], 0)} m`).openOn(S.hmap);
    });
  }

  function panels() {
    MapStyle.layersPanel($("#h-layers"), S.hl, S.hsel, {
      toggle: () => draw(), order: () => draw(),
      select: l => { S.hsel = l.id; panels(); },
      remove: () => draw(),
    });
    const l = S.hl.find(x => x.id === S.hsel && x.kind === "raster");
    if (!HR.out && l) { $("#h-style").innerHTML = `<p class="hint">Build the map to change the style of its layers.</p>`; return; }
    MapStyle.stylePanel($("#h-style"), l, () => draw(false, true));
  }

  function report() {
    const o = HR.out, M = o.M, cv = o.cv;
    const names = NAMES.filter((_, j) => M.use[j]);
    const row = (lab, m, cls = "") => `<tr class="${cls}"><td>${lab}</td><td>${fmt(m.rmse, 4)}</td><td>${fmt(m.mae, 4)}</td><td>${fmt(m.bias, 4)}</td><td>${fmt(m.r2, 3)}</td></tr>`;
    $("#h-metrics").innerHTML = `<thead><tr><th>Method (leave-one-out, n = ${cv.rk.n})</th><th>RMSE</th><th>MAE</th><th>Bias</th><th>R²</th></tr></thead><tbody>
      ${row("◆ Regression kriging", cv.rk, "combo")}${row("Trend only (regression on Copernicus covariates)", cv.trend)}${row("Ordinary kriging only (no covariates)", cv.ok)}
      <tr><td>RK 95% interval coverage</td><td colspan="4" style="text-align:left">${fmt(cv.cover95, 0)} % of the left-out samples (ideal ≈ 95 %)</td></tr></tbody>`;
    $("#h-model").innerHTML = `<dl class="kv"><dt>Target</dt><dd>${o.T.label}</dd>
      <dt>Trend coefficients<br><span class="hint">(per 1 SD of the covariate)</span></dt><dd>intercept ${fmt(M.beta[0], 4)}<br>${names.map((nm, j) => `${nm}: ${fmt(M.beta[j + 1], 4)} <span class="hint">(SD ${fmt(M.sd[NAMES.indexOf(nm)], 2)})</span>`).join("<br>")}</dd>
      <dt>Residual variogram</dt><dd>exponential · nugget ${fmt(M.vg.nug, 5)} · partial sill ${fmt(M.vg.sill, 5)} · range ${fmt(M.vg.a * 3 / 1000, 2)} km (practical)</dd></dl>`;
  }

  function csv() {
    const o = HR.out; if (!o || o.N * o.N > 1500000) return;
    const rows = [["lat", "lon", "estimate", "kriging_sd", "trend", "elevation_m"]];
    for (let r = 0; r < o.N; r++) for (let c = 0; c < o.N; c++) {
      const i = r * o.N + c;
      rows.push([+(o.lat0 - (r + 0.5) * o.cell / o.mlat).toFixed(6), +(o.lon0 + (c + 0.5) * o.cell / o.mlon).toFixed(6), o.est[i], o.sd[i], o.trd[i], o.elev[i]]);
    }
    EXPORT.save(EXPORT.csv(rows, [o.T.label]), `rk_${o.cell}m_${o.P.lat.toFixed(4)}_${o.P.lon.toFixed(4)}.csv`);
  }

  // GeoTIFF dello strato selezionato nel pannello Layers
  function geotiff() {
    const o = HR.out; if (!o) return;
    const lay = selRaster();
    EXPORT.geotiff(rasterOf(lay.key), o.N, o.N, o.lon0, o.lat0, o.cell / o.mlon, o.cell / o.mlat, `${o.T.label} | ${lay.name} | regression kriging, Prognostica`,
      `rk_${lay.key}_${o.cell}m_${o.P.lat.toFixed(4)}_${o.P.lon.toFixed(4)}.tif`);
  }

  return { init, periods, run, geotiff, variogram, fit, loocv, okPredict, metrics };
})();
