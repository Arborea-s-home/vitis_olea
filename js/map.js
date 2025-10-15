/* global L */

(function () {
  // ========== PHASES (per timeline) ==========
  const PHASES = [
    "Mesolitico","Eneolitico","Neolitico","Età del Bronzo","Età del Ferro / Villanoviano",
    "Periodo Etrusco / Orientalizzante","Periodo Arcaico (Roma)","Periodo Repubblicano (Roma)",
    "Periodo Imperiale (Roma)","Tarda Antichità","Medioevo","Rinascimento","Periodo Moderno","Età contemporanea"
  ];

  // ========== STATE GLOBALE ==========
  window.App = {
    state: {
      taxa: new Set(["Vitis vinifera L.", "Olea europaea L."]),
      stype: new Set(["carpological", "wood"]),
      context_typology: new Set(["settlement", "sacred", "underwater", "funerary", "other"]),
      chrono: { from: 0, to: PHASES.length - 1, includeUndated: false },
    },
    render: () => {},
    fitAll: () => {},
  };

  // ========== MAPPA ==========
  const map = L.map("map", {
    zoomControl: true,
    preferCanvas: true,
  }).setView([41.9, 12.5], 7);

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }
  ).addTo(map);

  // Poligoni (sites, contexts)
  const sitesLayer = L.geoJSON(null, {
    style: () => ({
      color: "rgba(46,125,50,0.85)",
      weight: 1.5,
      fillColor: "rgba(102,187,106,0.25)",
      fillOpacity: 0.6,
    }),
    onEachFeature: (feature, layer) => {
      layer.on({
        mouseover: () => layer.setStyle({ weight: 2.2 }),
        mouseout: () => layer.setStyle({ weight: 1.5 }),
        popupopen: () => layer.setStyle({ weight: 2.2 }),
        popupclose: () => layer.setStyle({ weight: 1.5 }),
      });
      layer.bindPopup(() => sitePopupHTML(feature));
    },
  });

  const contextsLayer = L.geoJSON(null, {
    style: () => ({
      color: "rgba(46,125,50,0.88)",
      weight: 1.2,
      fillColor: "rgba(46,125,50,0.18)",
      fillOpacity: 0.55,
    }),
    onEachFeature: (feature, layer) => {
      layer.on({
        mouseover: () => layer.setStyle({ weight: 2.0 }),
        mouseout: () => layer.setStyle({ weight: 1.2 }),
        popupopen: () => layer.setStyle({ weight: 2.0 }),
        popupclose: () => layer.setStyle({ weight: 1.2 }),
      });
      layer.bindPopup(() => contextPopupHTML(feature));
    },
  });

  sitesLayer.addTo(map);
  contextsLayer.addTo(map);

  // ========== CLUSTER ==========
  const clusterVitis = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    disableClusteringAtZoom: 16,
    maxClusterRadius: 44,
    iconCreateFunction: (cluster) =>
      createSpeciesClusterIcon("vitis", cluster.getChildCount()),
  }).addTo(map);

  const clusterOlea = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    disableClusteringAtZoom: 16,
    maxClusterRadius: 44,
    iconCreateFunction: (cluster) =>
      createSpeciesClusterIcon("olea", cluster.getChildCount()),
  }).addTo(map);

  const clusterOther = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    disableClusteringAtZoom: 16,
    maxClusterRadius: 44,
    iconCreateFunction: (cluster) =>
      createSpeciesClusterIcon(null, cluster.getChildCount()),
  }).addTo(map);

  // Nuovo: cluster per collisioni multi-specie su stesse coordinate
  const collisionCluster = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    disableClusteringAtZoom: 18,
    maxClusterRadius: 1, // cluster solo per punti praticamente coincidenti
    iconCreateFunction: (cluster) => {
      const children = cluster.getAllChildMarkers();
      let vitis = 0, olea = 0, other = 0;
      children.forEach((m) => {
        const s = m.__species;
        if (s === "vitis") vitis++;
        else if (s === "olea") olea++;
        else other++;
      });
      return makeCollisionDivIcon({ vitis, olea, other });
    },
  }).addTo(map);

  // ========== DATI ==========
  let sites = [];
  let contexts = [];
  let samples = [];

  const ctxById = new Map();          // fid -> context feature
  const siteById = new Map();         // fid -> site feature
  const ctxIdsBySite = new Map();     // site fid -> Set<context fid>
  const sampleIdsByCtx = new Map();   // context fid -> Set<sample fid>
  const ctxTypologyById = new Map();  // context fid -> normalized typology
  const ctxPhasesById = new Map();    // context fid -> Set<phase index>

  Promise.all([
    fetch("./data/geojson/vitis_olea_sites.geojson").then((r) => r.json()),
    fetch("./data/geojson/vitis_olea_contexts.geojson").then((r) => r.json()),
    fetch("./data/geojson/vitis_olea_samples.geojson").then((r) => r.json()),
  ])
    .then(([sitesGJ, contextsGJ, samplesGJ]) => {
      sites = (sitesGJ.features || []).slice();
      contexts = (contextsGJ.features || []).slice();
      samples = (samplesGJ.features || []).slice();

      // indici
      sites.forEach((f) => {
        const id = f?.properties?.fid;
        if (id != null) siteById.set(id, f);
      });

      contexts.forEach((f) => {
        const id = f?.properties?.fid;
        if (id != null) {
          ctxById.set(id, f);
          const siteId = f?.properties?.parent_id ?? null;
          const normTyp = normalizeTypology(f?.properties?.typology);
          ctxTypologyById.set(id, normTyp);
          if (siteId != null) {
            if (!ctxIdsBySite.has(siteId)) ctxIdsBySite.set(siteId, new Set());
            ctxIdsBySite.get(siteId).add(id);
          }
          ctxPhasesById.set(id, extractPhasesForContext(f.properties));
        }
      });

      samples.forEach((f) => {
        const ctxId = f?.properties?.context_id ?? null;
        const sid = f?.properties?.fid;
        if (ctxId != null && sid != null) {
          if (!sampleIdsByCtx.has(ctxId)) sampleIdsByCtx.set(ctxId, new Set());
          sampleIdsByCtx.get(ctxId).add(sid);
        }
      });

      App.render();
      App.fitAll();

      try { document.dispatchEvent(new Event("detail:ready")); } catch {}
    })
    .catch((err) => {
      console.error("Errore nel caricamento dei GeoJSON:", err);
      alert("Errore nel caricamento dei dati. Verifica i percorsi in /data/geojson/");
    });

  // ========== FILTRI ==========
  function applyFilters(opts = {}) {
    const { ignoreChrono = false } = opts;

    const taxaSel = App.state.taxa;
    const stypeSel = App.state.stype;
    const ctxTypSel = App.state.context_typology;
    const { from, to, includeUndated } = App.state.chrono;

    const taxaActive = taxaSel.size > 0;
    const stypeActive = stypeSel.size > 0;
    const ctxTypActive = ctxTypSel.size > 0;

    const chronoInRange = (ctxId) => {
      if (ignoreChrono) return true;
      const phases = ctxPhasesById.get(ctxId) || new Set();
      if (phases.size === 0) return !!includeUndated;
      for (const idx of phases) { if (idx >= from && idx <= to) return true; }
      return false;
    };

    const samplesFiltered = samples.filter((s) => {
      const p = s.properties || {};
      const taxaOk = !taxaActive || taxaSel.has(p.precise_taxon);
      const stypeOk = !stypeActive || stypeSel.has(p.s_type);
      const ctxId = p.context_id;
      const t = ctxTypologyById.get(ctxId) || "other";
      const ctxOk = !ctxTypActive || ctxTypSel.has(t);
      const chrOk = chronoInRange(ctxId);
      return taxaOk && stypeOk && ctxOk && chrOk;
    });

    const sampleCtxIds = new Set(samplesFiltered.map((s) => s.properties.context_id));
    const contextsFiltered = contexts.filter((c) => {
      const cid = c.properties.fid;
      const t = ctxTypologyById.get(cid) || "other";
      const typOk = !ctxTypActive || ctxTypSel.has(t);
      const chrOk = chronoInRange(cid);
      const hasAnySample = sampleCtxIds.has(cid);
      return typOk && chrOk && hasAnySample;
    });

    const filteredCtxIds = new Set(contextsFiltered.map((c) => c.properties.fid));
    const sitesFiltered = sites.filter((site) => {
      const sid = site.properties.fid;
      const allCtxForSite = ctxIdsBySite.get(sid) || new Set();
      return [...allCtxForSite].some((id) => filteredCtxIds.has(id));
    });

    return { samplesFiltered, contextsFiltered, sitesFiltered };
  }

  // ========== RENDER ==========
  App.render = function render() {
    const { samplesFiltered, contextsFiltered, sitesFiltered } = applyFilters();

    // poligoni
    contextsLayer.clearLayers();
    sitesLayer.clearLayers();
    sitesLayer.addData({ type: "FeatureCollection", features: sitesFiltered });
    contextsLayer.addData({ type: "FeatureCollection", features: contextsFiltered });

    // pulisci cluster
    clusterVitis.clearLayers();
    clusterOlea.clearLayers();
    clusterOther.clearLayers();
    collisionCluster.clearLayers();

    // raggruppa per coordinate esatte
    const byCoord = new Map(); // "lat,lng" -> array { marker, species }
    samplesFiltered.forEach((f) => {
      const [lng, lat] = f.geometry.coordinates;
      const key = `${lat},${lng}`;
      const species =
        f?.properties?.precise_taxon === "Vitis vinifera L." ? "vitis" :
        f?.properties?.precise_taxon === "Olea europaea L." ? "olea"  : "other";

      const icon = iconForSample(f);
      const marker = L.marker([lat, lng], { icon, alt: f?.properties?.precise_taxon || "sample" })
        .bindPopup(() => samplePopupHTML(f));
      marker.__species = species;

      if (!byCoord.has(key)) byCoord.set(key, []);
      byCoord.get(key).push({ marker, species });
    });

    // dispatch nei cluster
    byCoord.forEach((arr) => {
      const speciesSet = new Set(arr.map((x) => x.species));
      const isMultiSpecies = speciesSet.size >= 2;
      if (isMultiSpecies) {
        collisionCluster.addLayers(arr.map((x) => x.marker));
      } else {
        const s = arr[0].species;
        const layers = arr.map((x) => x.marker);
        if (s === "vitis") clusterVitis.addLayers(layers);
        else if (s === "olea") clusterOlea.addLayers(layers);
        else clusterOther.addLayers(layers);
      }
    });

    sitesLayer.bringToBack();
    contextsLayer.bringToFront();
  };

  App.fitAll = function fitAll() {
    const bounds = L.latLngBounds([]);
    if (sitesLayer.getLayers().length) bounds.extend(sitesLayer.getBounds());
    if (contextsLayer.getLayers().length) bounds.extend(contextsLayer.getBounds());
    if (clusterVitis.getLayers().length) bounds.extend(clusterVitis.getBounds());
    if (clusterOlea.getLayers().length) bounds.extend(clusterOlea.getBounds());
    if (clusterOther.getLayers().length) bounds.extend(clusterOther.getBounds());
    if (collisionCluster.getLayers().length) bounds.extend(collisionCluster.getBounds());
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.08));
  };

  // ========== UTILS ==========
  function normalizeTypology(val) {
    const v = (val || "").toString().trim().toLowerCase();
    if (["settlement", "sacred", "underwater", "funerary"].includes(v)) return v;
    return "other";
  }

  function normalizePhaseToken(token) {
    const t = (token || "").toLowerCase();
    if (t.includes("mesolit")) return "Mesolitico";
    if (t.includes("eneolit")) return "Eneolitico";
    if (t.includes("neolit")) return "Neolitico";
    if (t.includes("bronzo")) return "Età del Bronzo";
    if (t.includes("villanov") || t.includes("ferro")) return "Età del Ferro / Villanoviano";
    if (t.includes("etrusc") || t.includes("orientalizz")) return "Periodo Etrusco / Orientalizzante";
    if (t.includes("arcaico")) return "Periodo Arcaico (Roma)";
    if (t.includes("repubblic")) return "Periodo Repubblicano (Roma)";
    if (t.includes("imperial") || t.includes("altoimperial")) return "Periodo Imperiale (Roma)";
    if (t.includes("tarda antich")) return "Tarda Antichità";
    if (t.includes("medioevo") || t.includes("medio evo")) return "Medioevo";
    if (t.includes("rinasc")) return "Rinascimento";
    if (t.includes("modern")) return "Periodo Moderno";
    if (t.includes("contempor")) return "Età contemporanea";
    return null;
  }

  function extractPhasesForContext(p) {
    const raw = (p?.parent_chronology_iccd ?? p?.chronology_iccd ?? "") + "";
    const parts = raw.split(/[;|,/]/).map((s) => s.trim()).filter(Boolean);
    const set = new Set();
    parts.forEach((tok) => {
      const norm = normalizePhaseToken(tok);
      if (norm) {
        const idx = PHASES.indexOf(norm);
        if (idx >= 0) set.add(idx);
      }
    });
    return set;
  }

  // Icone base e cluster
  function makeDivIcon(kind, withCount) {
    const img =
      kind === "vitis" ? "./images/vitis.png" :
      kind === "olea"  ? "./images/olea.png"  : null;
    const cls = kind ? `pin2 pin2-${kind}` : "pin2";
    const html = `
      <div class="${cls}" ${img ? `style="--pin-bg:url('${img}')"` : ""}>
        ${withCount ? `<span class="cluster-badge">${withCount > 99 ? "99+" : withCount}</span>` : ""}
      </div>`;
    return L.divIcon({
      html,
      className: "",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -16],
    });
  }

  function iconForSample(feature) {
    const t = feature?.properties?.precise_taxon;
    if (t === "Vitis vinifera L.") return makeDivIcon("vitis", 0);
    if (t === "Olea europaea L.") return makeDivIcon("olea", 0);
    return makeDivIcon(null, 0);
  }

  function createSpeciesClusterIcon(kind, count) {
    const k = (kind === "vitis" || kind === "olea") ? kind : null;
    return makeDivIcon(k, count);
  }

  // Icona per collisione multi-specie (split circle)
  function makeCollisionDivIcon({ vitis = 0, olea = 0, other = 0 }) {
    const total = vitis + olea + other;
    if ((vitis>0 && olea===0 && other===0) || (olea>0 && vitis===0 && other===0) || (other>0 && vitis===0 && olea===0)) {
      const kind = vitis>0 ? "vitis" : olea>0 ? "olea" : null;
      return makeDivIcon(kind, total);
    }
    const img1 = vitis>0 ? "./images/vitis.png" : "./images/olea.png";
    const img2 = olea>0 ? "./images/olea.png" : (vitis>0 ? "./images/vitis.png" : "./images/olea.png");
    const html = `
      <div class="pin2 pin2-multi" style="--pin-bg1:url('${img1}'); --pin-bg2:url('${img2}')">
        <span class="half left"></span>
        <span class="half right"></span>
        <span class="cluster-badge">${total > 99 ? "99+" : total}</span>
      </div>`;
    return L.divIcon({
      html,
      className: "",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -16],
    });
  }

  // Popups
  function sitePopupHTML(f) {
    const p = f.properties || {};
    const ctxIds = ctxIdsBySite.get(p.fid) || new Set();

    const { samplesFiltered, contextsFiltered } = applyFilters();
    const visibleCtxIds = new Set(contextsFiltered.map((c) => c.properties.fid));
    const ctxVisible = [...ctxIds].filter((id) => visibleCtxIds.has(id));

    const samplesByCtx = new Map();
    samplesFiltered.forEach((s) => {
      const c = s.properties.context_id;
      samplesByCtx.set(c, (samplesByCtx.get(c) || 0) + 1);
    });
    const sampleCount = ctxVisible.reduce((acc, cid) => acc + (samplesByCtx.get(cid) || 0), 0);

    return `
      <div>
        <div style="font-weight:700;margin-bottom:6px;">${safe(p.name || p.site_name_brain || p.site_code || "Site")}</div>
        <table class="table">
          <tr><td class="key">Code</td><td class="val">${safe(p.site_code || "-")}</td></tr>
          <tr><td class="key">Typology</td><td class="val"><span class="badge">${safe(p.typology || "—")}</span></td></tr>
          <tr><td class="key">Region / Province</td><td class="val">${safe(p.region || "—")} / ${safe(p.province || "—")}</td></tr>
          <tr><td class="key">Contexts (visible)</td><td class="val">${ctxVisible.length}</td></tr>
          <tr><td class="key">Samples (visible)</td><td class="val">${sampleCount}</td></tr>
        </table>
      </div>
    `;
  }

  function contextPopupHTML(f) {
    const p = f.properties || {};
    const normT = normalizeTypology(p.typology);
    const { samplesFiltered } = applyFilters();
    const sampCount = samplesFiltered.filter((s) => s.properties.context_id === p.fid).length;

    return `
      <div>
        <div style="font-weight:700;margin-bottom:6px;">${safe(p.context_name || "Context")}</div>
        <table class="table">
          <tr><td class="key">Site</td><td class="val">${safe(p.site_name_brain || p.parent_context || p.site_code || "—")}</td></tr>
          <tr><td class="key">Typology</td><td class="val"><span class="badge">${normT}</span></td></tr>
          <tr><td class="key">Chronology</td><td class="val">${safe(p.chron_orig || p.chronology_iccd || "—")}</td></tr>
          <tr><td class="key">Samples (visible)</td><td class="val">${sampCount}</td></tr>
        </table>
      </div>
    `;
  }

  function samplePopupHTML(f) {
    const p = f.properties || {};
    const ctx = ctxById.get(p.context_id)?.properties || {};
    const site = siteById.get(ctx.parent_id)?.properties || {};
    return `
      <div>
        <div style="font-weight:700;margin-bottom:6px;">Sample — ${safe(p.precise_taxon || p.taxon || "—")}</div>
        <table class="table">
          <tr><td class="key">Type</td><td class="val">${safe(p.s_type || "—")}</td></tr>
          <tr><td class="key">Part</td><td class="val">${safe(p.s_part || "—")}</td></tr>
          <tr><td class="key">Quantity</td><td class="val">${safe(p.qt ?? p.quantity ?? "—")}</td></tr>
          <tr><td class="key">Context</td><td class="val">${safe(p.context || ctx.context_name || "—")} <span class="badge">${safe(normalizeTypology(ctx.typology))}</span></td></tr>
          <tr><td class="key">Site</td><td class="val">${safe(site.name || site.site_name_brain || site.site_code || "—")}</td></tr>
          <tr><td class="key">Ref.</td><td class="val">${safe(p.bibliography || "—")}</td></tr>
        </table>
      </div>
    `;
  }

  function safe(v) {
    return String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  // ===== API per la timeline =====
  window.__detail_setChronoRange = function (from, to, includeUndated) {
    App.state.chrono = { from, to, includeUndated: !!includeUndated };
    App.render();
  };

  window.__detail_computePhaseCounts = function () {
    // Conta i CONTEXTS per fase, rispettando taxa/s_type/typology ma
    // IGNORANDO il range cronologico (serve per il grafico).
    const { contextsFiltered } = (function () {
      return applyFilters({ ignoreChrono: true });
    })();

    const counts = new Array(PHASES.length).fill(0);
    contextsFiltered.forEach((c) => {
      const cid = c.properties.fid;
      const set = ctxPhasesById.get(cid) || new Set();
      if (set.size === 0) return; // gli "undated" non entrano nel grafico
      set.forEach((idx) => { counts[idx] += 1; });
    });
    return counts;
  };

  window.__detail_getSelectedRange = function () {
    const { from, to, includeUndated } = App.state.chrono;
    return { from, to, includeUndated };
  };
})();
