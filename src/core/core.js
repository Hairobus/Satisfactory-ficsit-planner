const DATA = __DATA__;
const ICONS = __ICONS__;
// icons are embedded in the file (local build) or sit next to it in an icons folder (online build)
const IU = n => ICONS[n] || `icons/${n}.png`;
const I = DATA.items, R = DATA.recipes, M = DATA.mach, RAW = new Set(DATA.raw);
const EPS = 1e-7;
const SOLID = new Set(['Desc_OreIron_C','Desc_OreCopper_C','Desc_Stone_C','Desc_Coal_C','Desc_OreGold_C','Desc_RawQuartz_C','Desc_Sulfur_C','Desc_OreBauxite_C','Desc_OreUranium_C','Desc_SAM_C']);
const SE = n => `Desc_SpaceElevatorPart_${n}_C`;
const PHASES = [[1,[[1,50]]],[2,[[1,1000],[2,1000],[3,100]]],[3,[[2,2500],[4,500],[5,100]]],[4,[[7,500],[6,500],[8,250],[9,100]]],[5,[[9,1000],[10,1000],[12,256],[11,200]]]]
  .map(([n,L]) => [n, L.map(([p,q]) => [SE(p), q])]);
const UF = {s:1/60, min:1, h:60};
const L10N = __L10N__, UI = __UI__;   // in-game localization names (Docs/*.json) + UI translations
const t = k => ((UI.T[S.lang] || UI.T['en-US'])[k] ?? UI.T['en-US'][k] ?? k);
const UU = () => t({s:'us', min:'umin', h:'uh'}[S.unit]);
const LOC = () => (UI.META[S.lang] || UI.META['en-US'])[1];

/* ---------- logistics: trucks, tractor, train, drones ---------- */
// item stack size (Docs: mCachedStackSize), default 100
const STK = {"50":"HazmatFilter Filter Computer ModularFrame ModularFrameHeavy Motor SpaceElevatorPart_1 SpaceElevatorPart_2 SpaceElevatorPart_3 SpaceElevatorPart_4 SpaceElevatorPart_5 SpaceElevatorPart_6 SpaceElevatorPart_7 SpaceElevatorPart_8 SpaceElevatorPart_9 SpaceElevatorPart_11 SpaceElevatorPart_12 SpaceElevatorPart_10 ModularFrameFused MotorLightweight Crystal Crystal_mk2 Crystal_mk3 ModularFrameLightweight PressureConversionCube ComputerSuper XmasStar XmasWreath SingularityCell AlienDNACapsule HogParts SpitterParts StingerParts HatcherParts NobeliskExplosive NobeliskCluster NobeliskGas NobeliskNuke NobeliskShockwave NuclearFuelRod PlutoniumFuelRod FicsoniumFuelRod AlienPowerFuel","200":"IronPlate IronRod Cable AluminumCasing AluminumPlate CopperSheet SteelPipe SteelPlate Silica Plastic CircuitBoard Rubber PolymerResin PetroleumCoke QuartzCrystal Battery Gunpowder PlutoniumCell TimeCrystal Diamond FicsiteMesh DarkMatter UraniumCell Gift XmasBall1 XmasBall2 Biofuel Wood GenericBiomass Mycelia","500":"Wire AluminumScrap Cement IronScrew HighSpeedWire NuclearWaste PlutoniumWaste NonFissibleUranium CopperDust XmasBranch Snow Leaves CartridgeSmartProjectile CartridgeChaos CartridgeStandard"};
const STACK = {}; for (const [n, L] of Object.entries(STK)) L.split(' ').forEach(k => STACK['Desc_' + k + '_C'] = +n);
const stackOf = it => STACK[it] || 100;
// figures from Docs (capacity, power, drone trip) and satisfactory.wiki.gg (speed, docking, size W×D×H, m)
// v — top speed, m/min; dock — docking time per round trip, min
const TRM = {
  truck:   {pw: 75, s: 48, l: 3200, v: 89000/60, dock: 16/60, veh: 'nTruck', vehL: 'nFTruck', st: 'nTruckSt', stL: 'nFTruckSt', p: 20, ico: 'TR_truck', dim: [16, 22, 12], g: 1},
  tractor: {pw: 55, s: 25, v: 69000/60, dock: 16/60, veh: 'nTractor', st: 'nTruckSt', p: 20, ico: 'TR_tractor', dim: [16, 22, 12], g: 1},
  train:   {s: 32, l: 2400, v: 120000/60, dock: 54/60, veh: 'nWagon', st: 'nTrainSt', pl: 'nPlat', plL: 'nFPlat', p: 50, ico: 'TR_train', dim: [16, 34, 20], g: 1},
  drone:   {s: 9, v: 75*60, dock: 102/60, veh: 'nDrone', st: 'nDronePort', p: 100, ico: 'TR_drone', dim: [24, 24, 15]}
};
const trModes = (it, dir) => [dir === 'out' ? 'store' : 'belt', 'truck', ...(I[it].f === 's' ? ['tractor'] : []), 'train', ...(I[it].f === 's' ? ['drone'] : [])];
const trCfg = (it, dir) => { const c = S.tr[dir + ':' + it] || linkCfg(it, dir), d0 = dir === 'out' ? 'store' : 'belt';
  return c && trModes(it, dir).includes(c.m) ? c : c ? {...c, m: d0} : {m: d0}; };   // invalid type (tractor/drone for fluids) — falls back to the default
const trName = (m, it) => m === 'store' ? t('storage') : m === 'belt' ? t(I[it].f === 's' ? 'conveyor' : 'pipeline') : m === 'train' ? t('nLoco') : t(I[it].f !== 's' && TRM[m].vehL ? TRM[m].vehL : TRM[m].veh);
const trIco = (m, it) => m === 'store' ? 'Storage' : m === 'belt' ? (I[it].f === 's' ? 'Belt_' + S.belt : 'Pipe_2') : m === 'truck' && I[it].f !== 's' ? 'TR_ftruck' : TRM[m].ico;
// at — where the button is (target/raw/logistics/lane): the popup opens under the one that was clicked
const trBtn = (it, dir, at = 'sm') => { const c = trCfg(it, dir), nm = t(dir === 'out' ? 'trOut' : 'trIn') + ': ' + trName(c.m, it);
  return `<button type="button" class="trb${TRM[c.m] ? ' on' : ''}" data-tr="${it}" data-dir="${dir}" data-at="${at}" title="${esc(nm)}" aria-label="${esc(nm + ' · ' + I[it].n)}" aria-haspopup="dialog"><img src="${IU(trIco(c.m, it))}" alt="" width="20" height="20"></button>`; };
// one flow q (per minute): how many vehicles/cars/drones, stations here, power and fuel
// vehicle fuel (truck, tractor): energy, MJ — from the wiki table (burn time × 75 MW of the truck). The tank is one slot, up to a stack;
// the station refuels exactly one round trip, so the "there and back" cycle must fit in one stack. We count strictly: engine
// at full power for the whole drive plus 10 % reserve (FRES) — so it surely suffices in game.
const FUEL = {Desc_Coal_C: 300, Desc_CompactedCoal_C: 630, Desc_PetroleumCoke_C: 180, Desc_Biofuel_C: 450, Desc_GenericBiomass_C: 180, Desc_Wood_C: 100, Desc_Mycelia_C: 20, Desc_Leaves_C: 15,
  Desc_Fuel_C: 750, Desc_PackagedBiofuel_C: 750, Desc_PackagedOil_C: 320, Desc_PackagedOilResidue_C: 400, Desc_TurboFuel_C: 2000, Desc_PackagedRocketFuel_C: 7200, Desc_PackagedIonizedFuel_C: 10000,
  Desc_Battery_C: 6000, Desc_NuclearFuelRod_C: 750000, Desc_PlutoniumFuelRod_C: 1500000, Desc_FicsoniumFuelRod_C: 150000};
const FRES = 1.1, fuelOf = c => FUEL[c.f] ? c.f : 'Desc_Coal_C';
const fuelRange = (m, f) => FUEL[f]*stackOf(f)*(TRM[m].v/60)/(2*TRM[m].pw*FRES);   // longest one-way distance, m
function logi(it, q, dir){
  const c = trCfg(it, dir), m = c.m; if (!TRM[m]) return {m};
  const T0 = TRM[m], fl = I[it].f !== 's', cap = fl ? T0.l : T0.s*stackOf(it), port = fl ? 600 : S.belt;
  const md = c.d > 0 ? 0 : (typeof mapDist === 'function' ? mapDist(it, dir) : 0), dist = c.d > 0 ? c.d : md;   // own distance or from the "Map" tab
  const T = dist > 0 ? 2*dist/T0.v + T0.dock : 0;
  if (!T) return {m, need: true, fl};
  const trips = q/cap, nV = Math.max(1, Math.ceil(q*T/cap - 1e-9)), o = {m, fl, cap, T, trips, dist, map: md > 0, est: true, st: [], P: 0, N: 0};
  if (m === 'truck' || m === 'tractor') { const n = Math.max(1, Math.ceil(q/(2*port) - 1e-9), Math.ceil(trips*8/60 - 1e-9));   // 2 outputs, docking 8 s
    o.veh = [[fl ? 'TR_ftruck' : T0.ico, fl && T0.vehL ? T0.vehL : T0.veh, nV]]; o.st = [[fl ? 'ST_ftruck' : 'ST_truck', fl ? T0.stL : T0.st, n]]; o.P = 20*n; o.N = n; o.w = 16*n;
    o.fuel = fuelOf(c); o.maxD = fuelRange(m, o.fuel); o.over = dist > o.maxD;
    o.fuelQ = trips*T0.pw*(2*dist/(T0.v/60))/FUEL[o.fuel]; }   // fuel items per minute: trips/min × MJ per trip / MJ per item
  else if (m === 'train') { const n = Math.max(nV, Math.ceil(q/(2*port) - 1e-9));   // a freight car at each platform
    o.veh = [['TR_loco', 'nLoco', 1], [T0.ico, 'nWagon', n]]; o.st = [['ST_train', 'nTrainSt', 1], [fl ? 'ST_fplat' : 'ST_plat', fl ? T0.plL : T0.pl, n]]; o.P = 50 + 50*n + 110; o.N = 1 + n; o.w = 16*(1 + n); o.plats = n; }   // + locomotive: up to 110 MW while accelerating (wiki; 25 MW idle) — we count the maximum
  else { const d = dist;
    const n = dir === 'out' ? Math.max(nV, Math.ceil(q/port - 1e-9)) : Math.max(1, Math.ceil(q/port - 1e-9), Math.ceil(trips*51/60 - 1e-9));   // each drone has its own port at the sender; landing 51 s
    o.veh = [[T0.ico, 'nDrone', nV]]; o.st = [['ST_drone', 'nDronePort', n]]; o.P = 100*n; o.N = n; o.bat = trips*(24000 + 6*d)/6000; o.ports = n; }   // Docs: 24000 MJ + 6 MJ/m per trip, battery 6000 MJ
  return o;
}
// transport icons — from the game (xicons/TR_*, ST_*; the 1.2 fluid truck uses the regular truck icon for now)

