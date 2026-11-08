const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+require('path').resolve(__dirname,'../index.html'));await p.waitForTimeout(800);
const r=await p.evaluate(()=>{const bad=[];let tot=0;const items=Object.keys(I).filter(it=>(producers[it]||[]).length);
 for(const pr of ['std','sa']) for(const it of items){S.view='graph';S.stepMode='full';S.targets=[[it,baseRate(it)*3]];S.choice=presetChoice(pr);G.ctx='';render();
  const N=[...G.L.nodes.values()].filter(n=>n.kind!=='dum');
  document.querySelectorAll('#vp path.edge').forEach(el=>{const L=el.getTotalLength();const A=el.dataset.a,B=el.dataset.b;tot++;
   for(let s=0;s<=L;s+=6){const q=el.getPointAtLength(s);const hit=N.find(n=>n.id!==A&&n.id!==B&&q.x>n.x+4&&q.x<n.x+NW-4&&q.y>n.y+4&&q.y<n.y+n.h-4);if(hit){bad.push([pr,it,A,B,hit.id]);break;}}});}
 return {tot,n:bad.length,ex:bad.slice(0,6)};});
console.log(JSON.stringify(r),errs);await b.close();})();
