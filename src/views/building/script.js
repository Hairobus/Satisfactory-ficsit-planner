/* ---------- multi-floor building ---------- */
// floors go bottom-up in production order; a shaft in the middle: each resource rises on its own lift (fluids — in a pipe)
// through floor holes. Raw resources come in from below the ground floor, products go to storage on their own floor.
function buildBuilding(rows, bal, target){
  const blocks = makeBlocks(rows);
  const consumed = new Set(); rows.forEach(({rid}) => R[rid].in.forEach(([it]) => consumed.add(it)));
  const lanes = [], lane = it => { if (!lanes.includes(it)) lanes.push(it); };
  Object.entries(bal).filter(([it,b]) => b < -EPS && solveRecipe(it) === 'raw').forEach(([it]) => lane(it));
  rows.slice().reverse().forEach(({rid}) => R[rid].out.forEach(([it]) => { if (consumed.has(it)) lane(it); }));
  const col = palOf(lanes), none = new Set();
  const size = bl => { const P = planFloor(bl, target, {lanes, consumed, inQ: {}, up: none, lift: true, col}); return [P.w, P.h]; };
  // group by chain depth, then merge neighbouring groups while a floor is no bigger than the largest one
  const depths = [...new Set(blocks.map(b => b.depth))].sort((a,b) => b - a), groups = depths.map(d => blocks.filter(b => b.depth === d));
  const dims = groups.map(size), Wt = Math.max(0, ...dims.map(d => d[0])), Ht = Math.max(0, ...dims.map(d => d[1]));
  const floors = []; let cur = null;
  groups.forEach(g => { if (!cur) { cur = g; return; } const m = cur.concat(g), [w, h] = size(m); if (w <= Wt + 1e-6 && h <= Ht + 1e-6) cur = m; else { floors.push(cur); cur = g; } });
  if (cur) floors.push(cur);
  // Laid out like a multi-storey factory: all floors the same size, stacked exactly, shaft in the middle.
  // Wing width on each side of the shaft (Ws) is chosen to minimise floor area: long rows are cut into
  // short parallel rows (a row "folds" into a compact block), rows go to whichever side of the shaft has more room,
  // and groups move between neighbouring floors so floors fill evenly (a supplier is never above its consumer).
  const busW0 = Math.max(1, Math.ceil(lanes.length*.6))*LANE + 4, isT = B => target[B.it] !== undefined;
  const fitW = (bl, Ws) => { const out = [];
    bl.forEach(B => { const W = (DIM[R[B.rid].b] || [10])[0], m = Math.max(1, Math.floor((Ws - 4 - (isT(B) ? 20 : 0))/W)), k = Math.ceil(B.cnt/m);
      if (k <= 1) { out.push(B); return; } const base = Math.floor(B.cnt/k), ex = B.cnt % k;
      for (let q = 0; q < k; q++) { const cnt = base + (q < ex ? 1 : 0); out.push({...B, cnt, share: B.share*cnt/B.cnt, hint: q ? 0 : B.hint, need: q ? 0 : B.need}); } });
    const n = {}, k = {}; out.forEach(B => n[B.rid] = (n[B.rid] || 0) + 1); return out.map(B => ({...B, part: n[B.rid] > 1 ? `${(k[B.rid] = (k[B.rid] || 0) + 1)}/${n[B.rid]}` : ''})); };
  const Hb = B => { const r = R[B.rid]; return 9 + (r.in.length + r.out.length)*LANE + (DIM[r.b] || [10, 12])[1] + ROWGAP; };
  const estH = (bl, Ws) => { let hL = 0, hR = 0; fitW(bl, Ws).forEach(B => { if (isT(B) || hR <= hL) hR += Hb(B); else hL += Hb(B); }); return Math.max(hL, hR) + 14; };
  const minWs = Math.max(24, ...blocks.map(B => (DIM[R[B.rid].b] || [10])[0] + 4 + (isT(B) ? 20 : 0))) + 2;
  const maxWs = Math.max(minWs, ...blocks.map(B => B.cnt*(DIM[R[B.rid].b] || [10])[0] + 4 + (isT(B) ? 20 : 0)));
  const pickWs = () => { let best = minWs, ba = Infinity;
    if (!floors.length) return minWs;   // no production at all (the target is a raw resource)
    for (let Ws = minWs, n = 0; Ws <= maxWs + 1e-6 && n < 200; Ws += 4, n++) { const H = Math.max(...floors.map(F => estH(F, Ws))), Wt = 2*Ws + busW0 + 12, a = Wt*H*(1 + .12*Math.abs(Math.log(Wt/H))); if (a < ba) { ba = a; best = Ws; } }
    return best; };
  let Ws = pickWs();
  // floor balancing: move a row down (if it needs nothing from this floor) or up (if nobody here takes its output)
  for (let pass = 0; pass < 8; pass++) { let moved = false;
    for (let f = 0; f < floors.length; f++) {
      const tryMove = (from, to) => { const onF = new Set(floors[from].map(b => b.rid)), outs = new Set(floors[from].flatMap(b => R[b.rid].in.map(([it]) => recipeOf(it))));
        const cand = floors[from].filter(b => to < from ? R[b.rid].in.every(([it]) => !onF.has(recipeOf(it))) : !outs.has(b.rid));
        const now = Math.max(estH(floors[from], Ws), estH(floors[to], Ws)); let best = null, bv = now;
        cand.forEach(c => { const v = Math.max(estH(floors[from].filter(b => b !== c), Ws), estH(floors[to].concat(c), Ws)); if (v < bv - 1e-6) { bv = v; best = c; } });
        if (!best) return false; floors[from] = floors[from].filter(b => b !== best); floors[to] = floors[to].concat(best).sort((a, b) => b.depth - a.depth); return true; };
      if (f > 0 && tryMove(f, f - 1)) moved = true;
      if (f < floors.length - 1 && tryMove(f, f + 1)) moved = true; }
    if (!moved) break; }
  Ws = pickWs();
  for (let f = floors.length - 1; f >= 0; f--) if (!floors[f].length) floors.splice(f, 1);
  const fOf = {}; floors.forEach((F, f) => F.forEach(b => { fOf[b.rid] = f; }));
  // where a resource comes from (-1 — from below the ground floor) and how much is used on each floor
  const src = it => { const r = recipeOf(it); return fOf[r] ?? (blocks.some(b => b.rid === r) ? 0 : -1); };
  const use = {}; floors.forEach((F, f) => F.forEach(b => R[b.rid].in.forEach(([it,a]) => { ((use[it] ||= {})[f] = (use[it][f] || 0) + a*b.x*b.share); })));
  const topUse = it => Math.max(-1, ...Object.keys(use[it] || {}).map(Number));
  const above = (it, f) => Object.entries(use[it] || {}).reduce((s, [g, q]) => s + (+g >= f ? q : 0), 0);
  // which lift/pipe is needed to rise into floor g: by the flow through that slab
  const tier = (it, q) => I[it].f === 's' ? (() => { const ti = BELTS.findIndex(c => c >= q - 1e-6); return {k: 'Lift_' + (ti < 0 ? 6 : ti + 1), n: ti < 0 ? Math.ceil(q/1200 - 1e-9) : 1}; })()
    : {k: q > 300 + 1e-6 ? 'Pipe_2' : 'Pipe_1', n: Math.ceil(q/600 - 1e-9)};
  const kName = k => k === 'Hole_Lift' ? t('gLiftHole') : k === 'Hole_Pipe' ? t('gPipeHole') : k[0] === 'L' ? t('gLift' + k.slice(5)) : t('gPipe' + k.slice(5));
  const desc = (it, g) => { const q = above(it, g), T = tier(it, q); return `${I[it].n} — ${kName(T.k)}${T.n > 1 ? ' ×' + T.n : ''} · ${fq(q)}${unit(it) ? ' ' + unit(it) : ''}${UU()}`; };
  // raw resources delivered by transport enter floor 1 from the station, not through a floor hole (`ext`)
  const EXT = extIn(lanes.filter(it => src(it) < 0).map(it => [it, -(bal[it] || 0)]).filter(([, q]) => q > EPS)), isExt = it => EXT.has(it) && src(it) < 0;
  const NF = floors.length, opts = f => { const inQ = {}, up = new Set(), dsc = {};
    lanes.forEach(it => { const s = src(it), T = topUse(it);
      if (s < f && T >= f) inQ[it] = (use[it] || {})[f] || 0;
      if (s <= f && T > f) up.add(it);
      if (s < f && T >= f) dsc[it] = desc(it, f); else if (s <= f && T > f) dsc[it] = desc(it, f + 1); });
    return {lanes, consumed, inQ, up, lift: true, col, desc: dsc, ext: f === 0 ? EXT : null}; };
  // floor bus: lift lanes first (same spot on every floor — lifts are strictly vertical), then the floor's local resources
  const lifted = lanes.filter(it => topUse(it) > src(it)), here = f => new Set(floors[f].flatMap(b => R[b.rid].in.map(x => x[0]).concat(R[b.rid].out.map(x => x[0]))));
  const tStore = new Set();   // a target also used inside the chain goes to storage from a single floor
  const plans = floors.map((F, f) => { const h = here(f); return planFloor(fitW(F, Ws), target, {...opts(f), tStore, lanes: lifted.concat(lanes.filter(it => !lifted.includes(it) && h.has(it))), Ws, balance: true}); });
  // floor height: tallest building + clearance, rounded up to wall height (4 m)
  const fh = floors.map(F => Math.ceil((Math.max(8, ...F.map(b => HGT[R[b.rid].b] || 10)) + 1)/4)*4);
  const z = fh.map((_, f) => fh.slice(0, f).reduce((a, b) => a + b, 0)), totalH = fh.reduce((a, b) => a + b, 0);
  // one slab size for all floors: overall footprint of all floors on the 8×8 m foundation grid
  const g8 = (v, up) => (up ? Math.ceil(v/8) : Math.floor(v/8))*8;
  const R0 = {x0: g8(Math.min(-6 - Ws, ...plans.map(P => P.geo.x0))), x1: g8(Math.max(...plans.map(P => P.busW + 6 + Ws), ...plans.map(P => P.geo.x1)), 1), y0: g8(Math.min(...plans.map(P => P.geo.y0))), y1: g8(Math.max(...plans.map(P => P.geo.y1)), 1)};
  R0.a = (R0.x1 - R0.x0)/8; R0.b = (R0.y1 - R0.y0)/8;
  const fp = plans.map(() => R0);
  const fpTxt = f => `${fp[f].a}×${fp[f].b}`, fTot = fp.reduce((a, r) => a + r.a*r.b, 0);
  const gX0 = Math.min(R0.x0, ...plans.map(P => P.X)), gX1 = Math.max(R0.x1, ...plans.map(P => P.X + P.w)), gY0 = Math.min(R0.y0, ...plans.map(P => P.Y)), gY1 = Math.max(R0.y1, ...plans.map(P => P.Y + P.h));
  const bX0 = Math.min(...fp.map(r => r.x0)), bX1 = Math.max(...fp.map(r => r.x1)), bY0 = Math.min(...fp.map(r => r.y0)), bY1 = Math.max(...fp.map(r => r.y1));
  // lifts and holes: every slab a resource passes through gets one floor hole per parallel line
  const kit = {}, add = (k, n) => kit[k] = (kit[k] || 0) + n;
  lanes.forEach(it => { const s = src(it), T = topUse(it); for (let g = s + 1; g <= T; g++) { const q = above(it, g); if (q < EPS) continue;
    const r = tier(it, q); add(r.k, r.n); if (!(g === 0 && isExt(it))) add(I[it].f === 's' ? 'Hole_Lift' : 'Hole_Pipe', r.n); } });   // delivered by a station — no floor hole on floor 1
  // logistics at the building: truck and train stations on the ground in front of the shaft, drone ports on the roof.
  // Inbound: belt from the station under floor 1 to the foot of the shaft (then ordinary lifts). Outbound: from the floor's storage by lift down/up.
  const LX0 = plans.length ? plans[0].laneX : () => 0, lgE = [];
  lanes.forEach(it => { if (src(it) >= 0) return; const q = -(bal[it] || 0); if (q < EPS) return; const o = logi(it, q, 'in'); if (TRM[o.m] && !o.need) lgE.push({it, q, dir: 'in', o}); });
  Object.entries(target).forEach(([it, q]) => { const o = logi(it, q, 'out'); if (!TRM[o.m] || o.need) return;
    const f = plans.findIndex(P => P.store && P.store.items.some(x => x[0] === it)), P = plans[f];
    lgE.push({it, q, dir: 'out', o, f, sx: P ? P.store.x + 8 : null, sy: P ? (P.store.y1 + P.store.y2)/2 : null}); });
  const lgTip = e => `${t(e.dir === 'out' ? 'trOut' : 'trIn')}: ${I[e.it].n} ${fq(e.q)}${unit(e.it) ? ' ' + unit(e.it) : ''}${UU()} · ` + e.o.veh.map(([, nm, n]) => `${t(nm)} ×${n}`).concat(e.o.st.map(([, nm, n]) => `${t(nm)} ×${n}`)).join(', ') + ` · ${fmt(e.o.T, 1)} ${t('mins')}`;
  const nG = lgE.filter(e => TRM[e.o.m].g).length; let gx = NF ? R0.x0 : 0, kG = 0;
  const gy0 = (NF ? R0.y1 : 0) + 6 + nG*1.6;
  let rx = NF ? R0.x0 + 1 : 0, rz = NF ? R0.y0 + 1 : 0;
  lgE.forEach(e => { e.tip = lgTip(e); e.c = col(e.it); e.k = e.st = e.o.st[0][0];
    if (TRM[e.o.m].g) { const [, d, h] = TRM[e.o.m].dim, w = e.o.w; e.box = {x0: gx, x1: gx + w, y0: gy0, y1: gy0 + d, h}; gx += w + 6;
      e.yk = (NF ? R0.y1 : 0) + 3 + kG*1.6; kG++; const cx = (e.box.x0 + e.box.x1)/2;
      e.path = e.dir === 'in' ? [[cx, gy0], [cx, e.yk], [LX0(e.it), e.yk], [LX0(e.it), 4.5]] : e.sx === null ? null : [[e.sx, e.sy], [e.sx, e.yk], [cx, e.yk], [cx, gy0]]; }
    else { e.ports = []; for (let i = 0; i < e.o.ports; i++) { if (rx + 24 > R0.x1 && rx > R0.x0 + 2) { rx = R0.x0 + 1; rz += 26; } e.ports.push([rx, rz]); rx += 26; }
      const [px, pz] = e.ports[0], pc = [px + 12, pz + 12], dx = LX0(e.it) + 1.6;
      e.path = e.dir === 'in' ? [pc, [dx, pc[1]], [dx, 4.5]] : e.sx === null ? null : [[e.sx, e.sy], [e.sx, pc[1]], pc]; e.dropX = e.dir === 'in' ? dx : e.sx; e.dropY = e.dir === 'in' ? 4.5 : e.sy; } });
  const gBox = lgE.filter(e => e.box), rBox = lgE.filter(e => e.ports);
  const lgX0 = Math.min(Infinity, ...gBox.map(e => e.box.x0), ...rBox.flatMap(e => e.ports.map(p => p[0]))), lgX1 = Math.max(-Infinity, ...gBox.map(e => e.box.x1), ...rBox.flatMap(e => e.ports.map(p => p[0] + 24)));
  const lgY1 = Math.max(-Infinity, ...gBox.map(e => e.box.y1)), roofH = rBox.length ? 15 : 0;
  S.floor = Math.min(Math.max(-1, S.floor || 0), NF);
  // toggle: section and floors
  document.getElementById('floorBar').innerHTML = NF ? `<button type="button" data-floor="-1" aria-pressed="${S.floor === -1}">3D</button><button type="button" data-floor="0" aria-pressed="${S.floor === 0}">${esc(t('section'))}</button>` +
    floors.map((_, f) => `<button type="button" data-floor="${f+1}" aria-pressed="${S.floor === f+1}" title="${esc(t('floor'))} ${f+1} · ${fh[f]} m · ${fpTxt(f)} ${esc(t('foundations'))}">${f+1}</button>`).join('') : '';
  let out = [], box;
  const is3 = S.floor === -1 && NF > 0;
  document.getElementById('lay').style.visibility = is3 ? 'hidden' : '';
  document.getElementById('l3d').hidden = !is3; document.getElementById('tip3d').hidden = true;
  if (is3) { // holographic 3D model: floor slabs, building boxes, belts and lifts
    const EX = 2.2, sc = {quads: [], boxes: [], lines: [], labels: [], icons: [], rowl: [], walls: []};
    floors.forEach((F, f) => { const e = z[f]*EX, P = plans[f];
      const r = fp[f]; sc.quads.push({p: [[r.x0,e,r.y0],[r.x1,e,r.y0],[r.x1,e,r.y1],[r.x0,e,r.y1]], f});
      sc.walls.push({r, e, h: fh[f]*EX});
      sc.labels.push({p: [r.x1 + 4, e + 1, r.y1], s: `${f+1} · ${fpTxt(f)}`, f});
      P.rows.forEach(rw => { const h = HGT[rw.b] || 10, tip = rw.tip;
        for (let x = rw.x0; x < rw.x1 - .5; x += (rw.x1 - rw.x0)/rw.cnt) sc.boxes.push({x: x + .4, y: e, z: rw.y, w: (rw.x1 - rw.x0)/rw.cnt - .8, h, d: rw.L, t: rw.t, f, tip});
        sc.rowl.push({p: [(rw.x0 + rw.x1)/2, e + h + 2, rw.y + rw.L/2], b: rw.b, it: rw.it, s: `×${rw.cnt} ${rw.nm}`, tip}); });
      if (P.store) { const tip = `${t('storage')}: ` + P.store.items.map(([it, q]) => `${I[it].n} ${fq(q)}${unit(it) ? ' ' + unit(it) : ''}${UU()}`).join(', ');
        sc.boxes.push({x: P.store.x, y: e, z: P.store.y1, w: 16, h: 4, d: P.store.y2 - P.store.y1, s: 1, f, tip});
        sc.rowl.push({p: [P.store.x + 8, e + 6, (P.store.y1 + P.store.y2)/2], b: 'Storage', its: P.store.items.map(x => x[0]), s: P.store.items.map(([it, q]) => fq(q) + (unit(it) ? ' ' + unit(it) : '') + UU()).join(' · '), tip, st: 1}); }
      P.lines.forEach(l => sc.lines.push({a: [l.a[0], e + .7, l.a[1]], b: [l.b[0], e + .7, l.b[1]], c: l.c, w: l.lane ? 2.2 : 1.4, f})); });
    const LX = plans[0].laneX;
    lanes.forEach(it => { const s = src(it), T = topUse(it); if (T <= s) return; const x = LX(it);
      for (let g = s + 1; g <= T; g++) sc.lines.push({a: [x, g - 1 < 0 ? (isExt(it) ? .3 : -5) : z[g-1]*EX + .7, 4.5], b: [x, z[g]*EX + .7, 4.5], c: col(it), w: 3.4, lift: 1, tip: desc(it, g)});
      if (s < 0 && !isExt(it)) sc.icons.push({p: [x, -7, 4.5], it}); });
    // logistics in 3D
    const gE = .3, roofE = totalH*EX, poly3 = (pts, e, c, tip) => { for (let i = 1; i < pts.length; i++) sc.lines.push({a: [pts[i-1][0], e, pts[i-1][1]], b: [pts[i][0], e, pts[i][1]], c, w: 1.8, tip}); };
    lgE.forEach(e => { const lg = {lg: 1, tip: e.tip};
      if (e.box) { const B = e.box, n = Math.max(1, Math.round((B.x1 - B.x0)/16));
        for (let i = 0; i < n; i++) sc.boxes.push({x: B.x0 + i*16 + .4, y: 0, z: B.y0, w: 15.2, h: B.h, d: B.y1 - B.y0, ...lg});
        sc.rowl.push({p: [(B.x0 + B.x1)/2, B.h + 3, (B.y0 + B.y1)/2], b: e.k, it: e.it, s: e.o.st.map(([, , n]) => '×' + n).join(' '), tip: e.tip});
        if (e.path) poly3(e.path, gE, e.c, e.tip);
        if (e.dir === 'out' && e.sx !== null) sc.lines.push({a: [e.sx, z[e.f]*EX + .7, e.sy], b: [e.sx, gE, e.sy], c: e.c, w: 3, lift: 1, tip: e.tip}); }
      else { e.ports.forEach(([px, pz]) => sc.boxes.push({x: px, y: roofE, z: pz, w: 24, h: 15, d: 24, ...lg}));
        sc.rowl.push({p: [e.ports[0][0] + 12, roofE + 18, e.ports[0][1] + 12], b: e.k, it: e.it, s: '×' + e.o.ports, tip: e.tip});
        if (e.path) { poly3(e.path, roofE + .7, e.c, e.tip); sc.lines.push({a: [e.dropX, roofE + .7, e.dropY], b: [e.dropX, e.dir === 'in' ? gE : z[e.f]*EX + .7, e.dropY], c: e.c, w: 3, lift: 1, tip: e.tip});
          if (e.dir === 'in') poly3([[e.dropX, 4.5], [LX0(e.it), 4.5]], gE, e.c, e.tip); } } });
    sc.wire = {x0: Math.min(bX0, lgX0), x1: Math.max(bX1, lgX1), z0: bY0, z1: Math.max(bY1, lgY1), h: totalH*EX + roofH};
    sc.c = [(bX0 + bX1)/2, totalH*EX/2, (bY0 + bY1)/2];
    C3.scene = sc; const sig3 = 'S' + rows.map(r => r.rid + ':' + r.m.n).join('|') + JSON.stringify(S.tr);
    if (sig3 !== C3.sig) { C3.sig = sig3; C3.fitted = false; }
    draw3D(); out = []; box = {x: 0, y: 0, w: 100, h: 100}; }
  else if (!NF) { out = []; box = {x: 0, y: 0, w: 100, h: 100}; }
  else if (S.floor) { const P = plans[S.floor - 1];
    const r = fp[S.floor - 1];
    const lgOut = [], fi = S.floor - 1, pth = (pts, c, tip) => `<path class="belt" style="stroke:${c}" d="M${pts.map(p => p[0]*U + ',' + p[1]*U).join(' L')}"><title>${esc(tip)}</title></path>`;
    const badge = (x, y, e, extra) => `<g class="slbl lgb"><title>${esc(e.tip)}</title><rect x="${x}" y="${y}" width="${74 + extra.length*15}" height="40" rx="9"/><image href="${IU(e.k)}" x="${x + 4}" y="${y + 3}" width="34" height="34"/><image href="${IU(e.it)}" x="${x + 40}" y="${y + 5}" width="30" height="30"/><text x="${x + 74}" y="${y + 27}">${esc(extra)}</text></g>`;
    let gyMax = -Infinity, gxMin = Infinity, gxMax = -Infinity;
    if (fi === 0) lgE.filter(e => e.box).forEach(e => { const B = e.box; gyMax = Math.max(gyMax, B.y1); gxMin = Math.min(gxMin, B.x0); gxMax = Math.max(gxMax, B.x1);
      if (e.path) lgOut.push(pth(e.path, e.c, e.tip));
      const n = Math.max(1, Math.round((B.x1 - B.x0)/16)); for (let i = 0; i < n; i++) lgOut.push(`<rect class="lgst" x="${(B.x0 + i*16 + .4)*U}" y="${B.y0*U}" width="${15.2*U}" height="${(B.y1 - B.y0)*U}" rx="${U}"><title>${esc(e.tip)}</title></rect>`);
      lgOut.push(badge(B.x0*U + 8, (B.y0 + B.y1)/2*U - 20, e, e.o.st.map(([, , n]) => '×' + n).join(' '))); });
    lgE.filter(e => e.f === fi && e.sx !== null).forEach(e => lgOut.push(`<g><title>${esc(e.tip)}</title><circle class="lgdrop" cx="${e.sx*U}" cy="${e.sy*U}" r="13" style="stroke:${e.c}"/><text class="lgarr" x="${e.sx*U}" y="${e.sy*U + 6}" text-anchor="middle">${e.ports ? '↑' : '↓'}</text></g>`));
    out = [`<rect class="zone" x="${bX0*U}" y="${bY0*U}" width="${(bX1-bX0)*U}" height="${(bY1-bY0)*U}"/>`, `<rect class="zone bldw" x="${r.x0*U}" y="${r.y0*U}" width="${(r.x1-r.x0)*U}" height="${(r.y1-r.y0)*U}"/>`, ...P.out, ...lgOut,
      `<text class="flab" x="${r.x0*U}" y="${Math.min(r.y0, gY0)*U - 30}">${esc(t('floor'))} ${S.floor} · ${fh[S.floor-1]} m · ${fpTxt(S.floor - 1)} ${esc(t('foundations'))}</text>`];
    const fX0 = Math.min(gX0, gxMin), fX1 = Math.max(gX1, gxMax), fY1 = Math.max(gY1, gyMax + 2);
    box = {x: fX0*U, y: gY0*U - 70, w: (fX1-fX0)*U, h: (fY1-gY0)*U + 70}; }
  else { // section: floors bottom-up, buildings at true height, lifts in the shaft
    const Y = m => -m*U*2, slbl = [];   // vertical ×2 so floors are readable; row labels drawn over the buildings
    floors.forEach((F, f) => { const P = plans[f], r = fp[f];
      out.push(`<rect class="zone bldw" x="${r.x0*U}" y="${Y(z[f] + fh[f])}" width="${(r.x1-r.x0)*U}" height="${fh[f]*U*2}"/><line class="slab" x1="${r.x0*U}" x2="${r.x1*U}" y1="${Y(z[f])}" y2="${Y(z[f])}"/><text class="flab big" x="${bX0*U - 24}" y="${Y(z[f] + fh[f]/2) + 10}" text-anchor="end">${f+1} · ${fh[f]} m · ${fpTxt(f)}</text>`);
      if (P.store) { const sx = P.store.x*U, sy = Y(z[f] + 4), its = P.store.items, tip = `${t('storage')}: ` + its.map(([it, q]) => `${I[it].n} ${fq(q)}${unit(it) ? ' ' + unit(it) : ''}${UU()}`).join(', ');
        out.push(`<rect class="sstore" x="${sx}" y="${sy}" width="${16*U}" height="${4*U*2}" rx="6"><title>${esc(tip)}</title></rect>`);
        slbl.push(`<g class="slbl st"><title>${esc(tip)}</title><rect x="${sx}" y="${sy - 50}" width="${44 + its.length*34 + its.map(([it, q]) => fq(q)).join(' · ').length*15}" height="40" rx="9"/><image href="${IU('Storage')}" x="${sx + 4}" y="${sy - 47}" width="34" height="34"/>${its.map(([it], i) => `<image href="${IU(it)}" x="${sx + 42 + i*34}" y="${sy - 46}" width="32" height="32"/>`).join('')}<text x="${sx + 46 + its.length*34}" y="${sy - 22}">${esc(its.map(([it, q]) => fq(q)).join(' · '))}</text></g>`); }
      // row labels: building and product icons, ×N and recipe; labels overlapping in width move to the next line
      const lines2 = [];
      P.rows.slice().sort((a, b) => a.x0 - b.x0).forEach(rw => { const tw = 92 + (`×${rw.cnt} ` + rw.nm).length*15, x0 = rw.x0*U;
        let li = 0; while ((lines2[li] || []).some(([a, b]) => x0 < b + 12 && a < x0 + tw)) li++; (lines2[li] ||= []).push([x0, x0 + tw]);
        const ty = Y(z[f] + fh[f]) + 14 + li*42;
        slbl.push(`<g class="slbl${rw.t ? ' t' : ''}"><title>${esc(rw.tip)}</title><rect x="${x0}" y="${ty}" width="${tw}" height="34" rx="9"/><image href="${IU(rw.b)}" x="${x0 + 4}" y="${ty + 2}" width="30" height="30"/><image href="${IU(rw.it)}" x="${x0 + 36}" y="${ty + 2}" width="30" height="30"/><text x="${x0 + 72}" y="${ty + 25}">×${rw.cnt} ${esc(rw.nm)}</text></g>`); });
      P.mach.forEach(m => out.push(`<rect class="smach" x="${(m.x+.4)*U}" y="${Y(z[f] + (HGT[m.b] || 10))}" width="${(m.W-.8)*U}" height="${(HGT[m.b] || 10)*U*2}" rx="6"><title>${esc(M[m.b].n)} — ${esc(I[m.it].n)}</title></rect>`)); });
    // logistics in section: stations at ground level (behind/in front), drone ports on the roof, outbound verticals
    let sxp = bX1 + 24;   // in the section, ground stations are drawn to the side so they don't cover floors (floor 1 plan shows their real place)
    lgE.forEach(e => { const tw = 74 + e.o.st.map(([, , n]) => '×' + n).join(' ').length*15, sb = (x, y) => `<g class="slbl lgb"><title>${esc(e.tip)}</title><rect x="${x}" y="${y}" width="${tw}" height="40" rx="9"/><image href="${IU(e.k)}" x="${x + 4}" y="${y + 3}" width="34" height="34"/><image href="${IU(e.it)}" x="${x + 40}" y="${y + 5}" width="30" height="30"/><text x="${x + 74}" y="${y + 27}">${esc(e.o.st.map(([, , n]) => '×' + n).join(' '))}</text></g>`;
      if (e.box) { const B = {...e.box, x0: sxp, x1: sxp + e.box.x1 - e.box.x0}; sxp = B.x1 + 8; out.push(`<rect class="slogi" x="${B.x0*U}" y="${Y(B.h)}" width="${(B.x1-B.x0)*U}" height="${B.h*U*2}" rx="6"><title>${esc(e.tip)} · ${esc(t('trGround'))}</title></rect>`); slbl.push(sb(B.x0*U + 6, Y(B.h) + 8));
        if (e.dir === 'out' && e.sx !== null) out.push(`<path class="belt bus lift lgv" style="stroke:${e.c}" d="M${e.sx*U},${Y(z[e.f] + 1)} V${Y(.3)}"><title>${esc(e.tip)}</title></path>`); }
      else { e.ports.forEach(([px]) => out.push(`<rect class="slogi" x="${px*U}" y="${Y(totalH + 15)}" width="${24*U}" height="${15*U*2}" rx="6"><title>${esc(e.tip)} · ${esc(t('trRoof'))}</title></rect>`)); slbl.push(sb(e.ports[0][0]*U + 6, Y(totalH + 15) - 48));
        if (e.dropX !== undefined && e.path) out.push(`<path class="belt bus lift lgv" style="stroke:${e.c}" d="M${e.dropX*U},${Y(totalH)} V${Y(e.dir === 'in' ? .3 : z[e.f] + 1)}"><title>${esc(e.tip)}</title></path>`); } });
    out.push(...slbl);
    const LX = plans[0].laneX;
    lanes.forEach(it => { const s = src(it), T = topUse(it); if (T <= s) return; const x = LX(it)*U, y0 = Y(s < 0 ? (isExt(it) ? .3 : -3) : z[s] + 1), y1 = Y(z[T] + 1.5);
      for (let g = s + 1; g <= T; g++) out.push(`<path class="belt bus lift" style="stroke:${col(it)}" d="M${x},${g - 1 < 0 ? y0 : Y(z[g-1] + 1)} V${g === T ? y1 : Y(z[g] + 1)}"><title>${esc(desc(it, g))}</title></path>`);
      out.push(`<image href="${IU(it)}" x="${x-13}" y="${y1-30}" width="26" height="26"><title>${esc(I[it].n)}</title></image>`);
      for (let g = s + 1; g <= T; g++) if (!(g === 0 && isExt(it))) out.push(`<rect class="hole" style="stroke:${col(it)}" x="${x-9}" y="${Y(z[g])-5}" width="18" height="10" rx="2"><title>${esc(desc(it, g))}</title></rect>`); });
    const sX0 = Math.min(bX0, lgX0), sX1 = Math.max(bX1, lgX1, sxp);
    box = {x: sX0*U - 520, y: Y(totalH + roofH) - 60 - (roofH ? 50 : 0), w: (sX1-sX0)*U + 560, h: (totalH + roofH)*U*2 + 120 + (roofH ? 50 : 0)}; }
  document.getElementById('lvp').innerHTML = out.join('');
  LZ.box = box;
  const kitHtml = ['Hole_Lift','Hole_Pipe','Lift_1','Lift_2','Lift_3','Lift_4','Lift_5','Lift_6','Pipe_1','Pipe_2'].filter(k => kit[k]).map(k => {
    const nm = kName(k), lv = k.startsWith('Hole') ? '' : (nm.match(/(\S*\s?\d+)\s*$/) || ['', ''])[1];
    return `<span class="kit" title="${esc(nm)} ×${kit[k]}"><img src="${IU(k)}" alt="${esc(nm)}" width="22" height="22">${lv ? `<i>${esc(lv)}</i>` : ''}×${kit[k]}</span>`; }).join('');
  document.getElementById('lsize').innerHTML = NF ? `≈ ${(bX1-bX0)/8} × ${(bY1-bY0)/8} ${esc(t('foundations'))} · Σ ${fTot} · ${NF} ${esc(t('floorsN'))} · ${totalH} m` : '';
  if (is3) return;
  const sig = 'B' + S.floor + rows.map(r => r.rid + ':' + r.m.n).join('|') + S.lang + JSON.stringify(S.tr);
  if (sig !== LZ.sig || !LZ.fitted) { LZ.sig = sig; fitLayout(); } else applyLZ();
}