const producers = {};
for (const [id, r] of Object.entries(R)) r.out.forEach(([it], i) => (producers[it] ||= []).push({id, main: i === 0}));
function defaultRecipe(it){
  if (RAW.has(it)) return 'raw';
  const L = producers[it] || [], ok = p => !/Unpackage/.test(p.id), f = fn => L.find(fn);
  const c = f(p => p.main && !R[p.id].alt && ok(p) && R[p.id].n === I[it].n) || f(p => p.main && !R[p.id].alt && ok(p)) || f(p => p.main && ok(p)) || f(p => !R[p.id].alt && ok(p)) || L[0];
  return c ? c.id : 'raw';
}

// The site always opens clean: targets and chosen recipes are not saved.
// Only settings are remembered (units, clock speed, miner, node, belt) and the alternates marked as unlocked.
const STORE = 'ficsit-planner-v2', KEEP = ['clock','mk','purity','belt','unlocked','onlyOpen','view','unit','lang','stepMode','mapPos','mapRes','mapReg','mapGrid','mapRelief','mapIso','map3d','mapSuit'];
// View tabs are modules from src/views/*: each registers itself in VIEWS and draws its own view.
// {el: container id, render(rows, bal, target), hide(), refit(), strip: show the logistics strip}
const VIEWS = {};
const LIM_MACH = 1500;   // above this many buildings "Layout" and "Building" are not drawn (the browser would freeze)
const refitViews = () => Object.values(VIEWS).forEach(v => v.refit && v.refit());
let S = {targets:[], choice:{}, clock:100, mk:2, purity:1, belt:270, unlocked:[], onlyOpen:false, view:'list', unit:'min', lang:'', stepMode:'step', expanded:[], floor:0, tr:{}, mapPos:null, mapRes:null, mapReg:true, mapGrid:true, mapRelief:true, mapIso:true, map3d:false};
try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s) KEEP.forEach(k => { if (s[k] !== undefined) S[k] = s[k]; }); } catch(e) {}
if (!UF[S.unit]) S.unit = 'min';
if (!L10N[S.lang]) { const nav = (navigator.languages || [navigator.language || 'en']).map(x => x.toLowerCase());
  const pick = c => nav.some(n => n === c.toLowerCase() || n.split('-')[0] === c.toLowerCase().split('-')[0] && !c.startsWith('zh'));
  S.lang = nav.some(n => n.startsWith('zh-tw') || n.startsWith('zh-hk') || n.includes('hant')) ? 'zh-Hant' : nav.some(n => n.startsWith('zh')) ? 'zh-Hans'
    : Object.keys(L10N).find(pick) || 'en-US'; }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(KEEP.map(k => [k, S[k]])))); } catch(e) {} };

// Sites — several factories on the map. Each has its own targets, transport, expansions and position; the active one lives in S.targets/S.tr/
// S.expanded/S.mapPos. What one site makes (its targets) another receives as raw input — by road from it, not from resource nodes.
S.sites = [{n: '', pos: S.mapPos, targets: [], tr: {}, exp: []}]; S.site = 0; S.proj = '';
const siteName = i => S.sites[i].n || t('site') + ' ' + (i + 1);
const clone = o => JSON.parse(JSON.stringify(o));
function siteSync(){ const o = S.sites[S.site]; o.pos = S.mapPos; o.targets = clone(S.targets); o.tr = clone(S.tr); o.exp = S.expanded.slice(); }
function siteLoad(i){ S.site = i; const o = S.sites[i]; S.mapPos = o.pos || null; S.targets = clone(o.targets); S.tr = clone(o.tr); S.expanded = o.exp.slice(); }
const siteGo = i => { siteSync(); siteLoad(i); refitViews(); render(); };
// Links between sites: LINKS = [{a: supplier, b: receiver, it, q}]. A receiver takes an item if another site makes it
// (as its target). A link is one line with one transport: supplier output and receiver input are kept in sync (`linkSync`), and if
// one side has no transport chosen, the other side's is used (`linkCfg`). Storage at the output = belt at the input.
let IMP = new Map(), LINKS = [];   // IMP — what is delivered to the active site: item → [{i, pos, q}]
const lIn = m => m === 'store' ? 'belt' : m, lOut = m => m === 'belt' ? 'store' : m;
function impOf(j){ const own = new Set(S.sites[j].targets.filter(x => x[1] > 0).map(x => x[0])), m = new Map();
  S.sites.forEach((o, i) => { if (i !== j) o.targets.forEach(([it, q]) => { if (q > 0 && !own.has(it)) { if (!m.has(it)) { m.set(it, []); m.get(it).it0 = it; } m.get(it).push({i, pos: o.pos, q}); } }); }); return m; }
// what site j has to import: compute its chain by temporarily putting it into S (solve() changes nothing)
function needsOf(j){ const k = [S.site, S.targets, S.tr, S.expanded, S.mapPos, IMP], o = S.sites[j], r = {};
  S.site = j; S.targets = o.targets; S.tr = o.tr; S.expanded = o.exp; S.mapPos = o.pos; IMP = impOf(j);
  try { const {bal} = solveSafe(); for (const [it, b] of Object.entries(bal)) if (b < -EPS && IMP.has(it) && solveRecipe(it) === 'raw') r[it] = -b; }
  finally { [S.site, S.targets, S.tr, S.expanded, S.mapPos, IMP] = k; } return r; }
// Quantity sync: a site target ordered by other sites equals their total demand (unless sync is turned off
// for it — the site's `man` list). Chains A→B→C repeat until stable (at most 12 rounds).
let TSYNC = new Map();   // item → total demand of the sites (for the label at the active site's target)
function syncTargets(){ TSYNC = new Map(); if (S.sites.length < 2) return; siteSync();
  for (let k = 0; k < 12; k++) { const need = {}; let ch = false;
    S.sites.forEach((o, j) => Object.entries(needsOf(j)).forEach(([it, q]) => { need[it] = (need[it] || 0) + q; }));
    Object.entries(need).forEach(([it, q]) => { TSYNC.set(it, q); const sup = []; let fixed = 0;
      S.sites.forEach(o => o.targets.forEach(tg => { if (tg[0] !== it) return; if ((o.man || []).includes(it)) fixed += tg[1]; else sup.push(tg); }));
      if (!sup.length) return; const per = Math.min(1e6, Math.max(0, q - fixed)/sup.length);
      sup.forEach(tg => { if (Math.abs(tg[1] - per) > 1e-6) { tg[1] = per; ch = true; } }); });
    if (!ch) break; }
  S.targets = clone(S.sites[S.site].targets); }
const synced = it => TSYNC.has(it) && !(S.sites[S.site].man || []).includes(it);
function impScan(){ syncTargets(); IMP = new Map(); LINKS = []; if (S.sites.length < 2) return; siteSync(); IMP = impOf(S.site);
  const key = JSON.stringify([S.sites.map(o => [o.pos, o.targets, o.exp]), S.choice, S.stepMode, S.clock, S.mk, S.purity, S.belt]);
  if (impScan.key === key) LINKS = impScan.L; else {
  // suppliers for each need — by distance, while their output lasts
  const left = {};   // how much the supplier has left (its output is shared between receivers)
  S.sites.forEach((o, j) => Object.entries(needsOf(j)).forEach(([it, need]) => {
    impOf(j).get(it).slice().sort((x, y) => (x.pos && o.pos ? Math.hypot(x.pos.x - o.pos.x, x.pos.y - o.pos.y) : 0) - (y.pos && o.pos ? Math.hypot(y.pos.x - o.pos.x, y.pos.y - o.pos.y) : 0))
      .forEach(src => { const lk = src.i + ':' + it; if (left[lk] === undefined) left[lk] = src.q; if (need <= EPS || left[lk] <= EPS) return;
        const tk = Math.min(need, left[lk]); LINKS.push({a: src.i, b: j, it, q: tk}); need -= tk; left[lk] -= tk; }); }));
  impScan.key = key; impScan.L = LINKS; }
  // imports to the active site — how much it really got from each supplier (the rest is "short")
  IMP.forEach(L => L.forEach(o => { o.q = LINKS.filter(l => l.a === o.i && l.b === S.site && l.it === L.it0).reduce((a, l) => a + l.q, 0); })); }
// link transport if none was chosen on this side: take the other side's
function linkCfg(it, dir){ if (S.sites.length < 2) return null;
  const L = LINKS.find(l => l.it === it && (dir === 'in' ? l.b === S.site : l.a === S.site)); if (!L) return null;
  const c = S.sites[dir === 'in' ? L.a : L.b].tr[(dir === 'in' ? 'out:' : 'in:') + it]; return c ? {m: dir === 'in' ? lIn(c.m) : lOut(c.m), ...(c.f ? {f: c.f} : {})} : null; }
// transport chosen on one side — set the same on the other
function linkSync(it, dir){ const c = S.tr[dir + ':' + it]; if (!c) return; siteSync();
  LINKS.filter(l => l.it === it && (dir === 'out' ? l.a === S.site : l.b === S.site)).forEach(l => { const o = S.sites[dir === 'out' ? l.b : l.a], k = (dir === 'out' ? 'in:' : 'out:') + it;
    o.tr[k] = {...(o.tr[k] || {}), m: dir === 'out' ? lIn(c.m) : lOut(c.m), ...(c.f ? {f: c.f} : {})}; }); }

