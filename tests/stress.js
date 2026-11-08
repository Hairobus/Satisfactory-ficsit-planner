const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file://'+require('path').resolve(__dirname,'../index.html'));await p.waitForTimeout(800);
const r=await p.evaluate(()=>{const out={slow:[],err:[],loops:[],nan:[]};const items=Object.keys(I).filter(it=>(producers[it]||[]).length);
 for(const preset of ['std','s','sa']) for(const mode of ['full','step']) for(const view of ['list','graph','layout']){
  for(const it of items){ S.targets=[[it,baseRate(it)*3]];S.choice=presetChoice(preset);S.stepMode=mode;S.view=view;S.expanded=[];
   const t0=performance.now(); try{render();}catch(e){out.err.push([preset,mode,view,it,e.message]);continue;} const dt=performance.now()-t0;
   if(dt>300) out.slow.push([preset,mode,view,it,Math.round(dt)]);
   if(/NaN|undefined|Infinity/.test(document.getElementById('chainList').textContent+document.querySelector('.inv').textContent)) out.nan.push([preset,mode,view,it]);
   if(document.getElementById('chainNotes').textContent.includes(t('loopNote').slice(0,10))) out.loops.push([preset,mode,it]);}}
 return {n:items.length,err:out.err.slice(0,10),errN:out.err.length,slow:out.slow.slice(0,15),slowN:out.slow.length,nan:out.nan.slice(0,10),nanN:out.nan.length,loops:[...new Set(out.loops.map(x=>x.join(':')))].slice(0,20)};});
console.log(JSON.stringify(r,null,1));console.log(errs.slice(0,5));await b.close();})();
