
## 1) Where to find the data

`/data` contains two subfolders with the same content in two formats:

data/
geojson/ # spatial + attributes (for the web map / GIS)
csv/ # attributes only (for spreadsheets / scripts)


### Why two formats?

- **GeoJSON** (`.geojson`): self-contained spatial features. Coordinates are **[longitude, latitude] (WGS84 / EPSG:4326)**.  
  Use in web mapping (Leaflet/Mapbox), GIS (QGIS), or any geo-enabled workflow.
- **CSV** (`.csv`): tabular attributes only (no geometry).  
  Use for quick filtering, stats, R/Python analysis, spreadsheets, etc.  
  The **join keys** (`fid`, `parent_id`, `context_id`) are present so you can rebuild the hierarchy.

**Files (both in `geojson/` and `csv/`):**
- `sites.*`
- `contexts.*`
- `samples.*`

---

## 2) Field reference

Below is a concise field guide you can refine as needed. Names are exactly as they appear in the files.

### A. `samples` (points)

| Field | Type | Description |
| --- | --- | --- |
| `fid` | int | Primary key for the sample feature. |
| `id` | int | Sample identifier (as in source). |
| `context_id` | int | **FK** → `contexts.fid`. |
| `context` | text | Context name/label from source publication. |
| `precise_taxon` | text | Normalized, precise taxon (e.g., `Vitis vinifera L.`, `Olea europaea L.`). Used by the map icons. |
| `species_orig_pub` | text | Taxon name as printed in the original publication. |
| `taxon` | text | Canonical taxon string (often equals `precise_taxon`). |
| `Family` / `genus` / `specie` | text | Botanical hierarchy (spelling follows the source). |
| `cf_genus` / `cf_sp` / `cf_subsp` | bool | “cf.” uncertainty flags on genus/species/subspecies. |
| `s_type` | text | Macroremain type (e.g., `carpological`, `wood`). |
| `s_foss` | text | Fossilisation/formation process (e.g., `charring`, `waterlogging`). |
| `s_part` | text | Plant part (e.g., `seed`, `pip`). |
| `sample_number` | text | Sample label/number in the source. |
| `qt` / `quantity` | number/text | Quantity count; `qt` is numeric when available. |
| `entity` | text | Qualitative unit, when counts are not absolute. |
| `weight_g` | number | Weight in grams (if reported). |
| `s_notes` | text | Notes on the sample. |
| `AMS` | text | AMS radiocarbon info, if any. |
| `bibliography` | text | Citation for the occurrence. |
| `photo` | text/url | Optional photo reference. |
| `geometry` | point | Point location (often context centroid) — **GeoJSON only**. |

**Usage tip:** the web map filters samples by `precise_taxon`, by `s_type`, and by the **typology and chronology of their parent context**.

---

### B. `contexts` (polygons)

| Field | Type | Description |
| --- | --- | --- |
| `fid` | int | Primary key for the context. |
| `site_code` | text | Site code (shared with the parent site). |
| `context_name` | text | Context name/description. |
| `parent_id` | int | **FK** → `sites.fid`. |
| `type` | text | Scale label (often `micro`). |
| `typology` | text | Context typology (`settlement`, `sacred`, `underwater`, `funerary`, other/NULL). |
| `chron_orig` | text | Original chronology as reported in the source. |
| `chronology_iccd` | text | ICCD/controlled chronology, when present. |
| `parent_chronology_iccd` | text | Higher-level chronology facets for the **site** (used by the timeline filter). |
| `c_appr` | int | Spatial approximation (0–4). |
| `c_notes` | text | Notes. |
| `site_name_brain` | text | Site label used in BRAIN/ARBOREA crosswalks. |
| `macro_context_name` | text | Optional macro-unit name. |
| `site_id` | int | Foreign ID in the upstream system, if present. |
| `source_type` / `source` | text | How/where the geometry was derived. |
| `bibliography` | text | Context-level bibliography. |
| `region` / `province` | text | Administrative info. |
| `geometry` | polygon | Context polygon — **GeoJSON only**. |

**Notes:**  
- The **timeline** in the web map normalizes chronology labels (e.g., “Neolitico”, “Età del Bronzo”, “Periodo Imperiale (Roma)”) and filters contexts (and therefore samples and sites) by selected phases, with an option to include **undated** records.

---

### C. `sites` (polygons)

| Field | Type | Description |
| --- | --- | --- |
| `fid` | int | Primary key for the site. |
| `site_code` | text | Site code. |
| `name` | text | Full site name (may include typology in parentheses). |
| `typology` | text | Site typology (`settlement`, `sacred`, `underwater`, `funerary`, etc.). |
| `type` | text | Scale label (often `macro`). |
| `site_name_brain` | text | Site label used in BRAIN/ARBOREA crosswalks. |
| `site_id` | int | External site identifier, if any. |
| `chron_orig` | text | Original chronology as reported. |
| `chronology_iccd` | text | ICCD/controlled chronology (site level). |
| `parent_chronology_iccd` | text | Higher-level chronology facets (used by the timeline). |
| `c_appr` | int | Spatial approximation (0–4). |
| `c_notes` | text | Notes. |
| `source_type` / `source` | text | Provenance of the geometry (e.g., OSM). |
| `bibliography` | text | Site-level bibliography. |
| `region` / `province` | text | Administrative info. |
| `q_e` | text | Internal quality flag, when present. |
| `geometry` | polygon | Site polygon — **GeoJSON only**. |

---

## 3) Explore the data on the custom web map

You can browse and filter the dataset on the GitHub Pages viewer:

👉 **https://arborea-s-home.github.io/vitis_olea**

Features:
- modern base map (CartoDB Positron)
- green polygons for **sites** and **contexts**
- round **species icons** for samples (`Vitis` and `Olea`)
- per-species marker clustering with counts
- sidebar filters (taxa, remain type) and a **timeline** by ICCD phases
- tidy pop-ups with key attributes and counts

---

## Repro / local development

No build step is required. To test locally, serve the root folder with any static server (or open `index.html` in a modern browser). GitHub Pages deploys directly from `main`.

