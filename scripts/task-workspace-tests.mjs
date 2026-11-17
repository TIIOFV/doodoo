import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import playwrightPath from './playwright-path.mjs';
import {createSandbox} from './phase-3-sandbox.mjs';
const {chromium} = await import(pathToFileURL(path.join(playwrightPath,'index.mjs')).href);
const browser = await chromium.launch({channel:'chrome',headless:true});
const origin = 'http://127.0.0.1:3300';
const output = 'docs/task-workspace';
fs.mkdirSync(output,{recursive:true});
const results=[];
async function poll(action, message) { for(let i=0;i<100;i++){if(await action())return; await new Promise(r=>setTimeout(r,60));} throw Error(message); }
async function test(name, action) {
 if(process.env.DOO_TEST_FILTER && !name.includes(process.env.DOO_TEST_FILTER)) return;
 const state=createSandbox(),contexts=[];
 const open=async(user=state.a, viewport={width:1440,height:960})=>{
  const ctx=await browser.newContext({viewport,timezoneId:'America/Sao_Paulo'});contexts.push(ctx);await state.attach(ctx,user);
  const page=await ctx.newPage();page.setDefaultTimeout(8000);page.setDefaultNavigationTimeout(60000);
  await page.addInitScript(()=>{window.__notices=[];window.addEventListener('doodoo:notify',e=>window.__notices.push(e.detail));});
  return page;
 };
 try { await action(state,open); assert.equal(state.blocked.length,0,'unexpected external request'); results.push({name,status:'PASS MOCK'}); console.log('PASS',name); }
 catch(e){results.push({name,status:'FAIL',error:e.message});console.log('FAIL',name,e.message);}
 finally {for(const ctx of contexts)await ctx.close();}
}
async function go(page, route='/dashboard/tarefas') {await page.goto(origin+route);await page.addStyleTag({content:'nextjs-portal { display:none !important; }'});await page.getByLabel('Tema visual').waitFor();}
async function notices(page) {return page.evaluate(()=>window.__notices.filter(n=>n.eventKey));}
async function baseline(page,state,user) {await poll(()=>page.evaluate(key=>localStorage.getItem(key)!==null,`doodoo:task-checkpoints:v1:${user.user_id}:${user.setor}`),'checkpoint missing');}
async function openDiary(page,id) {await go(page,`/dashboard/tarefas?taskId=${id}&tab=updates`);await page.getByLabel('Nova atualização').waitFor();}
async function send(page,text) {await page.getByLabel('Nova atualização').fill(text);await page.getByRole('button',{name:'Publicar atualização',exact:true}).click();await poll(()=>page.getByLabel('Nova atualização').inputValue().then(v=>!v),'send not confirmed');}

await test('expanded detail, list restoration, keyboard tabs and checklist persistence',async(s,open)=>{
 const p=await open();await go(p);const task=s.tables.doodoo_tarefas[0];
 const before=await p.locator('[aria-label="Lista de tarefas"]').boundingBox();
 await p.getByText(task.titulo,{exact:true}).first().click();
 const detail=p.getByRole('region',{name:'Detalhes da tarefa'});await detail.waitFor();
 await detail.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));
 assert.equal(await p.locator('[aria-label="Lista de tarefas"]').isVisible(),false);
 const after=await detail.boundingBox();assert(Math.abs(after.x-before.x)<2&&Math.abs(after.width-before.width)<2,'detail did not replace entire queue');
 await p.getByRole('button',{name:'Nova etapa',exact:true}).click();await p.getByLabel('Nova etapa',{exact:true}).fill('Conferir entrega');await p.getByRole('button',{name:'+ Adicionar Etapa',exact:true}).click();await p.getByRole('checkbox',{name:'Conferir entrega'}).click();
 await poll(()=>s.tables.doodoo_tarefas[0].etapas.some(e=>e.text==='Conferir entrega'&&e.done),'step not saved');
 await p.getByRole('button',{name:'Editar',exact:true}).click();await p.getByLabel('Editar título da tarefa').fill('Entrega revisada');await p.getByRole('button',{name:'Salvar Alterações',exact:true}).click();await p.getByRole('heading',{name:'Entrega revisada',exact:true}).waitFor();
 await p.getByRole('tab',{name:'Visão geral'}).focus();await p.keyboard.press('ArrowRight');assert.equal(await p.getByRole('tab',{name:/Diário e atualizações/}).getAttribute('aria-selected'),'true');
 await p.getByRole('button',{name:'Fechar tarefa',exact:true}).click();await p.locator('[aria-label="Lista de tarefas"]').waitFor({state:'visible'});
 await poll(()=>p.locator('[data-task-id]:focus, input[aria-label="Pesquisar tarefas"]:focus').count().then(n=>n===1),'queue focus not restored');
});

