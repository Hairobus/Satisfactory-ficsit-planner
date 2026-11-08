/* ===== vehicles on the 3D map — simple boxes sized from the wiki (satisfactory.wiki.gg) =====
   One unit box (x, z from −0.5 to 0.5, y from 0 to 1), scaled to size: length × width × height, m. */
const VEH = {
  tractor: {L: 5, W: 4, H: 3.5, v: 69/3.6},      // tractor 5×4×3.5 m, 69 km/h
  truck:   {L: 10.5, W: 6.5, H: 6, v: 89/3.6},   // truck 10.5×6.5×6 m, 89 km/h
  loco:    {L: 16, W: 6, H: 6, v: 120/3.6},      // locomotive 16×6×6 m, 120 km/h
  wagon:   {L: 16, W: 6, H: 6},                  // freight car 16×6×6 m
  drone:   {L: 6, W: 16, H: 3, v: 75}            // drone: length 6, width 16, height 3 m; 75 m/s on batteries
};
const BOX = (() => { const p = [], n = [], i = [];
  const q = (v, nn) => { const k = p.length/3; v.forEach(a => { p.push(...a); n.push(...nn); }); i.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  const a = -.5, b = .5;
  q([[a,0,b],[b,0,b],[b,1,b],[a,1,b]], [0,0,1]); q([[b,0,a],[a,0,a],[a,1,a],[b,1,a]], [0,0,-1]); q([[b,0,b],[b,0,a],[b,1,a],[b,1,b]], [1,0,0]);
  q([[a,0,a],[a,0,b],[a,1,b],[a,1,a]], [-1,0,0]); q([[a,1,b],[b,1,b],[b,1,a],[a,1,a]], [0,1,0]); q([[a,0,a],[b,0,a],[b,0,b],[a,0,b]], [0,-1,0]);
  return {p: new Float32Array(p), n: new Float32Array(n), t: new Float32Array(p.length/3).fill(1), i: new Uint16Array(i)}; })();
