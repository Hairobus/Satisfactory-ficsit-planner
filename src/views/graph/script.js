/* ---------- graph ---------- */
const G = {k:1, x:0, y:0, ctx:'', fitted:false, pos:{}, L:null};
const NW = 224, NH = 100, GAP = 200, COLW = NW + GAP, VGAP = 46, DH = 26, LABW = 92;
function buildGraph(rows, bal, target){
  const nodes = new Map(), edges = [];
  const add = n => nodes.set(n.id, Object.assign(n, {h: NH}));
  rows.forEach(({rid,x,it,m}) => add({id:'r:'+rid, kind:'rec', it, rid, n:m.n, clk:m.clk, b:m.b, sh:m.shards, rate:R[rid].out.find(o=>o[0]===it)[1]*x}));
  const prod = {}, cons = {}, push = (o,it,id,a) => { if (a > 1e-6) (o[it] ||= []).push([id,a]); };
  rows.forEach(({rid,x}) => { R[rid].out.forEach(([it,a]) => push(prod,it,'r:'+rid,a*x)); R[rid].in.forEach(([it,a]) => push(cons,it,'r:'+rid,a*x)); });
  for (const [it,b] of Object.entries(bal)) {
    if (b < -1e-6 && solveRecipe(it) === 'raw') { let back = null, bi = -1;
      if (S.stepMode === 'step') rows.forEach(r => { const k = S.expanded.indexOf(r.it); if (k > bi && R[r.rid].in.some(([i2]) => i2 === it)) { bi = k; back = r.it; } });
      add({id:'raw:'+it, kind:'raw', it, rate:-b, back}); push(prod,it,'raw:'+it,-b); }
    if (b > 1e-4) { add({id:'s:'+it, kind:'sur', it, rate:b}); push(cons,it,'s:'+it,b); }
  }
  for (const [it,q] of Object.entries(target)) { add({id:'t:'+it, kind:'t', it, rate:q}); push(cons,it,'t:'+it,q); }
  for (const it of Object.keys(cons)) { const P = prod[it] || [], tot = P.reduce((s,p) => s+p[1], 0); if (!tot) continue;
    for (const [c,ca] of cons[it]) for (const [p,pa] of P) { if (p === c) continue; const f = pa*ca/tot; if (f > 1e-6) edges.push({a:p, b:c, it, f}); } }

  // break cycles (e.g. recycled plastic ↔ rubber): back edges are ignored when assigning columns
  const adj = {}; edges.forEach(e => (adj[e.a] ||= []).push(e));
  const st = {}; const dfs = id => { st[id] = 1; for (const e of adj[id] || []) { if (st[e.b] === 1) e.back = true; else if (!st[e.b]) dfs(e.b); } st[id] = 2; };
  [...nodes.keys()].filter(id => id.startsWith('raw:')).forEach(id => { if (!st[id]) dfs(id); });
  nodes.forEach((n,id) => { if (!st[id]) dfs(id); });
  // layers: longest path to a target
  const col = {}; nodes.forEach((n,id) => col[id] = 0);
  for (let p = 0; p < 60; p++) { let ch = false;
    for (const e of edges) { if (e.back) continue; const v = Math.min(col[e.b] + 1, 60); if (col[e.a] < v) { col[e.a] = v; ch = true; } }
    if (!ch) break; }
  nodes.forEach((n,id) => { if (n.kind === 't' || n.kind === 'sur') col[id] = 0; });
  // step-by-step: a raw resource sits right left of its consumer (expanding doesn't move other tiles); full — in a shared left column
  if (S.stepMode === 'step') nodes.forEach((n,id) => { if (n.kind === 'raw') col[id] = 1 + Math.max(0, ...edges.filter(e => e.a === id && !e.back).map(e => col[e.b])); });
  else { const mc = Math.max(0, ...Object.values(col)); nodes.forEach((n,id) => { if (n.kind === 'raw') col[id] = mc; }); }
  const maxC = Math.max(0, ...Object.values(col));
  nodes.forEach((n,id) => { n.layer = maxC - col[id]; });

  // dummy nodes for long edges: the edge runs through a "corridor", not under tiles
  let dn = 0;
  edges.forEach(e => { const A = nodes.get(e.a), B = nodes.get(e.b); e.pts = [e.a];
    if (!e.back) for (let l = A.layer + 1; l < B.layer; l++) { const id = 'd' + (dn++); nodes.set(id, {id, kind:'dum', layer:l, h:DH}); e.pts.push(id); }
    e.pts.push(e.b); });
  const layers = []; nodes.forEach((n,id) => (layers[n.layer] ||= []).push(id));
  for (let i = 0; i < layers.length; i++) layers[i] ||= [];
  const nb = {}; edges.forEach(e => { for (let i = 0; i < e.pts.length - 1; i++) { (nb[e.pts[i]] ||= []).push(e.pts[i+1]); (nb[e.pts[i+1]] ||= []).push(e.pts[i]); } });

  // order within a layer — barycentres
  const ord = {}; const reidx = () => layers.forEach(L => L.forEach((id,i) => ord[id] = i));
  reidx();
  for (let s = 0; s < 8; s++) {
    const seq = s % 2 ? [...layers.keys()].reverse() : [...layers.keys()];
    for (const li of seq) { const L = layers[li];
      const bc = id => { const ns = (nb[id] || []).filter(n => Math.abs(nodes.get(n).layer - li) === 1); return ns.length ? ns.reduce((a,n) => a + ord[n], 0)/ns.length : ord[id]; };
      const v = Object.fromEntries(L.map(id => [id, bc(id)])); L.sort((a,b) => v[a] - v[b]); L.forEach((id,i) => ord[id] = i); } }

  // vertical positions: pull towards neighbours while keeping a gap
  const cy = {}; layers.forEach(L => { let y = 0; L.forEach(id => { const n = nodes.get(id); cy[id] = y + n.h/2; y += n.h + VGAP; }); const off = y/2; L.forEach(id => cy[id] -= off); });
  for (let it = 0; it < 24; it++) {
    const seq = it % 2 ? [...layers.keys()].reverse() : [...layers.keys()];
    for (const li of seq) { const L = layers[li]; if (!L.length) continue;
      const want = L.map(id => { const ns = (nb[id] || []).filter(n => Math.abs(nodes.get(n).layer - li) === 1); return ns.length ? ns.reduce((a,n) => a + cy[n], 0)/ns.length : cy[id]; });
      const pos = []; L.forEach((id,i) => { const n = nodes.get(id); const min = i ? pos[i-1] + nodes.get(L[i-1]).h/2 + VGAP + n.h/2 : -Infinity; pos[i] = Math.max(want[i], min); });
      for (let i = L.length - 2; i >= 0; i--) { const max = pos[i+1] - nodes.get(L[i+1]).h/2 - VGAP - nodes.get(L[i]).h/2; if (pos[i] > max) pos[i] = max; }
      const shift = want.reduce((a,w,i) => a + (w - pos[i]), 0)/L.length;
      L.forEach((id,i) => cy[id] = pos[i] + shift); } }
  nodes.forEach((n,id) => { n.x = n.ox = (n.layer - maxC)*COLW; n.y = n.oy = cy[id] - n.h/2; });   // columns are counted from the targets on the right; ox/oy — position from the layout

  G.L = {nodes, edges, layers};
  // tiles stay where they are: expanding/collapsing moves only the new ones
  const ctx = JSON.stringify([S.targets.map(x => x[0]).sort(), S.choice, S.stepMode]);
  if (ctx !== G.ctx) { G.ctx = ctx; G.pos = {}; G.fitted = false; }
  const real = [...nodes.values()].filter(n => n.kind !== 'dum'); real.forEach(n => n.key = n.kind === 'rec' || n.kind === 'raw' ? 'i:' + n.it : n.id);
  const placed = [], fresh = [];
  const free = (n, y) => !placed.some(o => Math.abs(o.x - n.x) < NW + 20 && y < o.y + o.h + VGAP/2 && o.y < y + n.h + VGAP/2);
  // tiles that were on screen last time go first; a long-hidden tile's remembered spot may be taken — then it is placed again
  const was = new Set(G.shown || []);
  real.slice().sort((a,b) => was.has(b.key) - was.has(a.key)).forEach(n => { const p = G.pos[n.key];
    if (p && (was.has(n.key) || (n.x = p.x, free(n, p.y)))) { n.x = p.x; n.y = p.y; placed.push(n); } else fresh.push(n); });
  G.shown = real.map(n => n.key);
  if (placed.length) {
    // a new tile goes next to its links, at the nearest free vertical spot
    fresh.forEach(n => { const nbY = edges.filter(e => e.a === n.id || e.b === n.id).map(e => nodes.get(e.a === n.id ? e.b : e.a)).filter(o => o.kind !== 'dum' && placed.includes(o));
      const want = nbY.length ? nbY.reduce((a,o) => a + o.y, 0)/nbY.length : n.y;
      let y = want; for (let k = 0; k < 400; k++) { const c = want + (k % 2 ? 1 : -1)*Math.ceil(k/2)*12; if (free(n, c)) { y = c; break; } }
      n.y = y; placed.push(n); });
    // dummy nodes of long edges — on a straight line between the ends
    edges.forEach(e => { const A = nodes.get(e.a), Bn = nodes.get(e.b), d = e.pts.slice(1, -1).map(id => nodes.get(id));
      d.forEach((m, i) => { const f = (i + 1)/(d.length + 1); m.y = A.y + A.h/2 + (Bn.y + Bn.h/2 - A.y - A.h/2)*f - m.h/2; }); });
  }
  real.forEach(n => G.pos[n.key] = {x: n.x, y: n.y});
  drawGraph();
  if (!G.fitted) fitGraph(); else applyT();
}

