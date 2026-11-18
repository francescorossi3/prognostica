"use strict";
/* Prognostica - interfaccia del sito (statico, nessun server).
   Schede: classifica, eventi, mappe, previsione nel punto, affidabilita' GPR, dati e metodo.
   Input:  data/*.json prodotti dagli script 03-07 (meta, scores, trend, weights, gp/, maps/, obs_recent, ...),
           Open-Meteo Forecast API (punto), Photon/Nominatim (ricerca luoghi), italy.geojson.
   Output: contenuto della pagina (tabelle, grafici Chart.js, mappe Leaflet); nessun file scritto. */

const $ = s => document.querySelector(s);
const DATA = "data/";
const VAR_LABEL = { t2m: "Mean temperature", tmax: "Maximum temperature", tmin: "Minimum temperature", prcp: "Precipitation" };
const VAR_UNIT = { t2m: "°C", tmax: "°C", tmin: "°C", prcp: "mm" };
const AGG_LABEL = { "1h": "Hourly", "6h": "6-hourly", "24h": "Daily" };
const COMBO = { BEST: "★ Best", WEIGHTED: "⚖ Weighted mean", GPR: "◆ GPR" };
const PALETTE = ["#1f77b4", "#d62728", "#2ca02c", "#9467bd", "#8c564b", "#e377c2", "#17becf", "#bcbd22",
  "#7f7f7f", "#ff7f0e", "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173"];
const S = { meta: null, scores: [], hold: [], trend: [], weights: [], gpval: [], gpst: [], stations: [], maps: {},
  evScores: [], evList: [], evDef: [], region: "italia", italy: null };
const inR = r => !r.region || r.region === S.region;          // filtro per regione selezionata

const fetchJSON = (f, fallback = null) => fetch(DATA + f).then(r => (r.ok ? r.json() : fallback)).catch(() => fallback);
const fmt = (v, d = 2) => (v == null || !isFinite(v) ? "–" : (+v).toFixed(d));
const pname = id => COMBO[id] || (S.meta.providers.find(p => p.id === id) || {}).name || id;
const leadLabel = l => (l === 0 ? "Today" : l === 1 ? "Tomorrow (+1 d)" : `+${l} days`);
const leadShort = l => (l === 0 ? "d0" : `+${l}d`);
function opts(sel, items, value) {
  sel.innerHTML = items.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
  if (value != null && items.some(([v]) => String(v) === String(value))) sel.value = value;
}
const varsFor = agg => (agg === "24h" ? ["t2m", "tmax", "tmin", "prcp"] : ["t2m", "prcp"]);
const charts = {};
function drawChart(id, cfg) {
  Chart.getChart(id)?.destroy();
  if (typeof I18N !== "undefined" && I18N.lang !== "en") {          // etichette dei grafici nella lingua scelta
    cfg.data.datasets.forEach(d => { d.label = I18N.t(d.label); });
    if (cfg.data.labels) cfg.data.labels = cfg.data.labels.map(l => I18N.t(l));
    Object.values(cfg.options?.scales || {}).forEach(a => { if (a.title?.text) a.title.text = I18N.t(a.title.text); });
  }
  const cv = document.getElementById(id), host = cv.closest(".chart-box, .card");
  // su telefono e tablet stretto i grafici con proporzioni fisse diventano più alti, per restare leggibili
  const ratio = w => (w < 560 ? 1.05 : w < 900 ? 1.5 : 2);
  if (cfg.options?.maintainAspectRatio !== false) {
    cfg.options = { ...cfg.options, aspectRatio: ratio(cv.parentElement.clientWidth || innerWidth),
      onResize: (c, size) => { if (c.options.aspectRatio !== ratio(size.width)) { c.options.aspectRatio = ratio(size.width); c.resize(); } } };
  }
  charts[id] = new Chart(cv, cfg);
  // pulsante CSV del grafico (uno per grafico, usa sempre i dati attuali)
  if (host && !host.querySelector(`button.dl[data-for="${id}"]`)) {
    host.classList.add("has-dl");
    EXPORT.button(host.firstChild, "CSV", "Download the data of this chart (CSV)",
      () => EXPORT.chart(charts[id], `${charts[id].config.options.csvName || id}.csv`, charts[id].config.options.csvHead)).dataset.for = id;
  }
  return charts[id];
}
// legenda HTML sopra un grafico: clic = mostra/nascondi la serie; tips = spiegazione al passaggio del mouse
function htmlLegend(ch, el, tips = {}) {
  el.innerHTML = ch.data.datasets.map((d, k) => d.label.startsWith("_") ? ""
    : `<button data-k="${k}" title="${tips[k] || "Show / hide"}"><i style="background:${d.borderColor || d.backgroundColor}"></i>${d.label}</button>`).join("");
  el.querySelectorAll("button").forEach(b => b.onclick = () => {
    const k = +b.dataset.k; ch.setDatasetVisibility(k, !ch.isDatasetVisible(k)); b.classList.toggle("off"); ch.update(); });
}
// pulsante CSV per ogni tabella del sito
function tableDownloads() {
  document.querySelectorAll("main table").forEach(t => {
    const host = t.closest(".card, details");
    host.classList.add("has-dl");
    EXPORT.button(host.querySelector(":scope > summary")?.nextSibling || host.firstChild, "CSV", "Download this table (CSV)", () => EXPORT.table(t, `${t.id}.csv`));
  });
}

// statistiche d'uso anonime (GoatCounter, senza cookie) -> repository privato Census
function track(name) {
  try { window.goatcounter?.count?.({ path: "prognostica/" + name, title: name, event: true }); } catch { /* niente */ }
}
function initStats() {
  const code = S.meta.goatcounter;
  if (!code) return;
  window.goatcounter = { path: p => "prognostica" + p };       // pagine distinte da quelle degli altri siti
  const sc = document.createElement("script");
  sc.async = true; sc.src = "https://gc.zgo.at/count.js";
  sc.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  document.head.appendChild(sc);
}

// ------------------------------------------------------------------ avvio
(async function init() {
  [S.meta, S.scores, S.hold, S.trend, S.weights, S.gpval, S.gpst, S.stations] = await Promise.all([
    fetchJSON("meta.json", {}), fetchJSON("scores.json", []), fetchJSON("scores_holdout.json", []),
    fetchJSON("trend.json", []), fetchJSON("weights.json", []), fetchJSON("gpr_validation.json", []),
    fetchJSON("gpr_station_errors.json", []), fetchJSON("stations.json", [])]);
  [S.evScores, S.evList, S.evDef, S.bt] = await Promise.all([fetchJSON("events_scores.json", []),
    fetchJSON("events_list.json", []), fetchJSON("events_def.json", []), fetchJSON("gpr_backtest.json", [])]);
  S.meta.providers = S.meta.providers || [];
  S.meta.regions = S.meta.regions || [{ id: "italia", name: "Italia", center: [42.2, 12.6, 6], providers: [] }];
  S.region = S.meta.regions[0].id;
  opts($("#region"), S.meta.regions.map(r => [r.id, r.name]), S.region);
  $("#region").onchange = () => {
    S.region = $("#region").value; refreshAll();
    const cur = document.querySelector("#tabs button.active")?.dataset.tab;
    if (!isVerified() && ["rank", "events"].includes(cur)) showTab("maps");   // nessuna verifica: si va alle mappe
  };
  S.italy = await fetch(DATA + "italy.geojson").then(r => r.json()).catch(() => null);
  $("#updated").textContent = S.meta.last_day
    ? `Verified up to ${S.meta.last_day} · updated ${S.meta.built?.replace("T", " ").slice(0, 16)} UTC` : "No data yet";
  document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => showTab(b.dataset.tab));
  const h0 = location.hash.slice(1);              // scheda richiesta nel link (prima che il punto riscriva l'indirizzo)
  if (h0) showTab(h0.split("?")[0]);
  initStats();
  initRank(); initEvents(); initMaps(); initPoint(); initData(); tableDownloads();
  refreshAll();
  if (h0) showTab(h0.split("?")[0]);
})();

const regionOf = id => S.meta.regions.find(r => r.id === id) || S.meta.regions[0];
const NOVER = "This region is not verified: the site only shows the model forecasts (Maps and Point forecast tabs); the values are archived in the data.";
const isVerified = () => regionOf(S.region).verify !== false;
function refreshAll() {
  renderRank(); renderEvents(); renderValid();
  const c = regionOf(S.region).center || [42, 12, 5];
  S.map.setView([c[0], c[1]], c[2]);
  loadMap();
}

function showTab(t) {
  if (t === "valid") t = "rank";                   // vecchi link: Model accuracy e GPR reliability ora sono una scheda
  track("tab-" + t);
  document.querySelectorAll("#tabs button").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === t);
    if (b.dataset.tab === t) b.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  document.querySelectorAll(".tab").forEach(s => s.classList.toggle("active", s.id === "tab-" + t));
  const q = location.hash.split("?")[1];
  history.replaceState(null, "", "#" + t + (q && ["point", "atm", "hr"].includes(t) ? "?" + q : ""));
  if (t === "maps" && S.map) setTimeout(() => S.map.invalidateSize(), 50);
  if (t === "point") Object.values(charts).forEach(c => c.resize());
  if (t === "hr" && S.hmap) setTimeout(() => { S.hmap.invalidateSize(); S.vmap?.invalidateSize(); }, 50);
  if (t === "atm" || t === "hr") Object.values(charts).forEach(c => c.resize());
}

// ================================================================== CLASSIFICA
function metricsFor(v, agg) {
  const m = [["rmse", "RMSE (root mean square error)"], ["mae", "MAE (mean absolute error)"], ["bias", "Bias (forecast − observed)"], ["corr", "Correlation"], ["r2", "R² (explained variance)"]];
  if (v === "prcp") {
    (S.meta.prcp_thresholds?.[agg] || []).forEach((t, i) => {
      m.push([`ets_${i + 1}`, `ETS ≥ ${t} mm`], [`csi_${i + 1}`, `CSI ≥ ${t} mm`],
        [`pod_${i + 1}`, `POD ≥ ${t} mm (hit rate)`], [`far_${i + 1}`, `FAR ≥ ${t} mm (false alarms)`]);
    });
  }
  return m;
}
const higherBetter = m => /^(corr|r2|ets|csi|pod)/.test(m);
const absBetter = m => m === "bias" || m.startsWith("fbias");

