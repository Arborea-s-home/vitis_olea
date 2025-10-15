/* Aggiorna App.state dai checkbox e richiama App.render().
   Regola: se un gruppo è vuoto, è "nessun filtro" (include tutto). */

document.addEventListener("DOMContentLoaded", () => {
  // Eventi sui chip
  document.querySelectorAll(".filter-group").forEach((groupEl) => {
    groupEl.addEventListener("change", () => {
      syncStateFromUI();
      window.App.render();
      document.dispatchEvent(new Event('detail:filters-changed'));
    });
  });

  // Pulsanti azione
  document.getElementById("btn-select-all").addEventListener("click", () => {
    document.querySelectorAll(".chip-input").forEach((i) => (i.checked = true));
    syncStateFromUI();
    window.App.render();
    document.dispatchEvent(new Event('detail:filters-changed'));
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    document.querySelectorAll(".chip-input").forEach((i) => (i.checked = false));
    syncStateFromUI();
    window.App.render();
    document.dispatchEvent(new Event('detail:filters-changed'));
  });

  document.getElementById("btn-fit").addEventListener("click", () => {
    window.App.fitAll();
  });

  // Inizializza lo state
  syncStateFromUI();
});

function syncStateFromUI() {
  const taxa = new Set();
  const stype = new Set();
  const ctxTyp = new Set();

  document.querySelectorAll('.filter-group[data-filter-group="taxa"] .chip-input')
    .forEach((i) => { if (i.checked) taxa.add(i.dataset.value); });

  document.querySelectorAll('.filter-group[data-filter-group="stype"] .chip-input')
    .forEach((i) => { if (i.checked) stype.add(i.dataset.value); });

  document.querySelectorAll('.filter-group[data-filter-group="context_typology"] .chip-input')
    .forEach((i) => { if (i.checked) ctxTyp.add(i.dataset.value); });

  window.App.state.taxa = taxa;
  window.App.state.stype = stype;
  window.App.state.context_typology = ctxTyp;
}
