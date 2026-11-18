// rkmap.js – vapore acqueo, AOD e grandezze di trasferimento radiativo ad alta risoluzione con il modello validato sulle misure.
// Cosa fa: per una data e un'ora passate calcola nel browser, su un reticolo di 30 m, le stesse covariate usate da Torricelli
//          (07_rk_validate.py) e applica il gradient boosting esportato (rk_model_<var>.json) che corregge ECMWF IFS / CAMS:
//            - modello (Open-Meteo: ECMWF IFS 0.25°, dal 3/2/2024; prima la rianalisi ERA5 0.25°; CAMS globale) nell'ora scelta, valore della cella di griglia:
//              vapore, AOD, polveri, temperatura e umidità a 2 m, pressione al suolo;
//            - terreno (tasselli Terrarium): quota, pendenza, TPI e rilievo entro 500 e 2000 m (quadrato di area uguale al cerchio);
//            - posizione, ora e giorno dell'anno.
//          Il modello si applica ogni 30 m (aree piccole) o 90 m e si riporta sui pixel della griglia della mappa.
//          Le grandezze RT usano vapore e AOD corretti nella LUT (6S o libRadtran) pixel per pixel, nella banda scelta (srf.js).
// Input:   griglia G (hires.js), data, ora UTC, grandezza, banda virtuale; funzione quota Z(lat, lon); modelli da S.meta.atmos_url.
// Output:  oggetto globale RKMAP.run() -> { est (corretto), trd (solo modello), sd (correzione), elev, step, rmse } sui pixel della griglia.
"use strict";