function initRank() {
  opts($("#r-agg"), S.meta.aggs.map(a => [a, AGG_LABEL[a]]), "24h");
  const wins = [...new Set(S.scores.map(r => r.window))];
  opts($("#r-win"), [...wins.map(w => [w, w === "all" ? "Whole record" : `Last ${parseInt(w)} days`]),
    ["holdout", `Last ${S.meta.holdout_days || ""} days + combinations`]], "90d");
  opts($("#r-trend-lead"), S.meta.leads.map(l => [l, leadLabel(l)]), 1);
  const upd = () => {
    opts($("#r-var"), varsFor($("#r-agg").value).map(v => [v, VAR_LABEL[v]]), $("#r-var").value || "t2m");
    opts($("#r-metric"), metricsFor($("#r-var").value, $("#r-agg").value), $("#r-metric").value || "rmse");
    renderRank(); renderValid();
  };
  ["#r-agg", "#r-var"].forEach(s => $(s).onchange = upd);
  ["#r-win", "#r-metric", "#r-trend-lead"].forEach(s => $(s).onchange = renderRank);
  upd();
}

function renderRank() {
  if (!isVerified()) { $("#r-hint").textContent = NOVER; $("#r-table").innerHTML = ""; drawChart("r-chart", { type: "line", data: { labels: [], datasets: [] } }); drawChart("r-trend", { type: "line", data: { labels: [], datasets: [] } }); return; }
  const v = $("#r-var").value, agg = $("#r-agg").value, win = $("#r-win").value, met = $("#r-metric").value;
  const rows = (win === "holdout" ? S.hold : S.scores.filter(r => r.window === win))
    .filter(r => r.var === v && r.agg === agg && inR(r));
  const leads = S.meta.leads;
  const provs = [...new Set(rows.map(r => r.provider))].sort((a, b) => (a in COMBO) - (b in COMBO) || pname(a).localeCompare(pname(b)));
  const get = (p, l) => rows.find(r => r.provider === p && r.lead_day === l);
  const unit = /^(rmse|mae|bias)$/.test(met) ? ` [${VAR_UNIT[v]}]` : "";
  $("#r-hint").textContent = rows.length
    ? `${VAR_LABEL[v]} · ${AGG_LABEL[agg]} · ${met.toUpperCase()}${unit}. Colours by column: green = best, red = worst; the black frame marks the best.`
      + (win === "holdout" ? " Combinations use weights chosen before these days (out-of-sample test)." : "")
    : "No data for this combination (a few weeks of record are needed).";
  // ranking per colonna
  const rank = {};
  for (const l of leads) {
    const vals = provs.map(p => [p, get(p, l)?.[met]]).filter(([, x]) => x != null && isFinite(x));
    const key = x => (absBetter(met) ? Math.abs(x) : higherBetter(met) ? -x : x);
    vals.sort((a, b) => key(a[1]) - key(b[1]));
    vals.forEach(([p], i) => (rank[p + "|" + l] = vals.length > 1 ? i / (vals.length - 1) : 0));
  }
  const color = t => `hsl(${120 - 120 * t}, 65%, ${88 - 8 * Math.abs(t - .5)}%)`;
  let html = `<thead><tr><th>Provider</th>${leads.map(l => `<th title="${leadLabel(l)}">${leadShort(l)}</th>`).join("")}<th>n</th></tr></thead><tbody>`;
  let sepDone = false;
  for (const p of provs) {
    const isCombo = p in COMBO;
    const cls = isCombo ? `combo${!sepDone ? " sep" : ""}` : "";
    if (isCombo) sepDone = true;
    const pr = S.meta.providers.find(x => x.id === p);
    const regProv = regionOf(S.region).providers || [];
    const tag = pr && !regProv.includes(p) ? '<span class="tag">solo stazioni</span>' : "";
    html += `<tr class="${cls}"><td>${pname(p)}${tag}</td>`;
    for (const l of leads) {
      const r = get(p, l), x = r?.[met], t = rank[p + "|" + l];
      html += x == null || !isFinite(x) ? "<td>–</td>"
        : `<td class="v${t === 0 ? " best" : ""}" style="background:${color(t)}">${fmt(x, /^(corr|r2)/.test(met) || /_/.test(met) ? 3 : 2)}</td>`;
    }
    html += `<td>${Math.max(0, ...leads.map(l => get(p, l)?.n || 0))}</td></tr>`;
  }
  $("#r-table").innerHTML = html + "</tbody>";
  // grafico metrica vs lead
  drawChart("r-chart", {
    type: "line",
    data: { labels: leads.map(leadShort), datasets: provs.map((p, i) => ({
      label: pname(p), data: leads.map(l => get(p, l)?.[met] ?? null), borderColor: PALETTE[i % PALETTE.length],
      backgroundColor: PALETTE[i % PALETTE.length], borderWidth: p in COMBO ? 3 : 1.5, pointRadius: 2, spanGaps: true,
      borderDash: p === "WEIGHTED" ? [6, 3] : p === "BEST" ? [2, 2] : [] })) },
    options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: { x: { title: { display: true, text: "forecast lead time" } }, y: { title: { display: true, text: met.toUpperCase() + unit } } } },
  });
  // trend mensile
  const tl = +$("#r-trend-lead").value;
  const tr = S.trend.filter(r => r.var === v && r.agg === agg && r.lead_day === tl && inR(r));
  const months = [...new Set(tr.map(r => r.month))].sort();
  const tprov = [...new Set(tr.map(r => r.provider))];
  drawChart("r-trend", {
    type: "line",
    data: { labels: months, datasets: tprov.map(p => ({ label: pname(p),
      data: months.map(m => tr.find(r => r.provider === p && r.month === m)?.[met] ?? null),
      borderColor: PALETTE[provs.indexOf(p) % PALETTE.length], borderWidth: 1.5, pointRadius: 2, spanGaps: true })) },
    options: { plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: met.toUpperCase() + unit } } } },
  });
}

