/* ---------- Map: game resource nodes and factory location ---------- */
// Coordinates are game-world metres (X — east, Y — south). Game map bounds (FGMapManager) — to align the coastline.
const MB = {x0: -3246.98832, x1: 4253.01832, y0: -3750, y1: 3750};
const MZ = {k: 1, x: 0, y: 0, fitted: false};
const MAPN = MAPDATA.nodes.map(([ti, p, x, y]) => ({it: MAPDATA.types[ti], p, x, y}))
  .concat(MAPDATA.wells.map(([ti, p, x, y]) => ({it: MAPDATA.types[ti], p, x, y, well: 1})));
// output of one node at 100%: miner of the chosen Mk, oil extractor, well (30/60/120)
const nodeRate = n => n.well ? 60*n.p : n.it === 'Desc_LiquidOil_C' ? 120*n.p : 60*{1:1,2:2,3:4}[S.mk]*n.p;
/* ---------- terrain routing: Dijkstra from the factory over a 512² grid (~15 m), 16 step directions ----------
   Step cost — length along the slope; steeper than the limit — forbidden (cliff) or, with construction, penalised (ramps/supports); water — forbidden or a bridge.
   Limits: rails — 1:3.375 (wiki, without beams); truck/tractor — an ESTIMATE from foundation ramps (25 % surface, 50 % with construction). */
const RT = {N: 512, ok: false, cache: {}};
(() => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'), W0 = im.naturalWidth; c.width = c.height = W0;
    const x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, W0, W0).data, N = RT.N, f = W0/N;
    RT.h = new Float32Array(N*N); RT.land = new Uint8Array(N*N); RT.water = new Uint8Array(N*N);
    for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) { let hs = 0, ln = 0, wt = 0;
      for (let i = 0; i < f; i++) for (let j = 0; j < f; j++) { const k = ((r*f + i)*W0 + q*f + j)*4; hs += d[k]; if (d[k + 1] > 127) ln++; if (d[k + 2] > 127) wt++; }
      const n = f*f, id = r*N + q; RT.h[id] = MAPDATA.hk*hs/n/256 + MAPDATA.hb; RT.land[id] = ln*2 >= n ? 1 : 0; RT.water[id] = wt*2 >= n ? 1 : 0; }
    RT.hf = new Uint8Array(W0*W0); RT.W0 = W0; for (let i = 0; i < W0*W0; i++) RT.hf[i] = d[i*4];   // full height map (bytes) — same as the on-screen terrain, for placing models
    RT.ok = true; if (S.view === 'map') render(); }; im.src = MAPDATA.hmap; })();
// 3D terrain surface height exactly as on screen: 640×640 mesh vertices (~12 m) from the same texture, triangles in between;
// in a narrow ravine the mesh surface is above the true floor — models sit on the mesh, otherwise the slope "eats" them
const hMesh = (x, y) => { const N = 640, u = (x - MB.x0)/(MB.x1 - MB.x0)*N, v = (y - MB.y0)/(MB.y1 - MB.y0)*N, c = Math.max(0, Math.min(N - 1, Math.floor(u))), r = Math.max(0, Math.min(N - 1, Math.floor(v))), fu = u - c, fv = v - r;
  const at = (a, b) => hGL(MB.x0 + a/N*(MB.x1 - MB.x0), MB.y0 + b/N*(MB.y1 - MB.y0)), h00 = at(c, r), h10 = at(c + 1, r), h01 = at(c, r + 1), h11 = at(c + 1, r + 1);
  return fu + fv <= 1 ? h00 + (h10 - h00)*fu + (h01 - h00)*fv : h11 + (h01 - h11)*(1 - fu) + (h10 - h11)*(1 - fv); };   // triangles (i, i+1, i+N+1) and (i+1, i+N+2, i+N+1)
// surface height as WebGL draws it (same texture and same 3×3 smoothing)
const hGL = (x, y) => { if (!RT.hf) return RT.ok ? hRT(x, y) : (heightAt(x, y) ?? 0); const W0 = RT.W0, u = (x - MB.x0)/(MB.x1 - MB.x0)*W0, v = (y - MB.y0)/(MB.y1 - MB.y0)*W0;
  const c = Math.max(1, Math.min(W0 - 2, Math.floor(u))), r = Math.max(1, Math.min(W0 - 2, Math.floor(v))), H = (a, b) => RT.hf[b*W0 + a];
  const sm = (4*H(c, r) + 2*(H(c + 1, r) + H(c - 1, r) + H(c, r + 1) + H(c, r - 1)) + H(c + 1, r + 1) + H(c - 1, r - 1) + H(c + 1, r - 1) + H(c - 1, r + 1))/16;
  return MAPDATA.hk*255/256*sm/255 + MAPDATA.hb; };
// one combined mode: on gentle ground — as is; steeper than the limit and water — with construction (ramps, supports, bridges), but costlier.
// Limits: rails 1:3.375 (wiki); vehicles — an ESTIMATE from foundation ramps (up to ~30 % on ground); belt — 50 %.
// step cost = length × cell multiplier + up × |climb| + over × (climb above the limit). Climb is linear: going around a hill
// pays off if it is high, while serpentines and loops on a slope save nothing (the height must be gained anyway) — so there are none.
const PROF = {veh: {g: .3, up: 1.5, over: 2, water: 4}, rail: {g: 1/3.375, up: 2, over: 3, water: 3}, belt: {g: .5, up: .5, over: 1, water: 2.5}};
const profOf = m => m === 'truck' || m === 'tractor' ? 'veh' : m === 'train' ? 'rail' : m === 'drone' ? null : 'belt';
const cellOf = (x, y) => { const N = RT.N; return Math.max(0, Math.min(N - 1, Math.floor((y - MB.y0)/(MB.y1 - MB.y0)*N)))*N + Math.max(0, Math.min(N - 1, Math.floor((x - MB.x0)/(MB.x1 - MB.x0)*N))); };
// height (m) at any point — bilinear on the routing grid (smoother than the hint grid)
const hRT = (x, y) => { const N = RT.N, u = (x - MB.x0)/(MB.x1 - MB.x0)*N - .5, v = (y - MB.y0)/(MB.y1 - MB.y0)*N - .5, q = Math.max(0, Math.min(N - 2, Math.floor(u))), r = Math.max(0, Math.min(N - 2, Math.floor(v))), fx = Math.min(1, Math.max(0, u - q)), fy = Math.min(1, Math.max(0, v - r)), h = RT.h;
  return h[r*N + q]*(1 - fx)*(1 - fy) + h[r*N + q + 1]*fx*(1 - fy) + h[(r + 1)*N + q]*(1 - fx)*fy + h[(r + 1)*N + q + 1]*fx*fy; };
// "clearance": distance (in cells) to the nearest obstacle — a cliff steeper than the limit, water, island edge (two-pass 3-4 chamfer)
function clearance(pk){ const key = 'cl:' + pk; if (RT.cache[key]) return RT.cache[key];
  const N = RT.N, cs = (MB.x1 - MB.x0)/N, g = PROF[pk].g, h = RT.h, d = new Float32Array(N*N);
  for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) { const i = r*N + q; let bad = !RT.land[i] || RT.water[i];
    if (!bad) for (const [a, b] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const rr = r + b, qq = q + a; if (rr < 0 || qq < 0 || rr >= N || qq >= N) continue; if (Math.abs(h[rr*N + qq] - h[i])/cs > g) { bad = true; break; } }
    d[i] = bad ? 0 : 1e9; }
  for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) { const i = r*N + q; if (!d[i]) continue; let v = d[i];
    if (q) v = Math.min(v, d[i - 1] + 1); if (r) { v = Math.min(v, d[i - N] + 1); if (q) v = Math.min(v, d[i - N - 1] + 1.41); if (q < N - 1) v = Math.min(v, d[i - N + 1] + 1.41); } d[i] = v; }
  for (let r = N - 1; r >= 0; r--) for (let q = N - 1; q >= 0; q--) { const i = r*N + q; if (!d[i]) continue; let v = d[i];
    if (q < N - 1) v = Math.min(v, d[i + 1] + 1); if (r < N - 1) { v = Math.min(v, d[i + N] + 1); if (q < N - 1) v = Math.min(v, d[i + N + 1] + 1.41); if (q) v = Math.min(v, d[i + N - 1] + 1.41); } d[i] = v; }
  return RT.cache[key] = d; }
const CLR = 5;   // keep ~5 cells (~70 m) from obstacles, closer is costlier: a vehicle goes around hills rather than scraping them
// cell multiplier: off the island — impossible, water — bridge, near an obstacle — costlier (computed once per transport type)
function cellMul(pk){ const key = 'mul:' + pk; if (RT.cache[key]) return RT.cache[key]; const P = PROF[pk], cl = clearance(pk), N = RT.N, mul = new Float32Array(N*N);
  for (let i = 0; i < N*N; i++) { let m = RT.land[i] ? 1 : Infinity; if (RT.water[i]) m *= P.water; const c = cl[i]; if (c < CLR) m *= 1 + 3*(1 - c/CLR)*(1 - c/CLR); mul[i] = m; }
  return RT.cache[key] = mul; }
// step cost a → b: length along the slope × (gentle is cheaper; steeper than the limit — ramps/supports) × cell multiplier
function stepCost(P, mul, a, b, dl){ const m0 = mul[b]; if (m0 === Infinity) return Infinity; const dh = Math.abs(RT.h[b] - RT.h[a]), ex = dh - P.g*dl;
  return Math.sqrt(dl*dl + dh*dh)*m0 + P.up*dh + (ex > 0 ? P.over*ex : 0); }
function routeField(pk){ return fieldAt(pk, S.mapPos); }
function fieldAt(pk, o){ const key = pk + ':' + o.x + ',' + o.y; if (!RT.cache[key]) { RT.cache[key] = dijkstra(pk, [cellOf(o.x, o.y)]); RT.cache[key].o = o; } return RT.cache[key]; }
// search from one or several cells at once (several — for suitability: distance to the nearest node from every point)
function dijkstra(pk, src){
  const P = PROF[pk], N = RT.N, cs = (MB.x1 - MB.x0)/N, mul = cellMul(pk), h = RT.h, g = P.g, up = P.up, ov = P.over;
  const cost = new Float32Array(N*N).fill(Infinity), len = new Float32Array(N*N), prev = new Int32Array(N*N).fill(-1), done = new Uint8Array(N*N);
  const D = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1],[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]].map(([a, b]) => [a, b, Math.hypot(a, b)*cs]);
  const hk = new Float32Array(N*N*2), hv = new Int32Array(N*N*2); let hn = 0;   // binary heap by cost
  const push = (k, v) => { let i = hn++; while (i) { const p2 = (i - 1) >> 1; if (hk[p2] <= k) break; hk[i] = hk[p2]; hv[i] = hv[p2]; i = p2; } hk[i] = k; hv[i] = v; };
  const pop = () => { const v = hv[0], k = hk[--hn], w = hv[hn]; let i = 0; for (;;) { let c = 2*i + 1; if (c >= hn) break; if (c + 1 < hn && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = k; hv[i] = w; return v; };
  src.forEach(s0 => { cost[s0] = 0; push(0, s0); });
  while (hn) { const a = pop(); if (done[a]) continue; done[a] = 1; const ar = (a/N) | 0, aq = a - ar*N;
    for (const [dq, dr, dl] of D) { const r = ar + dr, q = aq + dq; if (r < 0 || q < 0 || r >= N || q >= N) continue; const b = r*N + q; if (done[b]) continue;
      const m0 = mul[b]; if (m0 === Infinity) continue; const d0 = h[b] - h[a], dh = d0 < 0 ? -d0 : d0, ex = dh - g*dl, L = Math.sqrt(dl*dl + dh*dh);   // same cost as stepCost, inlined for speed
      const c = cost[a] + L*m0 + up*dh + (ex > 0 ? ov*ex : 0);
      if (c < cost[b]) { cost[b] = c; len[b] = len[a] + L; prev[b] = a; push(c, b); } } }
  return {cost, len, prev, P, mul, paths: {}};
}
// path to a point: cells by predecessors → straightening (a straight run if it costs no more) → corner rounding
// (Chaikin) → points every ~6 m with smooth height (moving average); over water and cliffs — like a bridge, straight between supports
function routePath(F, x, y){ const ck = x + ',' + y; if (F.paths[ck] !== undefined) return F.paths[ck];
  const N = RT.N, cs = (MB.x1 - MB.x0)/N; let c = cellOf(x, y), n = 0; if (!isFinite(F.cost[c])) return F.paths[ck] = null;
  const cells = []; while (c >= 0 && n++ < N*N) { cells.push(c); c = F.prev[c]; } cells.reverse();
  const xy = i => { const r = (i/N) | 0, q = i - r*N; return [MB.x0 + (q + .5)*cs, MB.y0 + (r + .5)*cs]; };
  // cost of a straight segment between cells i → j: step by half a cell and sum the same step cost
  const segCost = (i, j) => { const A = xy(i), B = xy(j), L = Math.hypot(B[0] - A[0], B[1] - A[1]), k = Math.max(1, Math.ceil(L/(cs*.7))); let sum = 0, pc = i;
    for (let s = 1; s <= k; s++) { const cc = cellOf(A[0] + (B[0] - A[0])*s/k, A[1] + (B[1] - A[1])*s/k); if (cc === pc) continue; const ra = (pc/RT.N) | 0, rb = (cc/RT.N) | 0, sc = stepCost(F.P, F.mul, pc, cc, Math.hypot(cc - rb*RT.N - (pc - ra*RT.N), rb - ra)*cs); if (!isFinite(sc)) return Infinity; sum += sc; pc = cc; } return sum; };
  const keep = [0]; let i = 0;
  while (i < cells.length - 1) { let best = i + 1;
    for (let j = Math.min(cells.length - 1, i + 32); j > i + 1; j--) { if (segCost(cells[i], cells[j]) <= (F.cost[cells[j]] - F.cost[cells[i]])*1.03 + 1) { best = j; break; } }
    keep.push(best); i = best; }
  let pts = keep.map(k => xy(cells[k])); pts[0] = [F.o.x, F.o.y]; pts[pts.length - 1] = [x, y];
  pts = unloop(pts);
  for (let it = 0; it < 3; it++) { const o = [pts[0]]; for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1]; o.push([a[0]*.75 + b[0]*.25, a[1]*.75 + b[1]*.25], [a[0]*.25 + b[0]*.75, a[1]*.25 + b[1]*.75]); } o.push(pts[pts.length - 1]); pts = o; }
  const out = []; for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.ceil(L/6));
    for (let s = 0; s < m; s++) out.push([a[0] + (b[0] - a[0])*s/m, a[1] + (b[1] - a[1])*s/m]); } out.push(pts[pts.length - 1]);
  let hh = out.map(([px, py]) => Math.max(0, hRT(px, py)));
  for (let it = 0; it < 3; it++) hh = hh.map((v, k) => { let s2 = 0, n2 = 0; for (let d = -4; d <= 4; d++) { const u = hh[k + d]; if (u !== undefined) { s2 += u; n2++; } } return Math.max(v - 2, s2/n2); });   // the road does not "shake" in height and goes no more than 2 m underground
  const res = out.map((q, k) => [q[0], q[1], hh[k]]); res.len = res.reduce((s2, q, k) => k ? s2 + Math.hypot(q[0] - res[k - 1][0], q[1] - res[k - 1][1], q[2] - res[k - 1][2]) : 0, 0);
  return F.paths[ck] = res; }