// Projects: save everything (sites, recipes, settings) under a name in the browser, load, export to a file and import from a file
const PSTORE = 'ficsit-planner-projects';
const projAll = () => { const z = Object.create(null); try { const o = JSON.parse(localStorage.getItem(PSTORE) || '{}'); if (o && typeof o === 'object' && !Array.isArray(o)) Object.assign(z, o); } catch(e) {} return z; };   // no prototype: the name "__proto__" is an ordinary name
const projPut = o => { try { localStorage.setItem(PSTORE, JSON.stringify(o)); return true; } catch(e) { return false; } };
function projData(){ siteSync(); return {app: 'ficsit-planner', v: 1, name: S.proj, sites: clone(S.sites), site: S.site, choice: S.choice, clock: S.clock, mk: S.mk, purity: S.purity, belt: S.belt}; }   // "Step by step / Full" mode is a global setting, not stored in a project
function projApply(d){ if (!d || !Array.isArray(d.sites) || !d.sites.length) return false;
  // the file could come from anywhere: validate everything and clamp to sane values (finite numbers, within range)
  const num = (v, a, b) => typeof v === 'number' && isFinite(v) ? Math.min(b, Math.max(a, v)) : null;
  const okT = a => (Array.isArray(a) ? a : []).filter(x => Array.isArray(x) && I[x[0]] && num(x[1], 0, 1e6) !== null).map(x => [x[0], num(x[1], 0, 1e6)]);
  const okTr = o => { const r = {}; if (o && typeof o === 'object') Object.entries(o).forEach(([k, c]) => { if (!/^(in|out):/.test(k) || !I[k.slice(k.indexOf(':') + 1)] || !c || typeof c.m !== 'string') return;
    r[k] = {m: c.m}; const d = num(c.d, 0, 1e5); if (d) r[k].d = d; if (FUEL[c.f]) r[k].f = c.f; }); return r; };
  const sites = d.sites.filter(o => o && typeof o === 'object'); if (!sites.length) return false;
  S.sites = sites.map(o => ({n: String(o.n || '').slice(0, 40), pos: o.pos && num(o.pos.x, -5000, 5000) !== null && num(o.pos.y, -5000, 5000) !== null ? {x: +o.pos.x, y: +o.pos.y} : null,
    targets: okT(o.targets), tr: okTr(o.tr), exp: Array.isArray(o.exp) ? o.exp.filter(x => I[x]) : [], man: Array.isArray(o.man) ? o.man.filter(x => I[x]) : []}));
  S.choice = Object.fromEntries(Object.entries(d.choice && typeof d.choice === 'object' ? d.choice : {}).filter(([it, r]) => I[it] && R[r]));
  if (num(d.clock, 10, 250) !== null) S.clock = num(d.clock, 10, 250);
  if ([1, 2, 3].includes(d.mk)) S.mk = d.mk; if ([.5, 1, 2].includes(d.purity)) S.purity = d.purity; if ([60, 120, 270, 480, 780, 1200].includes(d.belt)) S.belt = d.belt;
  S.proj = String(d.name || '').slice(0, 60); siteLoad(Math.min(S.sites.length - 1, Math.max(0, d.site | 0))); return true; }
const projApplySafe = d => { try { return projApply(d); } catch(e) { console.error(e); return false; } };
const projNew = () => { S.sites = [{n: '', pos: null, targets: [], tr: {}, exp: []}]; S.proj = ''; siteLoad(0); };

const fmt = (n, d) => { if (!isFinite(n)) return '—'; const a = Math.abs(n); const m = d ?? (a >= 100 ? 1 : a >= 1 ? 2 : 3); return n.toLocaleString(LOC(), {maximumFractionDigits: a >= 1000 ? 0 : m}); };
const cv = q => q*UF[S.unit];                       // from "per minute" to the chosen units
const fq = q => fmt(cv(q));
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const unit = it => I[it].f !== 's' ? t('m3') : '';
const ul = it => (unit(it) ? unit(it) : '') + UU();
const img = (it, w) => `<img src="${IU(it)}" alt="" width="${w}" height="${w}" loading="lazy">`;
const ic = (it, sm) => `<span class="ic${sm ? ' sm' : ''}" title="${esc(I[it].n)}">${img(it, sm ? 24 : 30)}</span>`;
const chip = (it, q, cls) => `<span class="flow${cls ? ' ' + cls : ''}" title="${esc(I[it].n)}">${img(it,24)}${cls === 'by' ? '+' : ''}${fq(q)}${unit(it) ? ' ' + unit(it) : ''}</span>`;
const bimg = (b, w) => `<img src="${IU(b)}" alt="${esc(M[b] ? M[b].n : '')}" title="${esc(M[b] ? M[b].n : '')}" width="${w}" height="${w}" loading="lazy">`;
const recipeOf = it => S.choice[it] || defaultRecipe(it);
// step-by-step mode: only targets and ingredients expanded by the user are computed, the rest is "delivered"
const isTarget = it => S.targets.some(([x,q]) => x === it && q > 0);
const solveRecipe = it => (!isTarget(it) && (IMP.has(it) || S.stepMode === 'step' && !S.expanded.includes(it))) ? 'raw' : recipeOf(it);   // imported from another site — treated as raw
const canExpand = it => S.stepMode === 'step' && !RAW.has(it) && (producers[it] || []).length > 0 && !isTarget(it);
// starting target amount = output of one building with the current recipe (per minute); for raw — one Mk1 miner on a normal node
const baseRate = it => { const r = R[recipeOf(it)]; if (!r) return 60; const o = r.out.find(x => x[0] === it); return o ? +(o[1]*60/r.t).toFixed(4) : 60; };
// popular alternates (community tier list, xgamingserver.com, 2026): order = priority
const TIER_S = ['Solid Steel Ingot','Coated Iron Plate','Steel Rod','Steel Screws','Adhered Iron Plate','Fused Wire','Quickwire Cable','Caterium Circuit Board','Rigor Motor','Fine Concrete','Sloppy Alumina','Heavy Encased Frame','Polymer Resin','Heavy Oil Residue','Recycled Plastic','Recycled Rubber','Silicon High-Speed Connector','Plastic AI Limiter','Insulated Crystal Oscillator','Pure Copper Ingot'];
const TIER_A = ['Pure Iron Ingot','Leached Iron Ingot','Iron Alloy Ingot','Coke Steel Ingot','Steel Cast Plate','Stitched Iron Plate','Caterium Wire','Insulated Cable','Silicon Circuit Board','Super-State Computer','Crystal Computer','Caterium Computer','Steeled Frame','Flexible Framework','Wet Concrete','Instant Scrap','Heat Exchanger','Electric Motor','Fertile Uranium','Oil-Based Diamonds','Diluted Fuel'];
const byEn = Object.fromEntries(Object.entries(R).filter(([,r]) => r.alt).map(([id,r]) => [r.en.replace(/^Alternate:\s*/, ''), id]));
function presetChoice(key){
  if (key === 'std') return {};
  const names = key === 's' ? TIER_S : TIER_S.concat(TIER_A), ch = {};
  for (const nm of names) { const id = byEn[nm]; if (!id) continue;
    if (S.onlyOpen && !S.unlocked.includes(id)) continue;
    const it = R[id].out[0][0]; if (!ch[it]) ch[it] = id; }
  return ch;
}
function presetKey(){
  const same = (a,b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => a[k] === b[k]); };
  return ['std','s','sa'].find(k => same(S.choice, presetChoice(k))) || '';
}
// solution metrics for comparing recipe sets
function metrics(choice){
  const keep = S.choice; S.choice = {...choice};
  const {rate, bal} = solveSafe(); let N = 0, P = 0, ore = 0, oil = 0, water = 0;
  for (const [rid,x] of Object.entries(rate)) if (x > EPS) { const m = machines(rid, x); N += m.n; P += m.power; }
  for (const [it,b] of Object.entries(bal)) if (b < -EPS && solveRecipe(it) === 'raw') { if (SOLID.has(it)) ore -= b; else if (it === 'Desc_LiquidOil_C') oil -= b; else if (it === 'Desc_Water_C') water -= b; }
  S.choice = keep; return {N, P, ore, oil, water};
}
const shortName = r => !r.alt ? r.n : r.n.replace(/^[^:：]{1,24}[:：]\s*/, '').replace(/\s*[（(][^()（）]{1,30}[)）]\s*$/, '');

function solve(){
  const target = {}; for (const [it, q] of S.targets) if (q > 0) target[it] = (target[it]||0) + q;
  const rate = {}, bal = {}, stuck = new Set(); let i = 0;
  const rec = () => { for (const k in bal) delete bal[k];
    for (const [it,q] of Object.entries(target)) bal[it] = -q;
    for (const [rid,x] of Object.entries(rate)) { const r = R[rid];
      r.in.forEach(([it,a]) => bal[it] = (bal[it]||0) - a*x); r.out.forEach(([it,a]) => bal[it] = (bal[it]||0) + a*x); } };
  for (; i < 4000; i++) { rec(); let ch = false;
    for (const [it,b] of Object.entries(bal)) { if (b >= -EPS) continue; const rid = solveRecipe(it); if (!R[rid]) continue;
      const out = R[rid].out.find(o => o[0] === it); if (!out) { stuck.add(it); continue; }
      const net = out[1] - (R[rid].in.find(o => o[0] === it)?.[1] || 0); if (net <= 0) { stuck.add(it); continue; }
      rate[rid] = (rate[rid]||0) - b/net; ch = true; }
    if (!ch) break; }
  rec(); return {rate, bal, target, loop: i >= 4000, stuck};
}
// guarded solve: if chosen recipes feed each other endlessly (fuel unpackaging, battery for water, etc.) —
// find which choice is to blame, revert it to the standard recipe and say so; numbers never go to infinity
const solveBad = r => r.loop || Object.values(r.rate).some(x => !isFinite(x) || x > 1e9);
let LASTFIX = [];   // replaced looping recipe — the message stays until the user picks a recipe themselves
function solveSafe(){ let r = solve(); if (!solveBad(r)) return r;
  for (const it of Object.keys(S.choice)) { const keep = S.choice[it]; delete S.choice[it]; const r2 = solve();
    if (!solveBad(r2)) { LASTFIX = [[it, keep]]; return r2; } S.choice[it] = keep; }
  return {rate: {}, bal: {}, target: r.target, loop: true, stuck: new Set()}; }
