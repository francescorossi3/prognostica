// Mappa ad alta risoluzione (10 m) intorno al punto con regression kriging.
//   trend:   regressione lineare (OLS) del valore su covariate Copernicus a 10 m
//            (quota e pendenza/esposizione da DEM, impermeabilizzazione e copertura arborea HRL 2018)
//   residui: kriging ordinario con variogramma esponenziale stimato sui residui
//   verifica: leave-one-out sui punti campione (RK vs solo trend vs solo kriging)
"use strict";

const HR = (() => {
  const CELL = 10;                                  // m
  const NS = 7;                                     // punti campione per lato (7 x 7 = 49)
  const EEA = "https://image.discomap.eea.europa.eu/arcgis/rest/services/GioLandPublic/";

  // ---------------------------------------------------------------- TIFF non compresso (EEA ImageServer)
  function readTiff(buf) {
    const dv = new DataView(buf), le = dv.getUint16(0) === 0x4949, off = dv.getUint32(4, le), n = dv.getUint16(off, le);
    const T = {};
    for (let i = 0; i < n; i++) {
      const p = off + 2 + i * 12, tag = dv.getUint16(p, le), type = dv.getUint16(p + 2, le), cnt = dv.getUint32(p + 4, le);
      const sz = { 3: 2, 4: 4, 12: 8 }[type] || 1, at = cnt * sz <= 4 ? p + 8 : dv.getUint32(p + 8, le);
      const rd = k => (type === 3 ? dv.getUint16(at + 2 * k, le) : type === 4 ? dv.getUint32(at + 4 * k, le) : type === 12 ? dv.getFloat64(at + 8 * k, le) : dv.getUint8(at + k));
      T[tag] = Array.from({ length: Math.min(cnt, 4096) }, (_, k) => rd(k));
    }
    if ((T[259]?.[0] || 1) !== 1) throw new Error("compressed TIFF");
    const W = T[256][0], H = T[257][0], out = new Uint8Array(W * H);
    if (T[322]) {                                    // a tasselli
      const tw = T[322][0], th = T[323][0], offs = T[324], across = Math.ceil(W / tw);
      offs.forEach((o, t) => {
        const tx = (t % across) * tw, ty = Math.floor(t / across) * th;
        for (let y = 0; y < th && ty + y < H; y++)
          for (let x = 0; x < tw && tx + x < W; x++) out[(ty + y) * W + tx + x] = dv.getUint8(o + y * tw + x);
      });
    } else {                                         // a strisce
      const rps = T[278]?.[0] || H; let row = 0;
      T[273].forEach(o => { for (let y = 0; y < rps && row < H; y++, row++) for (let x = 0; x < W; x++) out[row * W + x] = dv.getUint8(o + y * W + x); });
    }
    return { W, H, data: out, dx: T[33550][0], dy: T[33550][1], x0: T[33922][3], y0: T[33922][4] };
  }
  async function hrl(svc, bb, W, H) {
    const url = `${EEA}${svc}/ImageServer/exportImage?bbox=${bb.w},${bb.s},${bb.e},${bb.n}&bboxSR=4326&imageSR=4326`
      + `&size=${W},${H}&format=tiff&pixelType=U8&compression=None&interpolation=RSP_NearestNeighbor&f=image`;
    const t = readTiff(await (await fetch(url)).arrayBuffer());
    return (lat, lon) => {
      const x = Math.floor((lon - t.x0) / t.dx), y = Math.floor((t.y0 - lat) / t.dy);
      if (x < 0 || y < 0 || x >= t.W || y >= t.H) return 0;
      const v = t.data[y * t.W + x];
      return v > 100 ? 0 : v;                       // 254/255 = fuori area / non classificato
    };
  }

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
    const at = (fx, fy) => { const tx = Math.floor(fx), ty = Math.floor(fy), t = tiles.get(`${tx}/${ty}`);
      if (!t) return NaN; return t[Math.min(255, Math.floor((fy - ty) * 256)) * 256 + Math.min(255, Math.floor((fx - tx) * 256))]; };
    return (lat, lon) => {                           // bilineare
      const [fx, fy] = tile(lat, lon), u = fx * 256 - 0.5, v = fy * 256 - 0.5, i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j;
      const e = (ii, jj) => at(ii / 256 + 1e-9, jj / 256 + 1e-9);
      return (1 - a) * (1 - b) * e(i, j) + a * (1 - b) * e(i + 1, j) + (1 - a) * b * e(i, j + 1) + a * b * e(i + 1, j + 1);
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
  const NAMES = ["elevation [m]", "slope [°]", "northness", "imperviousness [%]", "tree cover [%]"];
  function covariates(z, imp, tcd, lat, lon, mlat, mlon) {
    const e = z(lat, lon), dlat = CELL / mlat, dlon = CELL / mlon;
    const gx = (z(lat, lon + dlon) - z(lat, lon - dlon)) / (2 * CELL), gy = (z(lat + dlat, lon) - z(lat - dlat, lon)) / (2 * CELL);
    const slope = Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI, north = Math.hypot(gx, gy) > 1e-6 ? -gy / Math.hypot(gx, gy) : 0;
    return [e, slope, north, imp ? imp(lat, lon) : 0, tcd ? tcd(lat, lon) : 0];
  }

  // ---------------------------------------------------------------- regression kriging completo
  function fit(F, y, xy) {
    const p = F[0].length, mu = [], sd = [];
    for (let j = 0; j < p; j++) { const c = F.map(r => r[j]), m = c.reduce((a, b) => a + b, 0) / c.length;
      mu.push(m); sd.push(Math.sqrt(c.reduce((a, b) => a + (b - m) ** 2, 0) / c.length) || 0); }
    const use = sd.map(s => s > 1e-6);                       // covariate costanti escluse
    const row = f => [1, ...f.map((v, j) => (use[j] ? (v - mu[j]) / sd[j] : 0)).filter((_, j) => use[j])];
    const X = F.map(row), beta = ols(X, y), tr = X.map(r => dot(r, beta)), res = y.map((v, i) => v - tr[i]);
    const vg = variogram(xy, res);
    return { mu, sd, use, beta, row, res, vg, trend: f => dot(row(f), beta) };
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
    return { rk: metrics(y, rk), trend: metrics(y, tr), ok: metrics(y, ok), cover95: 100 * cover.filter(Boolean).length / cover.length };
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
      return { values: vals, unit: VAR_UNIT[v], label: `${m ? "GPR" : "Model mean"} · ${VAR_LABEL[v]} · ${AGG_LABEL[agg]} ${key.replace("T", " ")}` };
    }
    // grandezze atmosferiche all'ora scelta
    const d = await ATM.fetchMulti(samples, 1, 3, false), L = await ATM.lut(), t = opt.time;
    const [name, band] = kind.split(":");
    const vals = d.map((x, i) => {
      const k = x.times.indexOf(t);
      if (k < 0) return NaN;
      const o = ATM.derive(x, k, samples[i].lat, samples[i].lon, Z(samples[i].lat, samples[i].lon), L);
      if (name === "tcwv") return o.tcwv;
      if (name === "aod") return o.aod;
      if (name === "rho") return o.rho;
      if (name === "t2m") return o.t2m;
      if (name === "ghi") return o.ghi;
      if (name === "tirtau") return o.tir.tau;
      if (name === "tirlu") return o.tir.lu;
      if (name === "tirld") return o.tir.ld;
      if (!o.rt) return NaN;
      const r = o.rt[band];
      if (name === "lpath") return r.l_path;
      if (name === "ttot") return r.t_down * r.t_up * r.t_gas;
      if (name === "tdown") return r.t_down;
      if (name === "tup") return r.t_up;
      if (name === "edir") return r.e_dir;
      if (name === "edif") return r.e_dif;
      return NaN;
    });
    const lab = $("#h-target").selectedOptions[0].textContent;
    return { values: vals, unit: "", label: `${lab} · ${$("#h-period").selectedOptions[0].textContent}` };
  }

  // ---------------------------------------------------------------- interfaccia
  function targetOptions() {
    const o = [["forecast", "Forecast variable shown above (GPR)"], ["tcwv", "Water vapour column [kg m⁻²]"], ["aod", "AOD 550 nm"],
      ["t2m", "Air temperature 2 m [°C]"], ["rho", "Air density [kg m⁻³]"], ["ghi", "Global irradiance [W m⁻²]"],
      ["tirtau", "TIR L8/9 B10 transmittance"], ["tirlu", "TIR L8/9 B10 upwelling radiance"], ["tirld", "TIR L8/9 B10 downwelling radiance"]];
    for (const b of ["S2_02", "S2_04", "S2_8A", "S2_11", "S2_12"]) {
      const n = ATM.S2NAME[b.slice(3)];
      o.push([`lpath:${b}`, `Path radiance S2 ${n} nm`], [`ttot:${b}`, `Total transmittance S2 ${n} nm`],
        [`edir:${b}`, `Direct irradiance S2 ${n} nm`], [`edif:${b}`, `Diffuse irradiance S2 ${n} nm`]);
    }
    return o;
  }
  function init() {
    opts($("#h-target"), targetOptions(), "forecast");
    opts($("#h-size"), [[2, "2 × 2 km (200 × 200 cells)"], [5, "5 × 5 km (500 × 500)"], [10, "10 × 10 km (1000 × 1000)"]], 5);
    opts($("#h-layer"), [["est", "Estimate (trend + kriged residual)"], ["sd", "Kriging standard deviation"], ["trend", "Trend only"], ["imp", "Covariate: imperviousness"], ["elev", "Covariate: elevation"]], "est");
    $("#h-target").onchange = periods;
    $("#h-layer").onchange = () => HR.out && draw();
    $("#h-go").onclick = run;
    $("#h-csv").onclick = csv;
    S.hmap = L.map("hmap");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(S.hmap);
    S.hmap.setView([41.9, 12.5], 12);
  }
  // periodi disponibili per il bersaglio scelto
  async function periods() {
    const kind = $("#h-target").value;
    if (kind === "forecast") {
      const rows = HR.rows || [];
      opts($("#h-period"), rows.filter(r => !r.past).map(r => [r.period, r.period.replace("T", " ")]), rows.find(r => !r.past)?.period);
    } else if (ATM.cur) {
      const { d, P } = ATM.cur;
      opts($("#h-period"), d.times.map(t => [t, (() => { const l = localParts(t, P.tz); return `${l.date} ${String(l.hour).padStart(2, "0")}:00`; })()]),
        +$("#a-hour").value >= 0 ? d.times[+$("#a-hour").value] : d.times[0]);
    }
  }

  async function run() {
    const P = S.point; if (!P) return;
    track("map-10m-" + $("#h-target").value.split(":")[0]);
    const st = $("#h-status"), size = +$("#h-size").value * 1000, kind = $("#h-target").value;
    const mlat = 111320, mlon = 111320 * Math.cos(P.lat * Math.PI / 180);
    const half = size / 2, pad = size * 0.1;
    const bb = { s: P.lat - (half + pad) / mlat, n: P.lat + (half + pad) / mlat, w: P.lon - (half + pad) / mlon, e: P.lon + (half + pad) / mlon };
    try {
      st.textContent = "1/4 · downloading Copernicus covariates (DEM, imperviousness, tree cover)…";
      const npx = Math.min(4000, Math.ceil((size + 2 * pad) / CELL));
      const [Z, IMP, TCD] = await Promise.all([dem(bb), hrl("HRL_ImperviousnessDensity_2018", bb, npx, npx).catch(() => null),
        hrl("HRL_TreeCoverDensity_2018", bb, npx, npx).catch(() => null)]);
      // punti campione: griglia regolare 7 x 7 sul riquadro (bordi compresi)
      const samples = [];
      for (let i = 0; i < NS; i++) for (let j = 0; j < NS; j++)
        samples.push({ lat: bb.s + (bb.n - bb.s) * (i + 0.5) / NS, lon: bb.w + (bb.e - bb.w) * (j + 0.5) / NS });
      st.textContent = `2/4 · downloading the forecast at ${samples.length} sample points…`;
      const opt = { agg: $("#p-agg").value, v: $("#p-var").value, period: $("#h-period").value, time: +$("#h-period").value };
      const T = await targets(kind, samples, opt, Z);
      const good = T.values.map((v, i) => (Number.isFinite(v) ? i : -1)).filter(i => i >= 0);
      if (good.length < 12) throw new Error("too few valid sample values for this variable and period (VNIR-SWIR parameters need the sun above 10°: choose a daytime hour)");
      const xyOf = (lat, lon) => [(lon - P.lon) * mlon, (lat - P.lat) * mlat];
      const F = good.map(i => covariates(Z, IMP, TCD, samples[i].lat, samples[i].lon, mlat, mlon));
      const y = good.map(i => T.values[i]), xy = good.map(i => xyOf(samples[i].lat, samples[i].lon));
      st.textContent = "3/4 · fitting trend + variogram, leave-one-out validation…";
      await new Promise(r => setTimeout(r, 20));
      const M = fit(F, y, xy), cv = loocv(F, y, xy);
      st.textContent = "4/4 · predicting on the 10 m grid…";
      await new Promise(r => setTimeout(r, 20));
      const N = Math.round(size / CELL), est = new Float32Array(N * N), trd = new Float32Array(N * N), sd = new Float32Array(N * N),
        imp = new Float32Array(N * N), elev = new Float32Array(N * N);
      const A = okSystem(xy, M.vg), n = xy.length, alpha = solve(A, [...M.res, 0]);
      const Ainv = invert(A), lat0 = P.lat + half / mlat, lon0 = P.lon - half / mlon;
      const SD_STEP = 5;
      for (let r = 0; r < N; r++) {
        const lat = lat0 - (r + 0.5) * CELL / mlat;
        for (let c = 0; c < N; c++) {
          const lon = lon0 + (c + 0.5) * CELL / mlon, f = covariates(Z, IMP, TCD, lat, lon, mlat, mlon), p = xyOf(lat, lon);
          const k = xy.map(q => cov(M.vg, Math.hypot(q[0] - p[0], q[1] - p[1])));
          const t = M.trend(f), i = r * N + c;
          trd[i] = t; est[i] = t + dot(k, alpha.slice(0, n)) + alpha[n]; imp[i] = f[3]; elev[i] = f[0];
          if (r % SD_STEP === 0 && c % SD_STEP === 0) {
            const kk = [...k, 1]; let q = 0;
            for (let a = 0; a <= n; a++) { let s = 0; for (let b = 0; b <= n; b++) s += Ainv[a][b] * kk[b]; q += kk[a] * s; }
            sd[i] = Math.sqrt(Math.max(0, M.vg.nug + M.vg.sill - q));
          } else sd[i] = sd[Math.floor(r / SD_STEP) * SD_STEP * N + Math.floor(c / SD_STEP) * SD_STEP];
        }
      }
      HR.out = { N, est, trd, sd, imp, elev, lat0, lon0, mlat, mlon, half, T, M, cv, samples: good.map(i => samples[i]), y, P };
      draw(); report();
      st.textContent = `Done · ${N} × ${N} cells of ${CELL} m · ${good.length} sample points`;
    } catch (e) { st.innerHTML = `<span class="error">${e.message}</span>`; console.error(e); }
  }

  function draw() {
    const o = HR.out, key = $("#h-layer").value, a = { est: o.est, sd: o.sd, trend: o.trd, imp: o.imp, elev: o.elev }[key];
    let lo = Infinity, hi = -Infinity;
    for (const v of a) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo < 1e-9) hi = lo + 1e-9;
    const stops = key === "sd" ? ["#fff7ec", "#fdbb84", "#d7301f", "#7f0000"] : key === "imp" ? ["#ffffff", "#bdbdbd", "#525252", "#000000"]
      : ["#313695", "#4575b4", "#abd9e9", "#ffffbf", "#fdae61", "#d73027", "#a50026"];
    const c = document.createElement("canvas"); c.width = c.height = o.N;
    const g = c.getContext("2d"), im = g.createImageData(o.N, o.N);
    for (let i = 0; i < a.length; i++) { const [r, gg, b] = colorAt(stops, (a[i] - lo) / (hi - lo)); im.data.set([r, gg, b, 200], 4 * i); }
    g.putImageData(im, 0, 0);
    if (S.hlayer) S.hmap.removeLayer(S.hlayer);
    const bounds = [[o.P.lat - o.half / o.mlat, o.P.lon - o.half / o.mlon], [o.P.lat + o.half / o.mlat, o.P.lon + o.half / o.mlon]];
    S.hlayer = L.imageOverlay(c.toDataURL(), bounds, { opacity: 0.85 }).addTo(S.hmap);
    (S.hpts || []).forEach(m => S.hmap.removeLayer(m));
    S.hpts = o.samples.map((s, i) => L.circleMarker([s.lat, s.lon], { radius: 3, color: "#111", weight: 1, fillOpacity: 1 }).bindTooltip(`sample: ${fmt(o.y[i], 3)}`).addTo(S.hmap));
    S.hmap.fitBounds(bounds);
    S.hlayer.getElement().style.imageRendering = "pixelated";
    const grad = stops.map((s, i) => `${s} ${(100 * i / (stops.length - 1)).toFixed(0)}%`).join(",");
    $("#h-legend").innerHTML = `<div>${$("#h-layer").selectedOptions[0].textContent}${key === "est" || key === "trend" || key === "sd" ? ` · ${o.T.label}` : ""}</div>
      <div class="bar" style="background:linear-gradient(90deg,${grad})"></div><div class="ticks"><span>${fmt(lo, 3)}</span><span>${fmt((lo + hi) / 2, 3)}</span><span>${fmt(hi, 3)}</span></div>`;
    S.hmap.off("click"); S.hmap.on("click", e => {
      const r = Math.floor((o.lat0 - e.latlng.lat) * o.mlat / CELL), cc = Math.floor((e.latlng.lng - o.lon0) * o.mlon / CELL);
      if (r < 0 || cc < 0 || r >= o.N || cc >= o.N) return;
      const i = r * o.N + cc;
      L.popup().setLatLng(e.latlng).setContent(`<b>${fmt(o.est[i], 3)}</b> ± ${fmt(o.sd[i], 3)} (kriging SD)<br>trend ${fmt(o.trd[i], 3)} · elev ${fmt(o.elev[i], 0)} m · imperv. ${fmt(o.imp[i], 0)} %`).openOn(S.hmap);
    });
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
    const o = HR.out; if (!o) return;
    track("download-csv-10m");
    const lines = ["lat,lon,estimate,kriging_sd,trend,elevation_m,imperviousness_pct"];
    for (let r = 0; r < o.N; r++) for (let c = 0; c < o.N; c++) {
      const i = r * o.N + c;
      lines.push(`${(o.lat0 - (r + 0.5) * CELL / o.mlat).toFixed(6)},${(o.lon0 + (c + 0.5) * CELL / o.mlon).toFixed(6)},${o.est[i].toFixed(4)},${o.sd[i].toFixed(4)},${o.trd[i].toFixed(4)},${o.elev[i].toFixed(1)},${o.imp[i]}`);
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `rk10m_${o.P.lat.toFixed(4)}_${o.P.lon.toFixed(4)}.csv`; a.click();
  }

  return { init, periods, run, readTiff, variogram, fit, loocv, okPredict, metrics };
})();
