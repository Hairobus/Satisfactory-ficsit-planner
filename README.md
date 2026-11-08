# FICSIT Planner

A production calculator and planner for **Satisfactory 1.2**: recipe chains, buildings and power, floor layouts,
a multi-storey factory in 3D, logistics (belts, trucks, tractors, trains, drones) and a world map with resource
nodes, terrain and routes.

The whole site is a single `index.html` file: no install, works offline, on desktop and on phones.
The interface is available in 15 languages (picked automatically from your browser, switchable in the top-right corner).

*Русская версия — ниже.*

## How to use

- **Online:** open the project's GitHub Pages site (link in the repository description).
- **Offline:** download `index.html` and open it in a browser (Chrome, Edge, Firefox; phones work too).

Features:
- pick targets and amounts; recipe sets (standard, best, best + alternates); "Step by step" and "Full" modes;
- tabs: **List**, **Graph**, **Layout**, **Building** (section, floor plans, 3D) and **Map** (2D/3D);
- logistics for raw inputs and products: vehicle count, stations, power, fuel and range;
- several sites (factories) with automatic links between them and synced amounts;
- projects saved in the browser and to a file.

## Building from source

```
pip install pillow
python3 build.py          # builds index.html from src/
```

Project structure, architecture and code rules are described in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Data sources

- Recipes, items, buildings, names and icons — from the Satisfactory game files (CommunityResources/Docs).
- Map image and heights — from the game files (exported with FModel).
- Resource node positions — [Konsl/satisfactory-world-generator](https://github.com/Konsl/satisfactory-world-generator).
- Vehicle and building speeds, capacities, sizes and power — [Satisfactory Wiki](https://satisfactory.wiki.gg).

## Legal

This is an unofficial, non-commercial fan project. It is not affiliated with or endorsed by Coffee Stain Studios.
Satisfactory and all game names, icons, images and data are © Coffee Stain Studios.

The MIT license ([LICENSE](LICENSE)) covers this project's source code only, not the game's data or images.

---

# Планировщик FICSIT (русский)

Калькулятор и планировщик производства для **Satisfactory 1.2**: цепочки рецептов, здания и энергия, планировка этажей,
многоэтажное здание в 3D, логистика (конвейеры, грузовики, тракторы, поезда, дроны) и карта мира с месторождениями,
рельефом и маршрутами. Весь сайт — один файл `index.html`: работает без установки и без интернета. Интерфейс на 15 языках.

**Как открыть:** страница проекта на GitHub Pages (ссылка — в описании репозитория) или скачать `index.html`
и открыть в браузере.

**Сборка:** `pip install pillow`, затем `python3 build.py` → `index.html`. Устройство проекта — в
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) (на английском).

**Правовая информация:** неофициальный фанатский некоммерческий проект, не связан с Coffee Stain Studios.
Satisfactory, названия, иконки, изображения и данные игры — © Coffee Stain Studios. Лицензия MIT распространяется
только на код проекта.
