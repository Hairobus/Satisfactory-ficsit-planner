const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+require('path').resolve(__dirname,'../index.html'));await p.waitForTimeout(800);
await p.evaluate(()=>{S.lang='ru';applyLang();S.view='bld';S.stepMode='full';S.targets=[['Desc_SpaceElevatorPart_3_C',10],['Desc_SpaceElevatorPart_2_C',10]];S.choice={};S.floor=-1;render();});
await p.waitForTimeout(400);await (await p.$('#lwrap')).scrollIntoViewIfNeeded();await p.waitForTimeout(200);
const pt=await p.evaluate(()=>{const h=C3.hits[12];const r=document.getElementById('l3d').getBoundingClientRect();return [r.left+(h.a[0]+h.b[0])/2, r.top+(h.a[1]+h.b[1])/2, h.tip];});
await p.mouse.move(pt[0]-20,pt[1]);await p.mouse.move(pt[0],pt[1],{steps:3});await p.waitForTimeout(200);
console.log(pt, await p.evaluate(([x,y])=>{const t=document.getElementById('tip3d');return [t.hidden,t.textContent,C3.hov,document.elementFromPoint(x,y)?.id||document.elementFromPoint(x,y)?.className]},pt));
await (await p.$('#lwrap')).screenshot({path:require('path').join(require('os').tmpdir(),'H1.png')});console.log(errs);await b.close();})();
