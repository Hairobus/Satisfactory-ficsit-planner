/* ---------- layout ---------- */
// building footprints (width × length, m) from satisfactory.wiki.gg; inputs on one short side, outputs on the other
const DIM = {Build_ConstructorMk1_C:[8,10], Build_SmelterMk1_C:[5,10], Build_FoundryMk1_C:[10,10], Build_AssemblerMk1_C:[9,16], Build_ManufacturerMk1_C:[18,20],
  Build_OilRefinery_C:[10,22], Build_Blender_C:[18,16], Build_Packager_C:[8,8], Build_HadronCollider_C:[24,38], Build_Converter_C:[16,16], Build_QuantumEncoder_C:[22,50]};
const LZ = {k:1, x:0, y:0, sig:'', fitted:false, box:null};
const U = 10, LANE = 3, MAXN = 10, ROWGAP = 6;
// building heights (m) from satisfactory.wiki.gg — for floor heights
const HGT = {Build_ConstructorMk1_C:8.5, Build_SmelterMk1_C:8.5, Build_FoundryMk1_C:9, Build_AssemblerMk1_C:11, Build_ManufacturerMk1_C:12,
  Build_OilRefinery_C:30, Build_Blender_C:15, Build_Packager_C:12, Build_HadronCollider_C:32, Build_Converter_C:18, Build_QuantumEncoder_C:18};
