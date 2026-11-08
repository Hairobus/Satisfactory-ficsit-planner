# Builds "FICSIT Planner" from modules into one self-contained HTML file (works offline and on phones).
#
#   src/core/page.html   — page skeleton (header, settings, targets, summary, "Chain" card)
#   src/core/base.css    — shared styles and theme tokens
#   src/core/core.js     — data, solver, summary, logistics, menus, events, languages
#   src/core/init.js     — startup (last, after all tabs have registered)
#   src/views/<module>/  — a tab: module.json (key and label), view.html, style.css, script.js
#   src/data/            — game data (game_data.js) and map data (resource nodes, coastline, terrain, heights)
#   xicons/              — extra icons of our own (lifts, pipes, storage, transport)
#
# Run: python3 build.py  →  index.html (needs Python 3 and Pillow: pip install pillow)
#
# To change a tab, edit only its folder. Tab order is the MODULES list.
import json, base64, io, os, glob, sys
from PIL import Image

MODULES = ['list', 'graph', 'layout', 'building', 'map']
OUT = 'index.html'

rd = lambda p: open(p, encoding='utf-8').read()

# embedded game data (recipes, icons, names) — src/data/game_data.js
src = rd('src/data/game_data.js')
L = {l.split(' = ')[0]: l for l in src.split('\n') if l.startswith(('const DATA = ', 'const ICONS = ', 'const L10N = '))}
ic = json.loads(L['const ICONS'][len('const ICONS = '):-1])
for f in glob.glob('xicons/*.png'):   # extra icons of our own: lifts, pipes, storage, transport
    ic[os.path.basename(f)[:-4]] = 'data:image/png;base64,' + base64.b64encode(open(f, 'rb').read()).decode()
def webp(v):
    if v.startswith('data:image/webp'): return v
    im = Image.open(io.BytesIO(base64.b64decode(v.split(',')[1])))
    if max(im.size) > 64: im = im.resize((64, 64), Image.LANCZOS)
    o = io.BytesIO(); im.save(o, 'WEBP', quality=90, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(o.getvalue()).decode()
icons = 'const ICONS = ' + json.dumps({k: webp(v) for k, v in ic.items()}, separators=(',', ':')) + ';'
line = L['const L10N']; i = line.index(', UI = '); j = line.rindex(';   //')
l10n = line[:i+7] + json.dumps(json.load(open('ui18n.json', encoding='utf-8')), ensure_ascii=False, separators=(',', ':')) + line[j:]

# map: resource nodes (game data 1.2.0, extracted by Konsl/satisfactory-world-generator) and coastline
W = json.load(open('src/data/world.json'))
PUR = {'RP_Inpure': 0.5, 'RP_Normal': 1, 'RP_Pure': 2}
types = sorted({n['resource'] for n in W['resourceNodes']} | {c['resource'] for c in W['frackingCores']})
nodes = [[types.index(n['resource']), PUR[n['purity']], round(n['location'][0]/100), round(n['location'][1]/100)] for n in W['resourceNodes']]
wells = [[types.index(c['resource']), PUR[s['purity']], round(s['location'][0]/100), round(s['location'][1]/100)] for c in W['frackingCores'] for s in c['satellites']]
outline = [[[round(x, 4), round(y, 4)] for x, y in p] for p in json.load(open('src/data/outline.json'))]
# terrain and heights — from an FModel export (tools/make_map.py): the game map image and contour lines every 25 m
HT = json.load(open('src/data/heights.json'))
relief = 'data:image/webp;base64,' + base64.b64encode(open('src/data/map_relief.webp', 'rb').read()).decode()
hmap = 'data:image/webp;base64,' + base64.b64encode(open('src/data/hmap.webp', 'rb').read()).decode()   # heights + island mask for WebGL
mapjs = 'const MAPDATA = ' + json.dumps({'v': W['gameVersion'], 'types': types, 'nodes': nodes, 'wells': wells, 'outline': outline,
  'relief': relief, 'hmap': hmap, 'hk': HT['k'], 'hb': HT['b'], 'iso': HT['lines'], 'hgrid': HT['grid'], 'hn': HT['n']}, separators=(',', ':')) + ';'

# modules
mods = [(m, json.load(open(f'src/views/{m}/module.json'))) for m in MODULES]
part = lambda m, f: rd(f'src/views/{m}/{f}') if os.path.exists(f'src/views/{m}/{f}') else ''
page = rd('src/core/page.html')
css = rd('src/core/base.css') + ''.join(part(m, 'style.css') for m, _ in mods)
tabs = ''.join(f'<button type="button" data-view="{j["view"]}" data-l="{j["label"]}"></button>' for _, j in mods)
views, slots = [], {}
for m, _ in mods:   # «# "<!--@INTO:name-->" — a fragment inserted into another view (Building draws on top of the Layout plan)
    h = part(m, 'view.html')
    if h.startswith('<!--@INTO:'): k = h[10:h.index('-->')]; slots[k] = slots.get(k, '') + h[h.index('-->')+3:]
    elif h: views.append(h)
views = '\n'.join(views)
for k, v in slots.items(): views = views.replace(f'<!--@SLOT:{k}-->', v)
js = rd('src/core/core.js').replace('const DATA = __DATA__;', L['const DATA']).replace('const ICONS = __ICONS__;', icons)
js = js.replace('const L10N = __L10N__, UI = __UI__;   // in-game localization names (Docs/*.json) + UI translations', l10n)
js += '\n' + mapjs + '\n' + ''.join(f'\n/* ===== module: {m} ===== */\n' + part(m, 'models.js') + part(m, 'script.js') for m, _ in mods) + '\n' + rd('src/core/init.js')
out = page.replace('/*@CSS*/', css).replace('<!--@TABS-->', tabs).replace('<!--@VIEWS-->', views).replace('//@JS', js)
for p in ('__DATA__', '__UI__', '__ICONS__', '@CSS', '@TABS', '@VIEWS', '//@JS', '@SLOT', '@INTO'): assert p not in out, p
open(OUT, 'w', encoding='utf-8').write(out)
print(len(out))
