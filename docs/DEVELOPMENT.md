# FICSIT Planner — developer notes

A production calculator for Satisfactory 1.2. The whole site is one self-contained HTML file (`index.html`): no server,
no external JS libraries, works offline and on phones. The internet is only used for Google Fonts
(system fonts are used without it).

## Building

```
pip install pillow
python3 build.py        # → index.html
```

`build.py` stitches together the page skeleton, styles, core and tab modules, and embeds the game data, icons (WebP),
UI translations and map data.

## Structure

| Path | Contents |
|---|---|
| `src/core/page.html` | page skeleton: header, settings, targets, summary, "Chain" card |
| `src/core/base.css` | shared styles and theme tokens (dark theme, `:root`) |
| `src/core/core.js` | state, solver, summary, logistics, sites, projects, menus, events, languages |
| `src/core/init.js` | startup — runs last, after all tabs have registered |
| `src/views/<tab>/` | `module.json` (key and label), `view.html`, `style.css`, `script.js` |
| `src/views/map/models.js` | vehicle sizes for the 3D map (simple boxes) |
| `src/data/game_data.js` | game data: recipes, items, buildings, icons, names in 15 languages |
| `src/data/world.json`, `outline.json` | resource nodes and coastline |
| `src/data/map_relief.webp`, `hmap.webp`, `heights.json` | map image, WebGL height map, contour lines |
| `ui18n.json` | UI texts in 15 languages: `{"T": {language: {key: text}}}` |
| `xicons/` | extra icons (lifts, pipes, storage, stations, transport) |
| `tools/make_map.py` | prepares map data from an FModel export |
| `tests/` | Playwright stress tests (they open `../index.html`) |

Tabs: List (`list`), Graph (`graph`), Layout (`layout`), Building (`building`), Map (`map`).
A tab registers itself as `VIEWS.<view> = {el, render(rows, bal, target), hide(), refit(), zoomBtn(), strip}`.
A `<!--@INTO:name-->` fragment in `view.html` is inserted into another view at its `<!--@SLOT:name-->`.

## Code rules

- Comments in English, short, explaining "why" rather than "what".
- Every new UI text is a key in `ui18n.json` for all 15 languages: ru, uk, en-US, de, fr, es-ES, pl, pt-BR, it, tr,
  cs, ja, ko, zh-Hans, zh-Hant. In JS use `t('key')`, in HTML the `data-l`, `data-la`, `data-lp`, `data-lt` attributes.
  Item and building names come from the game's official localization — never translate them yourself.
- Settings are stored in `localStorage` (`STORE`, the `KEEP` list), always inside `try/catch`. Targets are not saved —
  the site opens clean; "Projects" exist for saving.
- Never shadow the `t()` function with a local variable named `t`.

## How it works

**Solver.** `solve()` is an iterative recipe solver; `solveSafe()` catches recipe choices that make the solution loop
forever (it reverts to the standard recipe and shows a note). In "Step by step" mode unexpanded ingredients are treated
as raw. `machines()` computes buildings, clock speed and shards. `render()` redraws everything.

**Logistics.** `logi(it, q, dir)`: number of vehicles/cars/drones, stations, MW, batteries and fuel per transport type.
Capacities and speeds follow the wiki: truck 48 slots, tractor 25, freight car 32 slots or 2400 m³, fluid car 3200 m³;
89 / 69 / 120 km/h, drone 75 m/s. Truck and tractor range: one fuel stack per round trip + 10 % (`fuelRange`).

**Building.** Floors go bottom-up in production order, a lift shaft in the middle, all floors the same size.
`planFloor()` (in `layout/script.js`) lays out a floor: bus, rows, splitters/mergers, storage.
Raw resources come in from below through the floor; those delivered by transport come from the receiving station
(`extIn`, `isExt`).

**Map.** Game resource nodes, terrain and heights from the game files. WebGL2 (`GLM`): terrain, contour lines in the shader,
640×640 3D mesh, occlusion. Routes (`RT`): Dijkstra on a 512×512 grid with costs for slope, water (bridges) and nearness
to obstacles; smoothing (straightening, loop removal, Chaikin). Node choice (`mapPick`): belt — nearest nodes;
vehicles/train/drones — a node cluster with a road to its main node. Vehicles on the 3D map are boxes sized from the wiki
that move from supplier to receiver (`vehFrame`, `vehAnim`). The "Suitability" filter colours the terrain (`suitField`).

**Sites and projects.** `S.sites` holds several factories; a target of one site needed by another becomes a link
(`LINKS`, `impScan`); link transport is synced on both sides (`linkSync`), amounts follow demand (`syncTargets`).
Projects live in `localStorage` and in JSON files (`projData`; `projApply` validates the input).

## Testing

```
npm i playwright        # Chromium comes with Playwright: npx playwright install chromium
node tests/stress.js    # every item × recipe set × mode × tab: errors, NaN, loops, slow renders
node tests/stress6.js   # Building by floors, Map 2D/3D, logistics with every transport type
```

## Map data

`tools/make_map.py <folder>` turns an FModel export (the 2×2 map and `HeightData_Test.hdr`) into `map_relief.webp`,
`heights.json` and `hmap.webp`. Resource nodes come from `default-world.json` of Konsl/satisfactory-world-generator.
