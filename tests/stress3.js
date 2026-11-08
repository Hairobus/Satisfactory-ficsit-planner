const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+require('path').resolve(__dirname,'../index.html'));await p.waitForTimeout(800);
const r=await p.evaluate(()=>{const out={miss:{},lay:[],gov:[]};
 const keys=Object.keys(UI.T.ru); for(const l of Object.keys(UI.T)){const m=keys.filter(k=>!(k in UI.T[l])); if(m.length) out.miss[l]=m;}
 const items=Object.keys(I).filter(it=>(producers[it]||[]).length);
 for(const it of items){ S.targets=[[it,baseRate(it)*5]];S.choice=presetChoice('sa');S.stepMode='full';S.expanded=[];
  S.view='layout';render();
  const segs=[...document.querySelectorAll('#lvp path.belt:not(.bus)')].map(e=>{const m=e.getAttribute('d').match(/M([-\d.]+),([-\d.]+) H([-\d.]+)/);return m?{y:+m[2],a:Math.min(+m[1],+m[3]),b:Math.max(+m[1],+m[3])}:null}).filter(Boolean);
  let bad=0;for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++){const A=segs[i],B=segs[j];if(Math.abs(A.y-B.y)<20&&Math.min(A.b,B.b)-Math.max(A.a,B.a)>5)bad++;}
  if(bad) out.lay.push([it,bad]);
  // machines overlapping
  const R2=[...document.querySelectorAll('#lvp rect.mach')].map(e=>[+e.getAttribute('x'),+e.getAttribute('y'),+e.getAttribute('width'),+e.getAttribute('height')]);
  let mo=0;for(let i=0;i<R2.length;i++)for(let j=i+1;j<R2.length;j++){const a=R2[i],c=R2[j];if(a[0]<c[0]+c[2]-1&&c[0]<a[0]+a[2]-1&&a[1]<c[1]+c[3]-1&&c[1]<a[1]+a[3]-1)mo++;}
  if(mo) out.lay.push([it,'mach',mo]);
  S.view='graph';G.ctx='';render();
  const N=[...G.L.nodes.values()].filter(n=>n.kind!=='dum');let go=0;for(let i=0;i<N.length;i++)for(let j=i+1;j<N.length;j++){const a=N[i],c=N[j];if(a.x<c.x+NW&&c.x<a.x+NW&&a.y<c.y+c.h&&c.y<a.y+a.h)go++;}
  if(go) out.gov.push([it,go]); }
 return out;});
console.log(JSON.stringify(r));console.log(errs.slice(0,5));await b.close();})();
