// hires.js – scheda "Atmosphere RK": mappe ad alta risoluzione di vapore acqueo, AOD e grandezze di trasferimento radiativo
//   con il modello validato sulle misure (rkmap.js), per una data e un'ora passate.
//   Griglia: quadrato centrato sul luogo in UTM, oppure estensione, pixel e sistema di riferimento di un'immagine importata
//   (GeoTIFF/COG o ENVI), da cui si leggono anche le lunghezze d'onda delle bande e l'ora di acquisizione se presenti.
//   Bande: risposta spettrale del sensore (srf.js: libreria, immagine importata, personalizzata o singola lunghezza d'onda).
//   Validazione: errori ai siti AERONET e GNSS calcolati da Torricelli (07_rk_validate.py), su mappa e tabella.
// Input:  punto (S.point, app.js), DEM Terrarium (AWS), rkmap.js, srf.js, atmos.js (LUT), export.js; rk_validation.json da S.meta.atmos_url.
// Output: mappa con layer e stile (mapstyle.js), download in GeoTIFF, PNG/JPEG + world file, ASCII, ENVI, CSV nelle unità scelte.
"use strict";

const HR = (() => {
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
      let G, time = "";
      if (tif) {
        const im = await (await GeoTIFF.fromBlob(tif)).getImage(), k = im.getGeoKeys() || {}, [ox, oy] = im.getOrigin(), [rx, ry] = im.getResolution();
        const epsg = k.ProjectedCSTypeGeoKey && k.ProjectedCSTypeGeoKey !== 32767 ? k.ProjectedCSTypeGeoKey : k.GeographicTypeGeoKey;
        G = { W: im.getWidth(), H: im.getHeight(), x0: ox, y0: oy, dx: Math.abs(rx), dy: Math.abs(ry), epsg, def: projDef(epsg), name: tif.name.replace(/\.[^.]+$/, "") };
        S.himgBands = SRF.complete(await SRF.fromTiff(im));
        const md = (await im.getGDALMetadata()) || {};
        time = md.acquisition_time || md.ACQUISITION_TIME || md.ACQUISITION_DATE || md.DATETIME || "";
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
        S.himgBands = SRF.complete(SRF.fromEnvi(t));
        time = get("acquisition time");
      } else throw new Error("choose a GeoTIFF (.tif) or an ENVI header (.hdr, with its .img)");
      if (!G.def) throw new Error(`coordinate system EPSG:${G.epsg} not supported yet (supported: WGS84, UTM, ETRS89 and RDN2008 UTM, LAEA Europe, Monte Mario Gauss-Boaga)`);
      if (G.W * G.H > 25e6) throw new Error(`${G.W} × ${G.H} pixels: too many for the browser (max 25 million): crop the image first`);
      S.himg = makeGrid(G);
      // data e ora di acquisizione, se scritte nei metadati
      const tm = String(time).match(/(\d{4})[-:](\d{2})[-:](\d{2})[T ](\d{2})/);
      if (tm) { $("#h-date").value = `${tm[1]}-${tm[2]}-${tm[3]}`; $("#h-hour").value = +tm[4]; }
      await sensors();
      if (S.himgBands.length) { $("#h-sensor").value = "image"; await bandOptions(); }
      st.innerHTML = `<b>${G.name}</b> · ${G.W} × ${G.H} pixels of ${fmt(G.dx, G.geographic ? 6 : 2)}${G.geographic ? "°" : " m"} · EPSG:${G.epsg || "WKT"} ·
        ${G.bb.s.toFixed(4)}–${G.bb.n.toFixed(4)} N, ${G.bb.w.toFixed(4)}–${G.bb.e.toFixed(4)} E
        · ${S.himgBands.length ? `${S.himgBands.length} bands with wavelengths` : "no wavelengths in the metadata"}${tm ? ` · acquired ${tm[1]}-${tm[2]}-${tm[3]} ${tm[4]}:00 UTC` : ""}`;
      ["#h-size", "#h-size-u", "#h-cell", "#h-cell-u"].forEach(id => { $(id).disabled = true; });
      $("#h-img-clear").hidden = false;
      S.hmap.fitBounds([[G.bb.s, G.bb.w], [G.bb.n, G.bb.e]]);
    } catch (e) { st.innerHTML = `<span class="error">${e.message}</span>`; console.error(e); }
  }
  function clearImage() {
    S.himg = null; S.himgBands = []; $("#h-img").value = ""; sensors(); $("#h-img-info").textContent = ""; $("#h-img-clear").hidden = true;
    ["#h-size", "#h-size-u", "#h-cell", "#h-cell-u"].forEach(id => { $(id).disabled = false; });
  }

  // ---------------------------------------------------------------- grandezze e bande
  const TARGETS = [["tcwv", "Water vapour column [kg m⁻²]"], ["aod", "AOD 550 nm"],
    ["rt:t_tot", "Total transmittance (T↓·T↑·T gas)"], ["rt:t_down", "Downward scattering transmittance T↓"], ["rt:t_up", "Upward scattering transmittance T↑"],
    ["rt:t_gas", "Gaseous transmittance"], ["rt:l_path", "Path radiance [W m⁻² sr⁻¹ µm⁻¹]"], ["rt:e_dir", "Direct irradiance [W m⁻² µm⁻¹]"],
    ["rt:e_dif", "Diffuse irradiance [W m⁻² µm⁻¹]"], ["rt:s_alb", "Spherical albedo"],
    ["tir:tau", "LWIR transmittance τ"], ["tir:lu", "LWIR upwelling path radiance L↑ [W m⁻² sr⁻¹ µm⁻¹]"], ["tir:ld", "LWIR downwelling radiance L↓ [W m⁻² sr⁻¹ µm⁻¹]"]];
  // unità dell'export per tipo di grandezza: [etichetta, fattore rispetto all'unità della mappa]
  const RAD = [["W m⁻² sr⁻¹ µm⁻¹ (Landsat, PRISMA, MODIS)", 1], ["mW m⁻² sr⁻¹ nm⁻¹ (EnMAP)", 1], ["µW cm⁻² sr⁻¹ nm⁻¹ (AVIRIS)", 0.1],
    ["mW cm⁻² sr⁻¹ µm⁻¹", 0.1], ["W m⁻² sr⁻¹ nm⁻¹", 0.001]];
  const UNITS = { tcwv: [["kg m⁻² (= mm)", 1], ["g cm⁻² (= cm)", 0.1]], ratio: [["0–1", 1], ["%", 100]], rad: RAD,
    irr: [["W m⁻² µm⁻¹", 1], ["mW m⁻² nm⁻¹", 1], ["mW cm⁻² µm⁻¹", 0.1], ["W m⁻² nm⁻¹", 0.001]], elev: [["m", 1], ["km", 0.001]] };
  const unitKind = t => (t === "tcwv" ? "tcwv" : /l_path|tir:lu|tir:ld/.test(t) ? "rad" : /e_dir|e_dif/.test(t) ? "irr" : "ratio");
  const isBand = t => t.includes(":");
  const thermal = t => t.startsWith("tir:");

  // elenco delle bande per la sorgente scelta (libreria, immagine importata, personalizzate, singola lunghezza d'onda)
  async function bandOptions() {
    const src = $("#h-sensor").value, tir = thermal($("#h-target").value);
    $("#h-custom-wrap").hidden = src !== "custom";
    let list = [];
    if (src === "wl") list = tir ? Array.from({ length: 51 }, (_, i) => ({ name: `${(8 + i / 10).toFixed(1)} µm`, c: 8000 + 100 * i, fwhm: 100 }))
      : Array.from({ length: 211 }, (_, i) => ({ name: `${400 + 10 * i} nm`, c: 400 + 10 * i, fwhm: 10 }));
    else if (src === "image") list = S.himgBands || [];
    else if (src === "custom") list = SRF.fromText($("#h-custom").value);
    else list = Object.entries(((await SRF.library())[src] || {}).bands || {}).map(([n, b]) => ({ ...b, name: n }));
    S.hbands = list.filter(b => (tir ? b.c > 3000 : b.c >= 350 && b.c <= 2550));
    opts($("#h-band"), S.hbands.map((b, i) => [i, src === "wl" ? b.name : `${b.name} · ${b.c >= 3000 ? fmt(b.c / 1000, 2) + " µm" : fmt(b.c, 0) + " nm"}`]),
      src === "wl" ? S.hbands.findIndex(b => b.c === (tir ? 10900 : 550)) : 0);
    $("#h-band-info").textContent = S.hbands.length ? "" : src === "image" ? "The imported image has no wavelengths in its metadata for this range." : "No band in this range.";
  }
  async function sensors() {
    const lib = await SRF.library();
    opts($("#h-sensor"), [["wl", "Single wavelength (table grid)"], ...(S.himgBands?.length ? [["image", "Bands of the imported image"]] : []),
      ...Object.keys(lib).map(k => [k, k]), ["custom", "Custom (centre and FWHM, or SRF table)"]], $("#h-sensor").value || "Sentinel-2A MSI");
    return bandOptions();
  }
  function targetChange() {
    const t = $("#h-target").value;
    $("#h-band-row").hidden = !isBand(t);
    opts($("#h-unit"), UNITS[unitKind(t)].map(([n], i) => [i, n]), 0);
    if (isBand(t)) bandOptions();
  }

  // ---------------------------------------------------------------- interfaccia
  function init() {
    opts($("#h-target"), TARGETS, "tcwv");
    $("#h-target").onchange = targetChange;
    $("#h-sensor").onchange = bandOptions;
    $("#h-custom").onchange = bandOptions;
    $("#h-custom-file").onchange = async e => { if (e.target.files[0]) { $("#h-custom").value = await e.target.files[0].text(); bandOptions(); } };
    opts($("#h-hour"), Array.from({ length: 24 }, (_, h) => [h, `${String(h).padStart(2, "0")}:00`]), 10);
    $("#h-date").value = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
    $("#h-date").max = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    rtm();
    $("#h-go").onclick = run;
    opts($("#h-fmt"), EXPORT.FORMATS, "tif");
    $("#h-dl").onclick = download;
    $("#h-img").onchange = e => importImage(e.target.files);
    $("#h-img-clear").onclick = clearImage;
    S.hmap = L.map("hmap");
    const pane = id => { S.hmap.createPane(id); return id; };
    const base = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap", pane: pane("hl-base") }).addTo(S.hmap);
    // layer della mappa: in alto = disegnato sopra (pannello Layers come in QGIS)
    const raster = (key, name, ramp, visible) => ({ id: key, key, name, kind: "raster", visible, pane: pane("hl-" + key),
      style: MapStyle.create(ramp, 0.67), values: () => (HR.out ? rasterOf(key) : []) });
    S.hl = [
      raster("est", "Corrected (validated model)", "RdYlBu", true),
      raster("sd", "Correction (corrected − model)", "RdBu", false),
      raster("trend", "Model only (ECMWF / CAMS)", "RdYlBu", false),
      raster("elev", "Elevation [m]", "Greys", false),
      { id: "base", name: "OpenStreetMap", kind: "base", visible: true, pane: "hl-base", group: base },
    ];
    S.hsel = "est";
    validation();
    S.hmap.setView([41.9, 12.5], 10);
    panels();
    targetChange(); sensors();
  }

  async function run() {
    const P = S.point; if (!P && !S.himg) return;
    const kind = $("#h-target").value, st = $("#h-status");
    track("map-rk-" + kind.split(":")[0]);
    const G = S.himg || centredGrid(P, +$("#h-size").value * +$("#h-size-u").value, +$("#h-cell").value * +$("#h-cell-u").value);
    if (!(G.W >= 2 && G.H >= 2) || G.W * G.H > 25e6) {
      st.innerHTML = `<span class="error">The grid has ${G.W} × ${G.H} cells: choose at least 2 per side and at most 25 million in total.</span>`;
      return;
    }
    const hourIso = `${$("#h-date").value}T${String($("#h-hour").value).padStart(2, "0")}:00:00Z`;
    const bar = $("#h-progress"), t0 = performance.now();
    const step = (pct, text) => { bar.hidden = false; bar.value = pct; st.textContent = `${text} · ${((performance.now() - t0) / 1000).toFixed(0)} s`; };
    try {
      if (!$("#h-date").value || Date.parse(hourIso) > Date.now() - 864e5) throw new Error("choose a past date (at least one day ago)");
      let vb = null, bandLab = "";
      if (isBand(kind)) {
        const b = S.hbands?.[+$("#h-band").value];
        if (!b) throw new Error("choose a spectral band");
        vb = await SRF.band(b);
        bandLab = ` · ${$("#h-sensor").selectedOptions[0].textContent} ${b.name}`;
      }
      step(2, "0/4 · elevation…");
      const C = G.toLL(G.x0 + G.W * G.dx / 2, G.y0 - G.H * G.dy / 2), mlat = 111320, mlon = 111320 * Math.cos(C[1] * Math.PI / 180);
      const ext = Math.max((G.bb.n - G.bb.s) * mlat, (G.bb.e - G.bb.w) * mlon), pad = 2300;
      const Z = await dem({ s: G.bb.s - pad / mlat, n: G.bb.n + pad / mlat, w: G.bb.w - pad / mlon, e: G.bb.e + pad / mlon }, ext <= 10000 ? 14 : ext <= 40000 ? 13 : 12);
      const R = await RKMAP.run(G, hourIso, kind, vb, step, Z);
      HR.out = { G, ...R, kind, P: P || { lat: C[1], lon: C[0] },
        label: `${$("#h-target").selectedOptions[0].textContent}${bandLab} · ${hourIso.slice(0, 13).replace("T", " ")} UTC` };
      draw(true); report();
      bar.hidden = true;
      st.textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(0)} s · ${W0(G)} · model applied every ${R.step} m${vb?.outside ? " · band outside the tables: nearest wavelength used" : ""}`;
    } catch (e) { bar.hidden = true; st.innerHTML = `<span class="error">${e.message}</span>`; console.error(e); }
  }

  const W0 = G => `${G.W} × ${G.H} cells of ${fmt(G.dx, G.geographic ? 6 : 2)}${G.geographic ? "°" : " m"} (EPSG:${G.epsg || "WKT"})`;
  const rasterOf = key => ({ est: HR.out.est, sd: HR.out.sd, trend: HR.out.trd, elev: HR.out.elev }[key]);
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
    const lab = l.key !== "elev" ? `${l.name} · ${o.label}` : l.name;
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
      if (!l.visible) { if (l.overlay) { S.hmap.removeLayer(l.overlay); l.overlay = null; } continue; }
      legends.push(await rasterImage(l, bounds));
    }
    $("#h-legend").innerHTML = legends.join("");
    if (fit) S.hmap.fitBounds(bounds);
    if (!keepPanels) panels();
    S.hmap.off("click"); S.hmap.on("click", e => {
      const [x, y] = o.G.fromLL(e.latlng.lng, e.latlng.lat), r = Math.floor((o.G.y0 - y) / o.G.dy), cc = Math.floor((x - o.G.x0) / o.G.dx);
      if (r < 0 || cc < 0 || r >= o.G.H || cc >= o.G.W) return;
      const i = r * o.G.W + cc, d = o.kind === "aod" || /t_|s_alb|tau/.test(o.kind) ? 4 : 3;
      L.popup().setLatLng(e.latlng).setContent(`Corrected <b>${fmt(o.est[i], d)}</b><br>Model only ${fmt(o.trd[i], d)} · correction ${fmt(o.sd[i], d)}<br>
        Elevation ${fmt(o.elev[i], 0)} m · pixel ${cc + 1}, ${r + 1}`).openOn(S.hmap);
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
    const o = HR.out, rm = Object.entries(o.rmse).map(([v, e]) => `${v === "tcwv" ? "water vapour" : "AOD"} ${fmt(e, v === "tcwv" ? 2 : 3)}${v === "tcwv" ? " kg m⁻²" : ""}`);
    $("#h-model").innerHTML = `<dl class="kv"><dt>Map</dt><dd>${o.label}</dd><dt>Method</dt><dd>gradient boosting correction of ECMWF IFS / CAMS,
      validated on AERONET and GNSS; applied every ${o.step} m and interpolated on the ${W0(o.G)}</dd>
      <dt>Validation RMSE</dt><dd>${rm.join(" · ")} (sites left out of training)</dd></dl>`;
  }

  // download nel formato e nelle unità scelti, con i pixel e il sistema di riferimento della griglia (anche quella di un'immagine importata)
  function download() {
    const o = HR.out; if (!o) return;
    const G = o.G, f = $("#h-fmt").value, lay = selRaster(), name = `rk_${lay.key}_${G.name.replace(/\W+/g, "_")}`;
    const [uName, uF] = UNITS[unitKind(o.kind)][+$("#h-unit").value] || ["", 1], k = uF * (+$("#h-scale").value || 1);
    const conv = (a, key) => (key === "elev" || k === 1 ? a : a.map(v => v * k));
    const unit = `${uName}${+$("#h-scale").value !== 1 ? ` × ${$("#h-scale").value}` : ""}`;
    const lonlat = (c, r) => G.toLL(G.x0 + (c + 0.5) * G.dx, G.y0 - (r + 0.5) * G.dy);
    if (f === "csv") {
      if (G.W * G.H > 1500000) { $("#h-status").textContent = "CSV is limited to 1.5 million pixels: choose GeoTIFF, ENVI or ASCII grid."; return; }
      const est = conv(o.est), trd = conv(o.trd), sd = conv(o.sd), rows = [["lon", "lat", "corrected", "model_only", "correction", "elevation_m"]];
      for (let r = 0; r < G.H; r++) for (let c = 0; c < G.W; c++) {
        const i = r * G.W + c, [lo, la] = lonlat(c, r);
        rows.push([+lo.toFixed(6), +la.toFixed(6), est[i], trd[i], sd[i], o.elev[i]]);
      }
      return EXPORT.save(EXPORT.csv(rows, [o.label, `unit: ${unit}`, `grid EPSG:${G.epsg || "WKT"}`]), `rk_${G.name.replace(/\W+/g, "_")}.csv`);
    }
    const C = MapStyle.classify(lay.style, lay.values());
    EXPORT.raster(f, conv(rasterOf(lay.key), lay.key), G, `${o.label} | ${lay.name} | ${lay.key === "elev" ? "m" : unit} | Prognostica`,
      name, v => C.color(v / (lay.key === "elev" ? 1 : k)), lonlat);
  }

  // punto scelto con la ricerca: marcatore sulla mappa e riga sopra i controlli
  function point(P) {
    $("#h-point").innerHTML = `<b>${P.label || "Point"}</b> · ${P.lat.toFixed(4)}, ${P.lon.toFixed(4)} · ${fmt(P.elev, 0)} m
      <span class="hint">(change the place with the search above)</span>`;
    if (S.hmark) S.hmark.setLatLng([P.lat, P.lon]);
    else S.hmark = L.marker([P.lat, P.lon], { title: "Selected place", zIndexOffset: 1000 }).addTo(S.hmap);
    if (!S.himg && (!HR.out || HR.out.P !== P)) S.hmap.setView([P.lat, P.lon], 11);
  }

  // ---------------------------------------------------------------- validazione sulle misure AERONET e GNSS (da Torricelli)
  // ogni sito: pallino grande quanto l'RMSE del metodo scelto; verde-acqua = meglio del modello grezzo, ocra = peggio
  const VM = { model: "Model (ECMWF / CAMS)", hgb: "Gradient boosting", hgb_rk: "Gradient boosting + kriging" };
  async function validation() {
    const url = (S.meta.atmos_url || "").replace(/\/?$/, "/") + "data/validation/rk_validation.json";
    const V = await fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (!V) { $("#hv-info").textContent = "Validation not available yet."; return; }
    const vars = Object.entries(V.variables).filter(([, x]) => x.overall), methods = V.methods.filter(m => VM[m]);
    opts($("#hv-var"), vars.map(([k, x]) => [k, x.label]), "tcwv");
    opts($("#hv-method"), methods.filter(m => m !== "model").map(m => [m, VM[m]]), "hgb");
    S.vmap = L.map("vmap", { worldCopyJump: true }).setView([46, 10], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution: "© OpenStreetMap" }).addTo(S.vmap);
    const lay = L.layerGroup().addTo(S.vmap);
    const show = () => {
      const x = V.variables[$("#hv-var").value], m = $("#hv-method").value, u = x.unit ? ` [${x.unit}]` : "", d = x.unit ? 3 : 4;
      const net = n => x.sites.filter(s => s.network === n).length;
      $("#hv-info").textContent = `${net("aeronet")} AERONET and ${net("gnss")} GNSS sites · ${x.n_rows.toLocaleString()} hourly measurements · `
        + `${x.period.map(t => t.slice(0, 10)).join(" – ")} · each site left out of training when it is tested`;
      $("#hv-table").innerHTML = `<thead><tr><th>Method</th><th>RMSE${u}</th><th>MAE${u}</th><th>Bias${u}</th><th>R²</th><th>n</th></tr></thead><tbody>`
        + methods.map(k => { const r = x.overall[k];
          return `<tr class="${k === m ? "combo" : ""}"><td>${VM[k]}</td><td>${fmt(r.rmse, d)}</td><td>${fmt(r.mae, d)}</td><td>${fmt(r.bias, d)}</td><td>${fmt(r.r2, 3)}</td><td>${r.n}</td></tr>`; }).join("") + "</tbody>";
      lay.clearLayers();
      const mx = Math.max(...x.sites.map(s => s[m].rmse || 0), 1e-9);
      x.sites.forEach(s => {
        const a = s[m], b = s.model;
        if (a.rmse == null) return;
        L.circleMarker([s.lat, s.lon], { radius: 3 + 14 * a.rmse / mx, color: "#15233b", weight: s.network === "gnss" ? 2 : 1, dashArray: s.network === "gnss" ? "2 2" : null,
          fillOpacity: .8, fillColor: a.rmse < b.rmse ? "#23707e" : "#d49a3a" })
          .bindPopup(`<b>${s.site.replace(/_/g, " ")}</b> · ${s.network === "gnss" ? "GNSS" : "AERONET"}${s.elev == null ? "" : " · " + fmt(s.elev, 0) + " m"}<br>n = ${a.n}<br>
            RMSE ${VM[m]}: <b>${fmt(a.rmse, d)}</b><br>RMSE model: ${fmt(b.rmse, d)}<br>Bias ${VM[m]}: ${fmt(a.bias, d)}`).addTo(lay);
      });
      $("#hv-legend").innerHTML = `<div class="lg"><b>${VM[m]}</b> · ${x.label}
        <div class="lg-row"><span class="dot"></span><span>Size = RMSE at the site</span><span>(max ${fmt(mx, d)}${u})</span></div>
        <div class="lg-row"><span class="sw" style="background:#23707e"></span><span>Better than the model</span></div>
        <div class="lg-row"><span class="sw" style="background:#d49a3a"></span><span>Worse than the model</span></div>
        <div class="lg-row"><span class="dot dashed"></span><span>Dashed border = GNSS station</span></div></div>`;
      $("#hv-imp").innerHTML = `<thead><tr><th>Covariate</th><th>Importance (RMSE increase when shuffled${u})</th></tr></thead><tbody>`
        + x.importance.map(i => `<tr><td>${i.feature}</td><td>${fmt(i.importance, d)}</td></tr>`).join("") + "</tbody>";
    };
    $("#hv-var").onchange = show; $("#hv-method").onchange = show;
    show();
  }

  // grandezze termiche disponibili solo con un modello che copre il LWIR (non 6S)
  function rtm() {
    const off = S.rtm === "6s";
    [...$("#h-target").options].filter(o => thermal(o.value)).forEach(o => { o.disabled = off; });
    if (off && thermal($("#h-target").value)) { $("#h-target").value = "rt:t_tot"; targetChange(); }
    else if (isBand($("#h-target").value)) bandOptions();
  }

  return { init, run, point, rtm, validation, projDef };
})();
