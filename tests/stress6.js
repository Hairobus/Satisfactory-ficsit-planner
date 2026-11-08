const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const p=await b.newPage({viewport:{width:1440,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await p.goto('file://'+require('path').resolve(__dirname,'../index.html'));await p.waitForTimeout(3000);
const r=await p.evaluate(()=>{const out={err:[],nan:[],slow:[]};const items=Object.keys(I).filter(it=>(producers[it]||[]).length);
 const MODES=['belt','truck','tractor','train','drone'];const txt=()=>document.body.innerText;
 // building: floors, section/3D
 for(const pr of ['std','sa']) for(const it of items) for(const fl of [-1,0,1]){S.targets=[[it,baseRate(it)*3]];S.choice=presetChoice(pr);S.stepMode='full';S.expanded=[];S.view='bld';S.floor=fl;
   const t0=performance.now();try{render();}catch(e){out.err.push(['bld',pr,it,fl,e.message]);continue;}const dt=performance.now()-t0;if(dt>500)out.slow.push(['bld',pr,it,fl,Math.round(dt)]);
   if(/NaN|undefined|Infinity/.test(txt()))out.nan.push(['bld',pr,it,fl]);}
 // logistics + map: every item, transport type cycled for all raw inputs and the output
 const POS=[{x:-500,y:900},{x:300,y:-200},{x:2500,y:-1500}];let k=0;
 for(const it of items){S.targets=[[it,baseRate(it)*3]];S.choice=presetChoice('std');S.stepMode='full';S.expanded=[];S.view='map';S.map3d=k%2==1;S.mapPos=POS[k%3];
   render();const raw=Object.entries(last.bal).filter(([i,b])=>b<-1e-6&&solveRecipe(i)==='raw').map(([i])=>i);S.tr={};
   raw.forEach((i,j)=>S.tr['in:'+i]={m:MODES[(k+j)%5]});S.tr['out:'+it]={m:MODES[(k+2)%5],d:1500};k++;
   const t0=performance.now();try{render();if(S.map3d)draw3M();}catch(e){out.err.push(['map',it,e.message]);continue;}const dt=performance.now()-t0;if(dt>1500)out.slow.push(['map',it,Math.round(dt)]);
   if(/NaN|undefined|Infinity/.test(txt()))out.nan.push(['map',it,JSON.stringify(S.tr)]);
   for(const v of ['list','layout','bld']){S.view=v;try{render();}catch(e){out.err.push(['lg',v,it,e.message]);} if(/NaN|undefined|Infinity/.test(txt()))out.nan.push(['lg',v,it]);}}
 return {n:items.length,errN:out.err.length,err:out.err.slice(0,8),nanN:out.nan.length,nan:out.nan.slice(0,8),slowN:out.slow.length,slow:out.slow.slice(0,8)};});
console.log(JSON.stringify(r,null,1));console.log(errs.slice(0,5));await b.close();})();
