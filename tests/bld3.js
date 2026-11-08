const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+require('path').resolve(__dirname,'../index.html'));await p.waitForTimeout(800);
const r=await p.evaluate(()=>{const out={err:[],slow:[],ov:[]};const items=Object.keys(I).filter(it=>(producers[it]||[]).length);
 for(const pr of ['std','sa']) for(const it of items){S.view='bld';S.stepMode='full';S.expanded=[];S.targets=[[it,baseRate(it)*3]];S.choice=presetChoice(pr);S.floor=1;
  const t0=performance.now();try{render();}catch(e){out.err.push([pr,it,e.message]);continue;}const dt=performance.now()-t0;if(dt>800)out.slow.push([it,Math.round(dt)]);
  // machines must not overlap on a floor
  const R2=[...document.querySelectorAll('#lvp rect.mach')].map(e=>[+e.getAttribute('x'),+e.getAttribute('y'),+e.getAttribute('width'),+e.getAttribute('height')]);
  let mo=0;for(let i=0;i<R2.length;i++)for(let j=i+1;j<R2.length;j++){const a=R2[i],c=R2[j];if(a[0]<c[0]+c[2]-1&&c[0]<a[0]+a[2]-1&&a[1]<c[1]+c[3]-1&&c[1]<a[1]+a[3]-1)mo++;} if(mo) out.ov.push([pr,it,mo]);}
 return {errN:out.err.length,err:out.err.slice(0,4),slow:out.slow.slice(0,4),ov:out.ov.slice(0,4),ovN:out.ov.length};});
console.log(JSON.stringify(r),errs.slice(0,3));await b.close();})();