await test('bidirectional diary notices, no self notices, edit/delete replay and same-page deep link',async(s,open)=>{
 const task=s.tables.doodoo_tarefas[0];task.responsavel=s.b.nome;
 const a=await open(),b=await open(s.b);await go(a,'/dashboard/notas');await baseline(a,s,s.a);await openDiary(b,task.id);await baseline(b,s,s.b);
 await send(b,'Responsável terminou a primeira etapa');await poll(async()=> (await notices(a)).length===1,'creator received no notice outside tasks');assert.equal((await notices(b)).length,0);
 await openDiary(a,task.id);await send(a,'Pode prosseguir com a entrega');await poll(async()=> (await notices(b)).length===1,'assignee received no comment notice');
 await b.getByRole('button',{name:'Editar mensagem',exact:true}).click();await b.getByLabel('Editar atualização').fill('Primeira etapa revisada');await b.getByRole('button',{name:'Salvar atualização'}).click();await poll(()=>task.chat[0].text==='Primeira etapa revisada','edit not saved');
 await b.getByRole('button',{name:'Excluir mensagem',exact:true}).click();await b.getByRole('button',{name:'Sim, Excluir',exact:true}).click();await b.getByRole('alertdialog').waitFor({state:'detached'});
 await a.evaluate(()=>window.dispatchEvent(new Event('focus')));await a.waitForTimeout(300);assert.equal((await notices(a)).length,0,'edit/delete generated a new comment notice');
 // Exercise the actual notification panel while the task route is already mounted.
 await b.getByRole('tab',{name:'Visão geral'}).click();
 await b.getByRole('button',{name:/Notifica/}).first().click();
 await b.getByText('Nova atualização na tarefa',{exact:true}).first().click();
 await b.getByLabel('Nova atualização').waitFor();assert.equal(await b.getByRole('tab',{name:/Diário e atualizações/}).getAttribute('aria-selected'),'true');
});

await test('difficulty and reminder notify the opposite participant once',async(s,open)=>{
 const task=s.tables.doodoo_tarefas[0];task.responsavel=s.b.nome;
 const a=await open(),b=await open(s.b);await openDiary(a,task.id);await openDiary(b,task.id);await baseline(a,s,s.a);await baseline(b,s,s.b);
 await b.getByRole('checkbox',{name:'Sinalizar dificuldade'}).check();await send(b,'Preciso de acesso ao equipamento');await poll(async()=> (await notices(a)).length===1,'difficulty notice missing');assert.equal((await notices(a))[0].title,'Atenção no diário da tarefa');
 await a.getByRole('button',{name:'Solicitar atualização',exact:true}).click();await poll(async()=> (await notices(b)).length===1,'reminder notice missing');
 assert((await notices(b))[0].desc.includes('Solicitou posicionamento'));
});

await test('failed comment retains draft and produces no recipient notice',async(s,open)=>{
 const task=s.tables.doodoo_tarefas[0];task.responsavel=s.b.nome;
 const a=await open(),b=await open(s.b);await go(a,'/dashboard/notas');await baseline(a,s,s.a);await openDiary(b,task.id);await baseline(b,s,s.b);
 s.fail('doodoo_tarefas','PATCH');await b.getByLabel('Nova atualização').fill('Rascunho preservado');await b.getByRole('button',{name:'Publicar atualização'}).click();await b.getByRole('status').filter({hasText:'Não foi possível salvar'}).waitFor();
 assert.equal(await b.getByLabel('Nova atualização').inputValue(),'Rascunho preservado');assert.equal((await notices(a)).length,0);
 await b.getByRole('button',{name:'Publicar atualização'}).click();await poll(async()=> (await notices(a)).length===1,'retry did not notify');
});

await test('offline return recovers new comments once in same browser',async(s,open)=>{
 const task=s.tables.doodoo_tarefas[0];task.responsavel=s.b.nome;
 const a=await open(),b=await open(s.b);await go(a,'/dashboard/notas');await baseline(a,s,s.a);await a.goto('about:blank');await openDiary(b,task.id);await send(b,'Atualização durante ausência');
 await go(a,'/dashboard/notas');await poll(async()=> (await notices(a)).length===1,'offline recovery missing');await a.reload();await baseline(a,s,s.a);assert.equal((await notices(a)).length,0,'reload replayed notification');
});