const BELTS = [60,120,270,480,780,1200];
function makeBlocks(rows){
  // split a row so no belt in it exceeds the chosen belt tier and there are at most MAXN buildings per row
  const blocks = [];
  // flow goes bottom-up: supplier groups below consumer groups
  rows.slice().sort((a,b) => b.depth - a.depth).forEach(r => { const n = r.m.n, rr = R[r.rid];
    const maxF = Math.max(0, ...rr.in.concat(rr.out).filter(([it]) => I[it].f === 's').map(([,a]) => a*r.x));
    const byBelt = Math.ceil(maxF/S.belt - 1e-9), byCount = Math.ceil(n/MAXN);
    let parts = Math.min(n, Math.max(1, byCount, byBelt));
    while (parts < n && Math.ceil(n/parts)/n*maxF > S.belt + 1e-6) parts++;   // the largest part must fit too
    const better = byBelt > byCount ? BELTS.findIndex(c => c > S.belt && Math.ceil(maxF/c - 1e-9) <= byCount) : -1;
    const need = Math.ceil(n/parts)/n*maxF > S.belt + 1e-6 ? BELTS.findIndex(c => c >= Math.ceil(n/parts)/n*maxF - 1e-6) : -1;   // even a single building doesn't fit
    const base = Math.floor(n/parts), extra = n % parts;
    for (let p = 0; p < parts; p++) { const cnt = base + (p < extra ? 1 : 0);
      blocks.push({...r, cnt, share: cnt/n, part: parts > 1 ? `${p+1}/${parts}` : '', hint: p === 0 && better >= 0 ? better + 1 : 0, need: p === 0 && need >= 0 ? need + 1 : 0}); } });
  return blocks;
}
// colour coding: each resource has its own colour (golden angle around the hue wheel), the same on the bus, branches and splitters
const palOf = lanes => { const p = [...lanes]; return it => { let i = p.indexOf(it); if (i < 0) { p.push(it); i = p.length - 1; } return `hsl(${Math.round((i*137.508 + 20) % 360)} 70% 62%)`; }; };
// plan of one level: bus in the middle, rows on both sides (targets always on the right, towards storage).
// o.lanes — bus lane order (same on every floor), o.consumed — what goes from rows into the bus, o.inQ — what comes from below
// (raw or a lift from below), o.up — what goes up by lift, o.lift — a building floor plan (inputs through floor holes)
function planFloor(blocks, target, o){
  const laneItems = o.lanes, consumed = o.consumed, col = o.col;
  const busW = Math.max(1, laneItems.length) * LANE + 4, laneX = it => 2 + laneItems.indexOf(it) * LANE;
  const xR = busW + 6, xL = -6;
  const pts = {}, hit = (it, y) => (pts[it] ||= []).push(y);
  const cap = S.belt, ovI = (it, f) => I[it].f === 's' && f > cap + 1e-6;
  const lbl = (it, f) => `${fq(f)}${unit(it) ? ' ' + unit(it) : ''}${UU()}` + (ovI(it,f) && I[it].f === 's' ? ` · ${Math.ceil(f/cap)}× ${t('overflow')}` : '');
  const out = [], toStore = [], mach = [], lines = [], rowsI = [];   // lines — belts for the 3D view
  let yL = 0, yR = 0, minX = xL - 40, maxX = xR + 40;
  let side = 1; const topOf = {}, topSide = {}, hz = [];   // hz — horizontal belts already placed {y, a, b}
  blocks.forEach(B => {
    const r = R[B.rid], [W, L] = DIM[r.b] || [10, 12], x = B.x * B.share;
    const right = target[B.it] !== undefined ? true : o.balance ? yR >= yL : (side = -side) > 0;
    const dir = right ? 1 : -1, x0 = right ? xR : xL;
    const ins = r.in.map(([it,a]) => [it, a*x]), outs = r.out.map(([it,a]) => [it, a*x]);
    // rows grow upwards: the bottom of a new row is not above the top of the groups that feed it
    const Hb = 9 + (outs.length + ins.length)*LANE + L + ROWGAP;
    const limit = Math.min(right ? yR : yL, ...r.in.map(([it]) => o.balance && topSide[recipeOf(it)] !== right ? Infinity : topOf[recipeOf(it)] ?? Infinity));   // in compact mode — only suppliers on the same side
    // belts of left and right rows must not run on the same line on top of each other: if they match in height
    // and overlap in length — raise the row until all its belts lie on free lines
    const mx0 = i => right ? x0 + i*W : x0 - (i+1)*W, pX = (i, j, n) => mx0(i) + W*(j+1)/(n+1);
    const iy0 = 5 + outs.length*LANE + 1.5 + L + 2.5;
    const rel = [
      ...ins.map(([it], j) => [iy0 + j*LANE, laneX(it), pX(B.cnt - 1, j, ins.length)]),
      ...outs.map(([it], j) => [5 + j*LANE, consumed.has(it) ? laneX(it) : 1e9, consumed.has(it) ? pX(B.cnt - 1, j, outs.length) : pX(0, j, outs.length)])
    ].map(([dy, a, b]) => [dy, Math.min(a, b), Math.max(a, b)]);
    const clash = tp => rel.some(([dy, a, b]) => hz.some(h => Math.abs(h.y - (tp + dy)) < LANE*.9 && a < h.b + 1 && h.a < b + 1));
    let top = limit - Hb; for (let k = 0; k < 400 && clash(top); k++) top -= 1;
    rel.forEach(([dy, a, b]) => hz.push({y: top + dy, a, b}));
    const ly = top + 2.5, oy = outs.map((_, j) => top + 5 + j*LANE), my = top + 5 + outs.length*LANE + 1.5, by = my + L, iy = ins.map((_, j) => by + 2.5 + j*LANE);
    const mxOf = i => right ? x0 + i*W : x0 - (i+1)*W;           // left edge of building i
    const far = right ? x0 + B.cnt*W : x0 - B.cnt*W;               // far edge of the row
    const portX = (i, j, n) => mxOf(i) + W*(j+1)/(n+1);
    const tx = far + dir*2, anchor = right ? 'start' : 'end';
    for (let i = 0; i < B.cnt; i++) {
      const mx = mxOf(i); mach.push({x: mx, y: my, W, L, b: r.b, it: B.it, t: target[B.it] !== undefined});
      out.push(`<rect class="mach${target[B.it] !== undefined ? ' t' : ''}" x="${(mx+.4)*U}" y="${my*U}" width="${(W-.8)*U}" height="${L*U}" rx="${U}"><title>${esc(M[r.b].n)} — ${esc(I[B.it].n)}</title></rect>`);
      const s = Math.min(W, L)*.55*U; out.push(`<image href="${IU(r.b)}" x="${(mx + W/2)*U - s/2}" y="${(my + L/2)*U - s/2}" width="${s}" height="${s}"/>`);
      ins.forEach(([it], j) => { const px = portX(i, j, ins.length);
        out.push(`<line class="conn" style="stroke:${col(it)}" x1="${px*U}" y1="${by*U}" x2="${px*U}" y2="${iy[j]*U}"/><rect class="spl" style="stroke:${col(it)}" x="${px*U-9}" y="${iy[j]*U-9}" width="18" height="18" rx="3"><title>Splitter · ${esc(I[it].n)}</title></rect>`); });
      outs.forEach(([it], j) => { const px = portX(i, j, outs.length);
        out.push(`<line class="conn" style="stroke:${col(it)}" x1="${px*U}" y1="${my*U}" x2="${px*U}" y2="${oy[j]*U}"/><rect class="mrg" style="fill:${col(it)}" x="${px*U-8}" y="${oy[j]*U-8}" width="16" height="16" rx="3"><title>Merger · ${esc(I[it].n)}</title></rect>`); });
    }
    const farPort = (j, n) => portX(B.cnt - 1, j, n), nearPort = (j, n) => portX(0, j, n);
    const flowTxt = (it, f, y) => `<g class="txt"><image href="${IU(it)}" x="${(right ? tx : tx - 3)*U}" y="${y*U-13}" width="26" height="26"/><text class="${ovI(it,f) ? 'lw' : 'ls'}" x="${right ? tx*U + 32 : (tx - 3.4)*U}" y="${y*U+6}" text-anchor="${anchor}">${esc(lbl(it,f))}</text></g>`;
    ins.forEach(([it]) => lines.push({c: col(it), a: [laneX(it), iy[ins.findIndex(q => q[0] === it)]], b: [farPort(ins.findIndex(q => q[0] === it), ins.length), iy[ins.findIndex(q => q[0] === it)]]}));
    outs.forEach(([it], j) => lines.push({c: col(it), a: [consumed.has(it) ? laneX(it) : nearPort(j, outs.length), oy[j]], b: [consumed.has(it) ? farPort(j, outs.length) : 1e9, oy[j]]}));
    ins.forEach(([it,f], j) => { out.push(`<path class="belt${ovI(it,f) ? ' ov' : ''}" style="stroke:${col(it)}" d="M${laneX(it)*U},${iy[j]*U} H${farPort(j, ins.length)*U}"><title>${esc(I[it].n)}: ${lbl(it,f)}</title></path>`); out.push(flowTxt(it, f, iy[j])); hit(it, iy[j]); });
    outs.forEach(([it,f], j) => {
      if (consumed.has(it)) { out.push(`<path class="belt${ovI(it,f) ? ' ov' : ''}" style="stroke:${col(it)}" d="M${farPort(j, outs.length)*U},${oy[j]*U} H${laneX(it)*U}"><title>${esc(I[it].n)}: ${lbl(it,f)}</title></path>`); hit(it, oy[j]); }
      else toStore.push({it, f, y: oy[j], x: nearPort(j, outs.length), right, ov: ovI(it,f)});   // the line to storage is drawn as one piece below
      // belts to storage continue further, so the label goes under the line, not on top of it
      out.push(flowTxt(it, f, consumed.has(it) ? oy[j] : oy[j] + 2.3)); });
    out.push(`<g class="txt"><text class="lt" x="${x0*U}" y="${ly*U + 7}" text-anchor="${right ? 'start' : 'end'}">×${B.cnt} ${esc(M[r.b].n)} · ${esc((r.alt ? t('alt') + ': ' : '') + shortName(r))}${B.part ? ` (${B.part})` : ''}${B.need ? `<tspan class="lh" dx="14">${esc(t('beltNeed').replace('{n}', B.need))}</tspan>` : B.hint ? `<tspan class="lh" dx="14">${esc(t('beltHint').replace('{n}', B.hint))}</tspan>` : ''}</text></g>`);
    { const xs = [mxOf(0), mxOf(B.cnt - 1)]; rowsI.push({x0: Math.min(...xs), x1: Math.max(...xs) + W, y: my, L, b: r.b, it: B.it, cnt: B.cnt, t: target[B.it] !== undefined,
      nm: (r.alt ? t('alt') + ': ' : '') + shortName(r) + (B.part ? ` (${B.part})` : ''), tip: `×${B.cnt} ${M[r.b].n} · ${(r.alt ? t('alt') + ': ' : '') + shortName(r)}${B.part ? ` (${B.part})` : ''} · ${fq(r.out.find(o => o[0] === B.it)[1]*x)}${unit(B.it) ? ' ' + unit(B.it) : ''}${UU()}`}); }
    if (right) yR = top; else yL = top;
    topOf[B.rid] = Math.min(topOf[B.rid] ?? Infinity, top); topSide[B.rid] = right;
    const span = Math.max(...[...ins, ...outs].map(([it,f]) => lbl(it,f).length)) * 1.05 + 6;
    if (right) maxX = Math.max(maxX, far + span); else minX = Math.min(minX, far - span);
  });
  const bottom = 0, minTop = Math.min(yL, yR); let rawTxt = 0;
  const flowTxt0 = (it, f, x, y) => `<g class="txt"><image href="${IU(it)}" x="${x*U}" y="${y*U-13}" width="26" height="26"/><text class="ls" x="${x*U + 32}" y="${y*U+6}">${esc(lbl(it,f))}</text></g>`;
  const hole = (it, y) => `<image href="${IU(I[it].f === 's' ? 'Hole_Lift' : 'Hole_Pipe')}" x="${laneX(it)*U-15}" y="${y}" width="30" height="30"><title>${esc(o.desc && o.desc[it] ? o.desc[it] : t(I[it].f === 's' ? 'gLiftHole' : 'gPipeHole') + ' · ' + I[it].n)}</title></image>`;
  // bus lane; on a building floor the input from below and the lift up share one point (bottom of the lane) so the lift is vertical
  laneItems.forEach(it => { const ys = pts[it] || [], inn = o.inQ[it] !== undefined, upp = o.up.has(it); if (!ys.length && !inn && !upp) return;
    const lx = laneX(it), y1 = ys.length ? Math.min(...ys) : bottom - 2, y2 = inn || upp ? bottom + 4 : Math.max(...ys);
    lines.push({c: col(it), a: [lx, y1], b: [lx, y2], lane: true});
    out.unshift(`<path class="belt bus${o.lift && (inn || upp) ? ' lift' : ''}" style="stroke:${col(it)}" d="M${lx*U},${y1*U} V${y2*U}"><title>${esc(I[it].n)}</title></path>`);
    if (inn || upp) { const q = o.inQ[it] || 0, iy0 = (bottom + 5)*U, ty = iy0 + (o.lift || (o.ext && o.ext.has(it)) ? 70 : 36), s = (q > EPS ? fq(q) + (unit(it) ? ' ' + unit(it) : '') + UU() : '') + (upp ? ' ↑' : ''); rawTxt = Math.max(rawTxt, s.length + (o.lift || (o.ext && o.ext.has(it)) ? 4 : 0));
      // input from below (raw or a lift through a floor hole); label rotated vertically so neighbouring lanes don't overlap
      // delivered by transport (o.ext: item → station icon): input comes from the receiving station, not from a floor hole
      const st = o.ext && o.ext.get(it), stI = st ? `<image href="${IU(st)}" x="${lx*U-15}" y="${iy0}" width="30" height="30"><title>${esc(I[it].n)}: ${esc(t('trIn'))}</title></image>` : '';
      out.push(`<g><title>${esc(I[it].n)}: ${esc(s)}</title>${st ? stI : o.lift ? hole(it, iy0) : ''}<image href="${IU(it)}" x="${lx*U-14}" y="${o.lift || st ? iy0 + 34 : iy0}" width="28" height="28"/><text class="ls txt" x="${lx*U+6}" y="${ty}" transform="rotate(-90 ${lx*U+6} ${ty})" text-anchor="end">${esc(s)}</text></g>`); }
    else out.push(`<image href="${IU(it)}" x="${lx*U-11}" y="${y1*U-28}" width="22" height="22"><title>${esc(I[it].n)}</title></image>`); });
  // a target also consumed inside the chain: its storage share is a branch off the bus above the rows (on one floor, `o.tStore`)
  Object.entries(target).forEach(([it, q]) => { if (!consumed.has(it) || !(pts[it] || []).length || (o.tStore && o.tStore.has(it))) return; if (o.tStore) o.tStore.add(it);
    const y = minTop - 2 - toStore.filter(s2 => s2.tap).length*LANE; toStore.push({it, f: q, y, x: laneX(it), right: true, ov: false, tap: true});
    lines.push({c: col(it), a: [laneX(it), y], b: [1e9, y]}); out.push(flowTxt0(it, q, laneX(it) + 2, y + 2.3)); });
  if (toStore.length) { const sx = o.Ws ? xR + o.Ws - 16 : maxX + 2, sy1 = Math.min(...toStore.map(s => s.y)) - 4, sy2 = Math.max(...toStore.map(s => s.y)) + 4;
    const grp = {}; toStore.forEach(s2 => { grp[s2.it] = (grp[s2.it] || 0) + s2.f; });   // a row split into parts — one line at storage
    var store = {x: sx, y1: sy1, y2: sy2, items: Object.entries(grp)};
    toStore.forEach(s => out.push(`<path class="belt${s.ov ? ' ov' : ''}" style="stroke:${col(s.it)}" d="M${s.x*U},${s.y*U} H${sx*U}"><title>${esc(I[s.it].n)}: ${lbl(s.it, s.f)}</title></path>`));
    out.push(`<rect class="store" x="${sx*U}" y="${sy1*U}" width="${16*U}" height="${(sy2-sy1)*U}" rx="${U}"/><text class="storet" x="${(sx+8)*U}" y="${(sy1+sy2)/2*U+8}" text-anchor="middle">${t('storage')}</text>`);
    maxX = sx + 18; }
  lines.forEach(l => { if (l.b[0] === 1e9) l.b[0] = maxX - 16; });   // belts to storage — up to the storage
  const X = minX - 4, Y = toStore.reduce((m, s2) => Math.min(m, s2.y), minTop) - 4, w = maxX - minX + 8, h = bottom + 12 + rawTxt*1.05 + (o.lift ? 4 : 0) - Y;
  // bounds of the buildings, belts, bus and storage (no labels) — used for the floor area
  const gx = [], gy = [], ext = (x, y) => { gx.push(x); gy.push(y); };
  mach.forEach(m => { ext(m.x, m.y - 5 - LANE*2); ext(m.x + m.W, m.y + m.L + 3 + LANE*2); });
  lines.forEach(l => { ext(...l.a); ext(...l.b); }); if (typeof store !== 'undefined') { ext(store.x, store.y1); ext(store.x + 16, store.y2); }
  if (o.lift && (Object.keys(o.inQ).length || o.up.size)) ext(laneX(laneItems[0]) || 0, bottom + 9);
  const geo = gx.length ? {x0: Math.min(...gx) - 2, x1: Math.max(...gx) + 2, y0: Math.min(...gy) - 2, y1: Math.max(...gy) + 2} : {x0: 0, x1: 8, y0: -8, y1: 0};
  return {out, X, Y, w, h, geo, busW, mach, rows: rowsI, laneX, lines, store: typeof store === 'undefined' ? null : store};
}
// raw delivered by transport: item → receiving station icon (truck station, freight platform, drone port)
const extIn = L => new Map(L.map(([it, q]) => { const o = logi(it, q, 'in'); return TRM[o.m] && !o.need ? [it, o.st[o.m === 'train' ? 1 : 0][0]] : null; }).filter(Boolean));
function buildLayout(rows, bal, target){
  const blocks = makeBlocks(rows);
  const consumed = new Set(); rows.forEach(({rid}) => R[rid].in.forEach(([it]) => consumed.add(it)));
  const lanes = [], lane = it => { if (!lanes.includes(it)) lanes.push(it); }, inQ = {};
  Object.entries(bal).filter(([it,b]) => b < -EPS && solveRecipe(it) === 'raw').forEach(([it,b]) => { lane(it); inQ[it] = -b; });
  rows.slice().reverse().forEach(({rid}) => R[rid].out.forEach(([it]) => { if (consumed.has(it)) lane(it); }));
  const P = planFloor(blocks, target, {lanes, consumed, inQ, up: new Set(), lift: false, col: palOf(lanes), ext: extIn(Object.keys(inQ).map(it => [it, inQ[it]]))});
  P.out.unshift(`<rect class="zone" x="${P.X*U}" y="${P.Y*U}" width="${P.w*U}" height="${P.h*U}"/>`);
  document.getElementById('lvp').innerHTML = P.out.join('');
  LZ.box = {x: P.X*U, y: P.Y*U, w: P.w*U, h: P.h*U};
  document.getElementById('lsize').textContent = blocks.length ? `≈ ${Math.ceil(P.w/8)} × ${Math.ceil(P.h/8)} ${t('foundations')}` : '';
  const sig = 'L' + rows.map(r => r.rid + ':' + r.m.n).join('|') + S.lang;
  if (sig !== LZ.sig || !LZ.fitted) { LZ.sig = sig; fitLayout(); } else applyLZ();
}