// remove loops: if the polyline crosses itself, the piece between the crossings is dropped
function unloop(P){ const X = (a, b, c, d) => { const r = [b[0] - a[0], b[1] - a[1]], s2 = [d[0] - c[0], d[1] - c[1]], den = r[0]*s2[1] - r[1]*s2[0]; if (Math.abs(den) < 1e-9) return null;
    const u = ((c[0] - a[0])*s2[1] - (c[1] - a[1])*s2[0])/den, v = ((c[0] - a[0])*r[1] - (c[1] - a[1])*r[0])/den; return u > 0 && u < 1 && v > 0 && v < 1 ? [a[0] + r[0]*u, a[1] + r[1]*u] : null; };
  for (let i = 0; i < P.length - 3; i++) for (let j = P.length - 2; j > i + 1; j--) { const q = X(P[i], P[i + 1], P[j], P[j + 1]); if (q) { P = [...P.slice(0, i + 1), q, ...P.slice(j + 1)]; break; } }
  return P; }
// nearest nodes that cover flow q; distance is weighted by what is taken from each node
// which nodes suit a resource: nitrogen — wells only; oil — regular nodes only (oil wells need resource well
// extractors and a pressurizer — not modelled yet)
const nodeOk = (n, it) => n.it === it && (it === 'Desc_NitrogenGas_C' ? n.well : it === 'Desc_LiquidOil_C' ? !n.well : true);
function mapPick(it, q){
  if (!S.mapPos || q <= 0 || it === 'Desc_Water_C') return null;
  // belt: just the nearest nodes (the player routes them as convenient — lifts, supports); vehicles, train, drones — one node cluster,
  // road only to its main node, neighbours (within CLU m) are fed to it by belt; the cluster is chosen by path cost and capacity
  const pk = profOf(trCfg(it, 'in').m), belt = pk === 'belt', F = pk && !belt && RT.ok ? routeField(pk) : null   /* belt — no pathfinding: straight line */, CLU = 450;
  const sd = n => Math.hypot(n.x - S.mapPos.x, n.y - S.mapPos.y), dd = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // imported from another site: road to it (nearest by path cost, while their output lasts)
  const imp = IMP.get(it); if (imp) { const L = imp.filter(o => o.pos).map(o => { const c = F ? cellOf(o.pos.x, o.pos.y) : 0, k = F ? F.cost[c] : sd(o.pos);
      return {x: o.pos.x, y: o.pos.y, it, site: o.i, rate: o.q, k, d: isFinite(k) && F ? F.len[c] : sd(o.pos)}; }).filter(n => isFinite(n.k)).sort((a, b) => a.k - b.k);
    if (!L.length) return imp.some(o => o.pos) ? {use: [], hubs: [], feed: [], d: 0, none: true} : null;
    const use = []; let got = 0, dw = 0; for (const n of L) { if (got >= q - 1e-6) break; const tk = Math.min(n.rate, q - got); use.push(n); got += tk; dw += tk*n.d; }
    return {use, hubs: use, feed: [], d: got > 0 ? dw/got : use[0].d, short: got < q - 1e-6, F, pk, sites: true}; }
  const pool = MAPN.filter(n => nodeOk(n, it)).map(n => { const c = F ? cellOf(n.x, n.y) : 0, rk = F ? F.cost[c] : sd(n);
    return {...n, d: isFinite(rk) ? (F ? F.len[c] : sd(n)) : sd(n), k: belt ? sd(n) : rk}; });
  const L = pool.filter(n => isFinite(n.k)).sort((a, b) => a.k - b.k);
  if (!L.length) return F ? {use: [], hubs: [], feed: [], d: 0, none: true} : null;
  const use = [], hubs = [], feed = [], taken = new Set(); let got = 0, dw = 0;
  if (belt) { for (const n of L) { if (got >= q - 1e-6) break; const take = Math.min(nodeRate(n), q - got); use.push(n); hubs.push(n); got += take; dw += take*n.d; } }
  else while (got < q - 1e-6) { const need = q - got; let best = null;
    for (const h of L.filter(n => !taken.has(n)).slice(0, 40)) {
      const cl = pool.filter(n => !taken.has(n) && dd(n, h) <= CLU).sort((a, b) => dd(a, h) - dd(b, h)), sel = []; let cap = 0, loc = 0;
      for (const n of cl) { if (cap >= need - 1e-6) break; const tk = Math.min(nodeRate(n), need - cap); sel.push(n); cap += tk; loc += tk*dd(n, h); }
      const sc = h.k + .5*loc/cap + 2500*Math.max(0, 1 - cap/need);   // shortfall — penalty: one cluster further away is better than three at opposite ends
      if (!best || sc < best.sc) best = {sc, h, sel, cap}; }
    if (!best) break;
    best.sel.forEach(n => { taken.add(n); use.push(n); if (n !== best.h) feed.push([n, best.h]); }); hubs.push(best.h); got += best.cap; dw += best.cap*best.h.d; }
  return {use, hubs, feed, d: got > 0 ? dw/got : use[0].d, short: got < q - 1e-6, F, pk};
}
// "Suitability" filter (terrain colouring): red — peaks and narrow highs, orange — steep slopes, blue — hollows and water,
// green — flat spots; the closer the needed raw resources (path cost to the nearest nodes for the transport), the greener, far away — yellower.
// Raw proximity: search from all nodes of each resource at once (`dijkstra`), summed with weight flow/normal node output; drones — straight line.
const SUIT = {key: '', cvs: null, ver: 0};
function suitField(){ const need = mapNeed(); delete need.Desc_Water_C; const ents = Object.entries(need);
  const key = JSON.stringify([ents.map(([it, q]) => [it, Math.round(q), trCfg(it, 'in').m]), S.mk, [...IMP.entries()].map(([it, L]) => [it, L.map(o => o.pos)]), RT.ok]);
  if (SUIT.key === key) return SUIT; if (!RT.ok) return SUIT; SUIT.key = key;
  const N = RT.N, cs = (MB.x1 - MB.x0)/N, h = RT.h, NN = N*N;
  // raw proximity 0…1 (1 — close)
  let near = null;
  if (ents.length) { const tot = new Float32Array(NN);
    for (const [it, q] of ents) { const imp = IMP.get(it);
      const src = imp ? imp.filter(o => o.pos).map(o => ({x: o.pos.x, y: o.pos.y})) : MAPN.filter(n => nodeOk(n, it));
      if (!src.length) continue; const w = imp ? 1 : Math.max(1, q/nodeRate({...src[0], p: 1})), pk = profOf(trCfg(it, 'in').m);
      if (pk) { const F = dijkstra(pk, src.map(n => cellOf(n.x, n.y))); for (let i = 0; i < NN; i++) tot[i] += w*F.cost[i]; }
      else { const P = src.map(n => [(n.x - MB.x0)/cs - .5, (n.y - MB.y0)/cs - .5]);
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { let m = Infinity; for (const [a2, b2] of P) { const d = (a2 - c)*(a2 - c) + (b2 - r)*(b2 - r); if (d < m) m = d; } tot[r*N + c] += w*Math.sqrt(m)*cs; } } }
    const fin = []; for (let i = 0; i < NN; i += 5) if (RT.land[i] && isFinite(tot[i])) fin.push(tot[i]); fin.sort((x, y) => x - y);
    if (fin.length) { const lo = fin[Math.floor(fin.length*.02)], hi = fin[Math.floor(fin.length*.5)]; near = new Float32Array(NN);
      for (let i = 0; i < NN; i++) near[i] = isFinite(tot[i]) ? Math.min(1, Math.max(0, 1 - (tot[i] - lo)/((hi - lo) || 1))) : 0; } }
  // terrain: slope and "bulge" above the mean in a ~300 m window (+ peak/ridge, − hollow)
  const blur = (A, R2) => { const T = new Float32Array(NN), O = new Float32Array(NN);
    for (let r = 0; r < N; r++) { let a2 = 0, n = 0; for (let c = -R2; c < N + R2; c++) { if (c + R2 < N) { a2 += A[r*N + c + R2]; n++; } if (c - R2 - 1 >= 0) { a2 -= A[r*N + c - R2 - 1]; n--; } if (c >= 0 && c < N) T[r*N + c] = a2/n; } }
    for (let c = 0; c < N; c++) { let a2 = 0, n = 0; for (let r = -R2; r < N + R2; r++) { if (r + R2 < N) { a2 += T[(r + R2)*N + c]; n++; } if (r - R2 - 1 >= 0) { a2 -= T[(r - R2 - 1)*N + c]; n--; } if (r >= 0 && r < N) O[r*N + c] = a2/n; } }
    return O; };
  const hs = blur(h, 1), mean = blur(blur(h, 10), 10);
  const cvs = SUIT.cvs || (SUIT.cvs = document.createElement('canvas')); cvs.width = cvs.height = N; const g = cvs.getContext('2d'), im = g.createImageData(N, N), D = im.data;
  const mix = (A, B, t) => [A[0] + (B[0] - A[0])*t, A[1] + (B[1] - A[1])*t, A[2] + (B[2] - A[2])*t];
  const RED = [.88, .16, .12], ORG = [.96, .55, .14], YEL = [.93, .83, .26], GRN = [.22, .82, .32], BLU = [.16, .38, .86], DEEP = [.08, .2, .62];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const i = r*N + c;
    const gx = (hs[r*N + Math.min(N - 1, c + 1)] - hs[r*N + Math.max(0, c - 1)])/(2*cs), gy = (hs[Math.min(N - 1, r + 1)*N + c] - hs[Math.max(0, r - 1)*N + c])/(2*cs);
    const sl = Math.min(1, Math.max(0, (Math.hypot(gx, gy) - .12)/.45)), pr = hs[i] - mean[i], up = Math.min(1, Math.max(0, (pr - 8)/32)), dn = Math.min(1, Math.max(0, (-pr - 8)/32));   // up to ~12 % slope — flat; bulge/hollow from 8 m
    let col = mix(YEL, GRN, near ? near[i] : .7);
    col = mix(col, ORG, sl); col = mix(col, RED, up); col = mix(col, BLU, dn); if (RT.water[i]) col = DEEP;
    D[i*4] = col[0]*255; D[i*4 + 1] = col[1]*255; D[i*4 + 2] = col[2]*255; D[i*4 + 3] = RT.land[i] ? 255 : 0; }
  g.putImageData(im, 0, 0); SUIT.ver++; if (GLM.ok) GLM.setSuit(cvs); else SUIT.url = cvs.toDataURL(); return SUIT; }