/* ---------- 3D: holographic building view (canvas, orthographic projection, rotate with mouse/finger) ---------- */
const C3 = {yaw: -.75, pitch: .62, k: 1, ox: 0, oy: 0, scene: null, fitted: false, sig: '', img: {}};
function proj3(){ const sc = C3.scene, cy = Math.cos(C3.yaw), sy = Math.sin(C3.yaw), cp = Math.cos(C3.pitch), sp = Math.sin(C3.pitch);
  return ([X, Y, Z]) => { X -= sc.c[0]; Y -= sc.c[1]; Z -= sc.c[2]; const x = X*cy - Z*sy, z = X*sy + Z*cy; return [x*C3.k + C3.ox, (-Y*cp + z*sp)*C3.k + C3.oy, z*cp + Y*sp]; }; }
function fit3D(){ const cv = document.getElementById('l3d'), r = cv.getBoundingClientRect(), sc = C3.scene; if (!sc || !r.width) return;
  C3.k = 1; C3.ox = 0; C3.oy = 0; const P = proj3(), w = sc.wire, pts = [];
  for (const x of [w.x0, w.x1]) for (const y of [-6, w.h]) for (const z of [w.z0, w.z1]) pts.push(P([x, y, z]));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
  C3.k = Math.min((r.width - 80)/bw, (r.height - 170)/bh);
  C3.ox = r.width/2 - (Math.max(...xs) + Math.min(...xs))/2*C3.k; C3.oy = 45 + r.height/2 - (Math.max(...ys) + Math.min(...ys))/2*C3.k; C3.fitted = true; }