function applyLZ(){ document.getElementById('lvp').setAttribute('transform', `translate(${LZ.x},${LZ.y}) scale(${LZ.k})`); document.getElementById('lay').classList.toggle('far', LZ.k < .3); }
function fitLayout(){ const r = document.getElementById('lay').getBoundingClientRect(); if (!LZ.box || !r.width) return; LZ.fitted = true;
  const B = LZ.box, k = Math.min(1.2, (r.width - 40)/B.w, (r.height - 70)/B.h); LZ.k = Math.max(.03, k);
  LZ.x = (r.width - B.w*LZ.k)/2 - B.x*LZ.k; LZ.y = 50 + (r.height - 60 - B.h*LZ.k)/2 - B.y*LZ.k; applyLZ(); }
function zoomLZ(f, cx, cy){ const k = Math.min(4, Math.max(.03, LZ.k*f)); LZ.x = cx - (cx - LZ.x)*k/LZ.k; LZ.y = cy - (cy - LZ.y)*k/LZ.k; LZ.k = k; applyLZ(); }
(() => {
  const svg = document.getElementById('lay'), pts = new Map(); let lastP = null, pinch = null;
  svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomLZ(Math.exp(-e.deltaY*(e.ctrlKey ? .01 : .0015)), e.clientX - r.left, e.clientY - r.top); }, {passive:false});
  svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); lastP = [e.clientX, e.clientY]; svg.classList.add('drag');
    if (pts.size === 2) { const [a,b] = [...pts.values()]; pinch = Math.hypot(a[0]-b[0], a[1]-b[1]); } });
  svg.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch) { const [a,b] = [...pts.values()], d = Math.hypot(a[0]-b[0], a[1]-b[1]), r = svg.getBoundingClientRect(); zoomLZ(d/pinch, (a[0]+b[0])/2 - r.left, (a[1]+b[1])/2 - r.top); pinch = d; return; }
    LZ.x += e.clientX - lastP[0]; LZ.y += e.clientY - lastP[1]; lastP = [e.clientX, e.clientY]; applyLZ(); });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) svg.classList.remove('drag'); else lastP = [...pts.values()][0]; };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  document.getElementById('lctl').addEventListener('click', e => { const b = e.target.closest('[data-lz]'); if (!b) return; const r = svg.getBoundingClientRect();
    if (VIEWS[S.view].zoomBtn && VIEWS[S.view].zoomBtn(b.dataset.lz, r)) return;   // the tab has its own way (3D camera)
    if (b.dataset.lz === 'fit') fitLayout(); else zoomLZ(b.dataset.lz === 'in' ? 1.25 : .8, r.width/2, r.height/2); });
})();
VIEWS.layout = {el: 'lwrap', strip: true, refit(){ LZ.fitted = false; },
  render(rows, bal, target){ document.getElementById('lnoteT').textContent = t('layoutNote'); buildLayout(rows, bal, target); }};