const mapNeed = () => last ? Object.fromEntries(Object.entries(last.bal).filter(([it, b]) => b < -EPS && solveRecipe(it) === 'raw').map(([it, b]) => [it, -b])) : {};
// logistics distance: raw delivery — from the chosen nodes to the factory
function mapDist(it, dir){ if (!S.mapPos || !last) return 0;
  if (dir === 'out') { const L = LINKS.filter(l => l.it === it && l.a === S.site && S.sites[l.b].pos); if (!L.length) return 0;   // shipping to another site — along the road to it
    let w = 0, s2 = 0; L.forEach(l => { const d = linkPath(l); if (d) { w += l.q; s2 += l.q*d.len; } }); return w ? Math.round(s2/w) : 0; }
  const p = mapPick(it, mapNeed()[it] || 0); return p && !p.none ? Math.round(p.d) : 0; }
// link road: from the receiver (its inbound transport type) to the supplier; drones — straight line; {pts | null, len}
function linkPath(l){ const A = S.sites[l.a].pos, B = S.sites[l.b].pos; if (!A || !B) return null;
  const m = (l.b === S.site ? S.tr : S.sites[l.b].tr)['in:' + l.it], mm = m ? m.m : (S.sites[l.a].tr['out:' + l.it] || {}).m, pk = profOf(lIn(mm || 'store'));
  if (!pk || pk === 'belt' || !RT.ok) return {pts: null, len: Math.hypot(A.x - B.x, A.y - B.y), belt: pk === 'belt'};
  const P2 = routePath(fieldAt(pk, B), A.x, A.y); return P2 ? {pts: P2, len: P2.len} : {pts: null, len: Math.hypot(A.x - B.x, A.y - B.y), none: true}; }

let MCLR = false;   // the "Clear map?" question is open
const mcol = palOf(MAPDATA.types);
// regions (biomes) on the wiki grid: 1.024 km squares, X0Y0 — south-west corner of the land; labels approximate, names as on the wiki
const RG = {x0: -3022.7, y0: 3107.3, c: 1024};
const REGIONS = [['Abyss Cliffs',5,1,5,1],['Blue Crater',4,0,4,1],['Crater Lakes',2,3,2,3],['Desert Canyons',3,4,4,4],['Dune Desert',5,3,6,5],['Eastern Dune Forest',3,1,4,1],
  ['Grass Fields',2,0,2,0],['Jungle Spires',1,1,1,1],['Lake Forest',3,3,3,3],['Maze Canyons',4,3,4,3],['Northern Forest',2,4,2,4],['Red Bamboo Fields',2,2,3,2],['Red Jungle',1,2,2,2],
  ['Rocky Desert',0,3,1,4],['Snaketree Forest',2,1,2,1],['Southern Forest',3,0,3,1],['Spire Coast',3,4,5,5],['Swamp',5,2,5,2],['Titan Forest',3,2,5,3],['Western Beaches',0,1,0,2],['Western Dune Forest',1,2,2,1]]
  .map(([n, a, b, c, d]) => ({n, x: RG.x0 + ((a + c)/2 + .5)*RG.c, y: RG.y0 - ((b + d)/2 + .5)*RG.c, w: (c - a + 1)*(d - b + 1)}))
  .sort((p, q) => q.w - p.w);   // when crowded, larger regions are labelled first
// what to show: resources (default — raw inputs of the plan), regions, grid; the choice is remembered
const ALLRES = [...new Set(MAPN.map(n => n.it))];
// height at a point (m) from the game-file grid; null — outside the world
const HG = (() => { const s = atob(MAPDATA.hgrid), a = new Int16Array(s.length/2); for (let i = 0; i < a.length; i++) a[i] = (s.charCodeAt(2*i) | s.charCodeAt(2*i + 1) << 8) << 16 >> 16; return a; })();
const heightAt = (x, y) => { const N = MAPDATA.hn, c = Math.floor((x - MB.x0)/(MB.x1 - MB.x0)*N), r = Math.floor((y - MB.y0)/(MB.y1 - MB.y0)*N);
  if (c < 0 || r < 0 || c >= N || r >= N) return null; const v = HG[r*N + c]; return v < -900 ? null : v; };
// contour lines: delta code → points → smooth curve (Catmull-Rom → cubic Bézier); major lines every 100 m
const isoPts = d => { const P = [[d[0], d[1]]]; for (let i = 2; i < d.length; i += 2) P.push([P[P.length - 1][0] + d[i], P[P.length - 1][1] + d[i + 1]]); return P; };
const smooth = P => { const n = P.length, cl = Math.hypot(P[0][0] - P[n - 1][0], P[0][1] - P[n - 1][1]) < 1.5, at = i => cl ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))];
  let d = `M${P[0][0]},${P[0][1]}`;
  for (let i = 0; i < n - 1; i++) { const p0 = at(i - 1), p1 = P[i], p2 = P[i + 1], p3 = at(i + 2);
    d += `C${(p1[0] + (p2[0] - p0[0])/6).toFixed(1)},${(p1[1] + (p2[1] - p0[1])/6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0])/6).toFixed(1)},${(p2[1] - (p3[1] - p1[1])/6).toFixed(1)} ${p2[0]},${p2[1]}`; }
  return d; };
const ISO = Object.entries(MAPDATA.iso).map(([lv, L]) => { const PP = L.map(isoPts);
  return {lv: +lv, major: +lv % 100 === 0, P: PP, d: PP.map(smooth).join(''), labs: PP.filter(P => P.length > 30).map(P => P[Math.floor(P.length/2)])}; });