function machines(rid, x){
  const r = R[rid], m = M[r.b], e100 = x*r.t/60, exact = e100/(S.clock/100), n = Math.max(1, Math.ceil(exact - 1e-6)), clk = e100/n;
  const sh = clk > 1 + 1e-9 ? Math.ceil((clk - 1)/.5 - 1e-9) : 0; // a power shard gives +50% clock speed, at most 3 (250%)
  return {n, clk, power: n*(m.p > 0 ? m.p : r.vc + r.vf/2)*Math.pow(clk, m.exp || 1.321928), name: m.n, b: r.b, sh, shards: n*sh};
}
function depths(rate, target){
  const d = {}; Object.keys(target).forEach(it => d[it] = 0);
  for (let p = 0; p < 40; p++) { let ch = false;
    for (const it of Object.keys(d)) { const rid = solveRecipe(it); if (!R[rid] || !rate[rid]) continue;
      for (const [x] of R[rid].in) { const nd = d[it] + 1; if (d[x] === undefined || (d[x] < nd && nd < 40)) { d[x] = nd; ch = true; } } }
    if (!ch) break; }
  return d;
}
function options(it){
  const netOf = id => (R[id].out.find(o => o[0] === it)?.[1] || 0) - (R[id].in.find(o => o[0] === it)?.[1] || 0);   // a recipe that consumes as much or more of the item itself is not offered
  const L = (producers[it] || []).filter(p => netOf(p.id) > 0 && (!R[p.id].alt || !S.onlyOpen || S.unlocked.includes(p.id) || recipeOf(it) === p.id))
    .sort((a,b) => (R[a.id].alt - R[b.id].alt) || (b.main - a.main));
  const o = RAW.has(it) ? [{v:'raw', l:t('mining')}] : [];
  L.forEach(p => o.push({v:p.id, l:shortName(R[p.id]) + (p.main ? '' : ' ' + t('byproduct')), alt:R[p.id].alt, locked:R[p.id].alt && !S.unlocked.includes(p.id)}));
  return o.length ? o : [{v:'raw', l:t('manual')}];
}

// "+" / "−" button at an ingredient in step-by-step mode
const expBtn = it => !canExpand(it) ? '' : S.expanded.includes(it)
  ? `<button type="button" class="exp on" data-col="${it}" title="${esc(t('collapse'))}" aria-label="${esc(t('collapse'))}: ${esc(I[it].n)}">−</button>`
  : `<button type="button" class="exp" data-exp="${it}" title="${esc(t('expand'))}" aria-label="${esc(t('expand'))}: ${esc(I[it].n)}">+</button>`;
// recipe popup card: per building at 100%
function recipeCard(rid){
  const r = R[rid], per = a => a*60/r.t;
  return `<b>${esc(r.n)}</b><small><span class="bi">${bimg(r.b,20)}</span>${t('oneBuilding')}, ${UU()}</small>
    <div class="io"><span class="k">${t('need')}</span><div>${r.in.map(([it,a]) => chip(it, per(a))).join('')}</div><span class="k">${t('gives')}</span><div>${r.out.map(([it,a]) => chip(it, per(a))).join('')}</div></div>`;
}
const pop = document.getElementById('pop');
function showPop(html, el){
  pop.innerHTML = html; pop.hidden = false;
  const r = el.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  let x = r.right + 10, y = r.top;
  if (x + w > innerWidth - 8) x = r.left - w - 10;
  if (x < 8) { x = Math.max(8, Math.min(r.left, innerWidth - w - 8)); y = r.bottom + 8; }
  if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
}
const hidePop = () => { pop.hidden = true; };

