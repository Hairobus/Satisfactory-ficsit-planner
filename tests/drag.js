const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+require('path').resolve(__dirname,'../index.html'));await p.waitForTimeout(800);
await p.evaluate(()=>{S.view='graph';S.stepMode='full';S.targets=[['Desc_SpaceElevatorPart_3_C',10],['Desc_SpaceElevatorPart_2_C',10]];S.choice={};G.ctx='';render();});await p.waitForTimeout(300);

// drag two tiles with the real mouse
const drag=async(id,dx,dy)=>{const el=await p.$(`.node[data-id="${id}"] .box`);const bb=await el.boundingBox();await p.mouse.move(bb.x+bb.width/2,bb.y+10);await p.mouse.down();for(let i=1;i<=10;i++){await p.mouse.move(bb.x+bb.width/2+dx*i/10,bb.y+10+dy*i/10);}await p.mouse.up();};
const ids=await p.evaluate(()=>[...G.L.nodes.values()].filter(n=>n.kind==='rec').map(n=>n.id));
await drag(ids.find(i=>i.includes('IngotIron')),0,-200);
await drag(ids.find(i=>i.includes('IronRod')),150,250);

const r=await p.evaluate(()=>{const N=[...G.L.nodes.values()].filter(n=>n.kind!=='dum');let hit=0,back=0;
 document.querySelectorAll('#vp path.edge').forEach(el=>{const A=el.dataset.a,B=el.dataset.b,L=el.getTotalLength();let px=null;
  for(let s=0;s<=L;s+=6){const q=el.getPointAtLength(s);if(N.find(n=>n.id!==A&&n.id!==B&&q.x>n.x+4&&q.x<n.x+NW-4&&q.y>n.y+4&&q.y<n.y+n.h-4)){hit++;break;}}});
 return {hit};});
console.log(r,errs);await b.close();})();