const mapShown = need => S.mapRes ? new Set(S.mapRes) : new Set(Object.keys(need).length ? Object.keys(need).filter(it => ALLRES.includes(it)) : ALLRES);
function buildMap(){
  const need = mapNeed(), picks = {}; Object.entries(need).forEach(([it, q]) => { const p = mapPick(it, q); if (p) picks[it] = p; });
  if (!MZ.fitted) fitMap(); else mzKeep();   // icon size depends on zoom — fit the view first
  const used0 = new Set(Object.values(picks).flatMap(p => p.use.map(n => n.x + ',' + n.y))), s = 1/MZ.k, R = 15*s;   // mapPick returns copies of nodes — match by position
  const used = {has: n => used0.has(n.x + ',' + n.y)};
  const W = MB.x1 - MB.x0, H = MB.y1 - MB.y0, out = [];
  out.push(`<rect x="${MB.x0}" y="${MB.y0}" width="${W}" height="${H}" fill="transparent"/>`);
  const rel = S.mapRelief !== false;
  if (rel && !GLM.ok) out.push(`<image href="${MAPDATA.relief}" x="${MB.x0}" y="${MB.y0}" width="${W}" height="${H}" preserveAspectRatio="none"/>`);
  out.push(MAPDATA.outline.map(P => `<path class="land${rel || GLM.ok ? ' rl' : ''}" d="M${P.map(([u, v]) => (MB.x0 + u*W).toFixed(0) + ',' + (MB.y0 + v*H).toFixed(0)).join('L')}Z"/>`).join(''));
  // detail by zoom: from afar only major lines (100 m), closer — all every 25 m and labels of minor ones
  if (S.mapIso !== false) { const near = MZ.k >= .35, lab = near ? ISO : ISO.filter(L => L.major);
    if (!GLM.ok) ISO.forEach(L => { if (L.major || near) out.push(`<path class="iso${L.major ? ' mj' : ''}" d="${L.d}"/>`); });
    const seen = [], minD = 140*s;   // labels no closer than ~140 screen px to each other
    lab.forEach(L => L.labs.forEach(p => { if (seen.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < minD)) return; seen.push(p);
      out.push(`<text class="isol${L.major ? '' : ' mn'}" x="${p[0]}" y="${p[1]}" font-size="${10*s}" stroke-width="${3*s}">${L.lv} ${esc(t('meters'))}</text>`); })); }
  if (S.mapGrid !== false) { for (let i = 0; i <= 7; i++) out.push(`<path class="mgrid" d="M${RG.x0 + i*RG.c},${RG.y0 - 7*RG.c}V${RG.y0}"/>`); for (let j = 0; j <= 7; j++) out.push(`<path class="mgrid" d="M${RG.x0},${RG.y0 - j*RG.c}H${RG.x0 + 7*RG.c}"/>`);
    for (let i = 0; i < 7; i++) out.push(`<text class="mgl" x="${RG.x0 + (i + .5)*RG.c}" y="${RG.y0 + 26*s}" font-size="${11*s}">X${i}</text>`);
    for (let j = 0; j < 7; j++) out.push(`<text class="mgl" x="${RG.x0 - 16*s}" y="${RG.y0 - (j + .5)*RG.c}" font-size="${11*s}">Y${j}</text>`); }
  // region labels under the nodes, with a "halo" to read on any background; they don't shrink when zooming out
  if (S.mapPos) Object.entries(picks).forEach(([it, p]) => { if (!p.sites) (p.hubs || []).forEach(n => { const P2 = p.F ? routePath(p.F, n.x, n.y) : null;
    out.push(`<path class="route${P2 ? ' rd' : ''}" style="stroke:${mcol(it)}" d="M${(P2 || [[S.mapPos.x, S.mapPos.y], [n.x, n.y]]).map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L')}"/>`); });
    (p.feed || []).forEach(([a, b]) => out.push(`<path class="route fd" style="stroke:${mcol(it)}" d="M${a.x},${a.y}L${b.x},${b.y}"/>`)); });
  const SU = S.mapSuit ? suitField() : null;
  if (SU && !GLM.ok && SU.url) out.push(`<image class="mbest" href="${SU.url}" x="${MB.x0}" y="${MB.y0}" width="${MB.x1 - MB.x0}" height="${MB.y1 - MB.y0}" preserveAspectRatio="none" opacity=".75"/>`);
  const vis = mapShown(need), shown = MAPN.filter(n => vis.has(n.it) || used.has(n));   // nodes chosen for the factory are always visible
  const far = MZ.k < .22;   // whole island on screen — icons turn into dots, otherwise the map drowns in icons
  shown.slice().sort((a, b) => used.has(a) - used.has(b)).forEach(n => { const pip = n.p === 2 ? 3 : n.p === 1 ? 2 : 1;
    if (far && !used.has(n)) { out.push(`<circle class="ndot" cx="${n.x}" cy="${n.y}" r="${(2.5 + pip)*s}" style="fill:${mcol(n.it)}"><title>${esc(I[n.it].n)} · ${esc(t(n.p === 2 ? 'pure' : n.p === 1 ? 'normal' : 'impure'))}</title></circle>`); return; }
    out.push(`<g class="nd on${used.has(n) ? ' use' : ''}"><title>${esc(I[n.it].n)} · ${esc(t(n.p === 2 ? 'pure' : n.p === 1 ? 'normal' : 'impure'))}${n.well ? ' · ' + esc(M.Build_FrackingExtractor_C ? M.Build_FrackingExtractor_C.n : '') : ''}</title><circle class="ring" cx="${n.x}" cy="${n.y}" r="${R}"/><image href="${IU(n.it)}" x="${n.x - R*.72}" y="${n.y - R*.8}" width="${R*1.44}" height="${R*1.44}"/>${[...Array(pip)].map((_, i) => `<circle class="pip" cx="${n.x + (i - (pip - 1)/2)*5*s}" cy="${n.y + R*.72}" r="${1.7*s}"/>`).join('')}</g>`); });
  // regions above nodes; a long name on two lines; a label that would overlap an already placed one is skipped
  if (S.mapReg !== false) { const placed = [], fs = 12*s, lh = fs*1.15;
    REGIONS.forEach(r => { const words = r.n.split(' '), lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length/2)).join(' '), words.slice(Math.ceil(words.length/2)).join(' ')] : words;
      const w = Math.max(...lines.map(l => l.length))*fs*.72 + 8*s, h = lines.length*lh + 4*s, box = [r.x - w/2, r.y - h/2, r.x + w/2, r.y + h/2];
      if (placed.some(b => box[0] < b[2] && b[0] < box[2] && box[1] < b[3] && b[1] < box[3])) return; placed.push(box);
      out.push(`<text class="mreg" x="${r.x.toFixed(0)}" y="${(r.y - (lines.length - 1)*lh/2).toFixed(1)}" font-size="${fs}" stroke-width="${4*s}">${lines.map((l, i) => `<tspan x="${r.x.toFixed(0)}" dy="${i ? lh : 0}">${esc(l)}</tspan>`).join('')}<title>${esc(r.n)}</title></text>`); }); }
  const facG = (x, y, cls, attr) => { const f = 13*s; return `<g class="fac${cls}"${attr}><rect x="${x - f}" y="${y - f}" width="${2*f}" height="${2*f}" rx="${4*s}"/><path transform="translate(${x - f*.7} ${y - f*.7}) scale(${f*1.4/24})" d="M2 21V10l6 4V10l6 4V4h8v17z"/></g>`; };
  const facL = (x, y, i) => S.sites.length > 1 ? `<text class="mreg sitel" x="${x}" y="${y + 30*s}" font-size="${12*s}" stroke-width="${4*s}">${esc(siteName(i))}</text>` : '';
  // links between sites: the active site's links bright, others dimmer; item icon in the middle
  LINKS.forEach(l => { const d = linkPath(l); if (!d) return; const A = S.sites[l.a].pos, Bp = S.sites[l.b].pos, Q = d.pts || [[Bp.x, Bp.y], [A.x, A.y]], on = l.a === S.site || l.b === S.site, mid = Q[Math.floor(Q.length*(l.a < l.b ? .38 : .62))];   /* opposite links along one road — icons at different spots */
    out.push(`<path class="route lnk${d.pts ? ' rd' : ''}${on ? '' : ' dim'}" d="M${Q.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L')}"/>`);
    out.push(`<g class="lnkic${on ? '' : ' dim'}"><circle cx="${mid[0]}" cy="${mid[1]}" r="${11*s}"/><image href="${IU(l.it)}" x="${mid[0] - 8*s}" y="${mid[1] - 8*s}" width="${16*s}" height="${16*s}"/><title>${esc(I[l.it].n)}: ${esc(siteName(l.a))} → ${esc(siteName(l.b))}</title></g>`); });
  S.sites.forEach((o, i) => { if (i !== S.site && o.pos) out.push(facG(o.pos.x, o.pos.y, ' oth', ` data-site="${i}"`) + facL(o.pos.x, o.pos.y, i)); });
  if (S.mapPos) out.push(facG(S.mapPos.x, S.mapPos.y, '', '') + facL(S.mapPos.x, S.mapPos.y, S.site));
  document.getElementById('mvp').innerHTML = out.join('');
  // layer panel: resources (icons), regions, grid; purity legend; a hint until the factory is placed
  const tg = (on, attr, inner, ttl) => `<button type="button" class="mtg" ${attr} aria-pressed="${on}" title="${esc(ttl)}">${inner}</button>`;
  document.getElementById('mbar').innerHTML = `<div class="mrow">${tg(!S.map3d, 'data-m3="0"', '2D', '2D')}${tg(!!S.map3d, 'data-m3="1"', '3D', '3D')}<span class="msep"></span>${ALLRES.map(it => tg(vis.has(it), `data-mres="${it}" style="--c:${mcol(it)}"`, img(it, 24), I[it].n)).join('')}<span class="msep"></span>` +
    tg(S.mapRelief !== false, 'data-mlay="mapRelief"', esc(t('mapRelief')), t('mapRelief')) + tg(S.mapIso !== false, 'data-mlay="mapIso"', esc(t('mapIso')), t('mapIso')) + tg(S.mapReg !== false, 'data-mlay="mapReg"', esc(t('mapRegions')), t('mapRegions')) + tg(S.mapGrid !== false, 'data-mlay="mapGrid"', '#', t('mapGrid')) + tg(!!S.mapSuit, 'data-msuit', esc(t('mapSuit')), t('mapSuitT')) +
    `<span class="mleg" title="${esc(t('impure'))} / ${esc(t('normal'))} / ${esc(t('pure'))}">● ${esc(t('impure'))} ●● ${esc(t('normal'))} ●●● ${esc(t('pure'))}</span></div>` +
    (S.mapPos ? '' : `<div class="mhint">${esc(t('mapNote'))}</div>`) +
    // clear map: remove all sites from the map (the solver goes back to global purity); asked right on the panel
    (S.sites.some((o, i) => i === S.site ? S.mapPos : o.pos) ? `<div class="mrow mclr">${MCLR ? `<span class="mclq">${esc(t('mapClearQ'))}</span><button type="button" class="mtg wd dng" data-mclr="yes">${esc(t('yes'))}</button><button type="button" class="mtg wd" data-mclr="no">${esc(t('no'))}</button>`
      : `<button type="button" class="mtg wd" data-mclr="ask" title="${esc(t('mapClearT'))}">${esc(t('mapClear'))}</button>`}</div>` : '');
  // scale bar: a round length of ~90 screen px
  { const m = 90/MZ.k, L = [100, 200, 500, 1000, 2000].find(v => v >= m*.6) || 2000; document.getElementById('mscale').innerHTML = `<i style="width:${(L*MZ.k).toFixed(0)}px"></i>${L >= 1000 ? fmt(L/1000) + ' ' + esc(t('km')) : L + ' ' + esc(t('meters'))}`; }
  // list: what is brought from where, how many nodes, distance
  const ml = document.getElementById('mlist'), rowsM = Object.entries(picks);
  const fh = S.mapPos ? heightAt(S.mapPos.x, S.mapPos.y) : null;
  ml.hidden = !rowsM.length;
  const noR = Object.entries(need).filter(([it]) => picks[it] && picks[it].none).map(([it]) => it);
  ml.hidden = ml.hidden && !noR.length;
  ml.innerHTML = rowsM.map(([it, p]) => `<div class="mr">${img(it, 26)}<span><span class="pu">${p.sites ? '⌂ ' + p.use.map(n => esc(siteName(n.site))).join(', ') : [2, 1, .5].map(pp => { const c = p.use.filter(n => n.p === pp).length; return c ? `${pp === 2 ? '●●●' : pp === 1 ? '●●' : '●'}×${c}` : ''; }).filter(Boolean).join('  ')}</span>${p.short ? ` <span class="pu">· ${esc(t(p.sites ? 'mapShortSite' : 'mapShort'))}</span>` : ''}${(() => { const lo = !p.none && logi(it, need[it] || 0, 'in'); return lo && lo.over ? ` <span class="pu wrn" title="${esc(t('trRangeT'))}">⚠ ${esc(t('trRangeBad'))} ${fmt(lo.maxD/1000, 1)} ${esc(t('km'))}</span>` : ''; })()}</span><b>${p.none ? esc(t('mapNoRoute')) : fmt(p.d, 0) + ' ' + esc(t('meters'))}</b></div>`).join('');
  applyMZ();
  // 3D: canvas on top, SVG hidden; scale bar and "height under cursor" — 2D only
  const c3 = document.getElementById('m3d'); c3.hidden = !S.map3d; document.getElementById('wmap').style.visibility = S.map3d ? 'hidden' : '';
  document.getElementById('mscale').hidden = !!S.map3d; document.getElementById('mhgt').hidden = !!S.map3d;
  if (S.map3d) { M3.picks = picks; draw3M(); } else { document.getElementById('m3tip').hidden = true; if (GLM.ok) GLM.draw2D(); }
}
function applyMZ(){ document.getElementById('mvp').setAttribute('transform', `translate(${MZ.x},${MZ.y}) scale(${MZ.k})`); if (GLM.ok && !S.map3d && S.view === 'map') GLM.draw2D(); }
function fitMap(){ const r = document.getElementById('wmap').getBoundingClientRect(); if (!r.width) return; MZ.fitted = true;
  const x0 = MB.x0 + (MB.x1 - MB.x0)*.02, x1 = MB.x0 + (MB.x1 - MB.x0)*.99, y0 = MB.y0 + (MB.y1 - MB.y0)*.05, y1 = MB.y0 + (MB.y1 - MB.y0)*.93;
  const top = Math.min(110, (document.getElementById('mbar').offsetHeight || 60) + 18), bot = 36;   // top — under the layer panel, bottom — X axis labels
  MZ.k = Math.min((r.width - 30)/(x1 - x0), (r.height - top - bot)/(y1 - y0)); MZ.x = (r.width - (x1 - x0)*MZ.k)/2 - x0*MZ.k; MZ.y = top + (r.height - top - bot - (y1 - y0)*MZ.k)/2 - y0*MZ.k; MZ.sz = [r.width, r.height]; applyMZ(); }
// the window was resized (including while the map was hidden) — keep centre and zoom
function mzKeep(){ const r = document.getElementById('wmap').getBoundingClientRect(); if (!r.width || !MZ.fitted) return; if (MZ.sz && (MZ.sz[0] !== r.width || MZ.sz[1] !== r.height)) { MZ.x += (r.width - MZ.sz[0])/2; MZ.y += (r.height - MZ.sz[1])/2; } MZ.sz = [r.width, r.height]; }
// zoom: icon size in screen pixels is constant — redraw after zooming (at most once per frame)
let mzRaf = 0; const reMap = () => { if (!mzRaf) mzRaf = requestAnimationFrame(() => { mzRaf = 0; buildMap(); }); };
function zoomMZ(f, cx, cy){ const k = Math.min(3, Math.max(.03, MZ.k*f)); MZ.x = cx - (cx - MZ.x)*k/MZ.k; MZ.y = cy - (cy - MZ.y)*k/MZ.k; MZ.k = k; applyMZ(); reMap(); }
(() => {
  const svg = document.getElementById('wmap'), pts = new Map(); let lastP = null, pinch = null, moved = 0;
  svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomMZ(Math.exp(-e.deltaY*(e.ctrlKey ? .01 : .0015)), e.clientX - r.left, e.clientY - r.top); }, {passive: false});
  svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); lastP = [e.clientX, e.clientY]; moved = 0;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0]-b[0], a[1]-b[1]); moved = 99; } });
  svg.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a[0]-b[0], a[1]-b[1]), r = svg.getBoundingClientRect(); zoomMZ(d/pinch, (a[0]+b[0])/2 - r.left, (a[1]+b[1])/2 - r.top); pinch = d; return; }
    const dx = e.clientX - lastP[0], dy = e.clientY - lastP[1]; moved += Math.abs(dx) + Math.abs(dy); lastP = [e.clientX, e.clientY];
    if (moved > 4) { svg.classList.add('drag'); MZ.x += dx; MZ.y += dy; applyMZ(); } });
  // a short press without dragging — place the factory at this point
  const up = e => { const was = pts.has(e.pointerId); pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (pts.size) { lastP = [...pts.values()][0]; return; } svg.classList.remove('drag');
    if (was && moved <= 4 && e.type === 'pointerup') { const hit = document.elementFromPoint(e.clientX, e.clientY), sg = hit && hit.closest('[data-site]');
      if (sg) { siteGo(+sg.dataset.site); return; }
      const r = svg.getBoundingClientRect(); S.mapPos = {x: Math.round((e.clientX - r.left - MZ.x)/MZ.k), y: Math.round((e.clientY - r.top - MZ.y)/MZ.k)}; render(); } };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('pointermove', e => { if (pts.size) return; const r = svg.getBoundingClientRect(), x = (e.clientX - r.left - MZ.x)/MZ.k, y = (e.clientY - r.top - MZ.y)/MZ.k, v = heightAt(x, y);
    document.getElementById('mhgt').textContent = v === null ? '' : `↕ ${v} ${t('meters')}`; });
  svg.addEventListener('pointerleave', () => { document.getElementById('mhgt').textContent = ''; });
  document.querySelector('[data-mz]').parentElement.addEventListener('click', e => { const b = e.target.closest('[data-mz]'); if (!b) return; const r = svg.getBoundingClientRect();
    if (S.map3d) { const f = b.dataset.mz === 'in' ? 1.25 : .8;   // in 3D the buttons control the camera
      if (b.dataset.mz === 'fit') { M3.yaw = -.6; M3.pitch = .8; M3.fitted = false; } else { const f2 = zf3(f); M3.ox = r.width/2 - (r.width/2 - M3.ox)*f2; M3.oy = r.height/2 - (r.height/2 - M3.oy)*f2; M3.k *= f2; }
      draw3M(); return; }
    if (b.dataset.mz === 'fit') { fitMap(); reMap(); } else zoomMZ(b.dataset.mz === 'in' ? 1.3 : .77, r.width/2, r.height/2); });
  // on window resize — same centre and zoom (shift by half the difference), without refitting
  window.addEventListener('resize', () => { if (S.view === 'map' && !S.map3d) { mzKeep(); applyMZ(); } });
  // toggling resources and layers
  document.getElementById('mbar').addEventListener('click', e => { const r = e.target.closest('[data-mres]'), l = e.target.closest('[data-mlay]');
    if (r) { const cur = [...mapShown(mapNeed())], it = r.dataset.mres; S.mapRes = cur.includes(it) ? cur.filter(x => x !== it) : [...cur, it]; render(); }
    if (l) { const k = l.dataset.mlay; S[k] = S[k] === false; render(); }
    if (e.target.closest('[data-msuit]')) { S.mapSuit = !S.mapSuit; render(); }
    const cl = e.target.closest('[data-mclr]'); if (cl) { const v = cl.dataset.mclr; MCLR = v === 'ask'; if (v === 'yes') { S.mapPos = null; S.sites.forEach(o => { o.pos = null; }); } render(); }
    const m3 = e.target.closest('[data-m3]'); if (m3) { S.map3d = m3.dataset.m3 === '1'; render(); } });
})();
/* ---------- WebGL terrain (2D and 3D): the GPU smooths heights, draws hillshade, contour lines and occlusion ----------
   Contours are computed per screen pixel from height, so the interval adapts to zoom (100 → 25 → 10 → 5 m),
   and in 3D the depth buffer hides what is behind hills; distant parts fade into haze. Without WebGL2 the old canvas drawing remains. */
