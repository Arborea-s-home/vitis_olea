// js/timebar.js
// Timeline per filtrare per parent_chronology_iccd (range su PHASES).
// - Grafico a linee (Chart.js) con area selezionata semi-trasparente.
// - Slider "unico": due input range sovrapposti (CSS li mostra come una sola barra).
// - Integra con le API esposte da map.js: __detail_setChronoRange / __detail_computePhaseCounts / __detail_getSelectedRange.

(() => {
  "use strict";

  // Le fasi devono combaciare con quelle usate in map.js
  const PHASES = [
    "Mesolitico","Eneolitico","Neolitico","Età del Bronzo","Età del Ferro / Villanoviano",
    "Periodo Etrusco / Orientalizzante","Periodo Arcaico (Roma)","Periodo Repubblicano (Roma)",
    "Periodo Imperiale (Roma)","Tarda Antichità","Medioevo","Rinascimento","Periodo Moderno","Età contemporanea"
  ];

  // Elementi DOM
  const els = {
    wrap: null, controls: null, labels: null,
    chipFrom: null, chipTo: null, dotFrom: null, dotTo: null,
    undatedWrap: null, undated: null,
    canvasWrap: null, canvas: null,
    sliders: null, from: null, to: null,
    help: null, map: null
  };

  // Chart.js
  let chart = null;

  // Per gestione posizione responsiva rispetto alla mappa e sidebar
  const roList = [];
  let relayoutRAF = null;

  // ---------- Bootstrap ----------
  document.addEventListener("DOMContentLoaded", boot);

  function boot() {
    els.map = document.querySelector("#map");
    if (!els.map) return;

    buildUI();
    attachEvents();
    positionToMap();

    // Sync iniziale dallo stato globale se disponibile
    syncFromApp();

    // Carica Chart.js e poi disegna
    ensureChart().then(() => {
      ensureChartInstance();
      redraw(false);  // disegna senza inviare range a map.js
    });

    // Ricalcola su resize / orientamento
    window.addEventListener("resize", scheduleRelayout);
    window.addEventListener("orientationchange", scheduleRelayout);

    // Osserva variazioni della sidebar per riposizionare la timebar
    const sidebar = document.querySelector("#sidebar");
    if (sidebar && "ResizeObserver" in window) {
      const ro = new ResizeObserver(scheduleRelayout);
      ro.observe(sidebar);
      roList.push(ro);
    }

    // Quando i filtri della dashboard cambiano, aggiorna i conteggi (non sposta il range)
    document.addEventListener("detail:filters-changed", () => redraw(false));
    // Quando la mappa segnala "pronto", sincronizza e ridisegna
    document.addEventListener("detail:ready", () => { syncFromApp(); redraw(false); });
  }

  // ---------- UI ----------
  function buildUI() {
    const wrap = document.createElement("div");
    wrap.id = "timebar-detail";
    wrap.innerHTML = `
      <div class="tb-controls">
        <div class="tb-labels">
          <span class="chip"><span class="dot"></span><span id="tb-label-from"></span></span>
          <span class="chip"><span class="dot"></span><span id="tb-label-to"></span></span>
        </div>
        <label class="tb-switch">
          <input id="tb-undated" type="checkbox" />
          <span class="tb-switch-label">add undated contexts</span>
        </label>
      </div>

      <div class="tb-canvas-wrap">
        <canvas id="tb-canvas" height="120"></canvas>
      </div>

      <div class="tb-sliders">
        <input id="tb-from" type="range" />
        <input id="tb-to"   type="range" />
      </div>

      <button id="tb-help" class="tb-help" title="How the line works">?</button>
    `;
    document.body.appendChild(wrap);

    // Bind elementi
    els.wrap        = wrap;
    els.controls    = wrap.querySelector(".tb-controls");
    els.labels      = wrap.querySelector(".tb-labels");
    els.chipFrom    = wrap.querySelectorAll(".chip")[0];
    els.chipTo      = wrap.querySelectorAll(".chip")[1];
    els.dotFrom     = els.chipFrom?.querySelector(".dot");
    els.dotTo       = els.chipTo?.querySelector(".dot");
    els.undatedWrap = wrap.querySelector(".tb-switch");
    els.undated     = wrap.querySelector("#tb-undated");
    els.canvasWrap  = wrap.querySelector(".tb-canvas-wrap");
    els.canvas      = wrap.querySelector("#tb-canvas");
    els.sliders     = wrap.querySelector(".tb-sliders");
    els.from        = wrap.querySelector("#tb-from");
    els.to          = wrap.querySelector("#tb-to");
    els.help        = wrap.querySelector("#tb-help");

    // Inizializza slider (unica barra con due thumb sovrapposti)
    [els.from, els.to].forEach((r) => {
      r.min = "0";
      r.max = String(PHASES.length - 1);
      r.step = "1";
      // Stili track nativi: lasciamo al CSS
    });

    // Imposta CSS vars per l'ombreggiatura fallback (usate dal CSS che hai fornito)
    els.wrap.style.setProperty("--tb-count", String(PHASES.length));
  }

  function attachEvents() {
    const onInput  = () => { clampRange(); syncLabels(); shadeBackground(); };
    const onChange = () => { clampRange(); syncLabels(); shadeBackground(); redraw(true); };

    els.from.addEventListener("input", onInput);
    els.to.addEventListener("input", onInput);
    els.from.addEventListener("change", onChange);
    els.to.addEventListener("change", onChange);

    els.undated.addEventListener("change", () => redraw(true));

    els.help.addEventListener("click", () => {
      alert(
`The line counts CONTEXTS per phase.

• It respects typology, taxa and s_type filters set in the sidebar.
• The green shade is your active chronologic selection.
• Toggle “add undated contexts” to include contexts with no explicit phase.`
      );
    });
  }

  // Mantieni la barra vicino ai bordi della mappa (come nel progetto originale)
  function scheduleRelayout() {
    if (relayoutRAF) return;
    relayoutRAF = requestAnimationFrame(() => {
      relayoutRAF = null;
      positionToMap();
      if (chart) try { chart.resize(); } catch {}
    });
  }

  function positionToMap() {
    const mapR = els.map.getBoundingClientRect();
    if (mapR.width <= 0 || mapR.height <= 0) return;
    // Padding coerente con il CSS originale
    const pad = 16;
    els.wrap.style.left   = `${Math.max(12, mapR.left + pad)}px`;
    els.wrap.style.right  = `${Math.max(12, window.innerWidth - mapR.right + pad)}px`;
    els.wrap.style.bottom = `${Math.max(12, window.innerHeight - mapR.bottom + pad)}px`;
  }

  // ---------- Stato / Sincronizzazione ----------
  function syncFromApp() {
    const sel = (typeof window.__detail_getSelectedRange === "function")
      ? window.__detail_getSelectedRange()
      : { from: 0, to: PHASES.length - 1, includeUndated: false };

    els.from.value = String(sel.from);
    els.to.value   = String(sel.to);
    els.undated.checked = !!sel.includeUndated;

    clampRange();
    syncLabels();
    shadeBackground();
  }

  function clampRange() {
    let a = parseInt(els.from.value, 10);
    let b = parseInt(els.to.value, 10);
    if (Number.isNaN(a)) a = 0;
    if (Number.isNaN(b)) b = PHASES.length - 1;
    if (a > b) [a, b] = [b, a];
    els.from.value = String(a);
    els.to.value   = String(b);
    return { a, b };
  }

  function syncLabels() {
    const { a, b } = clampRange();
    const labFrom = els.chipFrom.querySelector("#tb-label-from");
    const labTo   = els.chipTo.querySelector("#tb-label-to");
    if (labFrom) labFrom.textContent = PHASES[a];
    if (labTo)   labTo.textContent   = PHASES[b];
  }

  function shadeBackground() {
    const { a, b } = clampRange();
    els.wrap.style.setProperty("--tb-from", String(a));
    els.wrap.style.setProperty("--tb-to",   String(b));
  }

  // ---------- Chart.js ----------
  function ensureChart() {
    if (window.Chart) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function rangeShadePlugin() {
    // plugin che colora l'area (from..to) con un velo verde tenue
    return {
      id: "tbRangeShade",
      beforeDatasetDraw(c, _args, opts) {
        const { chartArea: a, ctx, scales } = c;
        if (!a || !scales?.x) return;
        const x = scales.x;
        const labels = c.data.labels || [];
        const from = clampIndex(opts.from ?? 0, labels.length);
        const to   = clampIndex(opts.to ?? labels.length - 1, labels.length);

        // calcola i pixel tenendo conto della larghezza fra i punti
        const px0 = x.getPixelForValue(from);
        const px1 = x.getPixelForValue(to);
        const step = labels.length > 1 ? Math.abs(x.getPixelForValue(1) - x.getPixelForValue(0)) : 0;
        const half = step / 2;

        ctx.save();
        ctx.fillStyle = "rgba(46,125,50,0.10)"; // trasparente, elegante
        ctx.fillRect(px0 - half, a.top, Math.max(0, px1 - px0 + step), a.bottom - a.top);
        ctx.restore();
      }
    };
  }

  function clampIndex(i, len) {
    if (len <= 0) return 0;
    i = Math.max(0, Math.min(len - 1, i|0));
    return i;
    }

  function ensureChartInstance() {
    if (chart) return chart;
    const ctx = els.canvas.getContext("2d");

    chart = new window.Chart(ctx, {
      type: "line",
      data: {
        labels: PHASES,
        datasets: [{
          label: "Contexts",
          data: new Array(PHASES.length).fill(0),
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBorderWidth: 1,
          borderWidth: 2,
          borderColor: "#2563eb",
          pointBackgroundColor: "#2563eb",
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => (items[0]?.label || ""),
              label: (ctx) => `${ctx.parsed?.y ?? 0} contexts`
            }
          },
          tbRangeShade: { from: 0, to: PHASES.length - 1 }
        },
        scales: {
          x: {
            ticks: { maxRotation: 0, autoSkip: true, font: { size: 10 } },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(0,0,0,0.06)" },
            ticks: { precision: 0, font: { size: 10 } }
          }
        }
      },
      plugins: [rangeShadePlugin()]
    });

    // Assicura che il canvas segua la dimensione del contenitore
    const ro = new ResizeObserver(() => { try { chart.resize(); } catch {} });
    ro.observe(els.canvasWrap);
    roList.push(ro);

    return chart;
  }

  function readCounts() {
    const fn = window.__detail_computePhaseCounts;
    return (typeof fn === "function") ? fn() : new Array(PHASES.length).fill(0);
  }

  function redraw(applyGlobal) {
    const { a, b } = clampRange();
    const includeUndated = !!els.undated.checked;

    // Aggiorna lo stato globale (map.js) se richiesto
    if (applyGlobal && typeof window.__detail_setChronoRange === "function") {
      window.__detail_setChronoRange(a, b, includeUndated);
    }

    // Aggiorna il grafico
    if (!chart) return;

    const counts = readCounts();
    const max = Math.max(1, ...counts);

    chart.data.datasets[0].data = counts;
    chart.options.plugins.tbRangeShade.from = a;
    chart.options.plugins.tbRangeShade.to   = b;
    chart.options.scales.y.max = Math.ceil(max * 1.05);
    chart.update("none");
  }

})();