await test('assignment emits one recipient notice and none for unrelated teammate',async(s,open)=>{
 const teammate={...s.b,user_id:'44444444-4444-4444-8444-444444444444',id:'profile-d',nome:'Diego Teste'};s.users.push(teammate);s.tables.doodoo_perfis.push(teammate);
 const a=await open(),b=await open(s.b),d=await open(teammate);await go(a);await go(b,'/dashboard/notas');await go(d,'/dashboard/notas');await baseline(b,s,s.b);await baseline(d,s,teammate);
 await a.getByRole('button',{name:'Nova Tarefa',exact:true}).click();await a.getByLabel('Título da Demanda *').fill('Tarefa delegada moderna');await a.getByLabel('Responsável',{exact:true}).selectOption(s.b.nome);await a.getByRole('button',{name:'Salvar Tarefa'}).click();await a.getByRole('dialog').waitFor({state:'detached'});
 await poll(async()=> (await notices(b)).length===1,'assignment notice missing');assert.equal((await notices(d)).length,0);assert((await notices(b))[0].link.includes('taskId='));
});

await test('view transitions run on open/close and respect reduced motion',async(s,open)=>{
 const p=await open();await go(p);const task=s.tables.doodoo_tarefas[0];
 await p.evaluate(()=>{
  window.__taskMotion=0;
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(...args){window.__taskMotion++;return animate.apply(this,args);};
 });
 await p.getByText(task.titulo,{exact:true}).first().click();await p.locator('.task-title').waitFor();
 await p.locator('.task-detail').evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));
 assert(await p.evaluate(()=>window.__taskMotion>=2),'opening did not animate exit and entry');
 await p.getByRole('button',{name:'Fechar tarefa'}).click();await p.locator('.task-queue').waitFor({state:'visible'});
 await p.locator('.task-queue').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
 assert(await p.evaluate(()=>window.__taskMotion>=4),'closing did not animate exit and entry');
 await p.emulateMedia({reducedMotion:'reduce'});
 const before=await p.evaluate(()=>window.__taskMotion);
 await p.getByText(task.titulo,{exact:true}).first().click();await p.locator('.task-title').waitFor();
 assert.equal(await p.evaluate(()=>window.__taskMotion),before,'reduced-motion user received a view animation');
 assert(await p.locator('.task-detail').evaluate(el=>el.getAnimations({subtree:true}).length===0),'reduced-motion user received a content animation');
 assert(await p.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.task-description')).fontSize)>parseFloat(getComputedStyle(document.querySelector('.task-summary select')).fontSize)),'description is visually subordinate to controls');
});

await test('desktop and mobile layouts in nature/dark themes, no horizontal overflow',async(s,open)=>{
 const task=s.tables.doodoo_tarefas[0];task.titulo='Finalizar as formatações dos computadores do call center';task.atribuido_por=s.b.nome;task.data_limite='13/11/2026';task.status='andamento';task.descricao='Concluir a preparação dos equipamentos e validar a configuração com a supervisora do setor. Restam duas máquinas para liberar.';
 task.etapas=[{id:1,text:'Validar os equipamentos já preparados',done:true},{id:2,text:'Agendar a liberação das duas máquinas restantes',note:'Alinhar a melhor data com a supervisora do setor.',done:false}];
 task.chat=[{id:'old-1',author:s.b.nome,text:'Alguma atualização sobre os computadores?',time:'11/11/2026 às 23:03'},{id:'old-2',author:s.a.nome,authorId:s.a.user_id,text:'Aguardando a melhor data com a supervisora. No momento faltam duas máquinas.',time:'16/11/2026 às 12:42'}];
 const p=await open();await go(p,`/dashboard/tarefas?taskId=${task.id}`);await p.getByLabel('Status da tarefa').waitFor();
 for(const width of [1912,1440,1024,390,320]){
  await p.setViewportSize({width,height:width<500?844:960});
  for(const theme of ['nature','dark']){
   if(await p.getByLabel('Tema visual').isVisible()) await p.getByLabel('Tema visual').selectOption(theme);
   else await p.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
   for(const tab of ['Visão geral','Diário e atualizações']){
    await p.getByRole('tab',{name:tab,exact:false}).click();await p.locator('.task-detail').evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));
    const header=await p.locator('.task-detail-header').boundingBox(), close=await p.getByRole('button',{name:'Fechar tarefa',exact:true}).boundingBox();
    assert(close.x>header.x+header.width-65&&close.y<header.y+55,'close is not at the top-right at '+width);
    if(width>=1440&&tab==='Visão geral'){
      const description=await p.locator('.task-description-card').boundingBox(),aside=await p.locator('.task-overview-aside').boundingBox();
      assert(aside.x>=description.x+description.width,'task information lost its two-column layout at '+width);
    }
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'document overflow at '+width);
    assert(await p.locator('.task-detail').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'detail overflow at '+width);
    await p.screenshot({path:`${output}/${width}-${theme}-${tab==='Visão geral'?'overview':'diary'}.png`});
   }
  }
 }
});
await browser.close();
fs.writeFileSync(output+(process.env.DOO_TEST_FILTER?'/visual-results.json':'/results.json'),JSON.stringify(results,null,2));
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