const GLM = (() => {
  const cv = document.getElementById('mgl'); let g = null;
  try { g = cv.getContext('webgl2', {antialias: true, premultipliedAlpha: false, alpha: true}); } catch(e) {}
  if (!g) return {ok: false};
  const sh = (t, src) => { const o = g.createShader(t); g.shaderSource(o, src); g.compileShader(o); if (!g.getShaderParameter(o, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(o)); return o; };
  const prog = (vs, fs) => { const p = g.createProgram(); g.attachShader(p, sh(g.VERTEX_SHADER, vs)); g.attachShader(p, sh(g.FRAGMENT_SHADER, fs)); g.linkProgram(p); if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p)); return p; };
  const HEAD = `#version 300 es
precision highp float;
uniform sampler2D uH; uniform float uKK, uB;
float hr(vec2 u){ return texture(uH, u).r; }
float hs(vec2 u){ vec2 d = vec2(1.6/2048.);   // 3×3 smoothing — removes the "steps" of 8-bit heights (~3.5 m)
  return (4.*hr(u) + 2.*(hr(u+vec2(d.x,0.))+hr(u-vec2(d.x,0.))+hr(u+vec2(0.,d.y))+hr(u-vec2(0.,d.y))) + hr(u+d)+hr(u-d)+hr(u+vec2(d.x,-d.y))+hr(u+vec2(-d.x,d.y)))/16.; }
float hm(vec2 u){ return uKK*hs(u) + uB; }
`;
  // 3D: 640×640 mesh (~12 m) over the whole map, height read from the texture in the vertex shader; same projection as the canvas (proj3M)
  const VS3 = HEAD + `
in vec2 aUV; uniform vec4 uMB; uniform vec3 uC; uniform vec4 uCam; uniform vec4 uView; uniform vec2 uWH; uniform float uEX;
out vec2 vUV; out float vD; out float vH;
void main(){ vUV = aUV; vH = hm(aUV); float X = uMB.x + aUV.x*uMB.z - uC.x, Z = uMB.y + aUV.y*uMB.w - uC.z, Y = max(0., vH)*uEX - uC.y;
  float x = X*uCam.x - Z*uCam.y, z = X*uCam.y + Z*uCam.x;
  float sx = x*uView.z + uView.x, sy = (-Y*uCam.z + z*uCam.w)*uView.z + uView.y; vD = z*uCam.z + Y*uCam.w;
  gl_Position = vec4(sx/uWH.x*2. - 1., 1. - sy/uWH.y*2., -vD/30000., 1.); }`;
  // 2D: one rectangle over the whole map in screen coordinates (like the SVG: x = X·k + offset)
  const VS2 = HEAD + `
in vec2 aUV; uniform vec4 uMB; uniform vec3 uT; uniform vec2 uWH; out vec2 vUV; out float vD; out float vH;
void main(){ vUV = aUV; vD = 0.; vH = 0.; float sx = (uMB.x + aUV.x*uMB.z)*uT.z + uT.x, sy = (uMB.y + aUV.y*uMB.w)*uT.z + uT.y;
  gl_Position = vec4(sx/uWH.x*2. - 1., 1. - sy/uWH.y*2., 0., 1.); }`;
  const FS = HEAD + `
in vec2 vUV; in float vD; in float vH; out vec4 o;
// height for contours in the overview: mip level by zoom +2 — tiny rings are not drawn (fragment shader only)
float hl(vec2 u){ return uKK*texture(uH, u, 2.).r + uB; }
uniform sampler2D uR, uS; uniform float uMode, uRel, uIso, uExS, uSuit; uniform vec4 uA; uniform vec2 uFog;
// a line fades where one pixel covers more than ~a third of the interval (steep slopes from afar) — otherwise "grain" instead of lines
float ln(float m, float I, float w){ float fw = max(fwidth(m), 1e-4), f = abs(fract(m/I - .5) - .5)*I, d = f/fw; return (1. - smoothstep(w*.5, w*.5 + 1., d))*(1. - smoothstep(I*.18, I*.4, fw)); }
void main(){
  vec4 t = texture(uH, vUV); if (t.g < .5 || t.r < .01) { if (uMode > .5) discard; o = vec4(0.); return; }
  float m = hm(vUV), e = 3./2048., s = 3.*7500./2048.;   // hillshade over a 3-cell step — without 8-bit height "noise"
  float hx = (hm(vUV + vec2(e, 0.)) - hm(vUV - vec2(e, 0.)))/(2.*s)*uExS, hz = (hm(vUV + vec2(0., e)) - hm(vUV - vec2(0., e)))/(2.*s)*uExS;
  vec3 n = normalize(vec3(-hx, 1., -hz)), L = normalize(vec3(-.55, .65, -.52)); float lam = max(0., dot(n, L)), u = clamp(m/400., 0., 1.);
  vec3 col = mix(vec3(.05, .11, .20), vec3(.26, .45, .70), u)*(.3 + .85*lam);          // hologram: higher is lighter
  vec4 rl = texture(uR, vUV); if (uRel > .5) col = mix(col, rl.rgb*(uMode > .5 ? .55 + .6*lam : .75 + .25*lam), uMode > .5 ? .45 : .9);
  if (uSuit > .5) { vec3 sc = texture(uS, vUV).rgb; col = sc*(uMode > .5 ? .38 + .75*lam : .55 + .5*lam); }   // "Suitability": colour by slope/bulge/raw, same hillshade
  float a = uMode > .5 || uRel > .5 || uSuit > .5 ? 1. : .0;                             // 2D without the base image — lines only
  // on nearly flat ground (slope < ~1%) lines are not drawn — they "jitter" from data noise and mean nothing
  if (uIso > .5) { float ml = uA.x < .5 ? hl(vUV) : uMode > .5 ? vH : (uA.y < .5 ? mix(hl(vUV), m, uA.x) : m), fl = smoothstep(.004, .02, length(vec2(hx, hz))/uExS);
    float l = ln(ml, 100., 1.7)*(ml < 50. ? .45 : 1.)*fl, l2 = max(max(ln(ml, 25., 1.1)*uA.x*.6, ln(ml, 10., .85)*uA.y*.4), ln(ml, 5., .7)*uA.z*.28)*fl;   // finer interval — thinner and paler
    vec3 lc = uSuit > .5 ? col*.35 : mix(vec3(.45, .66, .95), vec3(.82, .93, 1.), u); float k = clamp(l*(uMode > .5 ? .95 : .8) + l2, 0., 1.);
    col = mix(col, lc, k); a = max(a, k); }
  if (uMode > .5) { float f = clamp((vD - uFog.x)/(uFog.y - uFog.x), 0., 1.); col = mix(vec3(.035, .045, .065), col, .25 + .75*f); }   // distance haze
  o = vec4(col, a); }`;
  let P3, P2;
  try { P3 = prog(VS3, FS); P2 = prog(VS2, FS); } catch(e) { console.warn(e); return {ok: false}; }
  // 3D mesh
  const N = 640, uv = new Float32Array((N + 1)*(N + 1)*2), idx = new Uint32Array(N*N*6);
  for (let r = 0, k = 0; r <= N; r++) for (let c = 0; c <= N; c++) { uv[k++] = c/N; uv[k++] = r/N; }
  for (let r = 0, k = 0; r < N; r++) for (let c = 0; c < N; c++) { const i = r*(N + 1) + c; idx.set([i, i + 1, i + N + 1, i + 1, i + N + 2, i + N + 1], k); k += 6; }
  const vao3 = g.createVertexArray(); g.bindVertexArray(vao3);
  let b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b); g.bufferData(g.ARRAY_BUFFER, uv, g.STATIC_DRAW);
  let loc = g.getAttribLocation(P3, 'aUV'); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
  b = g.createBuffer(); g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, b); g.bufferData(g.ELEMENT_ARRAY_BUFFER, idx, g.STATIC_DRAW);
  const vao2 = g.createVertexArray(); g.bindVertexArray(vao2);
  b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b); g.bufferData(g.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), g.STATIC_DRAW);
  loc = g.getAttribLocation(P2, 'aUV'); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
  g.bindVertexArray(null);
  // textures: heights (linear filtering — smooth slopes) and the game map image
  const tex = (unit, src, cb) => { const t = g.createTexture(), im = new Image(); im.onload = () => { g.activeTexture(g.TEXTURE0 + unit); g.bindTexture(g.TEXTURE_2D, t);
      g.pixelStorei(g.UNPACK_COLORSPACE_CONVERSION_WEBGL, g.NONE); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, im);
      g.generateMipmap(g.TEXTURE_2D); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE); R.n++; cb(); }; im.src = src; return t; };
  const R = {ok: true, n: 0, cv, g};
  tex(0, MAPDATA.hmap, () => R.redraw && R.redraw()); tex(1, MAPDATA.relief, () => R.redraw && R.redraw());
  const size = () => { const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1, w = Math.round(r.width*d), h = Math.round(r.height*d); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } return r; };
  const common = (P, mode, k) => { g.useProgram(P);
    g.uniform1i(g.getUniformLocation(P, 'uH'), 0); g.uniform1i(g.getUniformLocation(P, 'uR'), 1); g.uniform1i(g.getUniformLocation(P, 'uS'), 2);
    g.uniform1f(g.getUniformLocation(P, 'uSuit'), S.mapSuit && R.suit ? 1 : 0);
    g.uniform1f(g.getUniformLocation(P, 'uKK'), MAPDATA.hk*255/256); g.uniform1f(g.getUniformLocation(P, 'uB'), MAPDATA.hb);
    g.uniform4f(g.getUniformLocation(P, 'uMB'), MB.x0, MB.y0, MB.x1 - MB.x0, MB.y1 - MB.y0);
    g.uniform1f(g.getUniformLocation(P, 'uMode'), mode); g.uniform1f(g.getUniformLocation(P, 'uRel'), S.mapRelief !== false ? 1 : 0); g.uniform1f(g.getUniformLocation(P, 'uIso'), S.mapIso !== false ? 1 : 0);
    // minor lines by zoom (k — screen pixels per metre): 25 m → 10 m → 5 m, fading in smoothly
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a)/(b - a))); return t*t*(3 - 2*t); };
    g.uniform4f(g.getUniformLocation(P, 'uA'), ss(.13, .24, k), ss(.6, 1.1, k), ss(1.7, 2.8, k), 0); };
  R.draw2D = () => { if (R.n < 2) return; const r = size(); g.viewport(0, 0, cv.width, cv.height); g.disable(g.DEPTH_TEST); g.enable(g.BLEND); g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
    g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT); common(P2, 0, MZ.k);
    g.uniform1f(g.getUniformLocation(P2, 'uExS'), 2); g.uniform2f(g.getUniformLocation(P2, 'uWH'), r.width, r.height); g.uniform3f(g.getUniformLocation(P2, 'uT'), MZ.x, MZ.y, MZ.k);
    g.bindVertexArray(vao2); g.drawArrays(g.TRIANGLE_STRIP, 0, 4); g.bindVertexArray(null); };
  R.draw3D = () => { if (R.n < 2) return; const r = size(); g.viewport(0, 0, cv.width, cv.height); g.enable(g.DEPTH_TEST); g.depthFunc(g.LESS); g.disable(g.BLEND);
    g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT); common(P3, 1, M3.k);
    const cy = Math.cos(M3.yaw), sy = Math.sin(M3.yaw), cp = Math.cos(M3.pitch), sp = Math.sin(M3.pitch);
    g.uniform3f(g.getUniformLocation(P3, 'uC'), ...M3.c); g.uniform4f(g.getUniformLocation(P3, 'uCam'), cy, sy, cp, sp);
    g.uniform4f(g.getUniformLocation(P3, 'uView'), M3.ox, M3.oy, M3.k, 0); g.uniform2f(g.getUniformLocation(P3, 'uWH'), r.width, r.height);
    g.uniform1f(g.getUniformLocation(P3, 'uEX'), M3.EX); g.uniform1f(g.getUniformLocation(P3, 'uExS'), M3.EX);
    // haze: from the far edge of the island to the near one
    const ds = [[-3023, -3282], [4141, -3282], [-3023, 3105], [4141, 3105]].map(([x, z]) => { x -= M3.c[0]; z -= M3.c[2]; return (x*sy + z*cy)*cp; });
    g.uniform2f(g.getUniformLocation(P3, 'uFog'), Math.min(...ds), Math.max(...ds));
    g.bindVertexArray(vao3); g.drawElements(g.TRIANGLES, idx.length, g.UNSIGNED_INT, 0); g.bindVertexArray(null); };
  // "Suitability" texture (512², from suitField) — on unit 2
  R.setSuit = c => { if (!R.suit) R.suit = g.createTexture(); g.activeTexture(g.TEXTURE2); g.bindTexture(g.TEXTURE_2D, R.suit); g.pixelStorei(g.UNPACK_COLORSPACE_CONVERSION_WEBGL, g.NONE);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, c); g.generateMipmap(g.TEXTURE_2D); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE); };
  // models (vehicles) share the terrain depth buffer: hills hide them
  const VSM = `#version 300 es
precision highp float;
in vec3 aP; in vec3 aN; in float aT; uniform vec3 uC, uSz; uniform vec4 uCam, uView, uI; uniform vec2 uWH; uniform float uPt; out vec3 vN; out float vT; out float vD;
void main(){ float c = cos(uI.w), s = sin(uI.w), cp = cos(uPt), sp = sin(uPt); vec3 p = aP*uSz; p = vec3(p.x, p.y*cp + p.z*sp, -p.y*sp + p.z*cp); vec3 m = vec3(aN.x, aN.y*cp + aN.z*sp, -aN.y*sp + aN.z*cp);   // tilt along the slope, then turn to the heading
  vec3 q = vec3(p.x*c + p.z*s, p.y, -p.x*s + p.z*c); vN = vec3(m.x*c + m.z*s, m.y, -m.x*s + m.z*c); vT = aT;
  float X = uI.x + q.x - uC.x, Y = uI.y + q.y - uC.y, Z = uI.z + q.z - uC.z, x = X*uCam.x - Z*uCam.y, z = X*uCam.y + Z*uCam.x;
  float sx = x*uView.z + uView.x, sy = (-Y*uCam.z + z*uCam.w)*uView.z + uView.y; vD = z*uCam.z + Y*uCam.w;
  gl_Position = vec4(sx/uWH.x*2. - 1., 1. - sy/uWH.y*2., -vD/30000. - .00015, 1.); }`;
  const FSM = `#version 300 es
precision highp float;
in vec3 vN; in float vT; in float vD; uniform vec3 uCol; uniform vec2 uFog; out vec4 o;
void main(){ vec3 n = normalize(vN), L = normalize(vec3(-.55, .65, -.52)); float l = max(0., dot(n, L)), rim = pow(1. - abs(n.y), 2.)*.25;
  vec3 c = uCol*(.55 + .75*l + rim)*vT; float f = clamp((vD - uFog.x)/(uFog.y - uFog.x), 0., 1.); o = vec4(mix(vec3(.035, .045, .065), c, .35 + .65*f), 1.); }`;
  let PM = null; try { PM = prog(VSM, FSM); } catch(e) { console.warn(e); }
  const meshes = new Map();   // mesh → {vao, n}
  const upload = m => { if (meshes.has(m)) return meshes.get(m); const vao = g.createVertexArray(); g.bindVertexArray(vao);
    [['aP', m.p, 3], ['aN', m.n, 3], ['aT', m.t, 1]].forEach(([nm, arr, k]) => { const b2 = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b2); g.bufferData(g.ARRAY_BUFFER, arr, g.STATIC_DRAW);
      const l2 = g.getAttribLocation(PM, nm); if (l2 >= 0) { g.enableVertexAttribArray(l2); g.vertexAttribPointer(l2, k, g.FLOAT, false, 0, 0); } });
    const ib = g.createBuffer(); g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, ib); g.bufferData(g.ELEMENT_ARRAY_BUFFER, m.i, g.STATIC_DRAW); g.bindVertexArray(null);
    const o = {vao, n: m.i.length, type: m.i instanceof Uint32Array ? g.UNSIGNED_INT : g.UNSIGNED_SHORT}; meshes.set(m, o); return o; };
  // items: [{m: mesh, x, y (already ×EX), z, yaw, s, col: [r,g,b]}]
  R.drawModels = items => { if (!PM || !items.length) return; const r = cv.getBoundingClientRect(); g.useProgram(PM); g.enable(g.DEPTH_TEST); g.depthFunc(g.LESS);
    const cy = Math.cos(M3.yaw), sy = Math.sin(M3.yaw), cp = Math.cos(M3.pitch), sp = Math.sin(M3.pitch), U = nm => g.getUniformLocation(PM, nm);
    g.uniform3f(U('uC'), ...M3.c); g.uniform4f(U('uCam'), cy, sy, cp, sp); g.uniform4f(U('uView'), M3.ox, M3.oy, M3.k, 0); g.uniform2f(U('uWH'), r.width, r.height);
    const ds = [[-3023, -3282], [4141, -3282], [-3023, 3105], [4141, 3105]].map(([x, z]) => { x -= M3.c[0]; z -= M3.c[2]; return (x*sy + z*cy)*cp; }); g.uniform2f(U('uFog'), Math.min(...ds), Math.max(...ds));
    items.forEach(it => { const o = upload(it.m); g.uniform4f(U('uI'), it.x, it.y, it.z, it.yaw); g.uniform3f(U('uSz'), ...it.sz); g.uniform1f(U('uPt'), it.pt || 0); g.uniform3f(U('uCol'), ...(it.col || [1, .86, .55]));
      g.bindVertexArray(o.vao); g.drawElements(g.TRIANGLES, o.n, o.type, 0); }); g.bindVertexArray(null); };
  R.clear = () => { g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT); };
  return R;
})();
GLM.redraw = () => S.view === 'map' && (S.map3d ? draw3M() : GLM.draw2D());