// ================================================================== EVENTI
function initEvents() {
  opts($("#e-type"), S.evDef.map(e => [e.id, `${e.name} (${VAR_LABEL[e.var].toLowerCase()} ${e.op} ${e.thr} ${VAR_UNIT[e.var]})`]));
  opts($("#e-lead"), S.meta.leads.map(l => [l, leadLabel(l)]), 1);
  $("#e-type").onchange = renderEvents; $("#e-lead").onchange = renderEvents;
  renderEvents();
}
function renderEvents() {
  if (!isVerified()) { $("#e-hint").textContent = NOVER; $("#e-table").innerHTML = ""; $("#e-list").innerHTML = ""; drawChart("e-chart", { type: "line", data: { labels: [], datasets: [] } }); return; }
  const ev = S.evDef.find(e => e.id === $("#e-type").value);
  if (!ev) { $("#e-hint").textContent = "No events defined."; return; }
  const lead = +$("#e-lead").value, u = VAR_UNIT[ev.var];
  const rows = S.evScores.filter(r => r.event === ev.id && r.lead_day === lead && inR(r)).sort((a, b) => (b.csi ?? -1) - (a.csi ?? -1));
  const nobs = Math.max(0, ...rows.map(r => r.observed));
  $("#e-hint").textContent = rows.length
    ? `${nobs} events observed in the whole record (station × day). Hit = the forecast also exceeds the threshold; false alarm = forecast but not observed. Sorted by CSI.`
    : "No event of this type observed yet.";
  const pct = x => (x == null || !isFinite(x) ? "–" : Math.round(100 * x) + "%");
  let html = `<thead><tr><th>Provider</th><th>Observed</th><th>Hits</th><th>Misses</th><th>False alarms</th><th>POD</th><th>FAR</th><th>CSI</th>
    <th>Mean error on event days</th><th>MAE on event days</th></tr></thead><tbody>`;
  rows.forEach((r, i) => {
    html += `<tr><td>${i === 0 ? "★ " : ""}${pname(r.provider)}</td><td>${r.observed}</td><td>${r.hits}</td><td>${r.misses}</td><td>${r.false_alarms}</td>
      <td>${pct(r.pod)}</td><td>${pct(r.far)}</td><td><b>${pct(r.csi)}</b></td><td>${fmt(r.bias_on_event, 1)} ${u}</td><td>${fmt(r.mae_on_event, 1)} ${u}</td></tr>`;
  });
  $("#e-table").innerHTML = html + "</tbody>";
  const provs = [...new Set(S.evScores.filter(r => r.event === ev.id && inR(r)).map(r => r.provider))];
  drawChart("e-chart", { type: "line",
    data: { labels: S.meta.leads.map(leadShort), datasets: provs.map((p, i) => ({ label: pname(p),
      data: S.meta.leads.map(l => S.evScores.find(r => r.event === ev.id && r.provider === p && r.lead_day === l && inR(r))?.csi ?? null),
      borderColor: PALETTE[i % PALETTE.length], borderWidth: 1.5, pointRadius: 2, spanGaps: true })) },
    options: { maintainAspectRatio: false, plugins: { legend: { position: innerWidth < 700 ? "bottom" : "right", labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: { y: { min: 0, max: 1, title: { display: true, text: "CSI" } } } } });
  const list = S.evList.filter(r => r.event === ev.id && r.lead_day === lead && inR(r)).slice(0, 200);
  const hit = x => (x == null ? "" : (ev.op === ">=" ? x >= ev.thr : x <= ev.thr) ? "ok" : "bad");
  const lp = provs.filter(p => list.some(r => r[p] != null));
  let lh = `<thead><tr><th>Date</th><th>Station</th><th>Observed</th>${lp.map(p => `<th>${pname(p)}</th>`).join("")}</tr></thead><tbody>`;
  list.forEach(r => {
    lh += `<tr><td>${String(r.date).slice(0, 10)}</td><td>${r.name || r.station}</td><td><b>${fmt(r.osservato, 1)}</b></td>
      ${lp.map(p => `<td class="${hit(r[p])}">${fmt(r[p], 1)}</td>`).join("")}</tr>`;
  });
  $("#e-list").innerHTML = lh + "</tbody>";
}

// ================================================================== MAPPE
// Pannello Layers (accendi/spegni, ordine) e Style (simbologia) come in QGIS: vedi mapstyle.js.
// Ogni layer ha il suo "pane" Leaflet: l'ordine nella lista (in alto = sopra) decide lo z-index.
const mapKey = () => `${S.region}/${$("#m-var").value}_${$("#m-agg").value}`;
const curMap = () => S.maps[mapKey()];

// rampa e limiti predefiniti per layer (stessa resa delle versioni precedenti)
function defaultStyle(key) {
  const v = $("#m-var").value, pts = !curMap()?.res;
  if (key === "gpr_unc" || key === "spread") return MapStyle.create("YlOrRd", pts ? .95 : .78, s => [0, Math.max(s.max, 0.5)]);
  if (key === "gpr_p") return MapStyle.create("Blues", pts ? .95 : .78, () => [0, 100]);
  if (v === "prcp") return MapStyle.create("Precipitation", pts ? .95 : .78, () => [0, { "1h": 5, "6h": 15, "24h": 40 }[$("#m-agg").value]]);
  return MapStyle.create("Temperature (RdYlBu)", pts ? .95 : .78, s => [Math.floor(s.min), Math.ceil(s.max) > Math.floor(s.min) ? Math.ceil(s.max) : Math.floor(s.min) + 1]);
}
// stile per variabile + aggregazione + layer: le modifiche dell'utente restano finché la pagina è aperta
const styleFor = key => (S.mstyles[`${$("#m-var").value}|${$("#m-agg").value}|${key}`] ||= defaultStyle(key));
const unitOf = key => key === "gpr_p" ? "%" : VAR_UNIT[$("#m-var").value];

function addMapLayer(key, name) {
  if (S.mlayers.some(l => l.key === key)) { S.msel = "d:" + key; return; }
  const id = "d:" + key, pane = "ml-" + key.replace(/\W/g, "_");
  if (!S.map.getPane(pane)) S.map.createPane(pane);
  S.mlayers.unshift({ id, key, name, kind: "data", visible: true, removable: true, pane, style: styleFor(key),
    group: L.layerGroup().addTo(S.map), renderer: L.canvas({ pane }),
    values: () => { const m = curMap(); return m ? layerValues(m, key, +$("#m-time").value) : []; } });
  S.msel = id;
}

function initMaps() {
  document.querySelectorAll(".panel-style").forEach(d => { d.open = innerWidth > 1000; });   // su schermi piccoli: Style chiuso
  S.map = L.map("map", { worldCopyJump: true }).setView([42.2, 12.6], 6);
  S.mstyles = {};
  S.map.createPane("ml-base"); S.map.createPane("ml-stations");
  const base = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution: "© OpenStreetMap", pane: "ml-base" }).addTo(S.map);
  S.mlayers = [
    { id: "stations", name: "GPR error at stations", kind: "stations", visible: false, pane: "ml-stations", group: L.layerGroup().addTo(S.map) },
    { id: "base", name: "OpenStreetMap", kind: "base", visible: true, pane: "ml-base", group: base },
  ];
  opts($("#m-agg"), S.meta.aggs.map(a => [a, AGG_LABEL[a]]), "24h");
  const upd = async () => {
    opts($("#m-var"), varsFor($("#m-agg").value).map(v => [v, VAR_LABEL[v]]), $("#m-var").value || "t2m");
    await loadMap();
  };
  $("#m-agg").onchange = upd; $("#m-var").onchange = loadMap;
  $("#m-time").oninput = () => renderMap();
  opts($("#m-fmt"), EXPORT.FORMATS, "tif");
  $("#m-dl").onclick = () => mapExport($("#m-fmt").value);
  $("#m-add").onclick = () => { const o = $("#m-layer").selectedOptions[0]; if (o) { addMapLayer(o.value, o.text); renderMap(); } };
  S.map.on("click", e => mapPopup(e.latlng.wrap()));
  opts($("#m-var"), varsFor($("#m-agg").value).map(v => [v, VAR_LABEL[v]]), "t2m");
}

async function loadMap() {
  const key = mapKey();
  if (!(key in S.maps)) S.maps[key] = await fetchJSON(`maps/${key}.json`, null);
  const m = S.maps[key];
  if (!m) { S.mlayers.forEach(l => l.kind === "data" && l.group.clearLayers()); $("#legend").innerHTML = ""; $("#m-time-label").textContent = "map not available"; return; }
  let items;
  if (m.verified === false) {                      // regione senza verifica: solo i modelli
    items = [["mean", "Model mean"], ["spread", "Model spread (±1σ)"]];
  } else {
    items = [["best", "★ Best provider"], ["weighted", "⚖ Weighted mean"], ["gpr", "◆ GPR – estimate"], ["gpr_unc", "◆ GPR – uncertainty (±1σ)"]];
    if (m.layers.gpr_p) items.push(["gpr_p", `◆ GPR – probability ≥ ${S.meta.prcp_thresholds[$("#m-agg").value][0]} mm`]);
    items.push(["gpr_lo95", "◆ GPR – lower 95% bound"], ["gpr_hi95", "◆ GPR – upper 95% bound"]);
  }
  Object.keys(m.providers || {}).forEach(p => items.push(["p:" + p, pname(p)]));
  opts($("#m-layer"), items, $("#m-layer").value);
  // i layer di dati non disponibili per questa mappa vengono tolti; nomi e stili predefiniti aggiornati
  const keys = new Set(items.map(x => x[0]));
  S.mlayers = S.mlayers.filter(l => { if (l.kind !== "data" || keys.has(l.key)) return true; S.map.removeLayer(l.group); return false; });
  S.mlayers.forEach(l => { if (l.kind === "data") { l.name = items.find(x => x[0] === l.key)[1]; l.style = styleFor(l.key); } });
  if (!S.mlayers.some(l => l.kind === "data")) { const k = m.verified === false ? "mean" : "gpr"; addMapLayer(k, items.find(x => x[0] === k)[1]); }
  S.mlayers.find(l => l.id === "stations").hidden = m.verified === false;
  const t = $("#m-time");
  t.max = m.periods.length - 1;
  if (+t.value > +t.max) t.value = 0;
  renderMap();
}

function layerValues(m, layer, i) {
  return layer.startsWith("p:") ? m.providers[layer.slice(2)][i] : m.layers[layer]?.[i] || [];
}

function drawDataLayer(l, m, labels) {
  const C = MapStyle.classify(l.style, l.values()), h = m.res / 2, u = unitOf(l.key);
  l.group.clearLayers();
  l.values().forEach((x, k) => {
    const c = C.color(x); if (!c) return;
    const fill = MapStyle.css(c.slice(0, 3)), op = c[3] / 255;
    if (!m.res) {                                    // regione a punti (es. siti RadCalNet)
      const mk = L.circleMarker([m.lat[k], m.lon[k]], { pane: l.pane, radius: 11, color: "#15233b", weight: 1.5, fillColor: fill, fillOpacity: op });
      if (labels) mk.bindTooltip(`${m.names?.[k] || ""}: ${fmt(x, 1)} ${u}`, { permanent: true, direction: k % 2 ? "left" : "right",
        offset: [k % 2 ? -8 : 8, k % 2 ? 10 : -10], className: "site-label" });
      mk.addTo(l.group);
      return;
    }
    L.rectangle([[m.lat[k] - h, m.lon[k] - h], [m.lat[k] + h, m.lon[k] + h]],
      { renderer: l.renderer, stroke: false, fillColor: fill, fillOpacity: op, interactive: false }).addTo(l.group);
  });
  return MapStyle.legend(l.name, u, C);
}

function drawStations(l, m, i) {
  l.group.clearLayers();
  const v = $("#m-var").value;
  const errs = S.gpst.filter(r => r.var === v && r.agg === $("#m-agg").value && r.lead_day === m.lead_day[i] && inR(r));
  const mx = Math.max(...errs.map(r => r.mae), 0.1);
  errs.forEach(r => {
    const st = S.stations.find(s => String(s.station) === String(r.station));
    if (!st) return;
    L.circleMarker([st.lat, st.lon], { pane: l.pane, radius: 4 + 10 * r.mae / mx, color: "#15233b", weight: 1, fillColor: "#fff", fillOpacity: .7 })
      .bindTooltip(`${st.name}: MAE GPR (holdout) ${fmt(r.mae)} ${VAR_UNIT[v]}`).addTo(l.group);
  });
  return `<div class="lg"><b>GPR error at stations</b><div class="lg-row"><span class="dot"></span><span>Circle size = MAE (hold-out)</span><span>· max ${fmt(mx)} ${VAR_UNIT[v]}</span></div></div>`;
}

function renderMap(keepPanels = false) {
  const m = curMap();
  if (!m) return;
  const i = +$("#m-time").value, list = S.mlayers.filter(l => !l.hidden);
  const legends = [];
  let labels = true;                               // etichette dei siti solo per il layer di dati più in alto
  list.forEach((l, n) => {
    S.map.getPane(l.pane).style.zIndex = 450 - 5 * n;
    if (l.kind === "base") { l.visible ? l.group.addTo(S.map) : S.map.removeLayer(l.group); return; }
    if (!l.visible) { l.group.clearLayers(); return; }
    legends.push(l.kind === "stations" ? drawStations(l, m, i) : drawDataLayer(l, m, labels));
    if (l.kind === "data") labels = false;
  });
  $("#legend").innerHTML = legends.join("");
  const per = m.periods[i].replace("T", " ");
  const showBest = list.some(l => l.key === "best" && l.visible) && m.best_provider[i];
  const tzl = m.timezone === "locale" ? " local time" : m.timezone && m.timezone !== "Europe/Rome" ? ` ${m.timezone}` : "";
  $("#m-time-label").textContent = `${per}${tzl} (${leadLabel(m.lead_day[i])})${showBest ? ` · best: ${pname(m.best_provider[i])}` : ""}`;
  if (keepPanels !== true) mapPanels();
}

