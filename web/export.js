// export.js – download dei dati mostrati nel sito, uguale in tutte le schede.
// Cosa fa: grafici -> CSV (asse x + una colonna per serie), tabelle -> CSV (testo delle celle),
//          mappe -> GeoTIFF Float32, PNG o JPEG come mostrati (+ world file), griglia ASCII ESRI, ENVI (.img + .hdr), CSV;
//          sempre nel sistema di riferimento e con i pixel della griglia (EPSG della griglia).
// Input:   un grafico Chart.js, una <table> del DOM, oppure una griglia: valori riga per riga da nord-ovest,
//          G = { W, H, x0, y0 (angolo nord-ovest), dx, dy (passo positivo), epsg }.
// Output:  file scaricati dal browser.
"use strict";

const EXPORT = (() => {
  function save(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    if (typeof track === "function") track("download-" + name.split(".").pop());
  }
  const cell = v => {
    if (v == null || (typeof v === "number" && !Number.isFinite(v))) return "";
    const s = typeof v === "number" ? String(+v.toPrecision(7)) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = (rows, head = []) => new Blob([[...head.map(h => "# " + h), ...rows.map(r => r.map(cell).join(","))].join("\n")], { type: "text/csv" });
  const label = d => (d.csvLabel || d.label || "").replace(/^_/, "");

  // grafico: tabella larga se tutte le serie hanno le stesse x, altrimenti formato lungo (serie, x, y)
  function chart(c, name, head = []) {
    const ds = c.data.datasets.filter(d => d.data?.length);
    if (c.data.labels?.length && !ds.some(d => typeof d.data[0] === "object" && d.data[0] !== null)) {
      return save(csv([["x", ...ds.map(label)], ...c.data.labels.map((x, i) => [x, ...ds.map(d => d.data[i])])], head), name);
    }
    const xs = ds.map(d => d.data.map(p => p.x).join("|"));
    if (ds.length && xs.every(x => x === xs[0])) {
      return save(csv([[c.options.scales?.x?.title?.text || "x", ...ds.map(label)], ...ds[0].data.map((p, i) => [p.x, ...ds.map(d => d.data[i].y)])], head), name);
    }
    save(csv([["series", "x", "y"], ...ds.flatMap(d => d.data.map(p => [label(d), p.x, p.y]))], head), name);
  }

  // tabella del DOM: una riga per <tr>, testo di ogni cella
  function table(t, name) {
    const rows = [...t.querySelectorAll("tr")].map(tr => [...tr.children].map(td => td.innerText.replace(/\s+/g, " ").trim()));
    save(csv(rows.filter(r => r.length)), name);
  }

  // GeoTIFF Float32 a una banda; NaN = nessun dato; EPSG geografico (4326, 4258) o proiettato (UTM, LAEA, ...)
  const GEOGRAPHIC = new Set([4326, 4258, 4230, 4265, 6706]);
  function geotiff(values, G, desc, name) {
    const { W, H, x0, y0, dx, dy, epsg = 4326 } = G;
    const geokeys = GEOGRAPHIC.has(epsg) ? [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, epsg]
      : [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, epsg];
    const descB = new TextEncoder().encode(desc + "\0");
    const tags = [[256, 4, 1, [W]], [257, 4, 1, [H]], [258, 3, 1, [32]], [259, 3, 1, [1]], [262, 3, 1, [1]], [270, 2, descB.length, descB],
      [273, 4, 1, [0]], [277, 3, 1, [1]], [278, 4, 1, [H]], [279, 4, 1, [W * H * 4]], [284, 3, 1, [1]], [339, 3, 1, [3]],
      [33550, 12, 3, [dx, dy, 0]], [33922, 12, 6, [0, 0, 0, x0, y0, 0]], [34735, 3, geokeys.length, geokeys], [42113, 2, 4, new TextEncoder().encode("nan\0")]];
    const nT = tags.length, ifd = 8, size = { 2: 1, 3: 2, 4: 4, 12: 8 };
    let extra = ifd + 2 + nT * 12 + 4; const place = [];
    tags.forEach(t => { const len = size[t[1]] * t[2]; if (len > 4) { place.push(extra); extra += len + (len % 2); } else place.push(-1); });
    const dataOff = extra + (extra % 4 ? 4 - extra % 4 : 0);
    tags.find(t => t[0] === 273)[3] = [dataOff];
    const buf = new ArrayBuffer(dataOff + W * H * 4), dv = new DataView(buf);
    dv.setUint16(0, 0x4949); dv.setUint16(2, 42, true); dv.setUint32(4, ifd, true); dv.setUint16(ifd, nT, true);
    const put = (off, type, vals) => vals.forEach((v, j) => {
      if (type === 2) dv.setUint8(off + j, v); else if (type === 3) dv.setUint16(off + 2 * j, v, true);
      else if (type === 4) dv.setUint32(off + 4 * j, v, true); else dv.setFloat64(off + 8 * j, v, true); });
    tags.forEach((t, j) => {
      const e = ifd + 2 + j * 12; dv.setUint16(e, t[0], true); dv.setUint16(e + 2, t[1], true); dv.setUint32(e + 4, t[2], true);
      if (place[j] < 0) put(e + 8, t[1], Array.from(t[3])); else { dv.setUint32(e + 8, place[j], true); put(place[j], t[1], Array.from(t[3])); }
    });
    new Float32Array(buf, dataOff, W * H).set(values);
    save(new Blob([buf], { type: "image/tiff" }), name);
  }

  // griglia in altri formati: fmt = tif | png | jpg | asc | envi | csv; color(v) -> [r,g,b,a] | null per png/jpg;
  // lonlat(c, r) -> [lon, lat] del centro del pixel per il CSV
  const FORMATS = [["tif", "GeoTIFF (Float32, values)"], ["png", "PNG as shown + world file"], ["jpg", "JPEG as shown + world file"],
    ["asc", "ESRI ASCII grid (.asc)"], ["envi", "ENVI (.img + .hdr)"], ["csv", "CSV (lon, lat, value)"]];
  function raster(fmt, values, G, desc, name, color, lonlat) {
    const { W, H, x0, y0, dx, dy, epsg = 4326 } = G, base = `${name}_EPSG${epsg}`;
    const world = [dx, 0, 0, -dy, x0 + dx / 2, y0 - dy / 2].join("\n");
    if (fmt === "tif") return geotiff(values, G, desc, base + ".tif");
    if (fmt === "png" || fmt === "jpg") {
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const g = cv.getContext("2d"), im = g.createImageData(W, H);
      if (fmt === "jpg") im.data.fill(255);                                             // JPEG: sfondo bianco, opaco
      for (let i = 0; i < values.length; i++) { const c = color(values[i]); if (c) im.data.set(fmt === "jpg" ? [...c.slice(0, 3), 255] : c, 4 * i); }
      g.putImageData(im, 0, 0);
      cv.toBlob(b => save(b, `${base}.${fmt}`), fmt === "png" ? "image/png" : "image/jpeg", 0.95);
      return save(new Blob([world], { type: "text/plain" }), `${base}.${fmt === "png" ? "pgw" : "jgw"}`);
    }
    if (fmt === "asc") {
      const head = [`ncols ${W}`, `nrows ${H}`, `xllcorner ${x0}`, `yllcorner ${y0 - H * dy}`,
        ...(Math.abs(dx - dy) < 1e-9 * dx ? [`cellsize ${dx}`] : [`dx ${dx}`, `dy ${dy}`]), "NODATA_value -9999"];
      const rows = [];
      for (let r = 0; r < H; r++) rows.push(Array.from(values.subarray(r * W, (r + 1) * W), v => (Number.isFinite(v) ? +v.toPrecision(7) : -9999)).join(" "));
      return save(new Blob([[...head, ...rows].join("\n")], { type: "text/plain" }), base + ".asc");
    }
    if (fmt === "envi") {
      const data = Float32Array.from(values, v => (Number.isFinite(v) ? v : -9999));
      const utm = epsg >= 32601 && epsg <= 32760, zone = epsg % 100, north = epsg < 32700;
      const map = epsg === 4326 ? `map info = {Geographic Lat/Lon, 1, 1, ${x0}, ${y0}, ${dx}, ${dy}, WGS-84}`
        : utm ? `map info = {UTM, 1, 1, ${x0}, ${y0}, ${dx}, ${dy}, ${zone}, ${north ? "North" : "South"}, WGS-84, units=Meters}`
          : `map info = {Arbitrary, 1, 1, ${x0}, ${y0}, ${dx}, ${dy}}`;
      const hdr = ["ENVI", `description = {${desc} | EPSG:${epsg}}`, `samples = ${W}`, `lines = ${H}`, "bands = 1", "header offset = 0",
        "file type = ENVI Standard", "data type = 4", "interleave = bsq", "byte order = 0", map, "data ignore value = -9999"].join("\n");
      save(new Blob([data.buffer], { type: "application/octet-stream" }), base + ".img");
      return save(new Blob([hdr], { type: "text/plain" }), base + ".hdr");
    }
    const rows = [["lon", "lat", "value"]];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const [lo, la] = lonlat(c, r); rows.push([+lo.toFixed(6), +la.toFixed(6), values[r * W + c]]); }
    return save(csv(rows, [desc, `grid EPSG:${epsg}`]), base + ".csv");
  }

  // pulsante "CSV" piccolo, inserito una volta sola prima dell'elemento
  function button(before, text, title, onclick) {
    const b = document.createElement("button");
    b.className = "dl"; b.textContent = text; b.title = title; b.onclick = onclick;
    before.parentNode.insertBefore(b, before);
    return b;
  }

  return { save, csv, chart, table, raster, FORMATS, button };
})();
