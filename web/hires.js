// Mappa ad alta risoluzione (10 m) intorno al punto con regression kriging.
//   trend:   regressione lineare (OLS) del valore su covariate Copernicus a 10 m
//            (quota del DEM Copernicus: l'unica grandezza a 10 m che cambia l'atmosfera sopra il suolo)
//   residui: kriging ordinario con variogramma esponenziale stimato sui residui
//   validazione: sulle misure AERONET, calcolata da Torricelli (07_rk_validate.py) e mostrata qui su mappa e tabella
// Input:  punto e righe della previsione (S.point, HR.rows da app.js), grandezze atmosferiche (ATM), modelli GPR (GP),
//         Open-Meteo Forecast API nei punti campione, DEM Terrarium (AWS).
// Output: scheda "Atmosphere RK" (mappa, legenda, punti di validazione), download CSV e GeoTIFF Float32 (EPSG:4326, con export.js).
"use strict";

const HR = (() => {
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

  // ---------------------------------------------------------------- griglia della mappa (sistema di riferimento vero)
  // G = { W, H, x0, y0 (angolo nord-ovest), dx, dy, epsg, def (proj4), name }; toLL(x, y) -> [lon, lat], fromLL(lon, lat) -> [x, y]
  function projDef(epsg) {
    if (epsg === 4326 || epsg === 3857) return `EPSG:${epsg}`;
    if (epsg >= 32601 && epsg <= 32660) return `+proj=utm +zone=${epsg - 32600} +datum=WGS84 +units=m +no_defs`;
    if (epsg >= 32701 && epsg <= 32760) return `+proj=utm +zone=${epsg - 32700} +south +datum=WGS84 +units=m +no_defs`;
    if (epsg >= 25828 && epsg <= 25838) return `+proj=utm +zone=${epsg - 25800} +ellps=GRS80 +units=m +no_defs`;
    if (epsg === 6707 || epsg === 6708) return `+proj=utm +zone=${epsg - 6675} +ellps=GRS80 +units=m +no_defs`;    // RDN2008 / UTM 32N, 33N
    if (epsg === 3035) return "+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +units=m +no_defs";
    if (epsg === 3003 || epsg === 3004) return `+proj=tmerc +lat_0=0 +lon_0=${epsg === 3003 ? 9 : 15} +k=0.9996 +x_0=${epsg === 3003 ? 1500000 : 2520000} +y_0=0 +ellps=intl +towgs84=-104.1,-49.1,-9.9,0.971,-2.917,0.714,-11.68 +units=m +no_defs`;
    if (epsg === 4258 || epsg === 6706) return "+proj=longlat +ellps=GRS80 +no_defs";
    return null;
  }
  function makeGrid(G) {
    const T = proj4("EPSG:4326", G.def);
    G.toLL = (x, y) => T.inverse([x, y]); G.fromLL = (lon, lat) => T.forward([lon, lat]);
    G.geographic = /longlat|EPSG:4326/.test(G.def);
    const pts = [];                                     // contorno in lat/lon (5 punti per lato) per riquadro e sovrapposizione
    for (let k = 0; k <= 4; k++) for (const [fx, fy] of [[k / 4, 0], [k / 4, 1], [0, k / 4], [1, k / 4]])
      pts.push(G.toLL(G.x0 + fx * G.W * G.dx, G.y0 - fy * G.H * G.dy));
    G.bb = { s: Math.min(...pts.map(q => q[1])), n: Math.max(...pts.map(q => q[1])), w: Math.min(...pts.map(q => q[0])), e: Math.max(...pts.map(q => q[0])) };
    return G;
  }
  // griglia quadrata centrata sul luogo, in UTM (fuso del luogo)
  function centredGrid(P, size, cell) {
    const zone = Math.floor((P.lon + 180) / 6) + 1, epsg = (P.lat >= 0 ? 32600 : 32700) + zone, def = projDef(epsg);
    const [cx, cy] = proj4("EPSG:4326", def, [P.lon, P.lat]), N = Math.round(size / cell);
    return makeGrid({ W: N, H: N, x0: cx - N * cell / 2, y0: cy + N * cell / 2, dx: cell, dy: cell, epsg, def, name: `UTM${zone}_${P.lat.toFixed(3)}_${P.lon.toFixed(3)}` });
  }
  // immagine importata (GeoTIFF/COG o ENVI .hdr + .img): estensione, pixel e sistema di riferimento diventano la griglia
  async function importImage(files) {
    const st = $("#h-img-info"), list = [...files];
    try {
      const tif = list.find(f => /\.tiff?$/i.test(f.name)), hdr = list.find(f => /\.hdr$/i.test(f.name));
      let G;
      if (tif) {
        const im = await (await GeoTIFF.fromBlob(tif)).getImage(), k = im.getGeoKeys() || {}, [ox, oy] = im.getOrigin(), [rx, ry] = im.getResolution();
        const epsg = k.ProjectedCSTypeGeoKey && k.ProjectedCSTypeGeoKey !== 32767 ? k.ProjectedCSTypeGeoKey : k.GeographicTypeGeoKey;
        G = { W: im.getWidth(), H: im.getHeight(), x0: ox, y0: oy, dx: Math.abs(rx), dy: Math.abs(ry), epsg, def: projDef(epsg), name: tif.name.replace(/\.[^.]+$/, "") };
      } else if (hdr) {
        const t = await hdr.text();
        const get = key => { const m = t.match(new RegExp("^\\s*" + key + "\\s*=\\s*(\\{[^}]*\\}|[^\\n]*)", "mi")); return m ? m[1].replace(/[{}]/g, "").trim() : ""; };
        const mi = get("map info").split(",").map(x => x.trim()), W = +get("samples"), H = +get("lines");
        const [px, py, x, y, dx, dy] = mi.slice(1, 7).map(Number);
        let epsg = 0, def = null;
        if (/^UTM/i.test(mi[0])) { epsg = (/south/i.test(mi[8]) ? 32700 : 32600) + +mi[7]; def = projDef(epsg); }
        else if (/Geographic/i.test(mi[0])) { epsg = 4326; def = projDef(4326); }
        if (!def && get("coordinate system string")) def = get("coordinate system string");
        G = { W, H, x0: x - (px - 1) * dx, y0: y + (py - 1) * dy, dx, dy, epsg, def, name: hdr.name.replace(/\.[^.]+$/, "") };
      } else throw new Error("choose a GeoTIFF (.tif) or an ENVI header (.hdr, with its .img)");
      if (!G.def) throw new Error(`coordinate system EPSG:${G.epsg} not supported yet (supported: WGS84, UTM, ETRS89 and RDN2008 UTM, LAEA Europe, Monte Mario Gauss-Boaga)`);
      if (G.W * G.H > 25e6) throw new Error(`${G.W} × ${G.H} pixels: too many for the browser (max 25 million): crop the image first`);
      S.himg = makeGrid(G);
      st.innerHTML = `<b>${G.name}</b> · ${G.W} × ${G.H} pixels of ${fmt(G.dx, G.geographic ? 6 : 2)}${G.geographic ? "°" : " m"} · EPSG:${G.epsg || "WKT"} ·
        ${G.bb.s.toFixed(4)}–${G.bb.n.toFixed(4)} N, ${G.bb.w.toFixed(4)}–${G.bb.e.toFixed(4)} E`;
      ["#h-size", "#h-size-u", "#h-cell", "#h-cell-u"].forEach(id => { $(id).disabled = true; });
      $("#h-img-clear").hidden = false;
      S.hmap.fitBounds([[G.bb.s, G.bb.w], [G.bb.n, G.bb.e]]);
    } catch (e) { st.innerHTML = `<span class="error">${e.message}</span>`; console.error(e); }
  }
  function clearImage() {
    S.himg = null; $("#h-img").value = ""; $("#h-img-info").textContent = ""; $("#h-img-clear").hidden = true;
    ["#h-size", "#h-size-u", "#h-cell", "#h-cell-u"].forEach(id => { $(id).disabled = false; });
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
      if (name.startsWith("tir")) return o.tir ? o.tir[name.slice(3)] : NaN;
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
      ["tirtau", "LWIR L8/9 B10 transmittance (libRadtran)"], ["tirlu", "LWIR L8/9 B10 upwelling radiance (libRadtran)"], ["tirld", "LWIR L8/9 B10 downwelling radiance (libRadtran)"],
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
    const tg = () => { $("#h-wl-wrap").style.display = $("#h-target").value.startsWith("spec:") ? "" : "none"; periods(); };
    $("#h-target").onchange = tg;
    rtm();
    $("#h-go").onclick = run;
    opts($("#h-fmt"), EXPORT.FORMATS, "tif");
    $("#h-dl").onclick = download;
    $("#h-img").onchange = e => importImage(e.target.files);
    $("#h-img-clear").onclick = clearImage;
    S.hmap = L.map("hmap");
    const pane = id => { S.hmap.createPane(id); return id; };
    const base = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap", pane: pane("hl-base") }).addTo(S.hmap);
    // layer della mappa a 10 m: in alto = disegnato sopra (pannello Layers come in QGIS)
    const raster = (key, name, ramp, visible) => ({ id: key, key, name, kind: "raster", visible, pane: pane("hl-" + key),
      style: MapStyle.create(ramp, 0.67), values: () => HR.out ? rasterOf(key) : [] });
    S.hl = [
      { id: "samples", name: "Sample points", kind: "samples", visible: true, pane: pane("hl-samples"), group: L.layerGroup().addTo(S.hmap) },
      raster("est", "Estimate (trend + kriged residual)", "RdYlBu", true),
      raster("sd", "Kriging standard deviation", "OrRd", false),
      raster("trend", "Trend only (elevation)", "RdYlBu", false),
      { id: "base", name: "OpenStreetMap", kind: "base", visible: true, pane: "hl-base", group: base },
    ];
    S.hsel = "est";
    validation();
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
    const P = S.point; if (!P && !S.himg) return;
    track("map-10m-" + $("#h-target").value.split(":")[0]);
    const st = $("#h-status"), kind = $("#h-target").value;
    const G = S.himg || centredGrid(P, +$("#h-size").value * +$("#h-size-u").value, +$("#h-cell").value * +$("#h-cell-u").value);
    // limiti: almeno 10 celle per lato, al massimo 25 milioni di celle (oltre il browser non regge)
    if (!(G.W >= 10 && G.H >= 10) || G.W * G.H > 25e6) {
      st.innerHTML = `<span class="error">The grid has ${G.W} × ${G.H} cells: choose at least 10 per side and at most 25 million in total.</span>`;
      return;
    }
    const C = G.toLL(G.x0 + G.W * G.dx / 2, G.y0 - G.H * G.dy / 2), mlat = 111320, mlon = 111320 * Math.cos(C[1] * Math.PI / 180);
    const ext = Math.max((G.bb.n - G.bb.s) * mlat, (G.bb.e - G.bb.w) * mlon), pad = 0.1 * ext;
    NS = ext <= 5000 ? 7 : ext <= 10000 ? 9 : 11;
    const bb = { s: G.bb.s - pad / mlat, n: G.bb.n + pad / mlat, w: G.bb.w - pad / mlon, e: G.bb.e + pad / mlon };
    const cellM = G.geographic ? G.dx * mlon : G.dx, label = `${fmt(G.dx, G.geographic ? 6 : 2)}${G.geographic ? "°" : " m"}`;
    const bar = $("#h-progress"), t0 = performance.now();
    const step = (pct, text) => { bar.hidden = false; bar.value = pct; st.textContent = `${text} · ${((performance.now() - t0) / 1000).toFixed(0)} s`; };
    try {
      step(2, "1/4 · downloading the elevation (Copernicus DEM)…");
      const Z = await dem(bb, ext <= 10000 ? 14 : 13);
      // punti campione: griglia regolare NS x NS sul riquadro
      const samples = [];
      for (let i = 0; i < NS; i++) for (let j = 0; j < NS; j++)
        samples.push({ lat: bb.s + (bb.n - bb.s) * (i + 0.5) / NS, lon: bb.w + (bb.e - bb.w) * (j + 0.5) / NS });
      step(20, `2/4 · downloading the values at ${samples.length} sample points…`);
      const opt = { agg: $("#p-agg").value, v: $("#p-var").value, period: $("#h-period").value, time: +$("#h-period").value, band: $("#h-wl").value };
      const T = await targets(kind, samples, opt, Z);
      const good = T.values.map((v, i) => (Number.isFinite(v) ? i : -1)).filter(i => i >= 0);
      if (good.length < 12) throw new Error("too few valid sample values for this variable and period (VNIR-SWIR parameters need the sun above 10°: choose a daytime hour)");
      const xyOf = (lat, lon) => [(lon - C[0]) * mlon, (lat - C[1]) * mlat];
      const F = good.map(i => covariates(Z, samples[i].lat, samples[i].lon));
      const y = good.map(i => T.values[i]), xy = good.map(i => xyOf(samples[i].lat, samples[i].lon));
      step(35, "3/4 · fitting trend + variogram…");
      await new Promise(r => setTimeout(r, 20));
      const M = fit(F, y, xy);
      step(45, `4/4 · predicting on the ${label} grid…`);
      await new Promise(r => setTimeout(r, 20));
      const W = G.W, H = G.H, NP = W * H, est = new Float32Array(NP), trd = new Float32Array(NP), sd = new Float32Array(NP), elev = new Float32Array(NP);
      const A = okSystem(xy, M.vg), n = xy.length, alpha = solve(A, [...M.res, 0]), Ainv = invert(A);
      const SD_STEP = Math.max(5, Math.round(50 / cellM)), qx = Float64Array.from(xy, q => q[0]), qy = Float64Array.from(xy, q => q[1]);
      const k = new Float64Array(n + 1), sill = M.vg.nug + M.vg.sill, ST = 16;
      const lonR = new Float64Array(W), latR = new Float64Array(W);
      for (let r = 0; r < H; r++) {
        // lon/lat dei centri dei pixel della riga: proiezione esatta ogni 16 pixel, interpolazione lineare in mezzo
        const y = G.y0 - (r + 0.5) * G.dy;
        for (let c0 = 0; c0 < W; c0 += ST) {
          const c1 = Math.min(c0 + ST, W - 1), a0 = G.toLL(G.x0 + (c0 + 0.5) * G.dx, y), a1 = G.toLL(G.x0 + (c1 + 0.5) * G.dx, y);
          for (let c = c0; c <= c1; c++) { const t = c1 === c0 ? 0 : (c - c0) / (c1 - c0); lonR[c] = a0[0] + t * (a1[0] - a0[0]); latR[c] = a0[1] + t * (a1[1] - a0[1]); }
        }
        for (let c = 0; c < W; c++) {
          const lat = latR[c], lon = lonR[c], f = covariates(Z, lat, lon);
          const px = (lon - C[0]) * mlon, py = (lat - C[1]) * mlat;
          let kr = alpha[n];
          for (let j = 0; j < n; j++) { const h = Math.hypot(qx[j] - px, qy[j] - py); k[j] = h === 0 ? sill : M.vg.sill * Math.exp(-h / M.vg.a); kr += k[j] * alpha[j]; }
          const t = M.trend(f), i = r * W + c;
          trd[i] = t; est[i] = t + kr; elev[i] = f[0];
          if (r % SD_STEP === 0 && c % SD_STEP === 0) {
            k[n] = 1; let q = 0;
            for (let a2 = 0; a2 <= n; a2++) { let s2 = 0; const row = Ainv[a2]; for (let b2 = 0; b2 <= n; b2++) s2 += row[b2] * k[b2]; q += k[a2] * s2; }
            sd[i] = Math.sqrt(Math.max(0, sill - q));
          } else sd[i] = sd[Math.floor(r / SD_STEP) * SD_STEP * W + Math.floor(c / SD_STEP) * SD_STEP];
        }
        if (r % 20 === 19) { step(45 + 55 * (r + 1) / H, `4/4 · predicting on the ${label} grid… ${Math.round(100 * (r + 1) / H)} %`); await new Promise(res => setTimeout(res, 0)); }
      }
      HR.out = { G, est, trd, sd, elev, T, M, samples: good.map(i => samples[i]), y, P: P || { lat: C[1], lon: C[0] } };
      draw(true); report();
      bar.hidden = true;
      st.textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(0)} s · ${W} × ${H} cells of ${label} (EPSG:${G.epsg || "WKT"}) · ${good.length} sample points`;
    } catch (e) { bar.hidden = true; st.innerHTML = `<span class="error">${e.message}</span>`; console.error(e); }
  }

  const rasterOf = key => ({ est: HR.out.est, sd: HR.out.sd, trend: HR.out.trd }[key]);
  // layer scelto nel pannello per GeoTIFF/legenda: quello selezionato, altrimenti la stima
  const selRaster = () => S.hl.find(l => l.id === S.hsel && l.kind === "raster") || S.hl.find(l => l.key === "est");

  async function rasterImage(l, bounds) {
    const o = HR.out, C = MapStyle.classify(l.style, l.values());
    const c = document.createElement("canvas"); c.width = o.G.W; c.height = o.G.H;
    const g = c.getContext("2d"), im = g.createImageData(o.G.W, o.G.H), a = l.values();
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
    const bounds = [[o.G.bb.s, o.G.bb.w], [o.G.bb.n, o.G.bb.e]];       // sovrapposizione approssimata della griglia proiettata
    const legends = [];
    for (const [n, l] of S.hl.entries()) {
      S.hmap.getPane(l.pane).style.zIndex = 450 - 5 * n;
      if (l.kind === "base") { l.visible ? l.group.addTo(S.hmap) : S.hmap.removeLayer(l.group); continue; }
      if (l.kind === "samples") {
        l.group.clearLayers();
        if (l.visible) {
          o.samples.forEach((s, i) => L.circleMarker([s.lat, s.lon], { pane: l.pane, radius: 4, color: "#15233b", weight: 1, fillColor: "#fff", fillOpacity: 1 })
            .bindPopup(`<b>Sample point ${i + 1}</b> · ${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}<br>Value: <b>${fmt(o.y[i], 4)}</b><br><span class="hint">${o.T.source}</span>`)
            .addTo(l.group));
          legends.push(`<div class="lg"><div class="lg-row"><span class="dot"></span><span>Sample points</span><span>(${o.samples.length})</span></div></div>`);
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
      const [x, y] = o.G.fromLL(e.latlng.lng, e.latlng.lat), r = Math.floor((o.G.y0 - y) / o.G.dy), cc = Math.floor((x - o.G.x0) / o.G.dx);
      if (r < 0 || cc < 0 || r >= o.G.H || cc >= o.G.W) return;
      const i = r * o.G.W + cc;
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
    const o = HR.out, M = o.M;
    const names = NAMES.filter((_, j) => M.use[j]);
    $("#h-model").innerHTML = `<dl class="kv"><dt>Target</dt><dd>${o.T.label}</dd>
      <dt>Trend coefficients<br><span class="hint">(per 1 SD of the covariate)</span></dt><dd>intercept ${fmt(M.beta[0], 4)}<br>${names.map((nm, j) => `${nm}: ${fmt(M.beta[j + 1], 4)} <span class="hint">(SD ${fmt(M.sd[NAMES.indexOf(nm)], 2)})</span>`).join("<br>")}</dd>
      <dt>Residual variogram</dt><dd>exponential · nugget ${fmt(M.vg.nug, 5)} · partial sill ${fmt(M.vg.sill, 5)} · range ${fmt(M.vg.a * 3 / 1000, 2)} km (practical)</dd></dl>`;
  }

  // download nel formato scelto, con i pixel e il sistema di riferimento della griglia (anche quella di un'immagine importata);
  // CSV: stima, deviazione standard del kriging, trend e quota per ogni pixel; altri formati: lo strato selezionato nel pannello Layers
  function download() {
    const o = HR.out; if (!o) return;
    const G = o.G, f = $("#h-fmt").value, lay = selRaster(), name = `rk_${lay.key}_${G.name.replace(/\W+/g, "_")}`;
    const lonlat = (c, r) => G.toLL(G.x0 + (c + 0.5) * G.dx, G.y0 - (r + 0.5) * G.dy);
    if (f === "csv") {
      if (G.W * G.H > 1500000) { $("#h-status").textContent = "CSV is limited to 1.5 million pixels: choose GeoTIFF, ENVI or ASCII grid."; return; }
      const rows = [["lon", "lat", "estimate", "kriging_sd", "trend", "elevation_m"]];
      for (let r = 0; r < G.H; r++) for (let c = 0; c < G.W; c++) {
        const i = r * G.W + c, [lo, la] = lonlat(c, r);
        rows.push([+lo.toFixed(6), +la.toFixed(6), o.est[i], o.sd[i], o.trd[i], o.elev[i]]);
      }
      return EXPORT.save(EXPORT.csv(rows, [o.T.label, `grid EPSG:${G.epsg || "WKT"}`]), `rk_${G.name.replace(/\W+/g, "_")}.csv`);
    }
    const C = MapStyle.classify(lay.style, lay.values());
    EXPORT.raster(f, rasterOf(lay.key), G, `${o.T.label} | ${lay.name} | regression kriging, Prognostica`, name, C.color, lonlat);
  }

  // punto scelto con la ricerca: marcatore sulla mappa e riga sopra i controlli
  function point(P) {
    $("#h-point").innerHTML = `<b>${P.label || "Point"}</b> · ${P.lat.toFixed(4)}, ${P.lon.toFixed(4)} · ${fmt(P.elev, 0)} m
      <span class="hint">(change the place with the search above)</span>`;
    if (S.hmark) S.hmark.setLatLng([P.lat, P.lon]);
    else S.hmark = L.marker([P.lat, P.lon], { title: "Selected place", zIndexOffset: 1000 }).addTo(S.hmap);
    if (!S.himg && (!HR.out || HR.out.P !== P)) S.hmap.setView([P.lat, P.lon], 11);
  }

  // ---------------------------------------------------------------- validazione sulle misure AERONET (da Torricelli)
  // ogni sito: pallino grande quanto l'RMSE del metodo scelto; verde-acqua = meglio del modello grezzo, ocra = peggio
  const VM = { model: "Model (ECMWF / CAMS)", rf: "Random forest", rf_rk: "Random forest + kriging", hgb: "Gradient boosting", hgb_rk: "Gradient boosting + kriging" };
  async function validation() {
    const url = (S.meta.atmos_url || "").replace(/\/?$/, "/") + "data/validation/rk_validation.json";
    const V = await fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (!V) { $("#hv-info").textContent = "Validation not available yet."; return; }
    const vars = Object.entries(V.variables).filter(([, x]) => x.overall);
    opts($("#hv-var"), vars.map(([k, x]) => [k, x.label]), "tcwv");
    opts($("#hv-method"), V.methods.filter(m => m !== "model").map(m => [m, VM[m]]), "hgb");
    S.vmap = L.map("vmap", { worldCopyJump: true }).setView([46, 10], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution: "© OpenStreetMap" }).addTo(S.vmap);
    const lay = L.layerGroup().addTo(S.vmap);
    const show = () => {
      const x = V.variables[$("#hv-var").value], m = $("#hv-method").value, u = x.unit ? ` [${x.unit}]` : "", d = x.unit ? 3 : 4;
      $("#hv-info").textContent = `${x.n_sites} AERONET sites · ${x.n_rows} Sentinel-2 overpasses with a measurement · ${x.period.map(t => t.slice(0, 10)).join(" – ")} · each site left out of training when it is tested`;
      $("#hv-table").innerHTML = `<thead><tr><th>Method</th><th>RMSE${u}</th><th>MAE${u}</th><th>Bias${u}</th><th>R²</th><th>n</th></tr></thead><tbody>`
        + V.methods.map(k => { const r = x.overall[k];
          return `<tr class="${k === m ? "combo" : ""}"><td>${VM[k]}</td><td>${fmt(r.rmse, d)}</td><td>${fmt(r.mae, d)}</td><td>${fmt(r.bias, d)}</td><td>${fmt(r.r2, 3)}</td><td>${r.n}</td></tr>`; }).join("") + "</tbody>";
      lay.clearLayers();
      const mx = Math.max(...x.sites.map(s => s[m].rmse || 0), 1e-9);
      x.sites.forEach(s => {
        const a = s[m], b = s.model;
        if (a.rmse == null) return;
        L.circleMarker([s.lat, s.lon], { radius: 3 + 14 * a.rmse / mx, color: "#15233b", weight: 1, fillOpacity: .8,
          fillColor: a.rmse < b.rmse ? "#23707e" : "#d49a3a" })
          .bindPopup(`<b>${s.site.replace(/_/g, " ")}</b> · ${s.elev == null ? "" : fmt(s.elev, 0) + " m"}<br>n = ${a.n}<br>
            RMSE ${VM[m]}: <b>${fmt(a.rmse, d)}</b><br>RMSE model: ${fmt(b.rmse, d)}<br>Bias ${VM[m]}: ${fmt(a.bias, d)}`).addTo(lay);
      });
      $("#hv-legend").innerHTML = `<div class="lg"><b>${VM[m]}</b> · ${x.label}
        <div class="lg-row"><span class="dot"></span><span>Size = RMSE at the site</span><span>(max ${fmt(mx, d)}${u})</span></div>
        <div class="lg-row"><span class="sw" style="background:#23707e"></span><span>Better than the model</span></div>
        <div class="lg-row"><span class="sw" style="background:#d49a3a"></span><span>Worse than the model</span></div></div>`;
      $("#hv-imp").innerHTML = `<thead><tr><th>Covariate</th><th>Importance (random forest)</th></tr></thead><tbody>`
        + x.importance.map(i => `<tr><td>${i.feature}</td><td>${fmt(i.importance, 3)}</td></tr>`).join("") + "</tbody>";
    };
    $("#hv-var").onchange = show; $("#hv-method").onchange = show;
    show();
  }

  // grandezze termiche disponibili solo con un modello che copre il LWIR (non 6S)
  function rtm() {
    const off = S.rtm === "6s";
    [...$("#h-target").options].filter(o => o.value.startsWith("tir")).forEach(o => { o.disabled = off; });
    if (off && $("#h-target").value.startsWith("tir")) { $("#h-target").value = "spec:t_tot"; $("#h-target").onchange(); }
  }

  return { init, periods, run, point, rtm, validation };
})();
