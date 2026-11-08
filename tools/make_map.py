# Prepares map data from an FModel export (run by hand when the game updates):
#   Map_0-0…Map_1-1.png — the 2×2 game map (Interface/UI/Assets/MapTest/SlicedMap), HeightData_Test.hdr — heights (MapTest).
#   python3 tools/make_map.py <export folder>  →  src/data/map_relief.webp, src/data/heights.json
# Heights in the file are 8-bit (~3.5 m step); conversion to metres is fitted to 459 resource nodes of known height (median error ~7 m).
import sys, os, json, numpy as np
from PIL import Image, ImageEnhance
from skimage import measure
from scipy import ndimage
src = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'data')
X0, X1, Y0, Y1 = -3246.98832, 4253.01832, -3750, 3750           # game map bounds, m
# 1) base image: 2×2 stitch, dimmed for the dark theme
S = 1024; tiles = {'TL': (0, 0), 'TR': (1, 0), 'BL': (0, 1), 'BR': (1, 1)}
C = Image.new('RGB', (2*S, 2*S))
for name, (x, y) in tiles.items(): C.paste(Image.open(os.path.join(src, name + '.png')).convert('RGB').resize((S, S), Image.LANCZOS), (x*S, y*S))
CA = np.array(C).astype(int); WATER = (CA[..., 2] > CA[..., 0] + 30) & (CA[..., 1] > CA[..., 0] + 15)   # water on the game map is light blue
C = ImageEnhance.Color(C).enhance(.55); C = ImageEnhance.Brightness(C).enhance(.62); C = ImageEnhance.Contrast(C).enhance(1.08)
C.save(os.path.join(OUT, 'map_relief.webp'), 'WEBP', quality=72, method=6)
# 2) heights: RGBE decoding of the .hdr
b = open(os.path.join(src, 'HeightData_Test.hdr'), 'rb').read(); i = b.index(b'\n\n') + 2; j = b.index(b'\n', i)
H, W = [int(v) for v in b[i:j].split()[1::2]]; p = j + 1; img = np.zeros((H, W, 4), np.uint8)
for y in range(H):
    p += 4
    for c in range(4):
        x = 0
        while x < W:
            n = b[p]; p += 1
            if n > 128: n -= 128; img[y, x:x+n, c] = b[p]; p += 1
            else: img[y, x:x+n, c] = np.frombuffer(b[p:p+n], np.uint8); p += n
            x += n
e = img[..., 3].astype(np.int32); h = img[..., 0]*np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
# calibration against resource nodes
w = json.load(open(os.path.join(OUT, 'world.json')))
v, z = [], []
for nd in w['resourceNodes']:
    x, y, zz = nd['location']; r = int((y/100 - Y0)/(Y1 - Y0)*H); q = int((x/100 - X0)/(X1 - X0)*W)
    v.append(h[max(0, r-1):r+2, max(0, q-1):q+2].mean()); z.append(zz/100)
k, b0 = np.linalg.lstsq(np.vstack([v, np.ones(len(v))]).T, np.array(z), rcond=None)[0]
m = np.where(h > 0, k*h + b0, np.nan)                               # metres; outside the world — no data
# contour lines on the full grid (2048², ~3.7 m per cell): light smoothing only removes 8-bit "steps" (~3.5 m),
# simplification with ~1.5 m tolerance; coordinates are whole metres, delta-encoded (shorter JSON)
f = ndimage.gaussian_filter(np.nan_to_num(m, nan=np.nanmin(m)), 1.6)
mask = ndimage.binary_erosion(~np.isnan(m), iterations=3); f = np.where(mask, f, np.nan); R = f.shape[0]
# island only: keep a piece of line if more than half its points are on land (by the coastline, ~40 m margin) —
# otherwise the map shows fragments past the world edge and land outside the play area
from matplotlib.path import Path as MPath
LAND = [MPath(np.array(P)) for P in json.load(open(os.path.join(OUT, 'outline.json')))]
def on_land(xy):
    uv = np.array([((x - X0)/(X1 - X0), (y - Y0)/(Y1 - Y0)) for x, y in xy]); ins = np.zeros(len(uv), bool)
    for L in LAND: ins |= L.contains_points(uv, radius=.0053) | L.contains_points(uv, radius=-.0053)
    return ins.mean() > .5
lines = {}
for lv in range(0, 451, 25):
    L = []
    for cs in measure.find_contours(f, lv):
        P = measure.approximate_polygon(cs, .4)
        if len(P) < 4 or np.ptp(P[:, 0]) + np.ptp(P[:, 1]) < 6: continue   # tiny noise rings
        xy = [(round(X0 + (pt[1] + .5)/R*(X1 - X0)), round(Y0 + (pt[0] + .5)/R*(Y1 - Y0))) for pt in P]
        if not on_land(xy): continue
        d = [xy[0][0], xy[0][1]] + [v for i in range(1, len(xy)) for v in (xy[i][0] - xy[i-1][0], xy[i][1] - xy[i-1][1])]
        L.append(d)
    if L: lines[lv] = L
# texture for WebGL and routing: R — height as in the game (byte, metres = k·byte/256 + b), G — island (coastline mask),
# B — water (rivers, lakes, swamps; by the game map colour), 2048²,
# lossless WebP; the GPU does smoothing and contour lines
hb = np.clip(np.round(h*256), 0, 255).astype(np.uint8); uvx = (np.mgrid[0:H, 0:W][::-1].reshape(2, -1).T + .5)/[W, H]
mk = np.zeros(H*W, bool)
for L in LAND: mk |= L.contains_points(uvx, radius=.004) | L.contains_points(uvx, radius=-.004)
mk = mk.reshape(H, W) & (hb > 0)
Image.fromarray(np.dstack([hb, mk.astype(np.uint8)*255, (WATER & mk).astype(np.uint8)*255]), 'RGB').save(os.path.join(OUT, 'hmap.webp'), 'WEBP', lossless=True, method=6)
# 192×192 height grid for the "height here" hint (int16 in base64, m; -999 — no data)
import base64
N = 192; g = base64.b64encode(ndimage.zoom(np.nan_to_num(m, nan=-999), N/H, order=0).round().astype('<i2').tobytes()).decode()
json.dump({'k': k, 'b': b0, 'lines': lines, 'grid': g, 'n': N}, open(os.path.join(OUT, 'heights.json'), 'w'), separators=(',', ':'))
print('k=%.2f b=%.1f' % (k, b0), {lv: len(L) for lv, L in lines.items()}, os.path.getsize(os.path.join(OUT, 'map_relief.webp')))
