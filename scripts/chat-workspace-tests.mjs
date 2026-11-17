import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import playwrightPath from './playwright-path.mjs';
import {createSandbox} from './phase-3-sandbox.mjs';
const {chromium}=await import(pathToFileURL(path.join(playwrightPath,'index.mjs')).href);
const browser=await chromium.launch({channel:'chrome',headless:true});
const output='docs/chat-workspace';fs.mkdirSync(output,{recursive:true});
const results=[];
async function poll(fn,message){for(let i=0;i<120;i++){if(await fn())return;await new Promise(r=>setTimeout(r,60));}throw Error(message);}
async function test(name,action){
 const s=createSandbox(),contexts=[],errors=[];
 const open=async(user=s.a)=>{const c=await browser.newContext({viewport:{width:1440,height:960},timezoneId:'America/Sao_Paulo'});contexts.push(c);await s.attach(c,user);const p=await c.newPage();p.setDefaultTimeout(10000);p.setDefaultNavigationTimeout(60000);p.on('pageerror',e=>errors.push(e.message));return p;};
 try{await action(s,open);assert.equal(errors.length,0,errors.join(';'));assert.equal(s.blocked.length,0);results.push({name,status:'PASS MOCK'});console.log('PASS',name);}
 catch(e){results.push({name,status:'FAIL',error:e.message});console.log('FAIL',name,e.message);}
 finally{for(const c of contexts)await c.close();}
}
async function go(p,url){await p.goto('http://127.0.0.1:3300'+url);await p.addStyleTag({content:'nextjs-portal { display:none !important; }'});await p.getByLabel('Tema visual').waitFor();}
async function chat(p){await go(p,'/dashboard/conversas');await p.getByText('Equipe UI',{exact:true}).first().click();await p.getByLabel('Mensagem',{exact:true}).waitFor();}
async function send(p,text){await p.getByLabel('Mensagem',{exact:true}).fill(text);await p.getByRole('button',{name:'Enviar',exact:true}).click();}

await test('urgent cross-page delivery, opening exact message, acknowledgement and cooldown',async(s,open)=>{
 const a=await open(),b=await open(s.b);await chat(a);await go(b,'/dashboard/notas');
 await a.getByRole('checkbox',{name:'Enviar como urgente'}).check();await send(a,'Precisamos validar a liberação do equipamento agora.');
 const alert=b.getByRole('complementary',{name:'Chamada urgente'});await alert.waitFor();assert.equal(await a.getByRole('complementary',{name:'Chamada urgente'}).count(),0);
 assert.equal(s.tables.doodoo_mensagens.at(-1).metadata.urgent,true);const id=s.tables.doodoo_mensagens.at(-1).id;
 await alert.getByRole('button',{name:'Abrir conversa'}).click();await b.getByRole('button',{name:'Ciente',exact:true}).click();
 await poll(()=>s.tables.doodoo_mensagens.find(m=>m.id===id)?.metadata.acknowledgedBy?.includes(s.b.user_id),'ack not persisted');
 await a.getByText('1 pessoa ciente',{exact:true}).waitFor();
 await a.getByRole('checkbox',{name:'Enviar como urgente'}).check();await send(a,'Segunda chamada bloqueada');await a.getByRole('status').filter({hasText:'Aguarde um momento'}).waitFor();
 assert(!s.tables.doodoo_mensagens.some(m=>m.texto==='Segunda chamada bloqueada'));assert.equal(await a.getByLabel('Mensagem',{exact:true}).inputValue(),'Segunda chamada bloqueada');
 await b.reload();await b.getByText('Você confirmou ciência',{exact:true}).waitFor();
});

await test('first urgent message in a newly created direct conversation',async(s,open)=>{
 const a=await open(),b=await open(s.b);await chat(a);await go(b,'/dashboard/notas');
 await a.getByPlaceholder('Iniciar ou procurar conversa...').fill('Bruno');await a.getByText('Bruno Teste',{exact:true}).first().click();
 await a.getByRole('checkbox',{name:'Enviar como urgente'}).check();await send(a,'Primeira chamada direta para Bruno');
 await b.getByRole('complementary',{name:'Chamada urgente'}).getByText('Primeira chamada direta para Bruno',{exact:true}).waitFor();
 assert.equal(await a.locator('[data-chat-row]').filter({hasText:'Bruno Teste'}).count(),1,'direct conversation duplicated after realtime insert');
});