/* ---------- 3D map view: contours at their own height (holographic style, like the 3D building) ---------- */
// height stretched ×1.5 (~440 m relief over 7.5 km: unstretched the terrain is almost flat, more — distortion shows from the side); markers — only the factory and its nodes
const M3 = {yaw: -.6, pitch: .8, k: 1, ox: 0, oy: 0, fitted: false, EX: 1.5, busy: 0, c: [559, 150, -88], img: null, hits: [], hov: null, picks: {}};
// surface: 120×120 grid from game heights (bilinear + smoothing), land only (by the coastline), hillshade —
// light from the north-west above; cell colour is computed once
const makeSurf = N => { const src = MAPDATA.hn, W = MB.x1 - MB.x0, H = MB.y1 - MB.y0, M1 = N + 1;
  const at = (r, c) => { const v = HG[Math.max(0, Math.min(src - 1, r))*src + Math.max(0, Math.min(src - 1, c))]; return v < -900 ? NaN : v; };
  let h = new Float32Array(M1*M1);
  for (let r = 0; r <= N; r++) for (let c = 0; c <= N; c++) { const y = r/N*src - .5, x = c/N*src - .5, r0 = Math.floor(y), c0 = Math.floor(x), fy = y - r0, fx = x - c0;
    const v = at(r0, c0)*(1 - fx)*(1 - fy) + at(r0, c0 + 1)*fx*(1 - fy) + at(r0 + 1, c0)*(1 - fx)*fy + at(r0 + 1, c0 + 1)*fx*fy; h[r*M1 + c] = Math.max(-25, v); }
  const h2 = new Float32Array(M1*M1);   // 3×3 smoothing — removes the "steps" of 8-bit heights
  for (let r = 0; r <= N; r++) for (let c = 0; c <= N; c++) { let sm = 0, n = 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const v = h[Math.max(0, Math.min(N, r + i))*M1 + Math.max(0, Math.min(N, c + j))]; if (!isNaN(v)) { sm += v; n++; } } h2[r*M1 + c] = n ? sm/n : NaN; }
  h = h2;
  // land: cell centre inside the coastline (with half a cell margin — the shore is not clipped)
  const polys = MAPDATA.outline.map(P => ({P, x0: Math.min(...P.map(p => p[0])), x1: Math.max(...P.map(p => p[0])), y0: Math.min(...P.map(p => p[1])), y1: Math.max(...P.map(p => p[1]))}));
  const inside = (u, v) => polys.some(o => { if (u < o.x0 || u > o.x1 || v < o.y0 || v > o.y1) return false; let k = false; const P = o.P;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > v) !== (P[j][1] > v) && u < (P[j][0] - P[i][0])*(v - P[i][1])/(P[j][1] - P[i][1]) + P[i][0]) k = !k; return k; });
  const cw = W/N, chh = H/N, L = [-.55, .65, -.52], ln = Math.hypot(...L), q = [], e = .5/N;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const i = r*M1 + c, a = h[i], b = h[i + 1], d = h[i + M1], f = h[i + M1 + 1];
    if ([a, b, d, f].some(isNaN)) continue;
    const u = (c + .5)/N, v = (r + .5)/N; if (!inside(u, v) && !inside(u - e, v) && !inside(u + e, v) && !inside(u, v - e) && !inside(u, v + e)) continue;
    const dx = ((b + f) - (a + d))/2/cw*2, dz = ((d + f) - (a + b))/2/chh*2, nl = Math.hypot(dx, 1, dz), sh = Math.max(0, (-dx*L[0] + L[1] - dz*L[2])/nl/ln);
    const hu = Math.min(1, Math.max(0, (a + b + d + f)/4/400)), k = .25 + .75*sh;   // lighter — higher and towards the light
    q.push({c, r, col: `rgb(${Math.round((14 + 30*hu)*k + 8)},${Math.round((30 + 55*hu)*k + 12)},${Math.round((52 + 90*hu)*k + 20)})`}); }
  return {N, h, cw, chh, q}; };
const SURF = makeSurf(120), SURF_FAST = makeSurf(84);   // full and slightly sparser — while the camera moves (all lines remain)
// screen point → terrain point: in orthographic view the ray is straight; refine the height on the terrain a few times
function unproj3M(sx, sy){ const cy = Math.cos(M3.yaw), sy0 = Math.sin(M3.yaw), cp = Math.cos(M3.pitch), sp = Math.sin(M3.pitch), [cx, cyy, cz] = M3.c;
  const x = (sx - M3.ox)/M3.k; let Y = 0, X = 0, Z = 0;
  for (let i = 0; i < 8; i++) { const z = ((sy - M3.oy)/M3.k + (Y - cyy)*cp)/sp; X = x*cy + z*sy0 + cx; Z = -x*sy0 + z*cy + cz; const h = heightAt(X, Z); Y = Math.max(0, h ?? 0)*M3.EX; }
  return [X, Y, Z]; }
function proj3M(){ const cy = Math.cos(M3.yaw), sy = Math.sin(M3.yaw), cp = Math.cos(M3.pitch), sp = Math.sin(M3.pitch), [cx, cyy, cz] = M3.c;
  return (X, Y, Z) => { X -= cx; Y -= cyy; Z -= cz; const x = X*cy - Z*sy, z = X*sy + Z*cy; return [x*M3.k + M3.ox, (-Y*cp + z*sp)*M3.k + M3.oy, z*cp + Y*sp]; }; }
function fit3M(){ const cv = document.getElementById('m3d'), r = cv.getBoundingClientRect(); if (!r.width) return; M3.k = 1; M3.ox = 0; M3.oy = 0; const P = proj3M(), ps = [];
  for (const x of [-3023, 4141]) for (const y of [0, 430*M3.EX]) for (const z of [-3282, 3105]) ps.push(P(x, y, z));
  const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]); M3.k = Math.min((r.width - 40)/(Math.max(...xs) - Math.min(...xs)), (r.height - 90)/(Math.max(...ys) - Math.min(...ys)));
  M3.ox = r.width/2 - (Math.max(...xs) + Math.min(...xs))/2*M3.k; M3.oy = 40 + r.height/2 - (Math.max(...ys) + Math.min(...ys))/2*M3.k; M3.fitted = true; M3.kFit = M3.k; }
