// srf.js – bande spettrali dei sensori per le grandezze di trasferimento radiativo (scheda Atmosphere RK).
// Cosa fa: costruisce una "banda virtuale" della tabella RT (LUT 6S o libRadtran) pesando le bande strette della tabella
//          (400–2500 nm ogni 10 nm; 8–13 µm ogni 0,1 µm) con la funzione di risposta spettrale (SRF) del sensore.
//          L'interpolazione nella tabella è lineare, quindi pesare i nodi equivale a pesare le grandezze.
//          SRF da tre fonti: libreria (data/rt/srf.json: curve misurate VNIR–SWIR, gaussiane LWIR),
//          metadati dell'immagine importata (ENVI "wavelength"/"fwhm", GeoTIFF con metadati GDAL), o personalizzate
//          (testo "centro, FWHM" in nm, oppure CSV con lunghezza d'onda in nm e una colonna di risposta per banda).
// Input:   S.meta.atmos_url (libreria), tabelle da ATM.lut("hyper") e ATM.lut("tir").
// Output:  oggetto globale SRF: library(), fromImage(), fromText(), band(srf) -> { L, name, thermal } per ATM.rtBand / ATM.tirBand.
"use strict";

const SRF = (() => {
  let lib = null;
  const cache = new Map();

  async function library() {
    if (!lib) lib = fetch((S.meta.atmos_url || "").replace(/\/?$/, "/") + "data/rt/srf.json").then(r => (r.ok ? r.json() : { sensors: {} }))
      .then(j => j.sensors).catch(() => ({}));
    return lib;
  }

  // risposta della banda alla lunghezza d'onda x (nm): curva misurata, rettangolo o gaussiana
  function response(b, x) {
    if (b.r) { const u = (x - b.w0) / b.dw, i = Math.floor(u); if (i < 0 || i >= b.r.length - 1) return 0; return b.r[i] + (u - i) * (b.r[i + 1] - b.r[i]); }
    if (b.lo != null) return x >= b.lo && x <= b.hi ? 1 : 0;
    return Math.exp(-4 * Math.LN2 * ((x - b.c) / b.fwhm) ** 2);
  }

  // somma pesata di array annidati della stessa forma
  function combine(arrs, w) {
    if (typeof arrs[0] === "number") return arrs.reduce((s, v, i) => s + w[i] * v, 0);
    return arrs[0].map((_, k) => combine(arrs.map(a => a[k]), w));
  }

  // banda virtuale della tabella: VNIR-SWIR sotto 3 µm, LWIR sopra
  async function band(b) {
    const thermal = b.c > 3000, key = `${S.rtm}:${thermal}:${JSON.stringify(b)}`;
    if (cache.has(key)) return cache.get(key);
    const L = await ATM.lut(thermal ? "tir" : "hyper");
    if (!L) throw new Error(thermal ? "LWIR tables need libRadtran: choose it in the Atmosphere tab" : "radiative transfer tables not available");
    const names = Object.keys(L.bands).filter(n => n.startsWith("WL_")), wl = names.map(n => L.bands[n].wl_um * 1000);
    let w = wl.map(x => response(b, x));
    const step = wl[1] - wl[0], width = b.r ? b.r.length * b.dw : b.lo != null ? b.hi - b.lo : b.fwhm;
    if (width < 1.5 * step || !w.some(v => v > 1e-6)) {                 // banda più stretta della tabella: interpolazione al centro
      const u = (b.c - wl[0]) / step, i = Math.max(0, Math.min(wl.length - 2, Math.floor(u))), t = Math.min(1, Math.max(0, u - i));
      w = wl.map((_, k) => (k === i ? 1 - t : k === i + 1 ? t : 0));
    }
    const sum = w.reduce((a, v) => a + v, 0), idx = w.map((v, k) => [v / sum, k]).filter(([v]) => v > 1e-4);
    const ws = idx.map(([v]) => v), tot = ws.reduce((a, v) => a + v, 0);
    const out = { L: { ...L, bands: { V: { wl_um: b.c / 1000, values: combine(idx.map(([, k]) => L.bands[names[k]].values), ws.map(v => v / tot)) } } },
      name: "V", thermal, outside: b.c < wl[0] - step || b.c > wl[wl.length - 1] + step };
    cache.set(key, out);
    return out;
  }

  // metadati spettrali di un'immagine: ENVI (testo dell'header) o GeoTIFF (geotiff.js)
  function parseList(s) { return (s || "").replace(/[{}]/g, "").split(",").map(Number).filter(Number.isFinite); }
  function toNm(v, units) { const u = (units || "").toLowerCase(); return /micro|^um|µm/.test(u) || (!u && v < 30) ? v * 1000 : v; }
  function fromEnvi(hdrText) {
    const get = key => { const m = hdrText.match(new RegExp("^\\s*" + key + "\\s*=\\s*(\\{[^}]*\\}|[^\\n]*)", "mi")); return m ? m[1].trim() : ""; };
    const wl = parseList(get("wavelength")), fw = parseList(get("fwhm")), u = get("wavelength units");
    const names = get("band names").replace(/[{}]/g, "").split(",").map(s => s.trim());
    return wl.map((c, i) => ({ name: names[i] || `Band ${i + 1}`, c: toNm(c, u), fwhm: fw[i] ? toNm(fw[i], u) : null }));
  }
  async function fromTiff(im) {
    const out = [], n = im.getSamplesPerPixel(), all = (await im.getGDALMetadata()) || {};
    const listW = parseList(all.wavelength || all.WAVELENGTH), listF = parseList(all.fwhm || all.FWHM), u0 = all.wavelength_units || all.WAVELENGTH_UNITS;
    for (let i = 0; i < n; i++) {
      const m = (await im.getGDALMetadata(i)) || {}, u = m.wavelength_units || m.WAVELENGTH_UNITS || u0;
      const c = +(m.wavelength ?? m.WAVELENGTH ?? m.CENTRAL_WAVELENGTH ?? listW[i]), f = +(m.fwhm ?? m.FWHM ?? m.BANDWIDTH ?? listF[i]);
      if (Number.isFinite(c) && c > 0) out.push({ name: m.DESCRIPTION || `Band ${i + 1}`, c: toNm(c, u), fwhm: Number.isFinite(f) && f > 0 ? toNm(f, u) : null });
    }
    return out;
  }
  // bande senza FWHM: gaussiana larga quanto la distanza dalle bande vicine
  function complete(bands) {
    return bands.map((b, i) => (b.fwhm ? b : { ...b, fwhm: Math.max(1, Math.abs((bands[i + 1] || bands[i - 1] || { c: b.c + 10 }).c - b.c)) }));
  }

  // testo personalizzato: righe "centro, FWHM" (nm) oppure CSV con intestazione: lunghezza d'onda (nm), risposta banda 1, banda 2, ...
  function fromText(t) {
    const rows = t.trim().split(/\r?\n/).map(r => r.split(/[,;\t ]+/).filter(Boolean));
    if (!rows.length) return [];
    const head = rows[0].some(x => !Number.isFinite(+x)) ? rows.shift() : null, nums = rows.map(r => r.map(Number)).filter(r => r.every(Number.isFinite));
    if (nums.length && nums[0].length === 2 && nums.length <= 50 && !head) {
      return nums.map(([c, f], i) => ({ name: `Band ${i + 1}`, c, fwhm: f }));
    }
    const wl = nums.map(r => r[0]);
    return nums[0].slice(1).map((_, j) => {
      const r = nums.map(x => x[j + 1]), mx = Math.max(...r), dw = (wl[wl.length - 1] - wl[0]) / (wl.length - 1);
      // ricampionata a passo costante per response()
      const n = Math.round((wl[wl.length - 1] - wl[0]) / dw) + 1, rr = [];
      for (let k = 0; k < n; k++) { const x = wl[0] + k * dw; let i = 0; while (i < wl.length - 2 && wl[i + 1] < x) i++;
        const t2 = (x - wl[i]) / (wl[i + 1] - wl[i] || 1); rr.push((r[i] + t2 * (r[i + 1] - r[i])) / mx); }
      const c = rr.reduce((s, v, k) => s + v * (wl[0] + k * dw), 0) / rr.reduce((s, v) => s + v, 0);
      return { name: head ? head[j + 1] : `Band ${j + 1}`, c, w0: wl[0], dw, r: rr };
    });
  }

  return { library, band, fromEnvi, fromTiff, fromText, complete };
})();