function draw3D(){
  const cv = document.getElementById('l3d'), r = cv.getBoundingClientRect(), sc = C3.scene; if (!sc || !r.width || cv.hidden) return;
  if (!C3.fitted) fit3D();
  const dpr = devicePixelRatio || 1; if (cv.width !== Math.round(r.width*dpr) || cv.height !== Math.round(r.height*dpr)) { cv.width = Math.round(r.width*dpr); cv.height = Math.round(r.height*dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
  C3.boxHits = [];
  const P = proj3(), prims = [], area = q => { let a = 0; for (let i = 0; i < q.length; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i+1) % q.length]; a += x1*y2 - x2*y1; } return a; };
  // sign of the face area: the top of a unit cube seen from above is always visible
  const V = [Math.sin(C3.yaw)*Math.cos(C3.pitch), Math.sin(C3.pitch), Math.cos(C3.yaw)*Math.cos(C3.pitch)];   // direction towards the viewer
  const HL = 'rgba(150,205,255,', poly = (q, fill, stroke, lw) => ({d: q.reduce((a, p) => a + p[2], 0)/q.length, q, fill, stroke, lw});
  // building frame
  // walls of each tier follow its own perimeter
  sc.walls.forEach(({r, e, h}) => [[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]].forEach(([x, z]) => { const a = P([x, e, z]), b = P([x, e + h, z]); prims.push({d: (a[2] + b[2])/2 - 1e4, l: [a, b], c: HL + '.22)', w: 1}); }));
  sc.quads.forEach(Q => { const q = Q.p.map(P); prims.push({...poly(q, HL + '.045)', HL + '.55)', 1.4), d: -1e5 + Q.f}); });
  sc.boxes.forEach(B => { const {x, y, z, w: bw, h, d} = B, v = [[x,y,z],[x+bw,y,z],[x+bw,y,z+d],[x,y,z+d],[x,y+h,z],[x+bw,y+h,z],[x+bw,y+h,z+d],[x,y+h,z+d]].map(P);
    // visible faces: normal points at the viewer
    const F = [[4,7,6,5,'t',[0,1,0]],[0,4,5,1,'s',[0,0,-1]],[1,5,6,2,'s',[1,0,0]],[2,6,7,3,'s',[0,0,1]],[3,7,4,0,'s',[-1,0,0]]];
    F.forEach(([a, b2, c, e, k, n]) => { if (n[0]*V[0] + n[1]*V[1] + n[2]*V[2] <= 0) return; const q = [v[a], v[b2], v[c], v[e]];
      const hov = B.tip && C3.hov === B.tip, base = hov ? 'rgba(255,255,255,' : B.lg ? 'rgba(242,162,58,' : B.t ? 'rgba(255,240,210,' : B.s ? 'rgba(255,255,255,' : HL, al = (k === 't' ? .2 : .09) + (hov ? .12 : 0);
      if (B.tip) C3.boxHits.push({q, d: q.reduce((a, p2) => a + p2[2], 0)/4, tip: B.tip});
      prims.push(poly(q, base + al + ')', base + (B.t || B.lg || hov ? '.85)' : '.5)'), hov ? 1.6 : 1)); }); });
  C3.hits = [];
  sc.lines.forEach(L => { const a = P(L.a), b = P(L.b), hov = L.tip && C3.hov === L.tip; if (L.tip) C3.hits.push({a, b, tip: L.tip});
    prims.push({d: (a[2] + b[2])/2 + (L.lift ? 2 : .5) + (hov ? 1e4 : 0), l: [a, b], c: hov ? '#fff' : L.c, w: L.w*Math.max(.5, Math.min(1.3, C3.k*.6))*(hov ? 1.6 : 1)}); });
  prims.sort((p, q) => p.d - q.d);
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const p of prims) {
    if (p.l) { g.strokeStyle = p.c; g.lineWidth = p.w; g.beginPath(); g.moveTo(p.l[0][0], p.l[0][1]); g.lineTo(p.l[1][0], p.l[1][1]); g.stroke(); continue; }
    g.beginPath(); p.q.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillStyle = p.fill; g.fill(); g.strokeStyle = p.stroke; g.lineWidth = p.lw; g.stroke(); }
  const redraw3D = () => { if (!C3.raf) C3.raf = requestAnimationFrame(() => { C3.raf = 0; draw3D(); }); };   // icons load in a batch — one redraw per frame
  const img = k => { let im = C3.img[k]; if (!im) { im = C3.img[k] = new Image(); im.onload = redraw3D; im.src = IU(k); } return im.complete && im.naturalWidth ? im : null; };
  const taken = [], showTxt = C3.k > 2.2; g.textAlign = 'left'; g.font = '600 11.5px ' + getComputedStyle(document.body).getPropertyValue('--f-body');
  sc.rowl.map(L => ({L, p: P(L.p)})).sort((a, b) => (b.L.st || 0) - (a.L.st || 0) || b.p[2] - a.p[2]).forEach(({L, p: [x, y]}) => {
    const s = 20, ics = L.its ? [L.b, ...L.its] : [L.b, L.it], tw = showTxt || L.st ? g.measureText(L.s).width + 8 : 0, w = s*ics.length + 2*(ics.length - 1) + 4 + tw, bx = x - w/2, by = y - s - 4;
    if (taken.some(([a, b2, c, d]) => bx < c && a < bx + w && by < d && b2 < by + s + 4)) return; taken.push([bx, by, bx + w, by + s + 4]);
    g.fillStyle = C3.hov === L.tip ? 'rgba(255,255,255,.95)' : 'rgba(14,18,26,.82)'; g.beginPath(); g.roundRect ? g.roundRect(bx, by, w, s + 4, 6) : g.rect(bx, by, w, s + 4); g.fill();
    ics.forEach((k, i) => { const im = img(k); if (im) g.drawImage(im, bx + 2 + i*(s + 2), by + 2, s, s); });
    if (showTxt || L.st) { g.fillStyle = C3.hov === L.tip ? '#111' : L.st ? 'rgba(255,240,210,.98)' : 'rgba(200,225,255,.95)'; g.fillText(L.s, bx + ics.length*(s + 2) + 6, by + s - 3); }
    C3.boxHits.push({rect: [bx, by, bx + w, by + s + 4], d: 1e9, tip: L.tip}); });
  g.font = '600 13px ' + getComputedStyle(document.body).getPropertyValue('--f-mono'); g.fillStyle = HL + '.9)'; g.textAlign = 'left'; g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 4;
  sc.labels.forEach(L => { const [x, y] = P(L.p); g.fillText(L.s, x, y); }); g.shadowBlur = 0;
  sc.icons.forEach(ic => { let im = C3.img[ic.it]; if (!im) { im = C3.img[ic.it] = new Image(); im.onload = redraw3D; im.src = IU(ic.it); }
    if (im.complete && im.naturalWidth) { const [x, y] = P(ic.p), s = 18; g.drawImage(im, x - s/2, y, s, s); } });
}
(() => {
  const cv = document.getElementById('l3d'), pts = new Map(); let last = null, pinch = null;
  cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(), f = Math.exp(-e.deltaY*(e.ctrlKey ? .01 : .0015)), cx = e.clientX - r.left, cy = e.clientY - r.top;
    C3.ox = cx - (cx - C3.ox)*f; C3.oy = cy - (cy - C3.oy)*f; C3.k *= f; draw3D(); }, {passive: false});
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY, e.button === 2 || e.shiftKey];
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = [Math.hypot(a[0]-b[0], a[1]-b[1]), (a[0]+b[0])/2, (a[1]+b[1])/2]; } });
  // hovering a lift: tooltip with lift/pipe tier and flow through the slab
  const tip = document.getElementById('tip3d');
  cv.addEventListener('pointermove', e => { if (pts.size || e.pointerType === 'touch') return; const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 9; (C3.hits || []).forEach(h => { const [ax, ay] = h.a, [bx, by] = h.b, dx = bx - ax, dy = by - ay, L2 = dx*dx + dy*dy || 1, u = Math.max(0, Math.min(1, ((mx - ax)*dx + (my - ay)*dy)/L2)), d = Math.hypot(ax + u*dx - mx, ay + u*dy - my); if (d < bd) { bd = d; best = h; } });
    if (!best) { const inP = q => { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const [xi, yi] = q[i], [xj, yj] = q[j]; if ((yi > my) !== (yj > my) && mx < (xj - xi)*(my - yi)/(yj - yi) + xi) c = !c; } return c; };
      let bdp = -Infinity; (C3.boxHits || []).forEach(h => { const ok = h.rect ? mx >= h.rect[0] && mx <= h.rect[2] && my >= h.rect[1] && my <= h.rect[3] : inP(h.q); if (ok && h.d > bdp) { bdp = h.d; best = h; } }); }
    const k = best ? best.tip : null; if (k !== C3.hov) { C3.hov = k; draw3D(); }
    if (best) { tip.hidden = false; tip.textContent = best.tip; tip.style.left = Math.min(mx + 14, r.width - tip.offsetWidth - 8) + 'px'; tip.style.top = (my + 16) + 'px'; } else tip.hidden = true; });
  cv.addEventListener('pointerleave', () => { tip.hidden = true; if (C3.hov) { C3.hov = null; draw3D(); } });
  cv.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a[0]-b[0], a[1]-b[1]), mx = (a[0]+b[0])/2, my = (a[1]+b[1])/2, r = cv.getBoundingClientRect(), f = d/pinch[0], cx = mx - r.left, cy = my - r.top;
      C3.ox = cx - (cx - C3.ox)*f + (mx - pinch[1]); C3.oy = cy - (cy - C3.oy)*f + (my - pinch[2]); C3.k *= f; pinch = [d, mx, my]; draw3D(); return; }
    const dx = e.clientX - last[0], dy = e.clientY - last[1]; last[0] = e.clientX; last[1] = e.clientY;
    if (last[2]) { C3.ox += dx; C3.oy += dy; } else { C3.yaw -= dx*.008; C3.pitch = Math.max(.08, Math.min(1.5, C3.pitch + dy*.006)); }   // same as the 3D map: it turns the way you drag
    if (!C3.raf) C3.raf = requestAnimationFrame(() => { C3.raf = 0; draw3D(); }); });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (pts.size === 1) { const [p] = [...pts.values()]; last = [p[0], p[1], false]; } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('dblclick', () => { C3.yaw = -.75; C3.pitch = .62; C3.fitted = false; draw3D(); });
  window.addEventListener('resize', () => { if (!cv.hidden) { C3.fitted = false; draw3D(); } });
})();
// floor switcher and 3D camera belong to "Building" only; hide 3D and tooltips when leaving the tab
document.addEventListener('click', e => { const fl = e.target.closest('[data-floor]'); if (fl) { S.floor = +fl.dataset.floor; render(); } });
VIEWS.bld = {el: 'lwrap', strip: true, refit(){ LZ.fitted = false; },
  render(rows, bal, target){ document.getElementById('lnoteT').textContent = t('buildingNote'); document.getElementById('floorBar').hidden = false; buildBuilding(rows, bal, target); },
  hide(){ document.getElementById('floorBar').hidden = true; document.getElementById('l3d').hidden = true; document.getElementById('tip3d').hidden = true; document.getElementById('lay').style.visibility = ''; },
  zoomBtn(k, r){ if (S.floor !== -1) return false; const f = k === 'in' ? 1.25 : .8;
    if (k === 'fit') { C3.yaw = -.75; C3.pitch = .62; C3.fitted = false; } else { C3.ox = r.width/2 - (r.width/2 - C3.ox)*f; C3.oy = r.height/2 - (r.height/2 - C3.oy)*f; C3.k *= f; }
    draw3D(); return true; }};
