// mapstyle.js – simbologia delle mappe "come QGIS", condivisa da Maps (app.js) e Atmosphere RK (hires.js).
// Cosa fa:  scale di colori, limiti min/max (predefiniti, min-max, percentili 2–98 %, media ± 2σ, manuali),
//           classi continue / intervalli uguali / quantili, inversione, opacità, valori fuori scala trasparenti,
//           istogramma con i limiti, legenda; pannello Layers (accendi/spegni, ordine con trascinamento o ▲▼).
// Input:    valori numerici del layer (array, null/NaN = nessun dato) e lo stile del layer.
// Output:   funzione colore x -> [r, g, b, a] | null, HTML della legenda, pannelli nel DOM.
// Lo stile cambia solo la visualizzazione: i valori calcolati non vengono modificati.
"use strict";

const MapStyle = (() => {
  const RAMPS = {
    "RdYlBu": ["#313695", "#4575b4", "#abd9e9", "#ffffbf", "#fdae61", "#d73027", "#a50026"],
    "Temperature (RdYlBu)": ["#313695", "#4575b4", "#74add1", "#abd9e9", "#e0f3f8", "#ffffbf", "#fee090", "#fdae61", "#f46d43", "#d73027", "#a50026"],
    "Precipitation": ["#ffffff", "#c6dbef", "#6baed6", "#2171b5", "#08306b", "#6a51a3", "#d4b9da"],
    "YlOrRd": ["#ffffcc", "#fed976", "#fd8d3c", "#e31a1c", "#800026"],
    "OrRd": ["#fff7ec", "#fdbb84", "#d7301f", "#7f0000"],
    "Blues": ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"],
    "Greens": ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"],
    "Greys": ["#ffffff", "#bdbdbd", "#525252", "#000000"],
    "Viridis": ["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"],
    "Magma": ["#000004", "#1c1044", "#4f127b", "#812581", "#b5367a", "#e55964", "#fb8761", "#fec287", "#fcfdbf"],
    "Cividis": ["#00224e", "#123570", "#3b496c", "#575d6d", "#707173", "#8a8779", "#a69d75", "#c4b56c", "#e4cf5b", "#fee838"],
    "Turbo": ["#30123b", "#4662d7", "#36aaf9", "#1ae4b6", "#72fe5e", "#c8ef34", "#faba39", "#f66b19", "#ca2a04", "#7a0403"],
    "Spectral": ["#9e0142", "#d53e4f", "#f46d43", "#fdae61", "#fee08b", "#ffffbf", "#e6f598", "#abdda4", "#66c2a5", "#3288bd", "#5e4fa2"],
    "BrBG": ["#543005", "#8c510a", "#bf812d", "#dfc27d", "#f6e8c3", "#f5f5f5", "#c7eae5", "#80cdc1", "#35978f", "#01665e", "#003c30"],
  };
  const RANGE_MODES = [["default", "Default"], ["minmax", "Min – max"], ["p2_98", "Percentiles 2–98 %"], ["mean2sd", "Mean ± 2 std. dev."], ["manual", "Manual"]];
  const CLASS_MODES = [["continuous", "Continuous"], ["equal", "Equal intervals"], ["quantile", "Quantiles"]];

  const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  function rampAt(stops, t) {
    t = Math.min(1, Math.max(0, t));
    const x = t * (stops.length - 1), i = Math.min(Math.floor(x), stops.length - 2), f = x - i;
    const a = rgb(stops[i]), b = rgb(stops[i + 1]);
    return a.map((v, k) => Math.round(v + f * (b[k] - v)));
  }
  const css = c => `rgb(${c.join(",")})`;
  const stopsOf = st => { const s = RAMPS[st.ramp] || RAMPS.Viridis; return st.invert ? [...s].reverse() : s; };
  const digits = span => span >= 50 ? 0 : span >= 5 ? 1 : span >= 0.5 ? 2 : 3;
  const num = (x, d) => Number.isFinite(x) ? (Math.abs(x) < 0.5 * 10 ** -d ? 0 : x).toFixed(d) : "–";

  // stile di partenza: rampa e limiti predefiniti dati dalla scheda (stessa resa di prima)
  function create(ramp, opacity, def) {
    return { ramp, invert: false, range: "default", min: null, max: null, classes: "continuous", n: 5,
      opacity, clip: false, def: def || null };
  }

  const cache = new WeakMap();                     // statistiche per array: si ricalcolano solo se cambiano i dati
  function stats(vals) {
    if (cache.has(vals)) return cache.get(vals);
    const v = []; for (const x of vals) if (x != null && Number.isFinite(x)) v.push(x);
    v.sort((a, b) => a - b);
    const n = v.length; if (!n) return null;
    const mean = v.reduce((s, x) => s + x, 0) / n, sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
    const q = p => v[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
    const out = { v, n, min: v[0], max: v[n - 1], mean, sd, q };
    cache.set(vals, out);
    return out;
  }

  // limiti della scala secondo la modalità scelta
  function limits(st, S) {
    let lo, hi;
    if (!S) return [0, 1];
    if (st.range === "manual" && st.min != null && st.max != null) [lo, hi] = [+st.min, +st.max];
    else if (st.range === "minmax") [lo, hi] = [S.min, S.max];
    else if (st.range === "p2_98") [lo, hi] = [S.q(0.02), S.q(0.98)];
    else if (st.range === "mean2sd") [lo, hi] = [S.mean - 2 * S.sd, S.mean + 2 * S.sd];
    else [lo, hi] = st.def ? st.def(S) : [S.min, S.max];
    if (!(hi > lo)) hi = lo + 1e-9;
    return [lo, hi];
  }

  // classificatore: per i valori del layer restituisce colore RGBA, limiti, classi e statistiche
  function classify(st, vals) {
    const S = stats(vals), [lo, hi] = limits(st, S), stops = stopsOf(st), a = Math.round(255 * st.opacity);
    let edges = null;
    if (st.classes !== "continuous" && S) {
      const n = Math.max(2, Math.min(12, +st.n || 5));
      if (st.classes === "equal") edges = Array.from({ length: n + 1 }, (_, i) => lo + (hi - lo) * i / n);
      else {
        const inside = S.v.filter(x => x >= lo && x <= hi), m = inside.length;
        edges = Array.from({ length: n + 1 }, (_, i) => m ? inside[Math.min(m - 1, Math.round(i * (m - 1) / n))] : lo + (hi - lo) * i / n);
        edges[0] = lo; edges[n] = hi;
      }
    }
    const classColor = edges ? edges.slice(0, -1).map((_, i) => rampAt(stops, edges.length > 2 ? i / (edges.length - 2) : 0)) : null;
    function color(x) {
      if (x == null || !Number.isFinite(x)) return null;
      if (st.clip && (x < lo || x > hi)) return null;
      if (!edges) return [...rampAt(stops, (x - lo) / (hi - lo)), a];
      let i = 0; while (i < edges.length - 2 && x > edges[i + 1]) i++;
      return [...classColor[i], a];
    }
    return { color, lo, hi, edges, classColor, stops, S };
  }

  // legenda: barra continua oppure riquadri per classe
  function legend(title, unit, C) {
    const d = digits(C.hi - C.lo), u = unit ? ` [${unit}]` : "";
    if (C.edges) {
      const rows = C.classColor.map((c, i) => `<div class="lg-row"><span class="sw" style="background:${css(c)}"></span>${num(C.edges[i], d)} – ${num(C.edges[i + 1], d)}</div>`);
      return `<div class="lg"><b>${title}</b>${u}${rows.reverse().join("")}</div>`;
    }
    const ticks = [0, .25, .5, .75, 1].map(t => `<span>${num(C.lo + t * (C.hi - C.lo), d)}</span>`);
    return `<div class="lg"><b>${title}</b>${u}<div class="bar" style="background:linear-gradient(90deg,${C.stops.join(",")})"></div><div class="ticks">${ticks.join("")}</div></div>`;
  }

  // istogramma dei valori con i limiti min/max della scala
  function histogram(cv, C) {
    const g = cv.getContext("2d"), W = cv.width = cv.clientWidth * devicePixelRatio || 260, H = cv.height = 80 * devicePixelRatio;
    g.clearRect(0, 0, W, H);
    if (!C.S) return;
    const S = C.S, a = Math.min(S.min, C.lo), b = Math.max(S.max, C.hi), nb = 40, w = (b - a) / nb || 1, cnt = new Array(nb).fill(0);
    for (const x of S.v) cnt[Math.min(nb - 1, Math.floor((x - a) / w))]++;
    const mx = Math.max(...cnt, 1), bw = W / nb, X = x => (x - a) / (b - a || 1) * W;
    cnt.forEach((c, i) => {
      const col = C.color(a + (i + .5) * w);
      g.fillStyle = col ? css(col.slice(0, 3)) : "#d3dbe1";
      g.fillRect(i * bw + .5, H - 14 * devicePixelRatio - c / mx * (H - 18 * devicePixelRatio), bw - 1, c / mx * (H - 18 * devicePixelRatio));
    });
    g.fillStyle = "#15233b"; g.font = `${10 * devicePixelRatio}px system-ui`;
    for (const x of [C.lo, C.hi]) g.fillRect(X(x) - devicePixelRatio, 0, 2 * devicePixelRatio, H - 12 * devicePixelRatio);
    const d = digits(b - a);
    g.textAlign = "left"; g.fillText(num(a, d), 0, H - 2);
    g.textAlign = "right"; g.fillText(num(b, d), W, H - 2);
  }

  const opt = (list, v) => list.map(([k, l]) => `<option value="${k}"${k === v ? " selected" : ""}>${l}</option>`).join("");

  // pannello Style del layer selezionato; onChange() ridisegna la mappa
  function stylePanel(box, layer, onChange) {
    if (!layer || !layer.style) { box.innerHTML = `<p class="hint">Select a data layer to change its style.</p>`; return; }
    const st = layer.style, C = classify(st, layer.values());
    const d = digits(C.hi - C.lo);
    box.innerHTML = `<h4>${layer.name}</h4>
      <label>Colour ramp <select data-k="ramp">${opt(Object.keys(RAMPS).map(k => [k, k]), st.ramp)}</select></label>
      <div class="ramp-preview" style="background:linear-gradient(90deg,${C.stops.join(",")})"></div>
      <label class="chk"><input type="checkbox" data-k="invert"${st.invert ? " checked" : ""}> Invert ramp</label>
      <label>Min / max <select data-k="range">${opt(RANGE_MODES, st.range)}</select></label>
      <div class="minmax"><label>Min <input type="number" step="any" data-k="min" value="${num(C.lo, d + 1)}"></label>
        <label>Max <input type="number" step="any" data-k="max" value="${num(C.hi, d + 1)}"></label></div>
      <label>Classes <select data-k="classes">${opt(CLASS_MODES, st.classes)}</select></label>
      <label${st.classes === "continuous" ? " hidden" : ""}>Number of classes <input type="number" min="2" max="12" step="1" data-k="n" value="${st.n}"></label>
      <label>Opacity <input type="range" min="0" max="100" data-k="opacity" value="${Math.round(100 * st.opacity)}"> <span>${Math.round(100 * st.opacity)} %</span></label>
      <label class="chk"><input type="checkbox" data-k="clip"${st.clip ? " checked" : ""}> Values outside min–max transparent</label>
      <div class="histo"><canvas></canvas><p class="hint">Histogram of the values · bars = min and max of the scale</p></div>`;
    histogram(box.querySelector("canvas"), C);
    box.querySelectorAll("[data-k]").forEach(el => {
      const k = el.dataset.k;
      el[el.type === "range" || el.type === "number" ? "oninput" : "onchange"] = () => {
        if (k === "invert" || k === "clip") st[k] = el.checked;
        else if (k === "opacity") { st.opacity = el.value / 100; el.nextElementSibling.textContent = `${el.value} %`; }
        else if (k === "min" || k === "max") {
          if (el.value === "" || !Number.isFinite(+el.value)) return;
          const [lo, hi] = limits(st, C.S); st.min = lo; st.max = hi; st[k] = +el.value; st.range = "manual";
          box.querySelector('[data-k="range"]').value = "manual";
        } else if (k === "n") st.n = Math.max(2, Math.min(12, +el.value || 5));
        else st[k] = el.value;
        onChange();
        if (!(k === "min" || k === "max" || k === "opacity")) stylePanel(box, layer, onChange);
        else histogram(box.querySelector("canvas"), classify(st, layer.values()));
      };
    });
  }

  // pannello Layers: in alto = disegnato sopra; casella = visibile; ▲▼ o trascinamento = ordine
  function layersPanel(box, list, sel, cb) {
    box.innerHTML = `<h4>Layers</h4><ol class="layers">${list.map((l, i) => `
      <li draggable="true" data-i="${i}" class="${l.id === sel ? "sel" : ""}">
        <span class="grip" aria-hidden="true">⋮⋮</span>
        <input type="checkbox" ${l.visible ? "checked" : ""} title="Show / hide" aria-label="Show / hide ${l.name}">
        <button class="name" title="Select to change the style">${l.name}</button>
        <span class="mv"><button data-d="-1" title="Move up" aria-label="Move up"${i === 0 ? " disabled" : ""}>▲</button><button data-d="1" title="Move down" aria-label="Move down"${i === list.length - 1 ? " disabled" : ""}>▼</button>${l.removable ? `<button data-x title="Remove layer" aria-label="Remove layer">✕</button>` : ""}</span>
      </li>`).join("")}</ol>`;
    const move = (from, to) => { if (to < 0 || to >= list.length || from === to) return; const [l] = list.splice(from, 1); list.splice(to, 0, l); cb.order(); };
    box.querySelectorAll("li").forEach(li => {
      const i = +li.dataset.i, l = list[i];
      li.querySelector("input").onchange = e => { l.visible = e.target.checked; cb.toggle(l); };
      li.querySelector(".name").onclick = () => cb.select(l);
      li.querySelectorAll("[data-d]").forEach(b => b.onclick = () => move(i, i + +b.dataset.d));
      const x = li.querySelector("[data-x]"); if (x) x.onclick = () => { list.splice(i, 1); cb.remove(l); };
      li.ondragstart = e => { e.dataTransfer.setData("text/plain", i); li.classList.add("drag"); };
      li.ondragend = () => li.classList.remove("drag");
      li.ondragover = e => e.preventDefault();
      li.ondrop = e => { e.preventDefault(); move(+e.dataTransfer.getData("text/plain"), i); };
    });
  }

  return { create, classify, legend, stylePanel, layersPanel, css };
})();
