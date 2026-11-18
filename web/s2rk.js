// s2rk.js – vapore acqueo e AOD ad alta risoluzione con il modello validato sulle misure (AERONET, GNSS), per una data passata.
// Cosa fa: per un'immagine Sentinel-2 L2A scelta dall'utente calcola nel browser le stesse covariate usate da Torricelli
//          (07_rk_validate.py) e applica il gradient boosting esportato (rk_model_<var>.json) che corregge ECMWF IFS / CAMS:
//            - Sentinel-2 (Earth Search, COG su AWS, letti solo nella finestra che serve): AOT, vapore (WVP), riflettanze,
//              NDVI, NDBI, NDWI, frazioni della classificazione SCL, medie entro 60, 500 e 2000 m sui pixel validi
//              (60 m: cerchio esatto; 500 e 2000 m: quadrato di uguale area);
//            - terreno (tasselli Terrarium): quota, pendenza, TPI e rilievo a 500 e 2000 m;
//            - modello (Open-Meteo: ECMWF IFS 0.25°, CAMS globale) all'ora dell'immagine, valore della cella di griglia;
//            - posizione, giorno dell'anno, elevazione solare e copertura nuvolosa della scena.
//          Il modello si applica su una griglia di 20 m (aree piccole) o 60 m e si riporta sui pixel della griglia della mappa.
//          Per le grandezze di trasferimento radiativo usa il vapore e l'AOD corretti nella LUT (6S o libRadtran) pixel per pixel.
// Input:   griglia G (vedi hires.js), immagine STAC scelta, grandezza; modelli da Torricelli (site.atmos_url).
// Output:  { est (corretto), trd (solo modello), sd (correzione), elev } sui pixel della griglia.
"use strict";