const RKMAP = (() => {
  const RES = 30, PAD = 2100;
  const models = {};

  async function model(v) {
    if (!models[v]) {
      const u = (S.meta.atmos_url || "").replace(/\/?$/, "/") + `data/validation/rk_model_${v}.json`;
      models[v] = fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
    }
    return models[v];
  }

  // immagine integrale per medie su finestre quadrate
  function integral(x, W, H) {
    const S1 = new Float64Array((W + 1) * (H + 1)), N1 = new Float64Array((W + 1) * (H + 1));
    for (let r = 0; r < H; r++) {
      let s = 0, n = 0;
      for (let c = 0; c < W; c++) {
        const v = x[r * W + c];
        if (Number.isFinite(v)) { s += v; n++; }
        const o = (r + 1) * (W + 1) + c + 1;
        S1[o] = S1[o - W - 1] + s; N1[o] = N1[o - W - 1] + n;
      }
    }
    return { S1, N1 };
  }
  function boxStat(I, W, H, r, c, h) {
    const r0 = Math.max(0, r - h), r1 = Math.min(H, r + h + 1), c0 = Math.max(0, c - h), c1 = Math.min(W, c + h + 1), w = W + 1;
    return [I.S1[r1 * w + c1] - I.S1[r0 * w + c1] - I.S1[r1 * w + c0] + I.S1[r0 * w + c0],
      I.N1[r1 * w + c1] - I.N1[r0 * w + c1] - I.N1[r1 * w + c0] + I.N1[r0 * w + c0]];
  }
  const HALF = { 500: Math.round(500 * Math.sqrt(Math.PI) / 2 / RES), 2000: Math.round(2000 * Math.sqrt(Math.PI) / 2 / RES) };

  // gradient boosting esportato (stessa regola di scikit-learn: NaN -> ramo "missing")
  function predict(M, x) {
    let s = M.baseline;
    for (const t of M.trees) {
      let i = 0;
      while (!t.leaf[i]) { const v = x[t.f[i]]; i = Number.isNaN(v) ? (t.m[i] ? t.l[i] : t.r[i]) : (v <= t.t[i] ? t.l[i] : t.r[i]); }
      s += t.v[i];
    }
    return s;
  }

  // valori del modello su un reticolo 9 x 9, nell'ora scelta; restituisce la funzione del punto più vicino (= cella del modello)
  // ECMWF IFS 0.25° è archiviato da Open-Meteo dal 3 febbraio 2024: prima si usa la rianalisi ERA5 (stessa griglia 0.25°)
  const IFS025_FROM = "2024-02-03";
  // valori del modello su un reticolo 9 x 9, nell'ora scelta; restituisce la funzione del punto più vicino (= cella del modello) e la fonte
  async function modelFields(bb, hourIso) {
    const n = 9, pts = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pts.push([bb.s + (bb.n - bb.s) * (i + 0.5) / n, bb.w + (bb.e - bb.w) * (j + 0.5) / n]);
    const day = hourIso.slice(0, 10), q = `latitude=${pts.map(p => p[0].toFixed(4))}&longitude=${pts.map(p => p[1].toFixed(4))}&start_date=${day}&end_date=${day}&timezone=GMT`;
    const era5 = day < IFS025_FROM, met = "hourly=total_column_integrated_water_vapour,temperature_2m,relative_humidity_2m,surface_pressure";
    const [m, a] = await Promise.all([
      fetch(era5 ? `https://archive-api.open-meteo.com/v1/archive?${q}&models=era5&${met}` : `https://historical-forecast-api.open-meteo.com/v1/forecast?${q}&models=ecmwf_ifs025&${met}`).then(r => r.json()),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&domains=cams_global&hourly=aerosol_optical_depth,dust`).then(r => r.json())]);
    if (m.error || a.error) throw new Error(m.reason || a.reason);
    const at = (j, v) => { const h = j.hourly, k = h.time.indexOf(hourIso.slice(0, 13) + ":00"); return k < 0 ? NaN : h[v][k] ?? NaN; };
    const M = [].concat(m), A = [].concat(a);
    const val = pts.map((p, k) => ({ tcwv_model: at(M[k], "total_column_integrated_water_vapour"), t2m_c: at(M[k], "temperature_2m"),
      rh2m: at(M[k], "relative_humidity_2m"), ps_hpa: at(M[k], "surface_pressure"), aod_model: at(A[k], "aerosol_optical_depth"), dust_ugm3: at(A[k], "dust") }));
    if (!val.some(v => Number.isFinite(v.tcwv_model))) throw new Error(`no water vapour values for ${hourIso.slice(0, 13)} UTC in the archive`);
    if (!val.some(v => Number.isFinite(v.aod_model))) throw new Error(`no CAMS aerosol values for ${hourIso.slice(0, 13)} UTC (the CAMS archive starts in August 2022)`);
    const near = (lat, lon) => {
      const i = Math.max(0, Math.min(n - 1, Math.floor((lat - bb.s) / (bb.n - bb.s) * n))), j = Math.max(0, Math.min(n - 1, Math.floor((lon - bb.w) / (bb.e - bb.w) * n)));
      return val[i * n + j];
    };
    return { near, source: era5 ? "ERA5 0.25°" : "ECMWF IFS 0.25°" };
  }

  // target: "tcwv", "aod", "rt:<grandezza>" (VNIR-SWIR) o "tir:<tau|lu|ld>"; vb: banda virtuale (srf.js) per rt/tir
  async function run(G, hourIso, target, vb, step, Z) {
    const rt = target.includes(":"), vars = target === "aod" ? ["aod550"] : target === "tcwv" ? ["tcwv"] : ["tcwv", "aod550"];
    const Ms = await Promise.all(vars.map(model));
    if (Ms.some(m => !m)) throw new Error("the validated model is not published yet");
    // reticolo di lavoro in UTM (fuso del centro): riquadro della griglia + 2 km, a 30 m
    const C = [(G.bb.w + G.bb.e) / 2, (G.bb.s + G.bb.n) / 2], zone = Math.floor((C[0] + 180) / 6) + 1;
    const T = proj4("EPSG:4326", HR.projDef((C[1] >= 0 ? 32600 : 32700) + zone));
    const cs = [[G.bb.w, G.bb.s], [G.bb.w, G.bb.n], [G.bb.e, G.bb.s], [G.bb.e, G.bb.n]].map(p => T.forward(p));
    const x0 = Math.floor((Math.min(...cs.map(p => p[0])) - PAD) / RES) * RES, x1 = Math.ceil((Math.max(...cs.map(p => p[0])) + PAD) / RES) * RES;
    const y0 = Math.floor((Math.min(...cs.map(p => p[1])) - PAD) / RES) * RES, y1 = Math.ceil((Math.max(...cs.map(p => p[1])) + PAD) / RES) * RES;
    const W = (x1 - x0) / RES, H = (y1 - y0) / RES;
    if (W * H > 16e6) throw new Error("area too large for the browser (max about 110 × 110 km)");
    step(10, "1/4 · terrain and model values…");
    const lon = new Float32Array(W * H), lat = new Float32Array(W * H), z = new Float32Array(W * H);
    for (let r = 0; r < H; r++) {
      const y = y1 - (r + 0.5) * RES;
      for (let c0 = 0; c0 < W; c0 += 16) {
        const c1 = Math.min(c0 + 16, W - 1), a0 = T.inverse([x0 + (c0 + 0.5) * RES, y]), a1 = T.inverse([x0 + (c1 + 0.5) * RES, y]);
        for (let c = c0; c <= c1; c++) { const t = c1 === c0 ? 0 : (c - c0) / (c1 - c0), i = r * W + c;
          lon[i] = a0[0] + t * (a1[0] - a0[0]); lat[i] = a0[1] + t * (a1[1] - a0[1]); z[i] = Z(lat[i], lon[i]); }
      }
    }
    const { near: mf, source } = await modelFields(G.bb, hourIso), ms = Date.parse(hourIso);
    const doy = (ms - Date.UTC(new Date(ms).getUTCFullYear(), 0, 0)) / 864e5;
    const fixed = { hour: new Date(ms).getUTCHours(), doy_sin: Math.sin(2 * Math.PI * doy / 365.25), doy_cos: Math.cos(2 * Math.PI * doy / 365.25) };
    // punti di previsione: ogni k pixel (30 m se l'area è piccola, altrimenti 90 m), dentro il margine
    const k = W * H <= 1e6 ? 1 : 3, h2 = Math.ceil(PAD / RES), PR = [], PC = [];
    for (let r = h2; r < H - h2; r += k) for (let c = h2; c < W - h2; c += k) { PR.push(r); PC.push(c); }
    const NP = PR.length, feats = {};
    Ms[0].features.forEach(f => { feats[f] = new Float32Array(NP).fill(NaN); });
    step(30, `2/4 · covariates at ${NP.toLocaleString()} points…`);
    await new Promise(r => setTimeout(r, 0));
    const Iz = integral(z, W, H), Iz2 = integral(Float32Array.from(z, v => v * v), W, H);
    for (let p = 0; p < NP; p++) {
      const r = PR[p], c = PC[p], i = r * W + c, zc = z[i];
      const gx = (z[i + 1] - z[i - 1]) / (2 * RES), gy = (z[i + W] - z[i - W]) / (2 * RES);
      const put = (f, v) => { if (feats[f]) feats[f][p] = v ?? NaN; };
      put("dem_elev", zc); put("slope_deg", Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI);
      for (const rad of [500, 2000]) {
        const [s, n] = boxStat(Iz, W, H, r, c, HALF[rad]), [s2] = boxStat(Iz2, W, H, r, c, HALF[rad]), mu = s / n;
        put(`tpi_${rad}`, zc - mu); put(`relief_${rad}`, Math.sqrt(Math.max(0, s2 / n - mu * mu)));
      }
      put("lat", lat[i]); put("lon", lon[i]);
      for (const [f, v] of Object.entries(mf(lat[i], lon[i]))) put(f, v);
      for (const [f, v] of Object.entries(fixed)) put(f, v);
    }
    step(45, "3/4 · applying the validated model…");
    const pred = {};
    for (const [vi, v] of vars.entries()) {
      const M = Ms[vi], x = new Float32Array(M.features.length), base = v === "tcwv" ? "tcwv_model" : "aod_model";
      const out = new Float32Array(NP), raw = feats[base];
      for (let p = 0; p < NP; p++) {
        M.features.forEach((f, j) => { x[j] = feats[f] ? feats[f][p] : NaN; });
        out[p] = raw[p] + predict(M, x);
        if (p % 20000 === 19999) { step(45 + 30 * (vi + p / NP) / vars.length, `3/4 · applying the validated model… ${Math.round(100 * p / NP)} %`); await new Promise(res => setTimeout(res, 0)); }
      }
      pred[v] = { out: out.map(x => Math.max(0, x)), raw };
    }
    // riporto sui pixel della griglia (bilineare sul reticolo di previsione) ed eventuale trasferimento radiativo
    step(75, "4/4 · values on the map pixels…");
    const nr = Math.floor((H - 2 * h2 - 1) / k) + 1, nc = Math.floor((W - 2 * h2 - 1) / k) + 1;
    const sample = (arr, x, y) => {
      const u = ((x - x0) / RES - 0.5 - h2) / k, v = ((y1 - y) / RES - 0.5 - h2) / k;
      const c = Math.max(0, Math.min(nc - 2, Math.floor(u))), r = Math.max(0, Math.min(nr - 2, Math.floor(v))), a = Math.min(1, Math.max(0, u - c)), q = Math.min(1, Math.max(0, v - r));
      const o = r * nc + c;
      return (1 - a) * (1 - q) * arr[o] + a * (1 - q) * arr[o + 1] + (1 - a) * q * arr[o + nc] + a * q * arr[o + nc + 1];
    };
    const qty = target.split(":")[1], tir = target.startsWith("tir:");
    const rtv = (w, aot, la, lo, alt) => {
      if (tir) return ATM.tirBand(vb.L, vb.name, w / 10, Math.max(0, alt / 1000), la, ms)[qty];
      const s = ATM.sza(ms, la, lo);
      if (s > 80) return NaN;                                    // sole troppo basso per le tabelle VNIR-SWIR
      const g = ATM.rtBand(vb.L, vb.name, w / 10, aot, s, Math.max(0, alt / 1000));
      return qty === "t_tot" ? g.t_down * g.t_up * g.t_gas : g[qty];
    };
    const N = G.W * G.H, est = new Float32Array(N), trd = new Float32Array(N), sd = new Float32Array(N), elev = new Float32Array(N);
    for (let r = 0; r < G.H; r++) {
      for (let c = 0; c < G.W; c++) {
        const i = r * G.W + c, [lo, la] = G.toLL(G.x0 + (c + 0.5) * G.dx, G.y0 - (r + 0.5) * G.dy), [x, y] = T.forward([lo, la]);
        const zz = Z(la, lo); elev[i] = zz;
        if (rt) {
          est[i] = rtv(sample(pred.tcwv.out, x, y), sample(pred.aod550.out, x, y), la, lo, zz);
          trd[i] = rtv(sample(pred.tcwv.raw, x, y), sample(pred.aod550.raw, x, y), la, lo, zz);
        } else {
          const P = pred[vars[0]]; est[i] = sample(P.out, x, y); trd[i] = sample(P.raw, x, y);
        }
        sd[i] = est[i] - trd[i];
      }
      if (r % 50 === 49) { step(75 + 25 * r / G.H, `4/4 · values on the map pixels… ${Math.round(100 * r / G.H)} %`); await new Promise(res => setTimeout(res, 0)); }
    }
    return { est, trd, sd, elev, step: k * RES, source, rmse: Object.fromEntries(vars.map((v, i) => [v, Ms[i].rmse_validation])) };
  }

  return { run };
})();
