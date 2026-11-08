const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+require('path').resolve(__dirname,'../index.html'));await p.waitForTimeout(800);
const r=await p.evaluate(()=>{const out={err:[],slow:[],diff:[]};const items=Object.keys(I).filter(it=>(producers[it]||[]).length);
 for(const preset of ['std','sa']) for(const it of items){ S.targets=[[it,baseRate(it)*3]];S.choice=presetChoice(preset);S.view='graph';
  // full
  S.stepMode='full';S.expanded=[];render();const fullRaw=JSON.stringify(Object.entries(last.bal).filter(([,b])=>b<-1e-6).map(([k,b])=>[k,+b.toFixed(3)]).sort());
  S.stepMode='step';S.expanded=[];let k=0,t0=performance.now();
  try{ for(;k<80;k++){ render(); const nx=Object.entries(last.bal).filter(([i,b])=>b<-1e-6&&canExpand(i)&&!S.expanded.includes(i)).map(([i])=>i); if(!nx.length)break; S.expanded.push(...nx);} }catch(e){out.err.push([it,e.message]);continue;}
  const dt=performance.now()-t0; if(dt>1500) out.slow.push([it,Math.round(dt),k]);
  const stepRaw=JSON.stringify(Object.entries(last.bal).filter(([,b])=>b<-1e-6).map(([k,b])=>[k,+b.toFixed(3)]).sort());
  if(stepRaw!==fullRaw) out.diff.push([preset,it]);
  // collapse all back via colBtn logic
  S.expanded=[];render();}
 return {err:out.err.slice(0,5),slow:out.slow.slice(0,5),diffN:out.diff.length,diff:out.diff.slice(0,8)};});
console.log(JSON.stringify(r));console.log(errs.slice(0,5));await b.close();})();