const S2RK = (() => {
  const STAC = "https://earth-search.aws.element84.com/v1/search", COLL = "sentinel-2-c1-l2a", RES = 20;
  const OK = new Set([2, 4, 5, 6, 7, 11]), CLOUD = new Set([3, 8, 9, 10]);
  const BANDS = ["aot", "wvp", "blue", "green", "red", "nir", "swir16", "swir22"];
  const models = {};

  async function model(v) {
    if (!models[v]) {
      const u = (S.meta.atmos_url || "").replace(/\/?$/, "/") + `data/validation/rk_model_${v}.json`;
      models[v] = fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
    }
    return models[v];
  }

  // immagini Sentinel-2 L2A che coprono il centro della griglia, entro ±days dalla data, dalla meno nuvolosa
  async function search(G, date, days = 5) {
    const c = [(G.bb.w + G.bb.e) / 2, (G.bb.s + G.bb.n) / 2], d0 = new Date(date);
    const iso = k => new Date(d0.getTime() + k * 864e5).toISOString().slice(0, 10);
    const r = await fetch(STAC, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collections: [COLL], intersects: { type: "Point", coordinates: c },
        datetime: `${iso(-days)}T00:00:00Z/${iso(days)}T23:59:59Z`, limit: 50 }) });
    if (!r.ok) throw new Error(`Sentinel-2 search failed (${r.status})`);
    return (await r.json()).features.sort((a, b) => a.properties["eo:cloud_cover"] - b.properties["eo:cloud_cover"]);
  }

  // finestra di un COG ricampionata sulla griglia S2 a RES m; nodata 0 -> NaN; scala e offset dai metadati STAC
  async function band(asset, box, W, H, nearest) {
    const t = await GeoTIFF.fromUrl(asset.href, { allowFullFile: false });
    const [a] = await t.readRasters({ bbox: box, width: W, height: H, resampleMethod: nearest ? "nearest" : "bilinear", interleave: false });
    const rb = (asset["raster:bands"] || [{}])[0], sc = rb.scale ?? 1, of = rb.offset ?? 0, out = new Float32Array(W * H);
    for (let i = 0; i < out.length; i++) out[i] = a[i] === 0 && !nearest ? NaN : a[i] * sc + of;
    return out;
  }

  // immagine integrale (somma e conteggio dei valori finiti con maschera) per medie su finestre quadrate
  function integral(x, mask, W, H) {
    const S1 = new Float64Array((W + 1) * (H + 1)), N1 = new Float64Array((W + 1) * (H + 1));
    for (let r = 0; r < H; r++) {
      let s = 0, n = 0;
      for (let c = 0; c < W; c++) {
        const i = r * W + c, v = x[i];
        if ((!mask || mask[i]) && Number.isFinite(v)) { s += v; n++; }
        const o = (r + 1) * (W + 1) + c + 1;
        S1[o] = S1[o - W - 1] + s; N1[o] = N1[o - W - 1] + n;
      }
    }
    return { S1, N1 };
  }
  function boxStat(I, W, H, r, c, h) {
    const r0 = Math.max(0, r - h), r1 = Math.min(H, r + h + 1), c0 = Math.max(0, c - h), c1 = Math.min(W, c + h + 1), w = W + 1;
    const s = I.S1[r1 * w + c1] - I.S1[r0 * w + c1] - I.S1[r1 * w + c0] + I.S1[r0 * w + c0];
    const n = I.N1[r1 * w + c1] - I.N1[r0 * w + c1] - I.N1[r1 * w + c0] + I.N1[r0 * w + c0];
    return [s, n, (r1 - r0) * (c1 - c0)];
  }
  const CIRC3 = [];                                   // cerchio di 60 m sulla griglia a 20 m
  for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) if (Math.hypot(dr, dc) * RES <= 60) CIRC3.push([dr, dc]);
  const HALF = { 500: Math.round(500 * Math.sqrt(Math.PI) / 2 / RES), 2000: Math.round(2000 * Math.sqrt(Math.PI) / 2 / RES) };

  // valutazione del gradient boosting esportato (stessa regola di scikit-learn: NaN -> ramo "missing")
  function predict(M, x) {
    let s = M.baseline;
    for (const t of M.trees) {
      let i = 0;
      while (!t.leaf[i]) { const v = x[t.f[i]]; i = Number.isNaN(v) ? (t.m[i] ? t.l[i] : t.r[i]) : (v <= t.t[i] ? t.l[i] : t.r[i]); }
      s += t.v[i];
    }
    return s;
  }

  // valori del modello (ECMWF IFS, CAMS) su un reticolo di punti, all'ora dell'immagine
  async function modelFields(bb, hourIso) {
    const n = 9, pts = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pts.push([bb.s + (bb.n - bb.s) * (i + 0.5) / n, bb.w + (bb.e - bb.w) * (j + 0.5) / n]);
    const day = hourIso.slice(0, 10), q = `latitude=${pts.map(p => p[0].toFixed(4))}&longitude=${pts.map(p => p[1].toFixed(4))}&start_date=${day}&end_date=${day}&timezone=GMT`;
    const [m, a] = await Promise.all([
      fetch(`https://historical-forecast-api.open-meteo.com/v1/forecast?${q}&models=ecmwf_ifs025&hourly=total_column_integrated_water_vapour,temperature_2m,relative_humidity_2m,surface_pressure`).then(r => r.json()),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&domains=cams_global&hourly=aerosol_optical_depth,dust`).then(r => r.json())]);
    const at = (j, v) => { const h = j.hourly, k = h.time.indexOf(hourIso.slice(0, 13) + ":00"); return k < 0 ? NaN : h[v][k]; };
    const M = [].concat(m), A = [].concat(a);
    const val = pts.map((p, k) => ({ tcwv_model: at(M[k], "total_column_integrated_water_vapour"), t2m_c: at(M[k], "temperature_2m"),
      rh2m: at(M[k], "relative_humidity_2m"), ps_hpa: at(M[k], "surface_pressure"), aod_model: at(A[k], "aerosol_optical_depth"), dust_ugm3: at(A[k], "dust") }));
    return (lat, lon) => {                              // punto del reticolo piu' vicino = cella del modello, come nei dati di addestramento
      const i = Math.max(0, Math.min(n - 1, Math.floor((lat - bb.s) / (bb.n - bb.s) * n))), j = Math.max(0, Math.min(n - 1, Math.floor((lon - bb.w) / (bb.e - bb.w) * n)));
      return val[i * n + j];
    };
  }

  // calcolo completo per la griglia G e l'immagine scelta; target: "tcwv", "aod" o "spec:<grandezza>" (con band)
  async function run(G, item, target, bandName, step, Z) {
    const vars = target === "aod" ? ["aod550"] : target === "tcwv" ? ["tcwv"] : ["tcwv", "aod550"];
    const Ms = await Promise.all(vars.map(model));
    if (Ms.some(m => !m)) throw new Error("the validated model is not published yet (Torricelli, rk_model_*.json)");
    const epsg = item.properties["proj:code"] ? +String(item.properties["proj:code"]).split(":")[1] : item.properties["proj:epsg"];
    const def = HR.projDef(epsg), T = proj4("EPSG:4326", def);
    // finestra S2: riquadro della griglia + 2 km, a 20 m
    const cs = [[G.bb.w, G.bb.s], [G.bb.w, G.bb.n], [G.bb.e, G.bb.s], [G.bb.e, G.bb.n]].map(p => T.forward(p));
    const pad = 2100, x0 = Math.floor((Math.min(...cs.map(p => p[0])) - pad) / RES) * RES, x1 = Math.ceil((Math.max(...cs.map(p => p[0])) + pad) / RES) * RES;
    const y0 = Math.floor((Math.min(...cs.map(p => p[1])) - pad) / RES) * RES, y1 = Math.ceil((Math.max(...cs.map(p => p[1])) + pad) / RES) * RES;
    const W = (x1 - x0) / RES, H = (y1 - y0) / RES, box = [x0, y0, x1, y1];
    if (W * H > 9e6) throw new Error("area too large for Sentinel-2 in the browser (max about 55 × 55 km)");
    step(8, "1/5 · reading Sentinel-2 (classification and 8 bands)…");
    const scl = await band(item.assets.scl, box, W, H, true);
    const b = {};
    for (const [k, nm] of BANDS.entries()) { b[nm] = await band(item.assets[nm], box, W, H, false); step(8 + 3 * k, `1/5 · reading Sentinel-2 · ${nm}…`); }
    for (let i = 0; i < W * H; i++) b.wvp[i] *= 10;                               // cm -> kg m-2
    const ratio = (p, q) => Float32Array.from(p, (v, i) => (v - q[i]) / (v + q[i]));
    b.ndvi = ratio(b.nir, b.red); b.ndbi = ratio(b.swir16, b.nir); b.ndwi = ratio(b.green, b.nir);
    const ok = Uint8Array.from(scl, v => OK.has(v)), cls = { cloud: Uint8Array.from(scl, v => CLOUD.has(v)),
      water: Uint8Array.from(scl, v => v === 6), veg: Uint8Array.from(scl, v => v === 4), bare: Uint8Array.from(scl, v => v === 5) };
    // lon/lat dei pixel S2 (esatti ogni 16 pixel, interpolati in mezzo) e quota
    step(35, "2/5 · terrain and model values…");
    const lon = new Float32Array(W * H), lat = new Float32Array(W * H), z = new Float32Array(W * H);
    for (let r = 0; r < H; r++) {
      const y = y1 - (r + 0.5) * RES;
      for (let c0 = 0; c0 < W; c0 += 16) {
        const c1 = Math.min(c0 + 16, W - 1), a0 = T.inverse([x0 + (c0 + 0.5) * RES, y]), a1 = T.inverse([x0 + (c1 + 0.5) * RES, y]);
        for (let c = c0; c <= c1; c++) { const t = c1 === c0 ? 0 : (c - c0) / (c1 - c0), i = r * W + c;
          lon[i] = a0[0] + t * (a1[0] - a0[0]); lat[i] = a0[1] + t * (a1[1] - a0[1]); z[i] = Z(lat[i], lon[i]); }
      }
    }
    const tIso = item.properties.datetime, hour = new Date(Math.floor(Date.parse(tIso) / 36e5) * 36e5).toISOString();
    const mf = await modelFields(G.bb, hour);
    const doy = (Date.parse(tIso) - Date.UTC(new Date(tIso).getUTCFullYear(), 0, 0)) / 864e5;
    const scene = { cloud_scene: item.properties["eo:cloud_cover"], sun_elev: item.properties["view:sun_elevation"],
      doy_sin: Math.sin(2 * Math.PI * doy / 365.25), doy_cos: Math.cos(2 * Math.PI * doy / 365.25) };
    // griglia di previsione: ogni k pixel S2 (20 m se l'area e' piccola, altrimenti 60 m), solo dentro il riquadro della griglia
    const k = W * H <= 6e5 ? 1 : 3, h2 = Math.ceil(pad / RES), PR = [], PC = [];
    for (let r = h2; r < H - h2; r += k) for (let c = h2; c < W - h2; c += k) { PR.push(r); PC.push(c); }
    const NP = PR.length, feats = {};
    const F = Ms[0].features;
    F.forEach(f => { feats[f] = new Float32Array(NP).fill(NaN); });
    step(45, `3/5 · covariates at ${NP.toLocaleString()} points…`);
    await new Promise(r => setTimeout(r, 0));
    // medie di banda e frazioni per raggio
    for (const nm of [...BANDS, "ndvi", "ndbi", "ndwi"]) {
      const I = integral(b[nm], ok, W, H);
      for (let p = 0; p < NP; p++) {
        const r = PR[p], c = PC[p];
        let s = 0, n = 0;
        for (const [dr, dc] of CIRC3) { const i = (r + dr) * W + c + dc, v = b[nm][i]; if (ok[i] && Number.isFinite(v)) { s += v; n++; } }
        if (feats[`${nm}_60`]) feats[`${nm}_60`][p] = n ? s / n : NaN;
        for (const rad of [500, 2000]) { const [ss, nn] = boxStat(I, W, H, r, c, HALF[rad]); if (feats[`${nm}_${rad}`]) feats[`${nm}_${rad}`][p] = nn ? ss / nn : NaN; }
      }
    }
    for (const [nm, arr] of [["valid", ok], ...Object.entries(cls)]) {
      const I = integral(arr, null, W, H);
      for (let p = 0; p < NP; p++) {
        const r = PR[p], c = PC[p];
        let s = 0;
        for (const [dr, dc] of CIRC3) s += arr[(r + dr) * W + c + dc];
        if (feats[`${nm}_frac_60`]) feats[`${nm}_frac_60`][p] = s / CIRC3.length;
        for (const rad of [500, 2000]) { const [ss, , tot] = boxStat(I, W, H, r, c, HALF[rad]); if (feats[`${nm}_frac_${rad}`]) feats[`${nm}_frac_${rad}`][p] = ss / tot; }
      }
    }
    // terreno: quota, pendenza, TPI e rilievo
    const Iz = integral(z, null, W, H), Iz2 = integral(Float32Array.from(z, v => v * v), null, W, H);
    for (let p = 0; p < NP; p++) {
      const r = PR[p], c = PC[p], i = r * W + c, zc = z[i];
      const gx = (z[i + 1] - z[i - 1]) / (2 * RES), gy = (z[i + W] - z[i - W]) / (2 * RES);
      const m = mf(lat[i], lon[i]);
      const put = (f, v) => { if (feats[f]) feats[f][p] = v; };
      put("dem_elev", zc); put("elev", zc); put("slope_deg", Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI);
      for (const rad of [500, 2000]) {
        const [s, n] = boxStat(Iz, W, H, r, c, HALF[rad]), [s2] = boxStat(Iz2, W, H, r, c, HALF[rad]), mu = s / n;
        put(`tpi_${rad}`, zc - mu); put(`relief_${rad}`, Math.sqrt(Math.max(0, s2 / n - mu * mu)));
      }
      put("lat", lat[i]); put("lon", lon[i]);
      for (const [f, v] of Object.entries(m)) put(f, v ?? NaN);
      for (const [f, v] of Object.entries(scene)) put(f, v ?? NaN);
    }
    // previsione: correzione del modello per ogni variabile
    step(60, "4/5 · applying the validated model…");
    const pred = {};
    for (const [vi, v] of vars.entries()) {
      const M = Ms[vi], x = new Float32Array(M.features.length), base = v === "tcwv" ? "tcwv_model" : "aod_model";
      const out = new Float32Array(NP), raw = new Float32Array(NP);
      for (let p = 0; p < NP; p++) {
        M.features.forEach((f, j) => { x[j] = feats[f] ? feats[f][p] : NaN; });
        raw[p] = feats[base][p];
        out[p] = raw[p] + predict(M, x);
        if (p % 20000 === 19999) { step(60 + 20 * (vi + p / NP) / vars.length, `4/5 · applying the validated model… ${Math.round(100 * p / NP)} %`); await new Promise(r => setTimeout(r, 0)); }
      }
      pred[v] = { out, raw };
    }
    // riporto sui pixel della griglia G (bilineare sul reticolo di previsione) ed eventuale trasferimento radiativo
    step(82, "5/5 · values on the map pixels…");
    const nr = Math.floor((H - 2 * h2 - 1) / k) + 1, nc = Math.floor((W - 2 * h2 - 1) / k) + 1;
    const sample = (arr, x, y) => {
      const u = ((x - x0) / RES - 0.5 - h2) / k, v = ((y1 - y) / RES - 0.5 - h2) / k;
      const c = Math.max(0, Math.min(nc - 2, Math.floor(u))), r = Math.max(0, Math.min(nr - 2, Math.floor(v))), a = Math.min(1, Math.max(0, u - c)), q = Math.min(1, Math.max(0, v - r));
      const o = r * nc + c;
      return (1 - a) * (1 - q) * arr[o] + a * (1 - q) * arr[o + 1] + (1 - a) * q * arr[o + nc] + a * q * arr[o + nc + 1];
    };
    const L = target.startsWith("spec:") ? await ATM.lut(bandName.startsWith("WL_") ? "hyper" : "s2") : null, qty = target.split(":")[1];
    const ms = Date.parse(tIso), N = G.W * G.H, est = new Float32Array(N), trd = new Float32Array(N), sd = new Float32Array(N), elev = new Float32Array(N);
    const rt = (w, aot, la, lo, alt) => {
      const o = ATM.rtBand(L, bandName, w / 10, aot, ATM.sza(ms, la, lo), Math.max(0, alt / 1000));
      const g = Object.fromEntries(L.outputs.map((kk, j) => [kk, o[j]]));
      return qty === "t_tot" ? g.t_down * g.t_up * g.t_gas : g[qty];
    };
    for (let r = 0; r < G.H; r++) {
      for (let c = 0; c < G.W; c++) {
        const i = r * G.W + c, [lo, la] = G.toLL(G.x0 + (c + 0.5) * G.dx, G.y0 - (r + 0.5) * G.dy), [x, y] = T.forward([lo, la]);
        const zz = Z(la, lo); elev[i] = zz;
        if (L) {
          const wC = sample(pred.tcwv.out, x, y), wR = sample(pred.tcwv.raw, x, y), aC = sample(pred.aod550.out, x, y), aR = sample(pred.aod550.raw, x, y);
          est[i] = rt(wC, Math.max(0, aC), la, lo, zz); trd[i] = rt(wR, aR, la, lo, zz);
        } else {
          const P = pred[vars[0]]; est[i] = sample(P.out, x, y); trd[i] = sample(P.raw, x, y);
        }
        sd[i] = est[i] - trd[i];
      }
      if (r % 50 === 49) { step(82 + 18 * r / G.H, `5/5 · values on the map pixels… ${Math.round(100 * r / G.H)} %`); await new Promise(res => setTimeout(res, 0)); }
    }
    return { est, trd, sd, elev, time: tIso, item: item.id, step: k * RES };
  }

  return { search, run, model };
})();