let last = null;
function render(){
  save(); hidePop(); impScan();
  const SB = document.getElementById('siteBar');   // sites: the active one is a name field, the others are buttons; "+" adds a new one
  SB.innerHTML = (S.sites.length > 1 ? S.sites.map((o, i) => i === S.site
      ? `<input class="site on" id="siteName" maxlength="40" value="${esc(o.n)}" placeholder="${esc(siteName(i))}" size="${Math.max(7, siteName(i).length)}" aria-label="${esc(t('siteName'))}">`
      : `<button type="button" class="site" data-site="${i}">${esc(siteName(i))}</button>`).join('') +
      `<button type="button" class="site x" data-sdel aria-label="${esc(t('siteDel'))}" title="${esc(t('siteDel'))}: ${esc(siteName(S.site))}">×</button>` : '') +
    `<button type="button" class="site sadd" data-sadd title="${esc(t('siteAdd'))}" aria-label="${esc(t('siteAdd'))}">+ ⌂</button>`;
  document.getElementById('clock').value = S.clock;
  document.getElementById('clockOut').textContent = S.clock + '%';
  document.querySelectorAll('.bar .seg').forEach(g => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(S[g.dataset.key])))));
  document.getElementById('onlyOpen').setAttribute('aria-checked', String(!!S.onlyOpen));
  const pk = presetKey(); document.querySelectorAll('#presetTabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === pk)));

  document.getElementById('targetList').innerHTML = S.targets.length ? S.targets.map(([it,q],i) => `
    <div class="t-row">${ic(it)}<span class="t-name">${esc(I[it].n)}</span>
      <label class="rate"><input type="text" inputmode="decimal" autocomplete="off" id="tq-${i}" data-i="${i}"${synced(it) ? ' readonly class="sync"' : ''} value="${+cv(q).toPrecision(6)}" aria-label="${esc(I[it].n)}, ${ul(it)}"><span>${ul(it)}</span></label>
      ${TSYNC.has(it) ? `<button type="button" class="tsync${synced(it) ? ' on' : ''}" data-tsync="${it}" title="${esc(t(synced(it) ? 'syncOn' : 'syncOff').replace('{q}', fq(TSYNC.get(it)) + (unit(it) ? ' ' + unit(it) : '') + UU()))}" aria-pressed="${synced(it)}">${synced(it) ? '⇄' : '⇆'}</button>` : ''}${trBtn(it, 'out', 'tg')}<button class="x" type="button" data-del="${i}" aria-label="${t('remove')} ${esc(I[it].n)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </div>`).join('') : `<div class="empty">${t('emptyTargets')}</div>`;

  const {rate, bal, target, loop, stuck} = solveSafe();
  const d = depths(rate, target);
  const rows = Object.entries(rate).filter(([,x]) => x > EPS).map(([rid,x]) => {
    const it = R[rid].out.map(o => o[0]).find(o => recipeOf(o) === rid) || R[rid].out[0][0];
    return {rid, x, it, depth: d[it] ?? 99, m: machines(rid, x)};
  }).sort((a,b) => a.depth - b.depth || I[a.it].n.localeCompare(I[b.it].n, S.lang));
  last = {rows, bal, target};

  const notes = [];
  if (loop) notes.push(t('loopNote'));
  LASTFIX.forEach(([it, rid]) => notes.push(t('loopFix').replace('{r}', R[rid] ? shortName(R[rid]) : rid).replace('{it}', I[it].n)));
  stuck.forEach(it => notes.push(t('stuckNote').replace('{r}', R[recipeOf(it)] ? shortName(R[recipeOf(it)]) : '').replace('{it}', I[it].n)));
  // closed loops between groups (a product returns as an ingredient)
  const prodRows = {}; rows.forEach(r => R[r.rid].out.forEach(([o]) => (prodRows[o] ||= []).push(r.rid)));
  const radj = {}; rows.forEach(r => R[r.rid].in.forEach(([i2]) => (prodRows[i2] || []).forEach(p => { if (p !== r.rid) (radj[p] ||= []).push([r.rid, i2]); })));
  let ix = 0; const idx = {}, low = {}, stk = [], on = {}, comp = {};
  const tj = v => { idx[v] = low[v] = ix++; stk.push(v); on[v] = 1;
    for (const [w] of radj[v] || []) { if (idx[w] === undefined) { tj(w); low[v] = Math.min(low[v], low[w]); } else if (on[w]) low[v] = Math.min(low[v], idx[w]); }
    if (low[v] === idx[v]) { const c = []; let w; do { w = stk.pop(); on[w] = 0; c.push(w); } while (w !== v); if (c.length > 1) c.forEach(x => comp[x] = c); } };
  rows.forEach(r => { if (idx[r.rid] === undefined) tj(r.rid); });
  const cycIt = new Set(); Object.entries(radj).forEach(([p, L]) => L.forEach(([c, i2]) => { if (comp[p] && comp[p] === comp[c]) cycIt.add(i2); }));
  const manual = Object.entries(bal).filter(([it,b]) => b < -EPS && !RAW.has(it) && recipeOf(it) === 'raw').map(([it]) => I[it].n);
  if (manual.length) notes.push(t('manualNote') + ' ' + manual.join(', '));
  const stepTip = S.stepMode === 'step' && Object.entries(bal).some(([it,b]) => b < -EPS && canExpand(it) && !S.expanded.includes(it));
  const cycHtml = !loop && cycIt.size ? `<div class="note">${esc(t('cycleNote'))}<br>${[...cycIt].map(i2 => `<span class="cyc"><img src="${IU(i2)}" alt="">${esc(I[i2].n)}</span>`).join('')}</div>` : '';
  document.getElementById('chainNotes').innerHTML = cycHtml + notes.map(n => `<div class="note">${esc(n)}</div>`).join('');

  document.querySelectorAll('#viewTabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === S.view)));
  document.querySelectorAll('#stepTabs button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.step === '1') === (S.stepMode === 'step'))));
  if (!VIEWS[S.view]) S.view = 'list';
  const V = VIEWS[S.view];
  Object.values(VIEWS).forEach(v => { if (v !== V) { if (v.el !== V.el) document.getElementById(v.el).hidden = true; v.hide && v.hide(); } });
  document.getElementById(V.el).hidden = false;
  // graph and building draw every machine: for huge factories (an extra zero in the amount) — a message instead of freezing;
  // and if a tab still fails, the rest of the page (summary, logistics) still updates
  const nMach = rows.reduce((a, r) => a + r.m.n, 0), big = V.strip && S.view !== 'map' && nMach > LIM_MACH, lb = document.getElementById('lbig');
  if (lb) { lb.hidden = !big; if (big) { lb.textContent = t('tooBig').replace('{n}', fmt(nMach, 0)).replace('{m}', fmt(LIM_MACH, 0)); V.hide && V.hide(); document.getElementById('lay').style.visibility = 'hidden'; document.getElementById('lctl').hidden = true; }
    else { document.getElementById('lay').style.visibility = ''; document.getElementById('lctl').hidden = false; } }
  if (!big) try { V.render(rows, bal, target); } catch (e) { console.error(e); if (lb && V.strip) { lb.hidden = false; lb.textContent = t('viewErr'); } }

  // raw resources
  const mk = {1:1,2:2,3:4}[S.mk], mb = M['Build_MinerMk' + S.mk + '_C'];
  let ePow = 0;
  const extB = {}, ext = (q, per, b, key) => { const n = q/per, nn = Math.ceil(n - 1e-6); ePow += nn*(b.p || 0)*Math.pow(n/nn, b.exp || 1.321928); extB[key] = (extB[key] || 0) + nn; return nn; };   // extraction buildings count too
  // "back": which expansion added this resource (the last expanded of its consumers)
  const backOf = it => { if (S.stepMode !== 'step') return null; let best = null, bi = -1;
    rows.forEach(r => { const k = S.expanded.indexOf(r.it); if (k > bi && R[r.rid].in.some(([i2]) => i2 === it)) { bi = k; best = r.it; } }); return best; };
  const colBtn = it => { const c = backOf(it); return c ? `<button type="button" class="exp on" data-col="${c}" title="${esc(t('collapse'))}: ${esc(I[c].n)}" aria-label="${esc(t('collapse'))}: ${esc(I[c].n)}">−</button>` : ''; };
  const raws = Object.entries(bal).filter(([it,b]) => b < -EPS && solveRecipe(it) === 'raw').sort((a,b) => a[1]-b[1]);
  // the factory is on the map — extraction uses the real nodes picked by the map: one building per node with its purity,
  // an underloaded one is slowed down (power by clock speed); without the map — by the global purity setting
  let pMap = false;   // purity of at least one raw resource comes from the map — the global "Node" switch has no effect
  const extN = (q, nodes, b, key) => { let left = q, n = 0; const pu = {}; pMap = true;
    for (const nd of nodes) { if (left <= 1e-6) break; const r = nodeRate(nd), tk = Math.min(r, left); ePow += (b.p || 0)*Math.pow(tk/r, b.exp || 1.321928); n++; left -= tk; pu[nd.p] = (pu[nd.p] || 0) + 1; }
    extB[key] = (extB[key] || 0) + n; const pt = [2, 1, .5].filter(x => pu[x]).map(x => (x === 2 ? '●●●' : x === 1 ? '●●' : '●') + '×' + pu[x]).join(' ');
    return `×${n}</span><span class="bi" title="${esc(t('fromMapPur'))}">⌖ ${pt}`; };
  const mapNodes = (it, q) => { if (!S.mapPos || typeof mapPick !== 'function' || IMP.has(it)) return null; const p = mapPick(it, q); return p && !p.none && p.use.length && !p.sites ? p.use : null; };
  const rawHtml = raws.map(([it,b]) => { const q = -b, nds = it === 'Desc_Water_C' ? null : mapNodes(it, q); let how;
    if (IMP.has(it)) how = `<span class="bi">⌂ ${IMP.get(it).map(o => esc(siteName(o.i))).join(', ')}</span>`;
    else if (SOLID.has(it)) how = `<span class="bi">${bimg('Build_MinerMk' + S.mk + '_C',20)}${nds ? extN(q, nds, mb, 'Build_MinerMk' + S.mk + '_C') : '×' + ext(q, 60*mk*S.purity, mb, 'Build_MinerMk' + S.mk + '_C')}</span><span class="bi"><img src="${IU('Belt_' + S.belt)}" alt="${t('conveyor')}" title="${t('conveyor')}" width="20" height="20">×${Math.ceil(q/S.belt - 1e-6)}</span>`;
    else if (it === 'Desc_LiquidOil_C') how = `<span class="bi">${bimg('Build_OilPump_C',20)}${nds ? extN(q, nds, M.Build_OilPump_C, 'Build_OilPump_C') : '×' + ext(q, 120*S.purity, M.Build_OilPump_C, 'Build_OilPump_C')}</span>`;
    else if (it === 'Desc_Water_C') how = `<span class="bi">${bimg('Build_WaterPump_C',20)}×${ext(q, 120, M.Build_WaterPump_C, 'Build_WaterPump_C')}</span>`;
    else if (it === 'Desc_NitrogenGas_C') how = `<span class="bi">${bimg('Build_FrackingExtractor_C',20)}${nds ? extN(q, nds, M.Build_FrackingExtractor_C || {p: 0}, 'Build_FrackingExtractor_C') : '×' + ext(q, 60*S.purity, M.Build_FrackingExtractor_C || {p: 0}, 'Build_FrackingExtractor_C')}</span>`;   // resource well: 30/60/120 m³/min
    else if (S.stepMode === 'step' && !RAW.has(it) && (producers[it] || []).length) how = `${t('supplied')} ${expBtn(it)}`;
    else how = t('manualShort');
    return `<div class="li">${ic(it,1)}<span class="n"><b>${esc(I[it].n)}</b><small>${how}${colBtn(it)}${trBtn(it, 'in')}</small></span><span class="v">${fq(q)}<small>${ul(it)}</small></span></div>`; }).join('');
  { const g2 = document.querySelector('.bar .seg[data-key="purity"]'), c2 = g2.closest('.ctl');
    g2.setAttribute('aria-disabled', String(pMap)); g2.querySelectorAll('button').forEach(b => { b.disabled = pMap; }); c2.classList.toggle('off', pMap); c2.title = pMap ? t('purMapT') : ''; }
  const by = Object.entries(bal).filter(([,b]) => b > 1e-4).sort((a,b) => b[1]-a[1]);
  const byHtml = by.map(([it,b]) => `<div class="li">${ic(it,1)}<span class="n"><b>${esc(I[it].n)}</b></span><span class="v">+${fq(b)}<small>${ul(it)}</small></span></div>`).join('');
  // logistics: raw delivery and target shipping by transport
  const LGs = []; raws.forEach(([it,b]) => { const o = logi(it, -b, 'in'); if (TRM[o.m]) LGs.push([it, -b, 'in', o]); });
  Object.entries(target).forEach(([it,q]) => { const o = logi(it, q, 'out'); if (TRM[o.m]) LGs.push([it, q, 'out', o]); });
  const lgP = LGs.reduce((a, x) => a + (x[3].P || 0), 0), lgN = LGs.reduce((a, x) => a + (x[3].N || 0), 0);
  const bi = (k, nm, v) => `<span class="bi" title="${esc(nm)}"><img src="${IU(k)}" alt="${esc(nm)}" width="20" height="20">${v}</span>`;
  const lnk = (it, dir) => { const L = LINKS.filter(l => l.it === it && (dir === 'out' ? l.a === S.site : l.b === S.site)); return L.length ? `<span class="bi">${dir === 'out' ? '→' : '←'} ⌂ ${L.map(l => esc(siteName(dir === 'out' ? l.b : l.a))).join(', ')}</span>` : ''; };
  const lgHtml = LGs.map(([it, q, dir, o]) => `<div class="li">${ic(it,1)}<span class="n"><b>${esc(I[it].n)}</b><small><span class="bi">${t(dir === 'out' ? 'trOut' : 'trIn')}:</span>${lnk(it, dir)}${o.need ? `<span class="bi">${esc(t('trNoDist'))}</span>`
      : o.veh.map(([k, nm, n]) => bi(k, t(nm), '×' + n)).join('') + o.st.map(([k, nm, n]) => bi(k, t(nm) + ' · ' + t('here'), '×' + n)).join('') +
        `<span class="bi" title="${esc(t('distM'))}${o.map ? ' · ' + esc(t('fromMap')) : ''}">${o.map ? '⌖' : '↔'}${fmt(o.dist, 0)} ${t('meters')}</span><span class="bi" title="${esc(t('tripMin'))}">⏱≈${fmt(o.T, 1)} ${t('mins')}</span>` + (o.bat ? bi('Desc_Battery_C', I.Desc_Battery_C.n, fq(o.bat) + UU()) : '') + (o.fuel ? bi(o.fuel, t('trFuel') + ': ' + I[o.fuel].n, fq(o.fuelQ) + UU()) : '') +
        (o.over ? `<span class="bi wrn" title="${esc(t('trRangeT'))}">⚠ ${esc(t('trRangeBad'))} ${fmt(o.maxD/1000, 1)} ${t('km')}</span>` : '') +
        `<span class="bi">${fmt(o.P, 0)} ${t('mw')}</span>`}${trBtn(it, dir, 'lg')}</small></span><span class="v">${fq(q)}<small>${ul(it)}</small></span></div>`).join('');
  const lgEst = LGs.some(x => x[3].est && !x[3].need);
  const byB = {}; let N = lgN, P = lgP;
  let SH = 0; rows.forEach(({m}) => { byB[m.b] = (byB[m.b]||0) + m.n; N += m.n; P += m.power; SH += m.shards; });
  Object.entries(extB).forEach(([b, n]) => { byB[b] = (byB[b] || 0) + n; N += n; });
  const bl = Object.entries(byB).sort((a,b) => b[1]-a[1]), mx = bl[0]?.[1] || 1;
  const tg = Object.fromEntries(S.targets);
  const dur = m => m >= 60 ? fmt(m/60,1) + ' ' + t('hrs') : fmt(m, m < 10 ? 1 : 0) + ' ' + t('mins');
  const ph = PHASES.filter(([,L]) => L.every(([it]) => tg[it] > 0)).map(([n,L]) => {
    const mins = Math.max(...L.map(([it,q]) => tg[it] > 0 ? q/tg[it] : Infinity));
    return `<div class="phase"><span>${t('phase')} ${n}</span><span class="req">${L.map(([it,q]) => `<span class="rq${tg[it] > 0 ? '' : ' miss'}" title="${esc(I[it].n)}${tg[it] > 0 ? '' : ' — ' + t('notInTargets')}">${img(it,22)}${q}</span>`).join('')}</span>${isFinite(mins) ? `<b class="num">${dur(mins)}</b>` : `<b class="no">${esc(t('notAll'))}</b>`}</div>`; }).join('');
  const phase = ph ? `<div class="sec"><h2>${t('elevator')}</h2>${ph}</div>` : '';
  let cmpHtml = '';
  if (rows.length && Object.keys(S.choice).length) {
    const a = metrics({}), b = metrics(S.choice);
    const cell = (lbl, x, y, f, u) => { if (!x && !y) return ''; const d = x ? (y - x)/x*100 : 0;
      return `<div><small>${lbl}</small><b>${f(x)} → ${f(y)}${u}</b>${x ? `<i>${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmt(Math.abs(d),0)}%</i>` : ''}</div>`; };
    cmpHtml = `<div class="sec"><h2>${t('vsStd')}</h2><div class="cmp">
      ${cell(t('cBuildings'), a.N, b.N, v => v, '')}${cell(t('cPower'), a.P, b.P, v => fmt(v,0), ' ' + t('mw'))}
      ${cell(t('cOre') + UU(), a.ore, b.ore, v => fq(v), '')}${cell(t('cOil') + UU(), a.oil, b.oil, v => fq(v), ' ' + t('m3'))}${cell(t('cWater') + UU(), a.water, b.water, v => fq(v), ' ' + t('m3'))}</div></div>`;
  }
  document.getElementById('summary').innerHTML = !rows.length && !raws.length ? `<h2>${t('total')}</h2><div class="empty">${t('emptySummary')}</div>` : `
    <div class="kpis">
      <div><div class="big num">${N}${SH ? `<span class="kshard" title="${t('shardsTotal')}"><img src="${IU('Desc_CrystalShard_C')}" alt="${t('shards')}" width="34" height="34">×${SH}</span>` : ''}</div><div class="cap">${t('buildings')}</div></div>
      <div><div class="big num">${fmt(P + ePow, 0)}<small>${t('mw')}</small></div><div class="cap">${ePow ? `${t('ofMining')} ${fmt(ePow,0)}` : t('energy')}${lgP ? ` · ${t('logistics')} ${fmt(lgP,0)}` : ''}</div></div>
    </div>
    ${bl.length ? `<div class="bars">${bl.map(([b,c]) => `<div class="bar-row">${bimg(b,34)}<span class="track"><i style="width:${(c/mx*100).toFixed(1)}%"></i></span><span class="num">${c}</span></div>`).join('')}</div>` : ''}
    ${rawHtml ? `<div class="sec"><h2>${t('raw')}</h2>${rawHtml}</div>` : ''}
    ${lgHtml ? `<div class="sec"><h2>${t('logistics')}</h2>${lgHtml}${lgEst ? `<div class="lgn">${esc(t('trEst'))}</div>` : ''}</div>` : ''}
    ${byHtml ? `<div class="sec"><h2>${t('surplus')}</h2>${byHtml}</div>` : ''}
    ${cmpHtml}
    ${phase}`;

  const strip = document.getElementById('lgStrip'); strip.hidden = !V.strip || (!raws.length && !S.targets.length);
  if (!strip.hidden) { const chipT = (it, dir) => `<span class="lgc" title="${esc(I[it].n)}">${img(it, 26)}${trBtn(it, dir, 'st')}</span>`;
    strip.innerHTML = (raws.length ? `<span class="grp"><span class="k">${esc(t('trIn'))}</span>${raws.map(([it]) => chipT(it, 'in')).join('')}</span>` : '') +
      (Object.keys(target).length ? `<span class="grp"><span class="k">${esc(t('trOut'))}</span>${Object.keys(target).map(it => chipT(it, 'out')).join('')}</span>` : ''); }
  renderAlts(new Set(rows.map(r => r.rid)));
}

// recipe menu
let openMenu = null;
function toggleMenu(btn){
  if (openMenu && openMenu.btn === btn) { closeMenu(); return; }
  closeMenu();
  const it = btn.dataset.menu, cur = recipeOf(it);
  const m = document.createElement('div'); m.className = 'menu'; m.setAttribute('role', 'listbox');
  m.innerHTML = options(it).map(o => `<button type="button" role="option" data-pick="${o.v}" data-it="${it}" aria-selected="${o.v === cur}">${R[o.v] ? `<span class="bi">${bimg(R[o.v].b,20)}</span>` : ''}${esc(o.l)}${o.alt ? `<span class="tag${o.locked ? ' lk' : ''}">${esc(t('alt').toLowerCase())}</span>` : ''}</button>`).join('');
  btn.after(m); btn.setAttribute('aria-expanded', 'true'); openMenu = {btn, m};
  m.querySelector('[aria-selected=true]')?.focus();
}
function closeMenu(){
  if (!openMenu) return; openMenu.m.remove(); openMenu.btn.setAttribute('aria-expanded', 'false'); openMenu = null; hidePop();
}

let altFilter = 'all';
function renderAlts(used){
  used ||= new Set(last ? last.rows.map(r => r.rid) : []);
  const q = document.getElementById('altSearch').value.trim().toLowerCase();
  const all = Object.entries(R).filter(([,r]) => r.alt);
  document.getElementById('altCount').textContent = `${S.unlocked.length}/${all.length}`;
  const list = all.filter(([id,r]) => (altFilter === 'all' || (altFilter === 'on' && S.unlocked.includes(id)) || (altFilter === 'used' && used.has(id))) &&
    (!q || r.n.toLowerCase().includes(q) || r.en.toLowerCase().includes(q) || r.out.some(([it]) => I[it].n.toLowerCase().includes(q))))
    .sort((a,b) => I[a[1].out[0][0]].n.localeCompare(I[b[1].out[0][0]].n, S.lang) || shortName(a[1]).localeCompare(shortName(b[1]), S.lang));
  document.getElementById('altList').innerHTML = list.length ? list.map(([id,r]) =>
    `<button type="button" class="tile atile${used.has(id) ? ' used' : ''}" data-alt="${id}" data-rc="${id}" aria-pressed="${S.unlocked.includes(id)}" aria-label="${esc(shortName(r))}">${img(r.out[0][0],32)}</button>`).join('') : `<div class="empty">${t('nothing')}</div>`;
}

// item picker
const pickable = Object.keys(I).filter(it => producers[it] || RAW.has(it));
function renderTiles(){
  const q = document.getElementById('pickFilter').value.trim().toLowerCase();
  const have = new Set(S.targets.map(t => t[0]));
  document.getElementById('tiles').innerHTML = pickable.filter(it => !q || I[it].n.toLowerCase().includes(q) || I[it].en.toLowerCase().includes(q))
    .map(it => `<button type="button" class="tile${have.has(it) ? ' on' : ''}" role="option" data-add="${it}" title="${esc(I[it].n)}" aria-label="${esc(I[it].n)}">${img(it,32)}</button>`).join('') || `<div class="empty">${t('nothing')}</div>`;
}
function openPicker(open){
  const p = document.getElementById('picker'), b = document.getElementById('addBtn');
  p.hidden = !open; b.setAttribute('aria-expanded', String(open));
  if (open) { document.getElementById('pickFilter').value = ''; renderTiles(); document.getElementById('tip').textContent = ''; document.getElementById('pickFilter').focus(); }
}

/* ---------- events ---------- */
document.addEventListener('input', e => {
  const t = e.target;
  // numbers with a comma or a dot ("1,5" = 1.5); negative — 0, over a million per minute — a million
  if (t.matches('[data-i]') && !t.readOnly) { const i = +t.dataset.i, v = numIn(t.value); S.targets[i][1] = Math.min(1e6, v/UF[S.unit]);
    const it0 = S.targets[i][0], u0 = S.unit;
    clearTimeout(window.__rt); window.__rt = setTimeout(() => { const id = t.id, val = t.value, foc = document.activeElement === t; render();
      // restore the typed text and focus — only if it is still the same field of the same target in the same units and was not left
      const el = document.getElementById(id); if (el && foc && S.targets[i] && S.targets[i][0] === it0 && S.unit === u0) { el.value = val; el.focus(); try { el.setSelectionRange(val.length, val.length); } catch(_){} } }, 350); }
  if (t.id === 'clock') { S.clock = +t.value; if (!window.__cr) window.__cr = requestAnimationFrame(() => { window.__cr = 0; render(); }); }   // at most one recompute per frame
  if (t.id === 'pickFilter') renderTiles();
  if (t.id === 'siteName') { S.sites[S.site].n = t.value.slice(0, 40); clearTimeout(window.__sn); window.__sn = setTimeout(() => { const v = t.value; render(); const el = document.getElementById('siteName'); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }, 500); }
  if (t.id === 'altSearch') renderAlts();
});
document.addEventListener('click', e => {
  const g = e.target.closest('.bar .seg button'); if (g) { const k = g.parentElement.dataset.key; S[k] = k === 'unit' ? g.dataset.v : +g.dataset.v; render(); return; }
  const pick = e.target.closest('[data-pick]'); if (pick) { const it = pick.dataset.it, v = pick.dataset.pick; closeMenu(); LASTFIX = []; if (v === defaultRecipe(it)) delete S.choice[it]; else S.choice[it] = v; render(); return; }
  const mb = e.target.closest('[data-menu]'); if (mb) { toggleMenu(mb); return; }
  if (openMenu && !e.target.closest('.menu')) closeMenu();
  const ex = e.target.closest('[data-exp]'); if (ex && !ex.closest('#graph')) { const it = ex.dataset.exp; if (!S.expanded.includes(it)) S.expanded.push(it); render(); return; }
  const co = e.target.closest('[data-col]'); if (co && !co.closest('#graph')) { S.expanded = S.expanded.filter(x => x !== co.dataset.col); render(); return; }
  const st = e.target.closest('[data-step]'); if (st) { S.stepMode = st.dataset.step === '1' ? 'step' : 'full'; refitViews(); render(); return; }
  const vt = e.target.closest('[data-view]'); if (vt) { S.view = vt.dataset.view; refitViews(); render(); return; }
  const af = e.target.closest('[data-af]'); if (af) { altFilter = af.dataset.af; document.querySelectorAll('[data-af]').forEach(b => b.setAttribute('aria-pressed', String(b === af))); renderAlts(); return; }
  const at = e.target.closest('[data-alt]'); if (at) { const id = at.dataset.alt; S.unlocked = S.unlocked.includes(id) ? S.unlocked.filter(x => x !== id) : [...S.unlocked, id]; render(); return; }
  const ts = e.target.closest('[data-tsync]'); if (ts) { const o = S.sites[S.site], it = ts.dataset.tsync; o.man = (o.man || []).includes(it) ? o.man.filter(x => x !== it) : [...(o.man || []), it]; render(); return; }
  const sg = e.target.closest('[data-site]'); if (sg) { siteGo(+sg.dataset.site); return; }
  if (e.target.closest('[data-sadd]')) { siteSync(); S.sites.push({n: '', pos: null, targets: [], tr: {}, exp: []}); siteLoad(S.sites.length - 1); refitViews(); render(); return; }
  if (e.target.closest('[data-sdel]')) { if (S.sites.length > 1) { S.sites.splice(S.site, 1); siteLoad(Math.max(0, S.site - 1)); refitViews(); render(); } return; }
  if (e.target.closest('#projBtn')) { projOpen(); return; }
  const del = e.target.closest('[data-del]'); if (del) { S.targets.splice(+del.dataset.del, 1); render(); return; }
  const add = e.target.closest('[data-add]'); if (add) { const it = add.dataset.add; if (!S.targets.some(t => t[0] === it)) S.targets.push([it, baseRate(it)]); openPicker(false); render(); return; }
  if (e.target.closest('#addBtn')) { openPicker(document.getElementById('picker').hidden); return; }
  const pr = e.target.closest('[data-preset]'); if (pr) { S.choice = presetChoice(pr.dataset.preset); render(); return; }
  if (e.target.closest('#onlyOpen')) { S.onlyOpen = !S.onlyOpen; render(); return; }
  if (!e.target.closest('.adder')) openPicker(false);
});
// recipe popup cards: menu entries and alternate tiles
const popFor = el => { const p = el.closest('[data-pick],[data-rc]'); if (!p) return null; const id = p.dataset.rc || p.dataset.pick; return R[id] ? [p, id] : null; };
document.addEventListener('pointerover', e => { const f = popFor(e.target); if (f) showPop(recipeCard(f[1]), f[0]); });
document.addEventListener('pointerout', e => { const f = popFor(e.target); if (f && !f[0].contains(e.relatedTarget)) hidePop(); });
document.addEventListener('focusin', e => { const f = popFor(e.target); if (f) showPop(recipeCard(f[1]), f[0]); else if (!e.target.closest('.menu')) hidePop(); });
document.getElementById('tiles').addEventListener('mouseover', e => { const b = e.target.closest('.tile'); if (b) document.getElementById('tip').textContent = b.title; });
document.getElementById('tiles').addEventListener('focusin', e => { const b = e.target.closest('.tile'); if (b) document.getElementById('tip').textContent = b.title; });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (openMenu) { const b = openMenu.btn; closeMenu(); b.focus(); } else if (!document.getElementById('picker').hidden) { openPicker(false); document.getElementById('addBtn').focus(); } hidePop(); }
  if (openMenu && /Arrow(Up|Down)/.test(e.key)) { e.preventDefault(); const bs = [...openMenu.m.querySelectorAll('button')], i = bs.indexOf(document.activeElement); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); }
  if (e.target.id === 'pickFilter' && e.key === 'Enter') { const f = document.querySelector('#tiles .tile'); if (f) f.click(); }
  if (e.target.matches('.tile') && /Arrow/.test(e.key)) { e.preventDefault();
    const tiles = [...e.target.parentElement.querySelectorAll('.tile')], i = tiles.indexOf(e.target);
    const cols = Math.max(1, Math.round(e.target.parentElement.clientWidth / (e.target.offsetWidth + 6)));
    const j = {ArrowRight:i+1, ArrowLeft:i-1, ArrowDown:i+cols, ArrowUp:i-cols}[e.key]; if (tiles[j]) tiles[j].focus(); }
  if (e.target.id === 'pickFilter' && e.key === 'ArrowDown') { e.preventDefault(); document.querySelector('#tiles .tile')?.focus(); }
});
window.addEventListener('scroll', hidePop, {passive:true});
/* ---------- transport picker popup ---------- */
let TP = null;
const numIn = v => { const x = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isFinite(x) && x > 0 ? x : 0; };
const trPop = document.getElementById('trPop'), projPop = document.getElementById('projPop');
function projDraw(msg){ const all = projAll(), L = Object.entries(all).sort((a, b) => (b[1].t || 0) - (a[1].t || 0)), dt = v => new Date(v).toLocaleString(LOC(), {dateStyle: 'short', timeStyle: 'short'});
  projPop.innerHTML = `<b>${esc(t('projects'))}</b><small>${esc(msg || t('projNote'))}</small>
    <div class="prow"><input id="projName" value="${esc(S.proj)}" placeholder="${esc(t('projName'))}" maxlength="60"><button type="button" class="btn" data-psave>${esc(t('projSave'))}</button></div>
    <div class="plist">${L.length ? L.map(([n, o]) => `<div class="pli${n === S.proj ? ' on' : ''}"><button type="button" class="pl" data-pload="${esc(n)}"><span>${esc(n)}</span><small>${o.t ? dt(o.t) : ''} · ⌂×${(o.d && o.d.sites || []).length}</small></button><button type="button" class="x" data-pdel="${esc(n)}" aria-label="${esc(t('remove'))} ${esc(n)}">×</button></div>`).join('') : `<div class="pempty">${esc(t('projEmpty'))}</div>`}</div>
    <div class="prow"><button type="button" class="btn" data-pnew>${esc(t('projNew'))}</button><button type="button" class="btn" data-pexp>${esc(t('projExport'))}</button><label class="btn">${esc(t('projImport'))}<input type="file" id="projFile" accept=".json,application/json" hidden></label></div>`; }