await test('failed urgent send preserves text, retry sends once, recipient can dismiss',async(s,open)=>{
 const a=await open(),b=await open(s.b);await chat(a);await go(b,'/dashboard/notas');
 s.fail('doodoo_mensagens','POST');await a.getByRole('checkbox',{name:'Enviar como urgente'}).check();await send(a,'Acesso necessário para continuar');await a.getByRole('button',{name:'Reenviar mensagem'}).waitFor();
 assert.equal(await a.getByLabel('Mensagem',{exact:true}).inputValue(),'Acesso necessário para continuar');assert.equal(await b.getByRole('complementary',{name:'Chamada urgente'}).count(),0);
 await a.getByRole('button',{name:'Reenviar mensagem'}).click();await b.getByRole('complementary',{name:'Chamada urgente'}).waitFor();assert.equal(s.tables.doodoo_mensagens.filter(m=>m.texto==='Acesso necessário para continuar').length,1);
 await b.getByRole('button',{name:'Dispensar chamada urgente'}).click();assert.equal(await b.getByRole('complementary',{name:'Chamada urgente'}).count(),0);
});

await test('normal messages stay normal, unrelated teammate gets no urgent alert',async(s,open)=>{
 const d={...s.b,id:'profile-d',user_id:'44444444-4444-4444-8444-444444444444',nome:'Diego Teste'};s.users.push(d);s.tables.doodoo_perfis.push(d);
 const a=await open(),b=await open(s.b),other=await open(d);await chat(a);await go(b,'/dashboard/notas');await go(other,'/dashboard/notas');
 await send(a,'Atualização normal');await poll(()=>s.tables.doodoo_mensagens.some(m=>m.texto==='Atualização normal'),'message missing');assert.equal(await b.getByRole('complementary',{name:'Chamada urgente'}).count(),0);
 await a.getByRole('checkbox',{name:'Enviar como urgente'}).check();await send(a,'Chamada apenas para membros');await b.getByRole('complementary',{name:'Chamada urgente'}).waitFor();assert.equal(await other.getByRole('complementary',{name:'Chamada urgente'}).count(),0);
});

await test('chat styling at desktop/mobile, reply actions, search and reduced-motion alert',async(s,open)=>{
 const a=await open(),b=await open(s.b);await chat(a);await chat(b);await b.emulateMedia({reducedMotion:'reduce'});
 await a.getByRole('checkbox',{name:'Enviar como urgente'}).check();await send(a,'Conferir documentação da equipe para a entrega de hoje.');await b.getByRole('complementary',{name:'Chamada urgente'}).waitFor();
 assert.equal(await b.locator('.chat-attention').evaluate(el=>getComputedStyle(el).animationName),'none');
 await b.screenshot({path:output+'/urgent-desktop.png'});await b.getByRole('button',{name:'Dispensar chamada urgente'}).click();
 for(const width of [1440,1024,390,320]){
  await b.setViewportSize({width,height:width<500?844:960});
  await b.screenshot({path:output+`/chat-${width}.png`});assert(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow '+width);
 }
 await b.setViewportSize({width:1440,height:960});await b.getByLabel('Pesquisar nesta conversa').fill('DOCUMENTACAO');await b.locator('.chat-bubble').getByText('Conferir documentação da equipe para a entrega de hoje.',{exact:true}).waitFor();
});
await test('conversation filters, recent-message navigation and keyboard reply',async(s,open)=>{
 const channel=s.tables.doodoo_canais.find(c=>c.nome==='Equipe UI');
 for(let i=0;i<45;i++)s.tables.doodoo_mensagens.push({id:'history-'+i,canal_id:channel.id,sender_id:s.b.user_id,sender_nome:s.b.nome,texto:'Atualização de acompanhamento '+i,tipo:'text',metadata:{},created_at:new Date(Date.now()-(45-i)*60000).toISOString()});
 const a=await open();await chat(a);
 await a.locator('.chat-message-list').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});
 await a.getByRole('button',{name:'Mensagens recentes',exact:true}).click();
 assert(await a.locator('.chat-message-list').evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight<100),'jump did not reach latest messages');
 const reply=a.getByRole('button',{name:'Responder',exact:true}).last();await reply.focus();await a.keyboard.press('Enter');
 await a.getByLabel('Mensagem',{exact:true}).fill('Respondendo ao acompanhamento');await a.getByRole('button',{name:'Enviar',exact:true}).click();
 await poll(()=>s.tables.doodoo_mensagens.some(m=>m.texto==='Respondendo ao acompanhamento'&&m.metadata.replyTo),'reply context missing');
 await a.getByRole('button',{name:'Não lidas',exact:true}).click();await a.getByText('Nenhuma conversa neste filtro.').waitFor();
 await a.getByRole('button',{name:'Grupos',exact:true}).click();await a.locator('[data-chat-row]').filter({hasText:'Equipe UI'}).waitFor();
});
await browser.close();fs.writeFileSync(output+'/results.json',JSON.stringify(results,null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