// download del layer di dati selezionato (o del più alto visibile) al periodo mostrato
function mapExport(kind) {
  const m = curMap(), i = +$("#m-time").value;
  const l = S.mlayers.find(x => x.id === S.msel && x.kind === "data") || S.mlayers.find(x => x.kind === "data" && x.visible);
  if (!m || !l) return;
  const vals = layerValues(m, l.key, i), per = m.periods[i].replace(/[T:]/g, "-");
  const name = `${S.region}_${$("#m-var").value}_${$("#m-agg").value}_${l.key.replace(":", "-")}_${per}`;
  if (!m.res) {                                    // regione a punti: solo CSV
    return EXPORT.save(EXPORT.csv([["lat", "lon", ...(m.names ? ["name"] : []), l.key], ...vals.map((x, k) => [m.lat[k], m.lon[k], ...(m.names ? [m.names[k]] : []), x])],
      [`${l.name} · ${m.periods[i]} · unit ${unitOf(l.key)}`]), name + ".csv");
  }
  const r = m.res, lon0 = Math.min(...m.lon) - r / 2, lat0 = Math.max(...m.lat) + r / 2;
  const W = Math.round((Math.max(...m.lon) - Math.min(...m.lon)) / r) + 1, H = Math.round((Math.max(...m.lat) - Math.min(...m.lat)) / r) + 1;
  const g = new Float32Array(W * H).fill(NaN);
  vals.forEach((x, k) => { if (x != null) g[Math.round((lat0 - r / 2 - m.lat[k]) / r) * W + Math.round((m.lon[k] - lon0 - r / 2) / r)] = x; });
  const G = { W, H, x0: lon0, y0: lat0, dx: r, dy: r, epsg: 4326 };
  EXPORT.raster(kind, g, G, `${l.name} | ${m.periods[i]} | ${unitOf(l.key)} | Prognostica`, name, MapStyle.classify(l.style, vals).color,
    (c, rr) => [lon0 + (c + 0.5) * r, lat0 - (rr + 0.5) * r]);
}

function mapPanels() {
  const list = S.mlayers.filter(l => !l.hidden);
  MapStyle.layersPanel($("#m-layers"), list, S.msel, {
    toggle: () => renderMap(), order: () => { S.mlayers = [...list, ...S.mlayers.filter(l => l.hidden)]; renderMap(); },
    select: l => { S.msel = l.id; mapPanels(); },
    remove: l => { S.map.removeLayer(l.group); S.mlayers = S.mlayers.filter(x => x !== l); renderMap(); },
  });
  MapStyle.stylePanel($("#m-style"), S.mlayers.find(l => l.id === S.msel && l.kind === "data"), () => renderMap(true));
}

function mapPopup(ll) {
  const m = S.maps[`${S.region}/${$("#m-var").value}_${$("#m-agg").value}`];
  let txt = "";
  if (m) {
    let bi = -1, bd = 1e9;
    m.lat.forEach((la, k) => { const d = (la - ll.lat) ** 2 + (m.lon[k] - ll.lng) ** 2; if (d < bd) { bd = d; bi = k; } });
    const i = +$("#m-time").value, u = VAR_UNIT[$("#m-var").value];
    if (bi >= 0 && bd < Math.max(m.res * m.res, m.res ? 0 : 1)) {
      const g = k => m.layers[k]?.[i]?.[bi];
      const nm = m.names?.[bi] ? `${m.names[bi]}<br>` : "";
      txt = m.verified === false
        ? `<b>${nm}${m.periods[i].replace("T", " ")}</b><br>Model mean: ${fmt(g("mean"), 1)} ± ${fmt(g("spread"), 1)} ${u}<br>`
          + Object.keys(m.providers || {}).map(p => `${pname(p)}: ${fmt(m.providers[p][i][bi], 1)} ${u}`).join("<br>") + "<br>"
        : `<b>${nm}${m.periods[i].replace("T", " ")}</b><br>Best: ${fmt(g("best"), 1)} ${u}<br>Weighted mean: ${fmt(g("weighted"), 1)} ${u}<br>
        GPR: ${fmt(g("gpr"), 1)} ± ${fmt(g("gpr_unc"), 1)} ${u}` + (m.layers.gpr_p ? `<br>P(≥ threshold): ${fmt(g("gpr_p"), 0)}%` : "") + "<br>";
    }
  }
  L.popup().setLatLng(ll).setContent(`${txt}<button class="link" id="go-point">Detailed forecast here →</button>`).openOn(S.map);
  setTimeout(() => { const b = document.getElementById("go-point"); if (b) b.onclick = () => { setPoint(ll.lat, ll.lng); showTab("point"); runPoint(); }; }, 0);
}

// ================================================================== PUNTO
function initPoint() {
  opts($("#p-agg"), S.meta.aggs.map(a => [a, AGG_LABEL[a]]), "1h");
  const upd = () => { opts($("#p-var"), varsFor($("#p-agg").value).map(v => [v, VAR_LABEL[v]]), $("#p-var").value || "t2m"); renderPoint(); };
  $("#p-agg").onchange = upd; $("#p-var").onchange = renderPoint;
  opts($("#p-past"), [[0, "none"], [3, "3 days"], [7, "7 days"], [14, "14 days"], [30, "30 days"]], 7);
  S.pastDays = 7;
  $("#p-past").onchange = () => { S.pastDays = +$("#p-past").value; if (S.point) runPoint(); };
  // ricerca luoghi: suggerimenti mentre si scrive (Photon/OSM, vicino alla mappa), coordinate "lat, lon", Nominatim di riserva
  const box = $("#p-suggest");
  let items = [], sel = -1, timer = null, seq = 0;
  const close = () => { box.classList.remove("open"); box.innerHTML = ""; items = []; sel = -1; };
  const pick = x => { track("place-search"); $("#p-addr").value = x.title; close(); setPoint(x.lat, x.lon, x.label); runPoint(); };
  const show = list => {
    items = list; sel = list.length ? 0 : -1;
    box.innerHTML = list.length ? list.map((x, k) => `<div data-k="${k}" class="${k === 0 ? "sel" : ""}">${x.title}<small>${x.sub}</small></div>`).join("")
      : '<div class="hint">No place found: try adding the town or the country.</div>';
    box.classList.add("open");
    box.querySelectorAll("div[data-k]").forEach(d => (d.onmousedown = e => { e.preventDefault(); pick(items[+d.dataset.k]); }));
  };
  const parseLL = q => { const m = q.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
    if (!m) return null; const a = +m[1].replace(",", "."), b = +m[2].replace(",", ".");
    return Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lon: b } : null; };
  const photon = async q => {
    const c = S.pending || { lat: 42, lon: 12.5 };      // risultati vicini all'ultimo luogo scelto
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lat=${c.lat.toFixed(3)}&lon=${c.lon.toFixed(3)}`);
    const js = await r.json();
    return js.features.map(f => { const p = f.properties, [lon, lat] = f.geometry.coordinates;
      const street = [p.street, p.housenumber].filter(Boolean).join(" ");
      const title = p.name && p.name !== p.street ? (street ? `${p.name}, ${street}` : p.name) : street || p.city || p.county || "";
      const sub = [p.postcode, p.city || p.town || p.village, p.county, p.state, p.country].filter((v, k, a) => v && a.indexOf(v) === k && v !== title).join(", ");
      return { lat, lon, title, sub, label: [title, sub].filter(Boolean).join(", ") }; });
  };
  const nominatim = async q => {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=en&q=${encodeURIComponent(q)}`);
    return (await r.json()).map(x => ({ lat: +x.lat, lon: +x.lon, title: x.display_name.split(",")[0], sub: x.display_name.split(",").slice(1).join(",").trim(), label: x.display_name }));
  };
  const suggest = async (q, final) => {
    const ll = parseLL(q);
    if (ll) { if (final) { close(); setPoint(ll.lat, ll.lon); runPoint(); } else show([{ ...ll, title: `${ll.lat}, ${ll.lon}`, sub: "coordinates (lat, lon)", label: null }]); return; }
    if (q.length < 3) return close();
    const my = ++seq;
    let res = [];
    try { res = await photon(q); } catch { /* riserva */ }
    if (!res.length && final) { try { res = await nominatim(q); } catch { /* niente */ } }
    if (my !== seq) return;                       // arrivata una ricerca piu' recente
    if (final && res.length === 1) return pick(res[0]);
    show(res);
  };
  $("#p-addr").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => suggest($("#p-addr").value.trim(), false), 280); });
  $("#p-addr").addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return; e.preventDefault();
      sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      box.querySelectorAll("div[data-k]").forEach((d, k) => d.classList.toggle("sel", k === sel));
    } else if (e.key === "Enter") { e.preventDefault(); if (sel >= 0 && items[sel]) pick(items[sel]); else suggest($("#p-addr").value.trim(), true); }
    else if (e.key === "Escape") close();
  });
  $("#p-addr").addEventListener("blur", () => setTimeout(close, 150));
  $("#p-search").onclick = () => (sel >= 0 && items[sel] ? pick(items[sel]) : suggest($("#p-addr").value.trim(), true));
  $("#p-geo").onclick = () => navigator.geolocation?.getCurrentPosition(
    g => { setPoint(g.coords.latitude, g.coords.longitude, "My location"); runPoint(); },
    e => { $("#p-results").innerHTML = `<span class="error">Location not available: ${e.message}</span>`; }, { enableHighAccuracy: true, timeout: 10000 });
  // siti RadCalNet
  const sites = S.meta.regions.filter(r => r.type === "points").flatMap(r => (r.sites || []).map(x => ({ ...x, net: r.name })));
  opts($("#p-site"), [["", "— choose —"], ...sites.map(x => [x.id, `${x.net} · ${x.name}`])], "");
  $("#p-site").closest("label").style.display = sites.length ? "" : "none";
  $("#p-site").onchange = () => {
    const x = sites.find(z => z.id === $("#p-site").value);
    if (x) { setPoint(x.lat, x.lon, `${x.name} (${x.id})`); runPoint(); }
  };
  upd();
  // modello di trasferimento radiativo: con 6S la parte termica (LWIR) è ingrigita
  S.rtm = "6s"; document.body.classList.add("rtm-6s");
  ATM.available("libradtran").then(ok => {
    const o = $('#a-rtm option[value="libradtran"]');
    o.disabled = !ok; if (ok) o.textContent = "libRadtran · VNIR–SWIR and LWIR";
  });
  $("#a-rtm").onchange = () => {
    S.rtm = $("#a-rtm").value; document.body.classList.toggle("rtm-6s", S.rtm === "6s");
    HR.rtm(); if (S.point) ATM.render(S.point);
  };
  HR.init();
  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  if (q.has("lat") && q.has("lon")) { setPoint(+q.get("lat"), +q.get("lon")); runPoint(); }
  else { setPoint(41.9028, 12.4964, "Rome"); runPoint(); }
}
function setPoint(lat, lon, label = null) {
  S.pointLabel = label;
  S.pending = { lat, lon };
}