// 3D zoom limits: from half of "fit" to ×60 (beyond — emptiness or a mess of pixels)
const zf3 = f => { const a = (M3.kFit || M3.k)*.5, b = (M3.kFit || M3.k)*60; return Math.min(b/M3.k, Math.max(a/M3.k, f)); };
// while the camera moves — a lighter picture; full one 160 ms after it stops
const busy3M = () => { if (GLM.ok) return; M3.busy = 1; clearTimeout(M3.idle); M3.idle = setTimeout(() => { M3.busy = 0; draw3M(); }, 160); };
// 3D contours: without tiny rings (narrow rock spires — the smoothed surface doesn't follow them, rings would "hang" in the air)
const surfH = (x, z) => { const {N, h} = SURF, c = Math.round((x - MB.x0)/(MB.x1 - MB.x0)*N), r = Math.round((z - MB.y0)/(MB.y1 - MB.y0)*N); return h[Math.max(0, Math.min(N, r))*(N + 1) + Math.max(0, Math.min(N, c))]; };
// …and without rings that would hang more than 30 m above the smoothed surface (sharp peaks)
const ISO3 = ISO.map(L => ({...L, P: L.P.filter(Q => { const xs = Q.map(p => p[0]), zs = Q.map(p => p[1]);
  if (Math.max(...xs) - Math.min(...xs) + Math.max(...zs) - Math.min(...zs) <= 100) return false;
  const sh = surfH(xs.reduce((a, b) => a + b, 0)/xs.length, zs.reduce((a, b) => a + b, 0)/zs.length); return isNaN(sh) || L.lv - sh < 30; })}));
// ===== vehicles on routes: position by time, only the WebGL layer animates =====
const vWalk = Q => { const c = [0]; for (let k = 1; k < Q.length; k++) c.push(c[k - 1] + Math.hypot(Q[k][0] - Q[k - 1][0], Q[k][1] - Q[k - 1][1])); return {Q, c, L: c[c.length - 1]}; };
// point on the path at distance d: coordinates, path height (m), heading along the tangent
const vAt = (W, d) => { d = Math.max(0, Math.min(W.L, d)); let lo = 0, hi = W.c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (W.c[m] <= d) lo = m; else hi = m; }
  const a = W.Q[lo], b = W.Q[hi] || a, u = (d - W.c[lo])/((W.c[hi] - W.c[lo]) || 1); return {x: a[0] + (b[0] - a[0])*u, z: a[1] + (b[1] - a[1])*u, h: a[2] + (b[2] - a[2])*u, yaw: Math.atan2(b[0] - a[0], b[1] - a[1])}; };
// ground under the vehicle — like the on-screen terrain mesh (highest in the footprint), so the box doesn't "sink" into the slope
const vGnd = (x, z, r) => { let m = -1e9; for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) m = Math.max(m, hMesh(x + dx, z + dz)); return Math.max(0, m); };
// frame: all vehicles of all tracks at time t (ms); vehicles move evenly along the path, from supplier to receiver
function vehFrame(t){ const out = [], EX = M3.EX, px = 14; (M3.tracks || []).forEach(T => { const V = VEH[T.m === 'train' ? 'loco' : T.m]; if (!V) return;
    const sc = Math.max(1, px/(M3.k*V.L)), go = t/1000*V.v, col = T.fl ? [.55, .85, 1] : [1, .84, .52];
    const put = (d, D) => { if (d < 0 || d > T.W.L) return; const p = vAt(T.W, d), p2 = vAt(T.W, Math.min(T.W.L, d + 3));
      const y = T.air ? p.h*EX : (vGnd(p.x, p.z, 4) + .3)*EX, pt = T.air ? 0 : -Math.atan2((p2.h - p.h)*EX, 3);
      out.push({m: BOX, x: p.x, y, z: p.z, yaw: p.yaw, pt, sz: [D.W*sc, D.H*sc, D.L*sc], col}); };
    for (let k = 0; k < T.n; k++) { const d = ((go + k*T.W.L/T.n) % T.W.L + T.W.L) % T.W.L;
      if (T.m === 'train') { put(d, VEH.loco); for (let j = 0; j < T.nw; j++) put(d - (j + 1)*16.8*sc, VEH.wagon); } else put(d, V); } });
  return out; }
// animation: while the 3D map is open and there are vehicles — redraw only WebGL (terrain + vehicles), ~30 fps
function vehAnim(){ if (M3.anim || !GLM.ok) return; let last = 0;
  const step = ts => { if (S.view !== 'map' || !S.map3d || !(M3.tracks || []).length || document.hidden) { M3.anim = 0; return; }
    if (ts - last > 33 && !M3.rot) { last = ts; GLM.draw3D(); GLM.drawModels(vehFrame(ts)); } M3.anim = requestAnimationFrame(step); };
  M3.anim = requestAnimationFrame(step); }
// how many vehicles on a site link (as in logi, by the link output)
const linkVeh = (l, m, len) => { const T0 = TRM[m]; if (!T0) return null; const fl = I[l.it].f !== 's', cap = fl ? T0.l : T0.s*stackOf(l.it), T = 2*len/T0.v + T0.dock, n = Math.max(1, Math.ceil(l.q*T/cap - 1e-9));
  return {veh: m === 'train' ? [0, [0, 0, n]] : [[0, 0, n]]}; };