function projOpen(){ if (!projPop.hidden) { projPop.hidden = true; return; } langClose(); projDraw(); projPop.hidden = false; const r = document.getElementById('projBtn').getBoundingClientRect();
  projPop.style.top = (r.bottom + 8) + 'px'; projPop.style.left = Math.max(8, Math.min(innerWidth - projPop.offsetWidth - 8, r.right - projPop.offsetWidth)) + 'px'; }
projPop.addEventListener('click', e => { const all = projAll();
  if (e.target.closest('[data-psave]')) { let n = document.getElementById('projName').value.trim().slice(0, 60); if (!n) { let k = 1; while (all[t('projects') + ' ' + k]) k++; n = t('projects') + ' ' + k; }   /* unnamed — first free number */ S.proj = n; all[n] = {t: Date.now(), d: projData()};
    projDraw(projPut(all) ? t('projSaved') : t('projBad')); return; }
  const ld = e.target.closest('[data-pload]'); if (ld) { const o = all[ld.dataset.pload]; if (o && projApplySafe(o.d)) { projPop.hidden = true; refitViews(); render(); } else projDraw(t('projBad')); return; }
  const dl = e.target.closest('[data-pdel]'); if (dl) { delete all[dl.dataset.pdel]; projPut(all); projDraw(); return; }
  if (e.target.closest('[data-pnew]')) { projNew(); projPop.hidden = true; refitViews(); render(); return; }
  if (e.target.closest('[data-pexp]')) { const d = projData(), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], {type: 'application/json'}));
    a.download = (S.proj || 'ficsit-plan').replace(/[\\/:*?"<>|]+/g, '_') + '.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); } });
projPop.addEventListener('change', e => { if (e.target.id !== 'projFile' || !e.target.files[0]) return; const f = e.target.files[0]; f.text().then(txt => { let d = null; try { d = JSON.parse(txt); } catch(_) {}
  if (d && d.app === 'ficsit-planner' && projApplySafe(d)) { if (!S.proj) S.proj = f.name.replace(/\.json$/i, ''); projPop.hidden = true; refitViews(); render(); } else projDraw(t('projBad')); }).catch(() => projDraw(t('projBad'))); });
document.addEventListener('pointerdown', e => { if (!projPop.hidden && !e.target.closest('#projPop') && !e.target.closest('#projBtn')) projPop.hidden = true; });
function trRangeEl(c, it, dir){ const f = fuelOf(c), md = typeof mapDist === 'function' ? mapDist(it, dir) : 0, d = c.d > 0 ? c.d : md, R2 = fuelRange(c.m, f);
  return {cls: 'trr' + (d > R2 ? ' bad' : ''), html: `${esc(t('trRange'))}: <b>${fmt(R2/1000, 1)} ${t('km')}</b>${d > 0 ? ` · ↔ ${fmt(d/1000, 1)} ${t('km')} ${d > R2 ? '⚠' : '✓'}` : ''}`}; }
function trDraw(){ if (!TP) return; const {it, dir} = TP, c = trCfg(it, dir);
  trPop.innerHTML = `<b>${esc(I[it].n)}</b><small>${esc(t(dir === 'out' ? 'trOut' : 'trIn'))}</small><div class="trm">${trModes(it, dir).map(m => `<button type="button" data-trm="${m}" aria-pressed="${m === c.m}" title="${esc(trName(m, it))}"><img src="${IU(trIco(m, it))}" alt="" width="26" height="26"><span>${esc(trName(m, it))}</span></button>`).join('')}</div>` +
    (TRM[c.m] && TRM[c.m].pw ? (() => { const f = fuelOf(c), md = typeof mapDist === 'function' ? mapDist(it, dir) : 0, d = c.d > 0 ? c.d : md, R2 = fuelRange(c.m, f);
      return `<small class="trfh">${esc(t('trFuel'))}</small><div class="trf">${Object.keys(FUEL).map(k => `<button type="button" data-trf="${k}" aria-pressed="${k === f}" title="${esc(I[k].n)} · ${fmt(fuelRange(c.m, k)/1000, 1)} ${t('km')}">${img(k, 22)}</button>`).join('')}</div>
        ${(x => `<div class="${x.cls}" title="${esc(t('trRangeT'))}">${x.html}</div>`)(trRangeEl(c, it, dir))}`; })() : '') +
    (TRM[c.m] ? (() => { const md = typeof mapDist === 'function' ? mapDist(it, dir) : 0; return `<label>${esc(t('distM'))}<input type="text" inputmode="decimal" autocomplete="off" id="trD" value="${c.d > 0 ? c.d : ''}" placeholder="${md > 0 ? esc(t('fromMap')) + ' ' + fmt(md, 0) : ''}"></label>`; })() : '');
  const b = document.querySelector(`.trb[data-tr="${it}"][data-dir="${dir}"][data-at="${TP.at}"]`) || TP.btn; TP.btn = b;
  const r = b.getBoundingClientRect(), w = trPop.offsetWidth || 310, h = trPop.offsetHeight || 200;
  let x = Math.min(r.left, innerWidth - w - 8), y = r.bottom + 6; if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 6);
  trPop.style.left = Math.max(8, x) + 'px'; trPop.style.top = y + 'px'; }
function trOpen(btn){ const it = btn.dataset.tr, dir = btn.dataset.dir;
  if (TP && TP.it === it && TP.dir === dir && TP.at === btn.dataset.at && !trPop.hidden) { trClose(); return; }
  TP = {it, dir, btn, at: btn.dataset.at}; trPop.hidden = false; trDraw(); trDraw(); }
function trClose(){ trPop.hidden = true; TP = null; }
trPop.addEventListener('click', e => { const fb = e.target.closest('[data-trf]'); if (fb && TP) { e.stopPropagation(); const k = TP.dir + ':' + TP.it; S.tr[k] = {...trCfg(TP.it, TP.dir), f: fb.dataset.trf}; linkSync(TP.it, TP.dir); render(); trDraw(); return; }
  const b = e.target.closest('[data-trm]'); if (!b || !TP) return; e.stopPropagation();
  const k = TP.dir + ':' + TP.it; S.tr[k] = {...(S.tr[k] || {}), m: b.dataset.trm}; linkSync(TP.it, TP.dir); render(); trDraw(); });
trPop.addEventListener('input', e => { if (!TP) return; const k = TP.dir + ':' + TP.it, v = Math.min(1e5, numIn(e.target.value));   // up to 100 km
  S.tr[k] = {...trCfg(TP.it, TP.dir), d: v};
  clearTimeout(window.__trt); window.__trt = setTimeout(() => { render(); if (TP) { const b = document.querySelector(`.trb[data-tr="${TP.it}"][data-dir="${TP.dir}"][data-at="${TP.at}"]`); if (b) TP.btn = b;
    const rr = trPop.querySelector('.trr'); if (rr) { const x = trRangeEl(trCfg(TP.it, TP.dir), TP.it, TP.dir); rr.className = x.cls; rr.innerHTML = x.html; } } }, 300); });   // update range right away, without losing focus in the field
document.addEventListener('click', e => { const b = e.target.closest('[data-tr]'); if (b) { trOpen(b); return; } if (TP && !e.target.closest('#trPop')) trClose(); }, true);
window.addEventListener('scroll', () => { if (TP && document.activeElement?.id !== 'trD') trClose(); }, {passive: true});   // popup anchored to a button: the page scrolled — close it
document.addEventListener('keydown', e => { if (e.key === 'Escape' && TP) { const b = TP.btn; trClose(); b?.focus(); } });
window.addEventListener('resize', () => { if (TP) trDraw(); });
/* ---------- language ---------- */
const star = (cx, cy, r, rot = -90) => { let p = ''; for (let i = 0; i < 10; i++) { const a = (rot + i*36)*Math.PI/180, rr = i % 2 ? r*.4 : r; p += (i ? 'L' : 'M') + (cx + rr*Math.cos(a)).toFixed(2) + ',' + (cy + rr*Math.sin(a)).toFixed(2); } return p + 'Z'; };
const hs = c => c.map((x,i) => `<rect y="${i*20/c.length}" width="30" height="${20/c.length + .2}" fill="${x}"/>`).join('');
const vs = c => c.map((x,i) => `<rect x="${i*10}" width="10.2" height="20" fill="${x}"/>`).join('');
const FLAGS = {
  ru: hs(['#fff','#0039a6','#d52b1e']), ua: hs(['#0057b7','#ffd700']), de: hs(['#000','#dd0000','#ffce00']), pl: hs(['#fff','#dc143c']),
  fr: vs(['#002395','#fff','#ed2939']), it: vs(['#009246','#fff','#ce2b37']),
  es: '<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>',
  jp: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>',
  cn: `<rect width="30" height="20" fill="#de2910"/><path d="${star(6,6,3.4)}" fill="#ffde00"/><path d="${star(11,2.4,1)}" fill="#ffde00"/><path d="${star(13,4.6,1)}" fill="#ffde00"/><path d="${star(13,7.6,1)}" fill="#ffde00"/><path d="${star(11,9.6,1)}" fill="#ffde00"/>`,
  br: '<rect width="30" height="20" fill="#009c3b"/><path d="M15 2.2 27.5 10 15 17.8 2.5 10Z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.4" fill="#002776"/>',
  kr: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5" fill="#0047a0"/><path d="M10 10a5 5 0 0 1 10 0a2.5 2.5 0 0 1-5 0a2.5 2.5 0 0 0-5 0" fill="#cd2e3a"/><g stroke="#000" stroke-width="1"><path d="M4 4.5l3-2M5 6l3-2M21.7 15.6l3-2M22.7 17l3-2M4 15.5l3 2M5 14l3 2M21.7 4.4l3 2M22.7 3l3 2"/></g>',
  tr: `<rect width="30" height="20" fill="#e30a17"/><circle cx="11" cy="10" r="5" fill="#fff"/><circle cx="12.3" cy="10" r="4" fill="#e30a17"/><path d="${star(17.6,10,2.1,-180)}" fill="#fff"/>`,
  cz: '<rect width="30" height="20" fill="#d7141a"/><rect width="30" height="10" fill="#fff"/><path d="M0 0 15 10 0 20Z" fill="#11457e"/>',
  gb: '<clipPath id="gbc"><rect width="30" height="20"/></clipPath><g clip-path="url(#gbc)"><rect width="30" height="20" fill="#012169"/><path d="M0 0 30 20M30 0 0 20" stroke="#fff" stroke-width="4"/><path d="M0 0 30 20M30 0 0 20" stroke="#c8102e" stroke-width="1.6"/><path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6"/><path d="M15 0v20M0 10h30" stroke="#c8102e" stroke-width="3.4"/></g>',
  hant: '<rect width="30" height="20" fill="#3a3a40"/><text x="15" y="15" text-anchor="middle" font-size="13" fill="#fff" font-family="sans-serif">繁</text>'
};
const flag = code => `<svg class="flag" viewBox="0 0 30 20" aria-hidden="true">${FLAGS[(UI.META[code] || [])[2]] || ''}</svg>`;
function applyLang(){
  const L = L10N[S.lang] || L10N['en-US']; document.documentElement.lang = S.lang; document.title = `${t('h1')} FICSIT`;   // browser tab title — in the UI language
  for (const k in I) I[k].n = L.i[k] || I[k].en;
  for (const k in R) R[k].n = L.r[k] || R[k].en;
  for (const k in M) M[k].n = L.m[k] || M[k].n;
  document.documentElement.lang = S.lang;
  document.querySelectorAll('[data-l]').forEach(e => e.textContent = t(e.dataset.l));
  document.querySelectorAll('[data-la]').forEach(e => e.setAttribute('aria-label', t(e.dataset.la)));
  document.querySelectorAll('[data-lp]').forEach(e => e.setAttribute('placeholder', t(e.dataset.lp)));
  document.querySelectorAll('[data-lt]').forEach(e => e.setAttribute('title', t(e.dataset.lt)));
  const m = UI.META[S.lang];
  document.getElementById('langBtn').innerHTML = `${flag(S.lang)}<span>${esc(m[0])}</span>`;
  document.getElementById('langMenu').innerHTML = Object.keys(UI.META).map(c => `<button type="button" role="option" data-lang="${c}" aria-selected="${c === S.lang}" lang="${c}">${flag(c)}${esc(UI.META[c][0])}</button>`).join('');
}
document.getElementById('langBtn').addEventListener('click', e => { e.stopPropagation(); const m = document.getElementById('langMenu'), open = m.hidden;
  m.hidden = !open; e.currentTarget.setAttribute('aria-expanded', String(open)); if (open) m.querySelector('[aria-selected=true]')?.focus(); });
// language menu: closes on outside click and Esc; arrows move between languages; never open together with "Projects"
const langClose = () => { const m = document.getElementById('langMenu'); if (m.hidden) return false; m.hidden = true; document.getElementById('langBtn').setAttribute('aria-expanded', 'false'); return true; };
document.addEventListener('pointerdown', e => { if (!e.target.closest('#langMenu') && !e.target.closest('#langBtn')) langClose(); if (e.target.closest('#langBtn')) projPop.hidden = true; });
document.addEventListener('keydown', e => { const m = document.getElementById('langMenu');
  if (e.key === 'Escape') { if (langClose()) document.getElementById('langBtn').focus(); if (!projPop.hidden) { projPop.hidden = true; document.getElementById('projBtn').focus(); } }
  if (!m.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { const L = [...m.querySelectorAll('[data-lang]')], i = L.indexOf(document.activeElement); e.preventDefault();
    L[(i + (e.key === 'ArrowDown' ? 1 : -1) + L.length) % L.length].focus(); } });
document.getElementById('langMenu').addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (!b) return;
  S.lang = b.dataset.lang; document.getElementById('langMenu').hidden = true; document.getElementById('langBtn').setAttribute('aria-expanded', 'false');
  applyLang(); refitViews(); render(); if (!document.getElementById('picker').hidden) renderTiles(); });