// componenti di data/ora locali (fuso tz) per un istante UTC
const DTFS = {};
const DTF_OPTS = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" };
function localParts(ms, tz = "Europe/Rome") {
  let f = DTFS[tz];
  if (!f) {
    try { f = new Intl.DateTimeFormat("en-CA", { ...DTF_OPTS, timeZone: tz }); }
    catch { f = new Intl.DateTimeFormat("en-CA", { ...DTF_OPTS, timeZone: "UTC" }); }
    DTFS[tz] = f;
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour };
}
// punto dentro l'Italia? (ray casting sul poligono) -> regione con i modelli ad alta risoluzione
function inPoly(lat, lon, gj) {
  if (!gj) return false;
  const g = gj.features[0].geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  const inRing = ring => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; };
  return polys.some(p => inRing(p[0]) && !p.slice(1).some(inRing));
}
function distKm(a, b, c, d) {
  const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}
// regione del punto: Italia (poligono) -> regione a punti se vicino a un sito -> Mondo se attivo -> nessuna
function pointRegion(lat, lon) {
  if (S.meta.regions.some(r => r.id === "italia") && inPoly(lat, lon, S.italy)) return "italia";
  for (const r of S.meta.regions.filter(r => r.type === "points"))
    if (r.sites.some(s => distKm(lat, lon, s.lat, s.lon) <= (r.radius_km || 150))) return r.id;
  return S.meta.regions.find(r => r.id === "mondo")?.id || null;
}
const dayDiff = (a, b) => Math.round((Date.parse(a + "T00:00Z") - Date.parse(b + "T00:00Z")) / 86400000);

// stessa logica di meteoita/verify.py::aggregate (ora di fine -> blocco locale)
function aggregateSeries(times, t2m, prcp, agg, tz) {
  const blocks = new Map();
  times.forEach((ms, k) => {
    const lp = localParts(ms - 3600000, tz);
    let key;
    if (agg === "1h") key = `${lp.date}T${String(lp.hour).padStart(2, "0")}:00`;
    else if (agg === "6h") key = `${lp.date}T${String(Math.floor(lp.hour / 6) * 6).padStart(2, "0")}:00`;
    else key = `${lp.date}T00:00`;
    if (!blocks.has(key)) blocks.set(key, { t: [], p: [] });
    const b = blocks.get(key);
    if (t2m[k] != null) b.t.push(t2m[k]);
    if (prcp[k] != null) b.p.push(prcp[k]);
  });
  const minT = { "1h": 1, "6h": 5, "24h": 20 }[agg], minP = { "1h": 1, "6h": 6, "24h": 23 }[agg];
  const out = {};
  for (const [key, b] of blocks) {
    const okT = b.t.length >= minT;
    out[key] = {
      t2m: okT ? b.t.reduce((a, c) => a + c, 0) / b.t.length : null,
      tmax: okT ? Math.max(...b.t) : null, tmin: okT ? Math.min(...b.t) : null,
      prcp: b.p.length >= minP ? b.p.reduce((a, c) => a + c, 0) : null,
    };
  }
  return out;
}