function draw3M(){
  const cv = document.getElementById('m3d'), r = cv.getBoundingClientRect(); if (cv.hidden || !r.width) return;
  if (!M3.fitted) fit3M();
  const dpr = devicePixelRatio || 1; if (cv.width !== Math.round(r.width*dpr) || cv.height !== Math.round(r.height*dpr)) { cv.width = Math.round(r.width*dpr); cv.height = Math.round(r.height*dpr); }
  const g = cv.getContext('2d'), P = proj3M(), EX = M3.EX, HL = 'rgba(150,205,255,', W = MB.x1 - MB.x0, H = MB.y1 - MB.y0;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height); g.lineJoin = 'round'; g.lineCap = 'round';
  // terrain surface ("Terrain" button): cells far to near, with hillshade — so slope shapes read well
  if (GLM.ok) GLM.draw3D();
  if (!GLM.ok && S.mapRelief !== false) { const {N, h, cw, chh, q} = M3.busy ? SURF_FAST : SURF, V = new Array((N + 1)*(N + 1));
    for (let r = 0; r <= N; r++) for (let c = 0; c <= N; c++) { const i = r*(N + 1) + c; if (!isNaN(h[i])) V[i] = P(MB.x0 + c*cw, Math.max(0, h[i])*EX, MB.y0 + r*chh); }
    const L2 = q.map(o => { const i = o.r*(N + 1) + o.c, a = V[i], b = V[i + 1], d = V[i + N + 1], e = V[i + N + 2]; return {o, a, b, d, e, z: a[2] + b[2] + d[2] + e[2]}; }).sort((x, y) => x.z - y.z);
    g.lineWidth = .7;   // a stroke in the same colour closes gaps between cells
    L2.forEach(({o, a, b, d, e}) => { g.fillStyle = g.strokeStyle = o.col; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(e[0], e[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill(); if (!M3.busy) g.stroke(); }); }
  // shore — at sea level, dim (it almost matches the 0 m line)
  if (!GLM.ok) { g.strokeStyle = HL + '.22)'; g.lineWidth = 1; g.beginPath();
  MAPDATA.outline.forEach(Q => Q.forEach(([u, v], i) => { const p = P(MB.x0 + u*W, 0, MB.y0 + v*H); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }));
  g.stroke(); }
  // contours bottom-up: each at its own height; major ones (100 m) brighter
  // colour by height (dark blue low, light blue peaks); distant pieces dimmer — so volume reads
  const dz = []; [[-3023, -3282], [4141, -3282], [-3023, 3105], [4141, 3105]].forEach(([x, z]) => dz.push(P(x, 0, z)[2]));
  const z0 = Math.min(...dz), z1 = Math.max(...dz);
  // lines in batches: 4 depth bands per level — one stroke per band instead of one per piece
  if (!GLM.ok) ISO3.forEach(L => { const u = Math.min(1, L.lv/400), col = `rgba(${Math.round(70 + 130*u)},${Math.round(125 + 105*u)},${Math.round(210 + 45*u)},`, a0 = L.lv === 0 ? .18 : L.major ? .8 : .42;
    g.lineWidth = L.major && L.lv ? 1.5 : 1; const band = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    L.P.forEach(Q => { let pth = null; Q.forEach(([x, z], i) => { const p = P(x, L.lv*EX + 1.5, z);
      if (!i) { const dd = Math.min(1, Math.max(0, (p[2] - z0)/((z1 - z0) || 1))); pth = band[Math.min(3, Math.floor(dd*4))]; pth.moveTo(p[0], p[1]); } else pth.lineTo(p[0], p[1]); }); });
    band.forEach((pth, bi) => { g.strokeStyle = col + (a0*(.35 + .65*(bi + .5)/4)).toFixed(3) + ')'; g.stroke(pth); }); });
  // routes and markers on "legs": the factory and the nodes chosen for it
  M3.hits = []; const pins = [], hAt = (x, z) => Math.max(0, heightAt(x, z) ?? 0)*EX;
  // is the point visible: walk from it towards the camera (orthographic — the ray has one direction) and check the terrain is not above the ray
  const cp = Math.cos(M3.pitch), sp = Math.sin(M3.pitch), vx = Math.sin(M3.yaw)*cp, vz = Math.cos(M3.yaw)*cp, dt = 14/Math.max(cp, .05), HM = (RT.hmax ||= RT.ok ? RT.h.reduce((m, v) => v > m ? v : m, 0) : 0)*EX;
  const seen = (x, z, y) => { if (!RT.ok) return true; for (let t2 = dt; ; t2 += dt) { const X = x + vx*t2, Z = z + vz*t2, Y = y + sp*t2; if (Y > HM || X < MB.x0 || X > MB.x1 || Z < MB.y0 || Z > MB.y1) return true; if (Math.max(0, hRT(X, Z))*EX > Y + 4*EX) return false; } };
  // line through points [x, z, y(m)]: draw only visible pieces
  const line = Q => { g.beginPath(); let on = false; Q.forEach(([x, z, y]) => { const Y = (y + 2)*EX; if (!seen(x, z, Y)) { on = false; return; } const q = P(x, Y, z); on ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); on = true; }); g.stroke(); };
  const drape = (a, b) => { const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)/8)); return [...Array(n + 1)].map((_, i) => { const x = a.x + (b.x - a.x)*i/n, z = a.y + (b.y - a.y)*i/n; return [x, z, RT.ok ? Math.max(0, hRT(x, z)) : (heightAt(x, z) ?? 0)]; }); };
  const used = new Set();
  // vehicles on routes: tracks (path from supplier to receiver + vehicle count); position by time is computed by vehFrame()
  const tracks = [], addTrack = (Q, m, n, nw, air, fl) => { if (Q && Q.length > 1 && n > 0) tracks.push({W: vWalk(Q), m, n: Math.min(12, n), nw: Math.min(8, nw || 0), air, fl}); };
  const trackOf = (Q, m, o, fl) => { if (!o || !o.veh) return; if (m === 'train') addTrack(Q, m, 1, (o.veh[1] || [0, 0, 1])[2], false, fl); else addTrack(Q, m, o.veh[0][2], 0, m === 'drone', fl); };
  // drone arc: points from supplier a to receiver b, height in metres (y/EX)
  const arc = (a, b) => { const ha = hAt(a.x, a.y), hb = hAt(b.x, b.y), dl = Math.hypot(b.x - a.x, b.y - a.y), top = Math.max(ha, hb) + Math.min(400, 60 + dl*.08)*EX;
    return [...Array(41)].map((_, i) => { const u = i/40; return [a.x + (b.x - a.x)*u, a.y + (b.y - a.y)*u, ((1 - u)*ha + u*hb + (top - Math.max(ha, hb))*Math.sin(Math.PI*u)**.5)/EX]; }); };
  if (S.mapPos) { const fp = [S.mapPos.x, hAt(S.mapPos.x, S.mapPos.y), S.mapPos.y];
    Object.entries(M3.picks).forEach(([it, p]) => { g.save(); g.strokeStyle = mcol(it); g.lineWidth = 2;
      if (!p.sites) (p.hubs || []).forEach(n => { const P2 = p.F ? routePath(p.F, n.x, n.y) : null;
        const m0 = trCfg(it, 'in').m, o0 = TRM[m0] ? logi(it, (mapNeed()[it] || 0)/(p.hubs.length || 1), 'in') : null;
        if (P2) { line(P2); trackOf(P2.slice().reverse(), m0, o0, I[it].f !== 's'); }   // the path is built from the factory to the node — vehicles drive from the node to the factory   // road follows the terrain smoothly; hidden behind hills
        else if (p.pk === 'belt') { g.setLineDash([6, 5]); line(drape({x: S.mapPos.x, y: S.mapPos.y}, n)); g.setLineDash([]); }   // belt — straight over the terrain
        else { if (m0 === 'drone') trackOf(arc(n, {x: fp[0], y: fp[2]}), 'drone', o0); g.setLineDash([6, 5]); g.beginPath(); const dl = Math.hypot(n.x - fp[0], n.y - fp[2]), top = Math.max(fp[1], hAt(n.x, n.y)) + Math.min(400, 60 + dl*.08)*EX;   // drone: take-off, straight flight over the terrain, landing
          for (let i = 0; i <= 24; i++) { const u = i/24, x = fp[0] + (n.x - fp[0])*u, z = fp[2] + (n.y - fp[2])*u, y = (1 - u)*fp[1] + u*hAt(n.x, n.y) + (top - Math.max(fp[1], hAt(n.x, n.y)))*Math.sin(Math.PI*u)**.5;
            const q = P(x, y, z); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); } g.stroke(); g.setLineDash([]); } });
      g.lineWidth = 1.3; g.setLineDash([3, 4]); (p.feed || []).forEach(([a, b]) => line(drape(a, b))); g.restore();   // feeding from neighbouring cluster nodes
      p.use.forEach(n => { used.add(n.x + ',' + n.y); if (n.site !== undefined) return; pins.push({p: P(n.x, hAt(n.x, n.y), n.y), stem: 26, ic: n.it, s: '', tip: `${I[n.it].n} · ${t(n.p === 2 ? 'pure' : n.p === 1 ? 'normal' : 'impure')}`}); }); });
    pins.push({p: P(...fp), stem: 50, fac: 1, s: S.sites.length > 1 ? '⌂ ' + siteName(S.site) : '⌂', tip: ''}); }
  LINKS.forEach(l => { const d = linkPath(l); if (!d) return; const on = l.a === S.site || l.b === S.site; g.save(); g.strokeStyle = on ? 'rgba(255,214,150,.95)' : 'rgba(255,214,150,.45)'; g.lineWidth = on ? 2.2 : 1.6;
    if (d.pts) { line(d.pts); const c0 = (l.b === S.site ? S.tr : S.sites[l.b].tr)['in:' + l.it], m = c0 ? c0.m : lIn((S.sites[l.a].tr['out:' + l.it] || {}).m || 'store');
      const o = linkVeh(l, m, d.len); trackOf(d.pts.slice().reverse(), m, o, I[l.it].f !== 's'); }   // the path goes from receiver to supplier; vehicles drive the other way
    else if (d.belt) { g.setLineDash([6, 5]); line(drape(S.sites[l.b].pos, S.sites[l.a].pos)); } else { const A = S.sites[l.a].pos, B = S.sites[l.b].pos; trackOf(arc(A, B), 'drone', linkVeh(l, 'drone', d.len)); g.setLineDash([6, 5]); g.beginPath(); for (let i = 0; i <= 24; i++) { const u = i/24, x = B.x + (A.x - B.x)*u, z = B.y + (A.y - B.y)*u, y = (1 - u)*hAt(B.x, B.y) + u*hAt(A.x, A.y) + Math.min(400, 60 + Math.hypot(A.x - B.x, A.y - B.y)*.08)*EX*Math.sin(Math.PI*u)**.5; const q = P(x, y, z); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); } g.stroke(); }
    g.restore(); });
  M3.tracks = tracks; if (GLM.ok) GLM.drawModels(vehFrame(performance.now())); vehAnim();
  S.sites.forEach((o, i) => { if (i !== S.site && o.pos) pins.push({p: P(o.pos.x, hAt(o.pos.x, o.pos.y), o.pos.y), stem: 40, fac: 2, s: '⌂ ' + siteName(i), tip: siteName(i), site: i}); });
  // other nodes (as in 2D, by resource buttons) — small squares with an icon; hidden behind terrain
  { const vis = mapShown(mapNeed()), ics = M3.ics ||= {}, sm = [];
    MAPN.forEach(n => { if (!vis.has(n.it) || used.has(n.x + ',' + n.y)) return; const y = hAt(n.x, n.y); if (!seen(n.x, n.y, y + 2*EX)) return; sm.push({n, p: P(n.x, y, n.y)}); });
    const far = M3.k < .3;   // whole island on screen — dots instead of icons, as in 2D
    sm.sort((a, b) => a.p[2] - b.p[2]).forEach(({n, p}) => { const [x, y] = p, top = y - 10, w = 18, bx = x - w/2, by = top - w;
      if (far) { const r2 = 1.6 + (n.p === 2 ? 3 : n.p === 1 ? 2 : 1)*.6; g.fillStyle = mcol(n.it); g.globalAlpha = .9; g.beginPath(); g.arc(x, y - 2, r2, 0, 7); g.fill(); g.globalAlpha = 1;
        M3.hits.push({r: [x - 4, y - 6, x + 4, y + 2], tip: `${I[n.it].n} · ${t(n.p === 2 ? 'pure' : n.p === 1 ? 'normal' : 'impure')}`}); return; }
      g.strokeStyle = mcol(n.it); g.globalAlpha = .85; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x, top); g.stroke();
      g.fillStyle = 'rgba(14,18,26,.82)'; g.beginPath(); g.roundRect ? g.roundRect(bx, by, w, w, 4) : g.rect(bx, by, w, w); g.fill(); g.stroke();
      let im = ics[n.it]; if (!im) { im = ics[n.it] = new Image(); im.onload = () => draw3M(); im.src = IU(n.it); } if (im.complete && im.naturalWidth) g.drawImage(im, bx + 2, by + 2, 14, 14);
      const pip = n.p === 2 ? 3 : n.p === 1 ? 2 : 1; g.fillStyle = 'rgba(200,225,255,.95)'; for (let i = 0; i < pip; i++) { g.beginPath(); g.arc(x + (i - (pip - 1)/2)*4, by + w + 3, 1.3, 0, 7); g.fill(); }
      g.globalAlpha = 1; M3.hits.push({r: [bx, by, bx + w, by + w], tip: `${I[n.it].n} · ${t(n.p === 2 ? 'pure' : n.p === 1 ? 'normal' : 'impure')}`}); }); }
  g.font = '600 12px ' + getComputedStyle(document.body).getPropertyValue('--f-mono');
  pins.sort((a, b) => (a.fac === 1) - (b.fac === 1) || a.p[2] - b.p[2]).forEach(pn => { const [x, y] = pn.p, top = y - pn.stem, hov = M3.hov === pn.tip + '@' + Math.round(pn.p[0]) + ',' + Math.round(pn.p[1]);
    const fc = pn.fac === 1 ? 'rgba(255,240,210,.9)' : pn.fac === 2 ? 'rgba(255,240,210,.5)' : pn.fac === 3 ? 'rgba(150,240,160,.95)' : HL + '.9)';
    g.strokeStyle = fc; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, top); g.stroke();
    g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill();
    const icw = pn.ic ? 20 : 0, tw = pn.s ? g.measureText(pn.s).width : 0, w = pn.s ? icw + tw + (icw ? 12 : 10) : icw + 6, h = 24, bx = x - w/2, by = top - h;
    g.fillStyle = hov ? 'rgba(255,255,255,.95)' : 'rgba(14,18,26,.86)'; g.beginPath(); g.roundRect ? g.roundRect(bx, by, w, h, 6) : g.rect(bx, by, w, h); g.fill();
    g.strokeStyle = pn.fac ? fc : HL + '.6)'; g.lineWidth = 1; g.stroke();
    if (pn.ic) { let im = (M3.ics ||= {})[pn.ic]; if (!im) { im = M3.ics[pn.ic] = new Image(); im.onload = () => draw3M(); im.src = IU(pn.ic); } if (im.complete && im.naturalWidth) g.drawImage(im, bx + 3, by + 2, 20, 20); }
    g.fillStyle = hov ? '#111' : pn.fac ? fc : 'rgba(200,225,255,.95)'; g.fillText(pn.s, bx + icw + (icw ? 7 : 5), by + 16);
    M3.hits.push({r: [bx, by, bx + w, by + h], tip: pn.tip, key: pn.tip + '@' + Math.round(pn.p[0]) + ',' + Math.round(pn.p[1]), site: pn.site}); });
}
(() => {
  const cv = document.getElementById('m3d'), tip = document.getElementById('m3tip'), pts = new Map(); let last = null, pinch = null;
  cv.addEventListener('wheel', e => { e.preventDefault(); let f = Math.exp(-e.deltaY*(e.ctrlKey ? .01 : .0015)); const r = cv.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
    f = zf3(f); M3.ox = cx - (cx - M3.ox)*f; M3.oy = cy - (cy - M3.oy)*f; M3.k *= f; busy3M(); draw3M(); }, {passive: false});
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY, e.button === 2 || e.shiftKey];
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = [Math.hypot(a[0]-b[0], a[1]-b[1]), (a[0]+b[0])/2, (a[1]+b[1])/2]; } });
  // orbit around the point under the cursor (like Blender "orbit around mouse"): if the sea is under the cursor — around the screen centre
  cv.addEventListener('pointerdown', e => { if (e.button === 2 || e.shiftKey || pts.size > 1) return; const r = cv.getBoundingClientRect(); let sx = e.clientX - r.left, sy = e.clientY - r.top;
    let p = unproj3M(sx, sy); if (heightAt(p[0], p[2]) === null) { sx = r.width/2; sy = r.height/2; p = unproj3M(sx, sy); }
    M3.piv = p; M3.pivS = [sx, sy]; M3.rot = 1; });
  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) { if (e.pointerType === 'touch') return; const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const h = M3.hits.find(q => mx >= q.r[0] && mx <= q.r[2] && my >= q.r[1] && my <= q.r[3]), k = h ? (h.key || h.tip) : null;
      if (k !== M3.hov) { M3.hov = k; draw3M(); }
      if (h && h.tip) { tip.hidden = false; tip.textContent = h.tip; tip.style.left = Math.min(mx + 14, r.width - tip.offsetWidth - 8) + 'px'; tip.style.top = (my + 16) + 'px'; } else tip.hidden = true; return; }
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a[0]-b[0], a[1]-b[1]), mx = (a[0]+b[0])/2, my = (a[1]+b[1])/2, r = cv.getBoundingClientRect(), f = zf3(d/pinch[0]), cx = mx - r.left, cy = my - r.top;
      M3.ox = cx - (cx - M3.ox)*f + (mx - pinch[1]); M3.oy = cy - (cy - M3.oy)*f + (my - pinch[2]); M3.k *= f; pinch = [d, mx, my]; busy3M(); draw3M(); return; }
    const dx = e.clientX - last[0], dy = e.clientY - last[1]; last[0] = e.clientX; last[1] = e.clientY;
    if (last[2]) { M3.ox += dx; M3.oy += dy; } else { M3.yaw -= dx*.008; M3.pitch = Math.max(.15, Math.min(1.5, M3.pitch + dy*.006));
      if (M3.piv) { const q = proj3M()(...M3.piv); M3.ox += M3.pivS[0] - q[0]; M3.oy += M3.pivS[1] - q[1]; } }   // the pivot stays in place   // "holding the map by hand": it turns the way you drag
    busy3M(); if (!M3.raf) M3.raf = requestAnimationFrame(() => { M3.raf = 0; draw3M(); }); });
  // a short press without dragging (not on a label) — place the factory at the terrain point under the cursor
  // don't place if there was a second finger (pinch) or it is the first click of a double one (double — camera reset): place with a delay
  let downAt = null, multi = false, placeT = 0; cv.addEventListener('pointerdown', e => { if (pts.size > 1) multi = true; if (pts.size === 1) multi = false; downAt = [e.clientX, e.clientY, e.button]; });
  cv.addEventListener('pointerup', e => { if (!downAt || downAt[2] !== 0 || multi || pts.size > 1 || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return; downAt = null;
    const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, hq = M3.hits.find(q => sx >= q.r[0] && sx <= q.r[2] && sy >= q.r[1] && sy <= q.r[3]);
    if (hq) { if (hq.site !== undefined) siteGo(hq.site); return; }
    const p = unproj3M(sx, sy); if (heightAt(p[0], p[2]) === null) return; clearTimeout(placeT); placeT = setTimeout(() => { S.mapPos = {x: Math.round(p[0]), y: Math.round(p[2])}; render(); }, 280); });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (pts.size === 1) { const [p] = [...pts.values()]; last = [p[0], p[1], false]; M3.piv = null; } if (!pts.size && M3.rot) { M3.rot = 0; draw3M(); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { tip.hidden = true; if (M3.hov) { M3.hov = null; draw3M(); } });
  cv.addEventListener('dblclick', () => { clearTimeout(placeT); M3.yaw = -.6; M3.pitch = .8; M3.fitted = false; draw3M(); });
  let WZ3 = null; window.addEventListener('resize', () => { const r = cv.getBoundingClientRect(); if (!r.width) return; if (WZ3 && M3.fitted) { M3.ox += (r.width - WZ3[0])/2; M3.oy += (r.height - WZ3[1])/2; if (!cv.hidden) draw3M(); } WZ3 = [r.width, r.height]; });
})();
VIEWS.map = {el: 'mwrap', strip: true, render: () => buildMap(), hide(){ document.getElementById('m3tip').hidden = true; }, refit(){}};   // the map camera is not reset on site/project/mode change — only by the "fit" button and a double click