function seg(x1, y1, x2, y2){
  // smooth curve: horizontal tangents at both ends, so it joins passages through columns
  const dx = x2 > x1 ? Math.max(40, (x2 - x1)*.5) : Math.max(120, Math.abs(x2 - x1)*.6);
  return `M${x1},${y1} C${x1+dx},${y1} ${x2-dx},${y2} ${x2},${y2}`;
}
function roundPath(P, r){
  // polyline with rounded corners
  let d = `M${P[0][0]},${P[0][1]}`;
  for (let i = 1; i < P.length - 1; i++) { const [ax,ay] = P[i-1], [bx,by] = P[i], [cx,cy] = P[i+1];
    const l1 = Math.hypot(bx-ax, by-ay), l2 = Math.hypot(cx-bx, cy-by), k = Math.min(r, l1/2, l2/2);
    if (k < .5) { d += ` L${bx},${by}`; continue; }
    d += ` L${bx - (bx-ax)/l1*k},${by - (by-ay)/l1*k} Q${bx},${by} ${bx + (cx-bx)/l2*k},${by + (cy-by)/l2*k}`; }
  const L = P[P.length-1]; return d + ` L${L[0]},${L[1]}`;
}
function drawGraph(){
  const {nodes, edges} = G.L;
  const C = id => nodes.get(id);
  // ports: spread over the tile height
  const outs = {}, ins = {};
  edges.forEach(e => { (outs[e.a] ||= []).push(e); (ins[e.b] ||= []).push(e); });
  const cyOf = id => C(id).y + C(id).h/2;
  const spread = (list, side) => { const key = side === 'o' ? e => cyOf(e.pts[1]) : e => cyOf(e.pts[e.pts.length-2]);
    list.sort((p,q) => key(p) - key(q)); const st = Math.min(24, (NH - 24)/Math.max(1, list.length - 1));
    list.forEach((e,i) => e[side] = (i - (list.length-1)/2)*st); };
  Object.values(outs).forEach(l => spread(l, 'o')); Object.values(ins).forEach(l => spread(l, 'i'));
  // segments and lanes in the gaps
  const segs = [];
  // a long edge crosses columns via dummy nodes. By default — one smooth curve (joining at the column centre with a horizontal
  // tangent); if the curve would touch a tile somewhere, in that column the edge runs straight along its "corridor"
  const solidN = [...nodes.values()].filter(n => n.kind !== 'dum');
  const hitsC = (p0, c1, c2, p3, a, b) => { const K = Math.max(24, Math.ceil((Math.hypot(c1[0]-p0[0], c1[1]-p0[1]) + Math.hypot(c2[0]-c1[0], c2[1]-c1[1]) + Math.hypot(p3[0]-c2[0], p3[1]-c2[1]))/5));
    const xs = [p0[0], c1[0], c2[0], p3[0]], ys = [p0[1], c1[1], c2[1], p3[1]], X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys) - 4, Y1 = Math.max(...ys) + 4;
    const near = solidN.filter(n => n.id !== a && n.id !== b && n.x < X1 && n.x + NW > X0 && n.y - 4 < Y1 && n.y + n.h + 4 > Y0); if (!near.length) return false;
    for (let k = 1; k < K; k++) { const t = k/K, u = 1 - t;
      const x = u*u*u*p0[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*p3[0], y = u*u*u*p0[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*p3[1];
      if (near.some(n => x > n.x && x < n.x + NW && y > n.y - 4 && y < n.y + n.h + 4)) return true; } return false; };
  const hits = (x1, y1, x2, y2, a, b) => { const dx = x2 > x1 ? Math.max(40, (x2 - x1)*.5) : Math.max(120, Math.abs(x2 - x1)*.6);
    return hitsC([x1, y1], [x1 + dx, y1], [x2 - dx, y2], [x2, y2], a, b); };
  // if a tile at an end of the edge was moved (dragged, or kept its old place on expand), the intermediate layout
  // points no longer fit: re-route the edge evenly across columns between the ends, going around tiles vertically
  const solidAll = [...nodes.values()].filter(n => n.kind !== 'dum');
  const route = e => { const A = C(e.a), B = C(e.b);
    if (e.back || ((A.x === A.ox && A.y === A.oy) && (B.x === B.ox && B.y === B.oy))) return e.pts.map(id => C(id));
    const x0 = A.x + NW, span = B.x - x0, k = Math.max(0, Math.round((span - GAP)/COLW));
    if (span < 60) {   // the receiving tile was dragged left of the source: the edge makes a neat loop along a free horizontal
      const ya = A.y + A.h/2 + e.o, yb = B.y + B.h/2 + e.i, xa = x0 + 60, xb = B.x - 60, lo = Math.min(xa, xb), hi = Math.max(xa, xb), mid = (ya + yb)/2;
      const ok = y => !solidAll.some(n => n.id !== e.a && n.id !== e.b && lo < n.x + NW && n.x < hi && y - 10 < n.y + n.h && n.y < y + 10);
      let ym = mid; for (let q = 0; q < 300; q++) { const c = mid + (q % 2 ? 1 : -1)*Math.ceil(q/2)*8; if (ok(c)) { ym = c; break; } }
      // two smooth U-shaped arcs and a straight run between them
      const k1 = Math.min(140, Math.max(45, Math.abs(ym - ya)*.7)), k2 = Math.min(140, Math.max(45, Math.abs(yb - ym)*.7));
      e.loop = `M${x0},${ya} C${x0 + k1},${ya} ${x0 + k1},${ym} ${x0},${ym} L${B.x},${ym} C${B.x - k2},${ym} ${B.x - k2},${yb} ${B.x},${yb}`; return [A, B]; }
    if (!k) return [A, B];
    const y1 = A.y + A.h/2 + e.o, y2 = B.y + B.h/2 + e.i, step = span/(k + 1), pts = [A];
    for (let j = 1; j <= k; j++) { const cx = x0 + step*j, x = cx - NW/2, want = y1 + (y2 - y1)*j/(k + 1);
      const ok = y => !solidAll.some(n => n.id !== e.a && n.id !== e.b && x < n.x + NW && n.x < x + NW && y - DH/2 - 10 < n.y + n.h && n.y < y + DH/2 + 10);
      let y = want; for (let q = 0; q < 200; q++) { const c = want + (q % 2 ? 1 : -1)*Math.ceil(q/2)*10; if (ok(c)) { y = c; break; } }
      pts.push({kind:'dum', x, y: y - DH/2, h: DH}); }
    pts.push(B); return pts; };
  edges.forEach(e => { e.loop = null; const P = route(e), flat = P.map(() => false);
    const build = () => { const out = [];
      for (let i = 0; i < P.length - 1; i++) { const A = P[i], B = P[i+1];
        const y1 = A.kind === 'dum' ? A.y + A.h/2 : A.y + A.h/2 + e.o, y2 = B.kind === 'dum' ? B.y + B.h/2 : B.y + B.h/2 + e.i;
        out.push({e, i, x1: A.x + (A.kind === 'dum' && !flat[i] ? NW/2 : NW), y1, x2: B.x + (B.kind === 'dum' && !flat[i+1] ? NW/2 : 0), y2, gap: A.layer, first: i === 0, last: i === P.length - 2}); }
      return out; };
    let S2 = build();
    // try without waves first: one direct curve, then a smooth spline through control points (continuous tangents)
    e.whole = null;
    if (!e.back && !e.loop && P.length > 2) {
      const L0 = P[0], L1 = P[P.length-1], x0 = L0.x + NW, y0 = L0.y + L0.h/2 + e.o, x3 = L1.x, y3 = L1.y + L1.h/2 + e.i;
      if (!hits(x0, y0, x3, y3, e.a, e.b)) e.whole = seg(x0, y0, x3, y3);
      else { const Q = [[x0, y0], ...P.slice(1, -1).map(d => [d.x + NW/2, d.y + d.h/2]), [x3, y3]];
        const m = Q.map((q, i) => i === 0 ? [Q[1][0] - q[0], 0] : i === Q.length - 1 ? [q[0] - Q[i-1][0], 0] : [(Q[i+1][0] - Q[i-1][0])/2, (Q[i+1][1] - Q[i-1][1])/2]);
        let d = `M${x0},${y0}`, bad = false;
        for (let i = 0; i < Q.length - 1 && !bad; i++) { const c1 = [Q[i][0] + m[i][0]/3, Q[i][1] + m[i][1]/3], c2 = [Q[i+1][0] - m[i+1][0]/3, Q[i+1][1] - m[i+1][1]/3];
          if (hitsC(Q[i], c1, c2, Q[i+1], e.a, e.b)) bad = true; d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${Q[i+1][0]},${Q[i+1][1]}`; }
        if (!bad) e.whole = d; } }
    if (!e.back && !e.loop && !e.whole) for (let pass = 0; pass < 3; pass++) { let ch = false;
      S2.forEach(q => { if (hits(q.x1, q.y1, q.x2, q.y2, e.a, e.b)) [q.i, q.i + 1].forEach(j => { if (P[j].kind === 'dum' && !flat[j]) { flat[j] = true; ch = true; } }); });
      if (!ch) break; S2 = build(); }
    if (e.loop) S2[0].path = e.loop;
    segs.push(...S2); e.thru = e.whole ? [] : P.filter((n, j) => n.kind === 'dum' && flat[j]); });
  const byGap = {}; segs.forEach(s => (byGap[s.gap] ||= []).push(s));
  Object.values(byGap).forEach(L => { const v = L.filter(s => Math.abs(s.y2 - s.y1) > .5).sort((a,b) => (a.y2 - a.y1) - (b.y2 - b.y1) || a.y1 - b.y1);
    const room = GAP - LABW - 40, st = Math.min(12, room/Math.max(1, v.length)); v.forEach((s,i) => s.lx = s.x1 + 20 + i*st); });
  let h = '', ports = '';
  // back edges of a cycle: leave to the right, go around all tiles above or below on their own "shelf" and enter the tile from the left
  const solid = [...nodes.values()].filter(n => n.kind !== 'dum'); let kUp = 0, kDn = 0;
  segs.forEach(s => { if (!s.e.back) return;
    const lbl = fq(s.e.f) + (unit(s.e.it) ? ' ' + unit(s.e.it) : ''), lw = 30 + lbl.length*7;
    const xo = s.x1 + 26, xi = Math.min(s.x2 - lw - 30, s.x2 - 26), lo = Math.min(xi, xo) - 1, hi = Math.max(xi, xo) + 1;
    const span = solid.filter(n => n.x < hi && n.x + NW > lo);
    const top = Math.min(...span.map(n => n.y)), bot = Math.max(...span.map(n => n.y + n.h)), mid = (s.y1 + s.y2)/2;
    const Y = mid - top <= bot - mid ? top - 34 - 16*(kUp++) : bot + 34 + 16*(kDn++);
    s.path = roundPath([[s.x1, s.y1], [xo, s.y1], [xo, Y], [xi, Y], [xi, s.y2], [s.x2, s.y2]], 16); });
  edges.forEach(e => { const B = e.b, cls = `edge${nodes.get(B).kind === 't' ? ' to-t' : ''}${e.back ? ' back' : ''}`;
    const d = e.whole || segs.filter(s => s.e === e).map(s => s.path || seg(s.x1, s.y1, s.x2, s.y2)).join(' ') + e.thru.map(m => ` M${m.x},${m.y + m.h/2} H${m.x + NW}`).join('');
    h += `<path class="${cls}" data-a="${e.a}" data-b="${B}" d="${d}"/>`; });
  segs.filter(s => s.last).forEach(s => { const e = s.e, lbl = fq(e.f) + (unit(e.it) ? ' ' + unit(e.it) : ''), lw = 30 + lbl.length*7, lx = s.x2 - lw - 10, ly = s.y2 - 11;
    h += `<g class="elab" data-a="${e.a}" data-b="${e.b}"><title>${esc(I[e.it].n)}: ${lbl}${UU()}</title><rect x="${lx}" y="${ly}" width="${lw}" height="22" rx="7"/><image href="${IU(e.it)}" x="${lx+4}" y="${ly+3}" width="16" height="16"/><text x="${lx+24}" y="${ly+15}">${lbl}</text></g>`; });
  segs.forEach(s => { if (s.first) ports += `<circle class="port" data-a="${s.e.a}" data-b="${s.e.b}" cx="${s.x1}" cy="${s.y1}" r="4"/>`;
    if (s.last) ports += `<circle class="port" data-a="${s.e.a}" data-b="${s.e.b}" cx="${s.x2}" cy="${s.y2}" r="4"/>`; });
  for (const n of nodes.values()) { if (n.kind === 'dum') continue;
    const name = esc(I[n.it].n), u = unit(n.it) ? ' ' + unit(n.it) : '', U = UU();
    let t1, t2, t3, big;
    if (n.kind === 'rec') { t1 = `×${n.n}`; t2 = R[n.rid].alt ? t('alt') + ': ' + shortName(R[n.rid]) : I[n.it].n; t3 = `${fq(n.rate)}${u}${U}` + (Math.abs(n.clk*100 - S.clock) > .05 ? ` · ${t('at')} ${fmt(n.clk*100,1)}%` : ''); big = '×' + n.n; }
    else if (n.kind === 'raw') { t1 = I[n.it].n; t2 = canExpand(n.it) ? t('supplied') : t('gRaw'); t3 = `${fq(n.rate)}${u}${U}`; big = fq(n.rate); }
    else if (n.kind === 't') { t1 = I[n.it].n; t2 = t('gTarget'); t3 = `${fq(n.rate)}${u}${U}`; big = fq(n.rate); }
    else { t1 = I[n.it].n; t2 = t('gSurplus'); t3 = `+${fq(n.rate)}${u}${U}`; big = '+' + fq(n.rate); }
    const cut = (s, k) => esc(s.length > k ? s.slice(0, k-1) + '…' : s);
    h += `<g class="node ${n.kind}" data-id="${n.id}" transform="translate(${n.x},${n.y})"><title>${name}</title>
      <rect class="box" width="${NW}" height="${NH}" rx="16"/>
      <rect class="ibg" x="14" y="${NH/2-30}" width="60" height="60" rx="14"/><image href="${IU(n.it)}" x="18" y="${NH/2-26}" width="52" height="52"/>
      <g class="txt">${n.kind === 'rec' ? `<image href="${IU(n.b)}" x="84" y="${NH/2-30}" width="26" height="26"><title>${esc(M[n.b].n)}</title></image>` : ''}<text class="t1" x="${n.kind === 'rec' ? 113 : 86}" y="${NH/2-10}">${cut(t1,17)}</text><text class="t2" x="86" y="${NH/2+8}">${cut(t2,22)}</text><text class="t3" x="86" y="${NH/2+26}">${esc(t3)}</text></g>
      <text class="big" x="86" y="${NH/2+9}">${esc(big)}</text>${n.kind === 'raw' && canExpand(n.it) ? `<g class="gexp" data-exp="${n.it}"><title>${esc(t('expand'))}</title><circle cx="${NW-18}" cy="18" r="11"/><text x="${NW-18}" y="23" text-anchor="middle">+</text></g>` : ''}${n.kind === 'raw' && n.back ? `<g class="gexp" data-col="${n.back}"><title>${esc(t('collapse'))}: ${esc(I[n.back].n)}</title><circle cx="${NW-18}" cy="${NH-18}" r="11"/><text x="${NW-18}" y="${NH-13}" text-anchor="middle">−</text></g>` : ''}${n.kind === 'rec' && canExpand(n.it) && S.expanded.includes(n.it) ? `<g class="gexp" data-col="${n.it}"><title>${esc(t('collapse'))}</title><circle cx="${NW-18}" cy="${NH-18}" r="11"/><text x="${NW-18}" y="${NH-13}" text-anchor="middle">−</text></g>` : ''}${n.sh ? `<g><title>${t('shards')}</title><image href="${IU('Desc_CrystalShard_C')}" x="${NW-58}" y="8" width="24" height="24"/><text class="t1" x="${NW-33}" y="26">×${n.sh}</text></g>` : ''}</g>`; }
  document.getElementById('vp').innerHTML = h + ports;
}
function bbox(){ let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; G.L.nodes.forEach(n => { a = Math.min(a,n.x); b = Math.min(b,n.y); c = Math.max(c,n.x+NW); d = Math.max(d,n.y+n.h); }); return {x:a, y:b, w:c-a, h:d-b}; }
function applyT(){
  document.getElementById('vp').setAttribute('transform', `translate(${G.x},${G.y}) scale(${G.k})`);
  const svg = document.getElementById('graph'); svg.classList.toggle('far', G.k < .55); svg.classList.toggle('vfar', G.k < .22);
}
function fitGraph(){
  const r = document.getElementById('graph').getBoundingClientRect();
  if (!G.L || !G.L.nodes.size || !r.width) return; G.fitted = true;
  const B = bbox(), pad = 40, k = Math.min(1, (r.width - pad*2)/B.w, (r.height - pad*2)/B.h);
  G.k = Math.max(.12, k); G.x = (r.width - B.w*G.k)/2 - B.x*G.k; G.y = (r.height - B.h*G.k)/2 - B.y*G.k; applyT();
}
function zoomAt(f, cx, cy){ const k = Math.min(2.5, Math.max(.12, G.k*f)); G.x = cx - (cx - G.x)*k/G.k; G.y = cy - (cy - G.y)*k/G.k; G.k = k; applyT(); }
(() => {
  const svg = document.getElementById('graph'), pts = new Map(); let lastP = null, pinch = null, drag = null;
  svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY*(e.ctrlKey ? .01 : .0015)), e.clientX - r.left, e.clientY - r.top); }, {passive:false});
  svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); lastP = [e.clientX, e.clientY];
    const nd = e.target.closest('.node');
    if (nd && pts.size === 1) { const n = G.L.nodes.get(nd.dataset.id); drag = {id: nd.dataset.id, n}; }
    else { drag = null; svg.classList.add('drag'); }
    if (pts.size === 2) { drag = null; const [a,b] = [...pts.values()]; pinch = Math.hypot(a[0]-b[0], a[1]-b[1]); } });
  svg.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch) { const [a,b] = [...pts.values()], d = Math.hypot(a[0]-b[0], a[1]-b[1]), r = svg.getBoundingClientRect(); zoomAt(d/pinch, (a[0]+b[0])/2 - r.left, (a[1]+b[1])/2 - r.top); pinch = d; return; }
    const dx = e.clientX - lastP[0], dy = e.clientY - lastP[1]; lastP = [e.clientX, e.clientY];
    if (drag) { drag.n.x += dx/G.k; drag.n.y += dy/G.k; G.pos[drag.n.key] = {x: drag.n.x, y: drag.n.y};
      if (!drag.raf) drag.raf = requestAnimationFrame(() => { if (drag) drag.raf = 0; drawGraph(); }); }
    else { G.x += dx; G.y += dy; applyT(); } });
  let downAt = null;
  svg.addEventListener('pointerdown', e => { { const g = e.target.closest('.gexp'); downAt = [e.clientX, e.clientY, g?.dataset.exp, g?.dataset.col]; } }, true);
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
    if (!pts.size) { svg.classList.remove('drag'); if (drag) drawGraph(); drag = null;
      if (downAt && (downAt[2] || downAt[3]) && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5) { const [,, ex, co] = downAt; downAt = null; if (ex && !S.expanded.includes(ex)) S.expanded.push(ex); if (co) S.expanded = S.expanded.filter(x => x !== co); render(); return; } }
    else lastP = [...pts.values()][0]; };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('pointerover', e => { const n = e.target.closest('.node'); if (!n || pts.size) return; const id = n.dataset.id;
    svg.classList.add('hover'); svg.querySelectorAll('.on').forEach(x => x.classList.remove('on')); n.classList.add('on');
    svg.querySelectorAll(`[data-a="${id}"],[data-b="${id}"]`).forEach(x => { x.classList.add('on'); svg.querySelector(`.node[data-id="${x.dataset.a === id ? x.dataset.b : x.dataset.a}"]`)?.classList.add('on'); }); });
  svg.addEventListener('pointerout', e => { if (pts.size) return; if (!e.relatedTarget || !e.relatedTarget.closest?.('.node')) { svg.classList.remove('hover'); svg.querySelectorAll('.on').forEach(x => x.classList.remove('on')); } });
  document.querySelector('[data-z]').parentElement.addEventListener('click', e => { const b = e.target.closest('[data-z]'); if (!b) return; const r = svg.getBoundingClientRect();
    if (b.dataset.z === 'fit') { G.pos = {}; G.fitted = false; if (last) buildGraph(last.rows, last.bal, last.target); } else zoomAt(b.dataset.z === 'in' ? 1.25 : .8, r.width/2, r.height/2); });
  // on phones the hiding address bar changes only the height — don't reset the view
  let lastW = innerWidth; window.addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; if (S.view === 'graph') fitGraph(); if (S.view === 'layout' || S.view === 'bld') fitLayout(); });
})();
VIEWS.graph = {el: 'gwrap', render: buildGraph, refit(){ G.fitted = false; }};