async function runPoint() {
  const { lat, lon } = S.pending || {};
  if (!isFinite(lat) || !isFinite(lon)) return;
  const curTab = document.querySelector("#tabs button.active")?.dataset.tab || "point";
  history.replaceState(null, "", `#${["point", "atm", "hr"].includes(curTab) ? curTab : "point"}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
  track("point-forecast");
  const rid = pointRegion(lat, lon);
  // fuori dalle regioni verificate: solo i modelli globali grezzi, senza combinazioni
  const globalIds = S.meta.providers.filter(p => p.gridded && p.coverage === "global").map(p => p.id);
  const rprov = rid ? (regionOf(rid).providers || []) : globalIds;
  const grid = S.meta.providers.filter(p => p.gridded && rprov.includes(p.id));
  $("#p-summary").innerHTML = `<p class="hint">Downloading model forecasts…</p>`;
  const url = `${S.meta.openmeteo_url}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation`
    + `&models=${grid.map(p => p.model).join(",")}&forecast_days=8&past_days=${S.pastDays || 0}&timezone=auto&timeformat=unixtime`;
  let js;
  try { const r = await fetch(url); js = await r.json(); if (js.error) throw new Error(js.reason); }
  catch (e) { $("#p-summary").innerHTML = `<p class="error">Open-Meteo download error: ${e.message}</p>`; return; }
  const h = js.hourly, times = h.time.map(t => (typeof t === "number" ? t * 1000 : Date.parse(t + "Z")));
  const now = Date.now();
  const raw = {};
  for (const p of grid) {
    const kt = h[`temperature_2m_${p.model}`] ? `temperature_2m_${p.model}` : grid.length === 1 ? "temperature_2m" : null;
    const kp = h[`precipitation_${p.model}`] ? `precipitation_${p.model}` : grid.length === 1 ? "precipitation" : null;
    if (!kt) continue;
    raw[p.id] = { t: h[kt], p: kp ? h[kp] : h[kt].map(() => null) };
  }
  const keep = times.map(t => t > now - (S.pastDays || 0) * 86400000);    // futuro + giorni passati richiesti
  S.point = { lat, lon, elev: js.elevation, tz: js.timezone || "UTC", region: rid, label: S.pointLabel,
    times: times.filter((_, k) => keep[k]), raw, agg: {}, past: S.pastDays || 0, now,
    station: (S.pastDays || 0) > 0 ? await nearestStation(lat, lon) : null };
  for (const id in raw) { raw[id].t = raw[id].t.filter((_, k) => keep[k]); raw[id].p = raw[id].p.filter((_, k) => keep[k]); }
  await renderPoint();
  HR.point(S.point);
  await ATM.render(S.point);
}

// osservazioni recenti della stazione piu' vicina (entro 25 km), da data/obs_recent.json
async function nearestStation(lat, lon) {
  if (S.obs === undefined) S.obs = await fetchJSON("obs_recent.json", null);
  if (!S.obs) return null;
  let best = null;
  for (const st of S.obs.stations) {
    const d = distKm(lat, lon, st.lat, st.lon);
    if (d <= 25 && (!best || d < best.dist)) best = { ...st, dist: d };
  }
  return best;
}
function obsAt(P, agg, v, key) {
  const st = P.station;
  if (!st) return null;
  P.obsAgg ||= {};
  if (!P.obsAgg[agg]) {
    const n = S.obs.t2m[st.id].length, times = Array.from({ length: n }, (_, i) => S.obs.start_ms + i * 3600000);
    P.obsAgg[agg] = aggregateSeries(times, S.obs.t2m[st.id], S.obs.prcp[st.id], agg, P.tz);
  }
  return P.obsAgg[agg][key]?.[v] ?? null;
}

async function computePoint(agg, v) {
  const P = S.point;
  const nl = localParts(Date.now(), P.tz), today = nl.date;   // periodo in corso: quelli prima sono "passati"
  const nowKey = agg === "24h" ? `${nl.date}T00:00` : `${nl.date}T${String(agg === "6h" ? Math.floor(nl.hour / 6) * 6 : nl.hour).padStart(2, "0")}:00`;
  const per = {};
  for (const id in P.raw) {
    const a = aggregateSeries(P.times, P.raw[id].t, P.raw[id].p, agg, P.tz);
    for (const k in a) (per[k] ||= {})[id] = a[k][v];
  }
  const rows = [];
  for (const k of Object.keys(per).sort()) {
    const lead = dayDiff(k.slice(0, 10), today);
    if (lead < -P.past || lead > Math.max(...S.meta.leads)) continue;
    const ml = Math.max(lead, 0);                  // giorni passati: si usano pesi e GPR a 0 giorni (corto raggio)
    const vals = per[k];
    if (!Object.values(vals).some(x => x != null && isFinite(x))) continue;   // periodo incompleto
    const ver = !!P.region && regionOf(P.region).verify !== false;
    const sel = ver ? S.weights.filter(w => w.agg === agg && w.var === v && w.lead_day === ml && (!w.region || w.region === P.region)) : [];
    // migliore = primo della classifica disponibile in questo punto
    const ranked = [...sel].sort((a, b) => a.score - b.score).map(w => w.provider);
    const bestId = ranked.find(p => vals[p] != null && isFinite(vals[p]));
    let ws = 0, wf = 0;
    sel.forEach(w => { const x = vals[w.provider]; if (x != null && isFinite(x)) { ws += w.weight; wf += w.weight * x; } });
    if (!ver) {                                    // nessuna verifica: media semplice dei modelli
      Object.values(vals).forEach(x => { if (x != null && isFinite(x)) { ws += 1; wf += x; } });
      ws = ws ? Math.max(ws, 1) : 0;
    }
    const m = ver ? await GP.load(`${DATA}gp/${P.region}/${v}_${agg}_d${ml}.json`) : null;
    const g = m ? GP.predict(m, { lat: P.lat, lon: P.lon, elev: P.elev, ...vals }) : null;
    const thr = S.meta.prcp_thresholds?.[agg]?.[0];
    rows.push({ period: k, lead, past: k < nowKey, obs: obsAt(P, agg, v, k), vals, best: bestId ? vals[bestId] : null, bestId,
      weighted: ws > 0.5 ? wf / ws : null, gpr: g,
      prob: g && v === "prcp" ? 100 * GP.probExceed(g, thr, m.transform) : null });
  }
  return rows;
}

async function renderPoint() {
  if (!S.point) return;
  const agg = $("#p-agg").value, v = $("#p-var").value, u = VAR_UNIT[v];
  const rows = await computePoint(agg, v);
  const P = S.point;
  const pver = !!P.region && regionOf(P.region).verify !== false;
  const wLabel = pver ? COMBO.WEIGHTED : "Model mean";
  const fut = rows.filter(r => !r.past);
  const first = fut.find(r => r.gpr) || fut[0];
  $("#p-summary").innerHTML = `<dl class="kv">
      <dt>Point</dt><dd>${P.label ? P.label + "<br>" : ""}${P.lat.toFixed(4)}, ${P.lon.toFixed(4)} · elevation ${fmt(P.elev, 0)} m</dd>
      <dt>Region / time zone</dt><dd>${P.region ? regionOf(P.region).name : "outside the verified regions"} · ${P.tz} (local times)</dd>
      <dt>Next period</dt><dd>${first ? first.period.replace("T", " ") : "–"}</dd>
      <dt>GPR estimate</dt><dd><span class="big">${first?.gpr ? fmt(first.gpr.est, 1) : "–"}</span> ${u}
        ${first?.gpr ? ` (68%: ${fmt(first.gpr.lo68, 1)} – ${fmt(first.gpr.hi68, 1)})` : ""}</dd>
      <dt>Best</dt><dd>${fmt(first?.best, 1)} ${u} ${first?.bestId ? "· " + pname(first.bestId) : ""}</dd>
      <dt>${pver ? "Weighted mean" : "Model mean"}</dt><dd>${fmt(first?.weighted, 1)} ${u}</dd>
      ${v === "prcp" ? `<dt>Probability ≥ ${S.meta.prcp_thresholds[agg][0]} mm</dt><dd>${fmt(first?.prob, 0)} %</dd>` : ""}
    </dl><p class="hint">${!P.region ? "Point far from Italy and the calibration sites: only the global models and their mean, no verified combinations."
      : regionOf(P.region).verify === false ? `Near a ${regionOf(P.region).name} site: model data only (simple mean), no verification or GPR.`
      : "Model forecasts downloaded now from Open-Meteo; weights and GPR model from the latest verification."}
      ${P.past ? ` Past days: model short-range values (Open-Meteo) with the 0-day GPR${P.station ? `; green = observations at ${P.station.name}, ${fmt(P.station.dist, 0)} km away` : "; no observing station within 25 km"}.` : ""}</p>`;
  const labels = rows.map(r => r.period.replace("T", " ").replace(" 00:00", agg === "24h" ? "" : " 00:00"));
  const provIds = Object.keys(P.raw);
  const ds = provIds.map(id => ({ label: pname(id), data: rows.map(r => r.vals[id] ?? null), borderColor: "#c3c8d0",
    borderWidth: 1, pointRadius: 0, spanGaps: true, type: "line" }));
  ds.push({ label: "GPR 95%", csvLabel: "GPR 95% upper", data: rows.map(r => r.gpr?.hi95 ?? null), borderWidth: 0, pointRadius: 0, backgroundColor: "rgba(17,24,39,.12)", fill: "+1" },
    { label: "_lo", csvLabel: "GPR 95% lower", data: rows.map(r => r.gpr?.lo95 ?? null), borderWidth: 0, pointRadius: 0 },
    { label: COMBO.GPR, data: rows.map(r => r.gpr?.est ?? null), borderColor: "#111827", borderWidth: 2.5, pointRadius: 0 },
    { label: COMBO.BEST, data: rows.map(r => r.best), borderColor: "#1f6feb", borderWidth: 2, pointRadius: 0, borderDash: [2, 2] },
    { label: wLabel, data: rows.map(r => r.weighted), borderColor: "#e8590c", borderWidth: 2, pointRadius: 0, borderDash: [6, 3] });
  if (P.station) ds.push({ label: `Observed – ${P.station.name} (${fmt(P.station.dist, 0)} km)`, data: rows.map(r => r.obs),
    borderColor: "#16a34a", backgroundColor: "#16a34a", showLine: false, pointRadius: agg === "1h" ? 2 : 4, pointStyle: "rectRot" });
  const nowIdx = rows.findIndex(r => !r.past);
  const nowLine = { id: "nowline", afterDatasetsDraw(c) {
    if (nowIdx <= 0) return;
    const x = c.scales.x.getPixelForValue(nowIdx) - (c.scales.x.getPixelForValue(1) - c.scales.x.getPixelForValue(0)) / 2;
    const { top, bottom } = c.chartArea, g = c.ctx;
    g.save(); g.strokeStyle = "#6b7280"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke();
    g.fillStyle = "#6b7280"; g.font = "11px system-ui"; g.fillText("past ◂ ▸ forecast", x + 4, top + 12); g.restore(); } };
  // grafico largo (larghezza per periodo) con barra di scorrimento, asse y fisso e legenda HTML sopra
  const box = $("#p-scroll"), width = Math.max(box.clientWidth, rows.length * { "1h": 12, "6h": 36, "24h": 70 }[agg]);
  $("#p-inner").style.width = width + "px";
  const yAxis = { id: "yaxis", afterRender(c) {          // copia l'asse y su una tela fissa a sinistra
    const cv = $("#p-yaxis"), r = devicePixelRatio, w = c.chartArea.left;
    if (!w || !c.canvas.width || !c.canvas.height) return;          // scheda nascosta: niente da copiare
    cv.width = w * r; cv.height = c.height * r; cv.style.width = w + "px"; cv.style.height = c.height + "px";
    cv.getContext("2d").drawImage(c.canvas, 0, 0, w * r, c.height * r, 0, 0, w * r, c.height * r); } };
  const ch = drawChart("p-chart", { type: "line", data: { labels, datasets: ds }, plugins: [nowLine, yAxis],
    options: { animation: false, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      csvName: `forecast_${v}_${agg}_${P.lat.toFixed(3)}_${P.lon.toFixed(3)}`, plugins: { legend: { display: false } },
      scales: { y: { title: { display: true, text: `${VAR_LABEL[v]} [${u}]` }, ...(v === "prcp" ? { min: 0 } : {}) },
        x: { ticks: { maxTicksLimit: Math.round(width / 90), maxRotation: 0 } } } } });
  htmlLegend(ch, $("#p-legend"));
  // si parte con "adesso" a un quarto della larghezza visibile
  if (nowIdx > 0) box.scrollLeft = ch.scales.x.getPixelForValue(nowIdx) - box.clientWidth / 4;
  let html = `<thead><tr><th>Period</th><th>Lead</th>${P.station ? "<th>Observed</th>" : ""}<th>◆ GPR</th><th>±1σ</th><th>95%</th>${v === "prcp" ? "<th>P(≥ threshold)</th>" : ""}
    <th>★ Best</th><th>${pver ? "⚖ Weighted" : "Model mean"}</th>${provIds.map(id => `<th>${pname(id)}</th>`).join("")}</tr></thead><tbody>`;
  rows.forEach(r => {
    html += `<tr class="${r.past ? "pastrow" : ""}"><td>${r.period.replace("T", " ")}</td><td>${r.past ? "past" : leadShort(r.lead)}</td>
      ${P.station ? `<td>${fmt(r.obs, 1)}</td>` : ""}<td><b>${fmt(r.gpr?.est, 1)}</b></td>
      <td>${fmt(r.gpr?.unc, 1)}</td><td>${r.gpr ? fmt(r.gpr.lo95, 1) + " – " + fmt(r.gpr.hi95, 1) : "–"}</td>
      ${v === "prcp" ? `<td>${fmt(r.prob, 0)}%</td>` : ""}<td>${fmt(r.best, 1)}</td><td>${fmt(r.weighted, 1)}</td>
      ${provIds.map(id => `<td>${fmt(r.vals[id], 1)}</td>`).join("")}</tr>`;
  });
  $("#p-table").innerHTML = html + "</tbody>";
}

// ================================================================== VALIDAZIONE
// classe di colore della copertura di un intervallo rispetto al valore nominale
function coverageClass(x, nom) {
  if (x == null) return "";
  const d = Math.abs(x - nom);
  if (d < 0.07) return "ok";
  return d < 0.15 ? "meh" : "bad";
}
function renderValid() {
  if (!isVerified()) { $("#v-table").innerHTML = `<tr><td>${NOVER}</td></tr>`; $("#b-table").innerHTML = ""; $("#b-hint").textContent = ""; return; }
  const v = $("#r-var").value, agg = $("#r-agg").value, u = VAR_UNIT[v];
  renderBacktest(v, agg);
  const rows = S.gpval.filter(r => r.var === v && r.agg === agg && inR(r)).sort((a, b) => a.lead_day - b.lead_day);
  const hs = (p, l) => S.hold.find(r => r.provider === p && r.var === v && r.agg === agg && r.lead_day === l && inR(r));
  const bestProv = l => S.hold.filter(r => r.var === v && r.agg === agg && r.lead_day === l && !(r.provider in COMBO) && inR(r))
    .sort((a, b) => a.rmse - b.rmse)[0];
  let html = `<thead><tr><th>Lead</th><th>n</th><th>MAE GPR</th><th>RMSE GPR</th><th>RMSE best provider (ex post)</th><th>RMSE ★ Best</th>
    <th>RMSE ⚖ Weighted</th><th>R² ◆ GPR</th><th>R² ★ Best</th><th>R² ⚖ Weighted</th><th>Bias GPR</th><th>Coverage 68%</th><th>Coverage 95%</th><th>Mean uncertainty</th></tr></thead><tbody>`;
  if (!rows.length) html += `<tr><td colspan="14">No validation available yet for this case (at least 14 days of record are needed).</td></tr>`;
  rows.forEach(r => {
    const bp = bestProv(r.lead_day);
    html += `<tr><td>${leadLabel(r.lead_day)}</td><td>${r.n}</td><td>${fmt(r.mae)}</td><td><b>${fmt(r.rmse)}</b></td>
      <td>${bp ? fmt(bp.rmse) + ` <span class="tag">${pname(bp.provider)}</span>` : "–"}</td>
      <td>${fmt(hs("BEST", r.lead_day)?.rmse)}</td><td>${fmt(hs("WEIGHTED", r.lead_day)?.rmse)}</td>
      <td><b>${fmt(r.r2, 3)}</b></td><td>${fmt(hs("BEST", r.lead_day)?.r2, 3)}</td><td>${fmt(hs("WEIGHTED", r.lead_day)?.r2, 3)}</td><td>${fmt(r.bias)}</td>
      <td class="${coverageClass(r.cov68, .68)}">${fmt(100 * r.cov68, 0)}%</td><td class="${coverageClass(r.cov95, .95)}">${fmt(100 * r.cov95, 0)}%</td>
      <td>${fmt(r.mean_unc)} ${u}</td></tr>`;
  });
  $("#v-table").innerHTML = html + "</tbody>";
}

function renderBacktest(v, agg) {
  const rows = (S.bt || []).filter(r => r.var === v && r.agg === agg && inR(r)).sort((a, b) => a.lead_day - b.lead_day);
  if (!rows.length) {
    $("#b-hint").textContent = "Not available yet: the back-test needs about two months of record. The record is rebuilt automatically "
      + "a few weeks at a time every day, and the back-test runs once a week.";
    $("#b-table").innerHTML = ""; return;
  }
  $("#b-hint").textContent = `Test blocks from ${rows[0].first_test} to ${rows[0].last_test} (${rows[0].folds} blocks of 14 days, each trained only on the previous 45 days). `
    + "Skill = RMSE reduction of the GPR with respect to the Best provider chosen in advance (positive = GPR better).";
  const sk = x => (x == null ? "" : x > 2 ? "ok" : x > -2 ? "meh" : "bad");
  let html = `<thead><tr><th>Lead</th><th>Blocks</th><th>n</th><th>RMSE ◆ GPR</th><th>RMSE ★ Best (ex ante)</th><th>Skill vs Best</th>
    <th>GPR better than Best</th><th>RMSE ⚖ Weighted</th><th>RMSE best ex post</th><th>R² ◆ GPR</th><th>R² ★ Best</th><th>R² ⚖ Weighted</th>
    <th>Coverage 68%</th><th>Coverage 95%</th></tr></thead><tbody>`;
  rows.forEach(r => {
    html += `<tr><td>${leadLabel(r.lead_day)}</td><td>${r.folds}</td><td>${r.n}</td><td><b>${fmt(r.rmse_gpr)}</b></td>
      <td>${fmt(r.rmse_best_exante)}</td><td class="${sk(r.skill_vs_best_pct)}">${fmt(r.skill_vs_best_pct, 1)}%</td>
      <td>${fmt(100 * r.share_gpr_beats_best, 0)}% of blocks</td><td>${fmt(r.rmse_weighted)}</td><td>${fmt(r.rmse_best_expost)}</td>
      <td><b>${fmt(r.r2_gpr, 3)}</b></td><td>${fmt(r.r2_best_exante, 3)}</td><td>${fmt(r.r2_weighted, 3)}</td>
      <td class="${coverageClass(r.cov68, .68)}">${fmt(100 * r.cov68, 0)}%</td><td class="${coverageClass(r.cov95, .95)}">${fmt(100 * r.cov95, 0)}%</td></tr>`;
  });
  $("#b-table").innerHTML = html + "</tbody>";
}

// ================================================================== DATI
function initData() {
  const d = S.meta.data_url || "../data/csv";
  const raw = S.meta.raw_url;
  const link = f => (raw ? `<a href="${raw}/${f}">${f}</a>` : `<code>${f}</code>`);
  if (typeof I18N !== "undefined" && I18N.lang === "it") { $("#data-text").innerHTML = dataTextIT(link, d); return; }
  $("#data-text").innerHTML = `
  <h3>The name</h3>
  <p><b>Prognostica</b> is the title of the Latin translation in which Cicero rendered the part of Aratus' <i>Phaenomena</i> devoted to the signs
  that foretell the weather: the first “weather-forecasting handbook” of Latin literature. It belongs to a family of projects with
  <b>Columella</b> (agriculture, after the <i>De re rustica</i>) and <b>Torricelli</b> (atmosphere and atmospheric correction, after the inventor of the barometer).</p>
  <h3>Download the data</h3>
  <p>All results are stored in the GitHub repository, folder <a href="${d}">data/csv</a>, as CSV files (comma separator, dot decimal)
  plus an Excel summary:</p>
  <ul>
    <li>${link("summary.xlsx")} – all main tables in a single Excel file</li>
    <li>${link("rankings.csv")} – scores by provider, variable, aggregation, lead time and time window</li>
    <li>${link("rankings_holdout.csv")} – last days, including Best, Weighted mean and GPR</li>
    <li>${link("best_and_weights.csv")} – best provider and weights in use</li>
    <li>${link("gpr_validation.csv")} – GPR errors and calibration on the latest held-out days</li>
    <li>${link("gpr_backtest.csv")} / ${link("gpr_backtest_summary.csv")} – historical back-test of the GPR (every fold / summary)</li>
    <li>${link("monthly_trend.csv")} – monthly scores</li>
    <li><code>daily_pairs/YYYY-MM.csv</code> – for each day, station, variable and lead time: observation and forecast of every provider</li>
    <li>${link("event_scores.csv")} – significant-event verification (hits, misses, false alarms, error on event days)</li>
    <li>${link("event_list.csv")} – every observed event with the forecast of each provider</li>
    <li><code>radcalnet/YYYY-MM.csv</code>, <code>hypernets/YYYY-MM.csv</code> – hourly forecasts of every model at the RadCalNet and HYPERNETS sites, for every lead time (0–7 days)</li>
    <li>${link("stations.csv")} – verification stations</li>
  </ul>
  <h3>How it works</h3>
  <p><b>Regions.</b> “Italy” uses all models covering Italy (including ICON-2I, ICON-EU, ARPEGE) on a dense grid.
  “RadCalNet” (Railroad Valley, Gobabeb, La Crau, Baotou) and “HYPERNETS” (LANDHYPERNET and WATERHYPERNET sites, e.g. Gobabeb, Demmin,
  Järvselja, Lonzée, Wytham Woods, Acqua Alta) are calibration/validation sites for satellite reflectance: here the site only shows the global models
  (ECMWF, ICON, GFS, UKMO, GEM), their mean and spread, without verification; the values are archived every day
  (<code>data/csv/radcalnet</code>) for comparison with the site measurements. When you query a point the region is chosen automatically;
  days and 6-hour blocks are in the point's local time.</p>
  <p><b>Providers.</b> Numerical models (ItaliaMeteo ICON-2I, ECMWF, ICON, GFS, ARPEGE, UKMO, …) come from Open-Meteo,
  which archives, for every hour, the forecast issued 0, 1, …, 7 days earlier, so the record can be rebuilt backwards. Station-only services
  (MET Norway and, if API keys are configured, OpenWeatherMap, WeatherAPI, Tomorrow.io, Visual Crossing) are archived every day.</p>
  <p><b>Observations.</b> Synoptic stations (Meteostat). Instantaneous temperature, hourly precipitation; 6-hour blocks and days in each station's local time.
  A block is verified only if complete.</p>
  <p><b>Lead time.</b> “Today” = forecast issued a few hours earlier; “+1 d” = issued about 24 hours earlier; … up to one week.</p>
  <p><b>Events.</b> Besides average errors, significant observed events are verified (heavy rain, heat, frost; thresholds in
  <code>config.yaml</code>): for each provider, how many were forecast, missed, and how many false alarms were issued.</p>
  <p><b>Best</b> = provider with the lowest error over the last ${S.meta.window_days || 90} days, for that variable, aggregation and lead time.
  <b>Weighted mean</b> = mean of the providers with weights proportional to 1/MSE. <b>GPR</b> = Gaussian-process regression using
  location, elevation and the forecasts of all models to estimate the value and its uncertainty. It is checked on days excluded from training
  and, every week, with a historical back-test over the whole record (“GPR reliability” tab).</p>
  <p><b>Place search</b> suggests places while you type (<a href="https://photon.komoot.io/">Photon</a>, OpenStreetMap data, ranked by
  closeness to the map), accepts coordinates (“41.90, 12.50”) and your device location, and falls back to
  <a href="https://nominatim.openstreetmap.org/">Nominatim</a>.</p>
  <h3>Atmosphere and atmospheric correction</h3>
  <p>For the chosen point: total column water vapour, surface pressure, temperature, humidity, cloud cover, irradiance (ECMWF IFS 0.25°),
  aerosol optical depth at 550 nm and dust (CAMS), and the profile on pressure levels 1000–200 hPa (temperature, humidity, geopotential height, wind).
  Air density is ρ = p / (R<sub>d</sub> T<sub>v</sub>) with the virtual temperature T<sub>v</sub>. The radiative-transfer parameters of the
  Sentinel-2 bands (downward/upward scattering transmittance, gaseous transmittance, path radiance, direct and diffuse irradiance, spherical albedo)
  are interpolated from look-up tables (water vapour × AOD × solar zenith × altitude; nadir view, continental aerosol, ozone 0.30 cm-atm) computed with
  6S (solar spectrum only) or libRadtran (solar and thermal spectrum), chosen in the Atmosphere tab. In the thermal infrared libRadtran gives transmittance
  and upwelling and downwelling radiance with standard atmospheres chosen by latitude and season.</p>
  <h3>Atmosphere RK: high-resolution maps validated on measurements</h3>
  <p>For a past date and hour, water vapour (ECMWF IFS, about 25 km) and AOD (CAMS, about 45 km) are corrected with a gradient boosting model trained on
  hourly AERONET and GNSS measurements, using covariates that exist for every pixel: the model values, terrain within 500 m and 2 km, position and time.
  It is applied every 30 m (90 m for large areas). The validation leaves out each site and every site in its 0.5° cell: errors are against measurements, not
  against the model. The grid can be the square around the place or the grid of an imported GeoTIFF/ENVI image. Radiative transfer quantities are
  converted to the band of a sensor with its spectral response (library, image metadata or custom) and exported in the units of the product.</p>
  <p><b>Limitations.</b> Best, Weighted mean and GPR only use models available everywhere (Open-Meteo), so they can be computed
  at any point. Stations are mostly in lowlands or on the coast: in the mountains estimates and uncertainties are less verified.
  The AOD correction is small: aerosol varies too quickly for the covariates to explain much more than CAMS.</p>
  <h3>Licence</h3><p>© 2026 Francesco Rossi. Code: all rights reserved. Data: CC BY-NC 4.0 (attribution, non-commercial use).
  Third-party data remain under their own licences.</p>`;
}
// testo della scheda "Dati e metodo" in italiano
function dataTextIT(link, d) {
  return `
  <h3>Il nome</h3>
  <p><b>Prognostica</b> è il titolo della traduzione latina in cui Cicerone rese la parte dei <i>Fenomeni</i> di Arato dedicata ai segni che
  annunciano il tempo: il primo “manuale di previsione meteorologica” della letteratura latina. Fa parte di una famiglia di progetti con
  <b>Columella</b> (agricoltura, dal <i>De re rustica</i>) e <b>Torricelli</b> (atmosfera e correzione atmosferica, dall'inventore del barometro).</p>
  <h3>Scarica i dati</h3>
  <p>Tutti i risultati sono nel repository GitHub, cartella <a href="${d}">data/csv</a>, in file CSV (separatore virgola, decimale punto)
  più un riepilogo Excel:</p>
  <ul>
    <li>${link("summary.xlsx")} – tutte le tabelle principali in un unico file Excel</li>
    <li>${link("rankings.csv")} – punteggi per fornitore, variabile, aggregazione, anticipo e finestra temporale</li>
    <li>${link("rankings_holdout.csv")} – ultimi giorni, con Migliore, Media pesata e GPR</li>
    <li>${link("best_and_weights.csv")} – fornitore migliore e pesi in uso</li>
    <li>${link("gpr_validation.csv")} – errori e calibrazione della GPR negli ultimi giorni esclusi dall'addestramento</li>
    <li>${link("gpr_backtest.csv")} / ${link("gpr_backtest_summary.csv")} – back-test storico della GPR (ogni blocco / sintesi)</li>
    <li>${link("monthly_trend.csv")} – punteggi mensili</li>
    <li><code>daily_pairs/AAAA-MM.csv</code> – per ogni giorno, stazione, variabile e anticipo: osservazione e previsione di ogni fornitore</li>
    <li>${link("event_scores.csv")} – verifica degli eventi significativi (colti, mancati, falsi allarmi, errore nei giorni di evento)</li>
    <li>${link("event_list.csv")} – ogni evento osservato con la previsione di ogni fornitore</li>
    <li><code>radcalnet/AAAA-MM.csv</code>, <code>hypernets/AAAA-MM.csv</code> – previsioni orarie di ogni modello ai siti RadCalNet e HYPERNETS, per ogni anticipo (0–7 giorni)</li>
    <li>${link("stations.csv")} – stazioni di verifica</li>
  </ul>
  <h3>Come funziona</h3>
  <p><b>Regioni.</b> “Italia” usa tutti i modelli che coprono l'Italia (compresi ICON-2I, ICON-EU, ARPEGE) su una griglia fitta.
  “RadCalNet” (Railroad Valley, Gobabeb, La Crau, Baotou) e “HYPERNETS” (siti LANDHYPERNET e WATERHYPERNET, ad es. Gobabeb, Demmin, Järvselja,
  Lonzée, Wytham Woods, Acqua Alta) sono siti di calibrazione/validazione della riflettanza satellitare: qui il sito mostra solo i modelli globali
  (ECMWF, ICON, GFS, UKMO, GEM), la loro media e dispersione, senza verifica; i valori sono archiviati ogni giorno. Quando interroghi un punto la regione
  è scelta automaticamente; giorni e blocchi di 6 ore sono nell'ora locale del punto.</p>
  <p><b>Fornitori.</b> I modelli numerici (ItaliaMeteo ICON-2I, ECMWF, ICON, GFS, ARPEGE, UKMO, …) arrivano da Open-Meteo, che archivia per ogni ora
  la previsione emessa 0, 1, …, 7 giorni prima, così l'archivio si può ricostruire all'indietro. I servizi solo per stazioni (MET Norway e, con le chiavi API,
  OpenWeatherMap, WeatherAPI, Tomorrow.io, Visual Crossing) sono archiviati ogni giorno.</p>
  <p><b>Osservazioni.</b> Stazioni sinottiche (Meteostat). Temperatura istantanea, precipitazione oraria; blocchi di 6 ore e giorni nell'ora locale di
  ogni stazione. Un blocco è verificato solo se completo.</p>
  <p><b>Anticipo.</b> “Oggi” = previsione emessa poche ore prima; “+1 g” = emessa circa 24 ore prima; … fino a una settimana.</p>
  <p><b>Eventi.</b> Oltre agli errori medi si verificano gli eventi significativi osservati (pioggia forte, caldo, gelo; soglie in <code>config.yaml</code>):
  per ogni fornitore quanti sono stati previsti, mancati e quanti falsi allarmi ha dato.</p>
  <p><b>Migliore</b> = fornitore con l'errore più basso negli ultimi ${S.meta.window_days || 90} giorni, per quella variabile, aggregazione e anticipo.
  <b>Media pesata</b> = media dei fornitori con pesi proporzionali a 1/MSE. <b>GPR</b> = regressione a processi gaussiani che usa posizione, quota e
  le previsioni di tutti i modelli per stimare il valore e la sua incertezza. È controllata su giorni esclusi dall'addestramento e, ogni settimana,
  con un back-test storico su tutto l'archivio (scheda “Affidabilità GPR”).</p>
  <p><b>Ricerca dei luoghi</b>: suggerimenti mentre scrivi (<a href="https://photon.komoot.io/">Photon</a>, dati OpenStreetMap, ordinati per vicinanza alla mappa),
  coordinate (“41.90, 12.50”), posizione del dispositivo, e <a href="https://nominatim.openstreetmap.org/">Nominatim</a> come riserva.</p>
  <h3>Atmosfera e correzione atmosferica</h3>
  <p>Per il punto scelto: vapore acqueo in colonna, pressione al suolo, temperatura, umidità, nuvolosità, irradianza (ECMWF IFS 0,25°), spessore ottico degli
  aerosol a 550 nm e polveri (CAMS), e il profilo sui livelli di pressione 1000–200 hPa (temperatura, umidità, altezza geopotenziale, vento).
  La densità dell'aria è ρ = p / (R<sub>d</sub> T<sub>v</sub>) con la temperatura virtuale T<sub>v</sub>. I parametri di trasferimento radiativo delle bande
  Sentinel-2 (trasmittanza di diffusione in discesa e in salita, trasmittanza gassosa, radianza di percorso, irradianza diretta e diffusa, albedo sferico)
  sono interpolati da tabelle (vapore × AOD × zenit solare × quota; vista al nadir, aerosol continentale, ozono 0,30 cm-atm) calcolate con 6S (solo spettro
  solare) o libRadtran (spettro solare e termico), da scegliere nella scheda Atmosfera. Nell'infrarosso termico libRadtran dà trasmittanza e radianze in salita
  e in discesa con atmosfere standard scelte secondo latitudine e stagione.</p>
  <h3>Atmosphere RK: mappe ad alta risoluzione validate sulle misure</h3>
  <p>Per una data e un'ora passate, vapore acqueo (ECMWF IFS, circa 25 km) e AOD (CAMS, circa 45 km) sono corretti con un modello gradient boosting addestrato sulle
  misure orarie AERONET e GNSS, con covariate che esistono per ogni pixel: i valori del modello, il terreno entro 500 m e 2 km, posizione e ora.
  Si applica ogni 30 m (90 m per aree grandi). La validazione esclude ogni sito e tutti i siti della sua cella di 0,5°: gli errori sono rispetto alle misure, non al modello.
  La griglia può essere il quadrato intorno al luogo o quella di un'immagine GeoTIFF/ENVI importata. Le grandezze di trasferimento radiativo sono convertite alla banda
  di un sensore con la sua risposta spettrale (libreria, metadati dell'immagine o personalizzata) ed esportate nelle unità del prodotto.</p>
  <p><b>Limiti.</b> Migliore, Media pesata e GPR usano solo modelli disponibili ovunque (Open-Meteo), così si possono calcolare in qualsiasi punto.
  Le stazioni sono soprattutto in pianura o sulla costa: in montagna stime e incertezze sono meno verificate.
  La correzione dell'AOD è piccola: l'aerosol cambia troppo in fretta perché le covariate spieghino molto più di CAMS.</p>
  <h3>Licenza</h3><p>© 2026 Francesco Rossi. Codice: tutti i diritti riservati. Dati: CC BY-NC 4.0 (attribuzione, uso non commerciale).
  I dati di terzi restano soggetti alle loro licenze.</p>`;
}
function onLang(l) {
  track("lang-" + l);
  if (!S.meta) return;
  initData(); refreshAll();
  if (S.point) renderPoint();
}

