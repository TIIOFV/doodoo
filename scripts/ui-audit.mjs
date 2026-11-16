import fs from 'node:fs';
import path from 'node:path';
import playwrightPath from './playwright-path.mjs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(path.join(playwrightPath, 'index.mjs')).href);
const phase = process.argv[2] || 'after';
const output = path.resolve('docs/ui-audit', phase);
if(import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) fs.mkdirSync(output, { recursive: true });
const profile = { id: 'profile-test', user_id: '11111111-1111-4111-8111-111111111111', nome: 'Pessoa de Teste', email: 'teste@example.invalid', cargo: 'administrador', setor: 'Teste', status: 'ativo', status_presenca: 'online' };
const peer = { ...profile, id: 'peer', user_id: '22222222-2222-4222-8222-222222222222', nome: 'Colega de Teste' };
const today = new Date().toISOString().slice(0,10);
const tables = {
 doodoo_perfis: [profile,peer],
 doodoo_permissoes: ['visao_geral','tarefas','chat','agenda','anotacoes','configuracoes'].map(aba_key=>({aba_key,cargos_permitidos:['administrador'],usuarios_permitidos:[]})),
 doodoo_tarefas: [{id:'task-test',titulo:'Revisar documento de teste',descricao:'Dados locais simulados',setor:'Teste',responsavel:profile.nome,atribuido_por:profile.nome,status:'pendente',prioridade:'Normal',meu_dia:true,data_limite:today.split('-').reverse().join('/'),hora_limite:'17:00',created_at:new Date().toISOString(),etapas:[],chat:[]}],
 doodoo_tarefas_categorias: [{id:'cat',nome:'Geral',cor:'#0071e3'}],
 doodoo_notas: [{id:'note-test',usuario_id:profile.user_id,titulo:'Nota de teste',conteudo:'Conteúdo simulado para validação local.',cor:'Geral',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}],
 doodoo_canais: [{id:'channel-test',nome:'Geral',is_group:true,setor:'Todos',membros:[profile,peer].map(p=>({user_id:p.user_id,name:p.nome,role:p.cargo,isAdmin:true})),created_at:new Date().toISOString()}],
 doodoo_mensagens: [], doodoo_agenda: [{id:'event-test',titulo:'Reunião de teste',descricao:'Pauta simulada',data:today,hora_inicio:'10:00',hora_fim:'11:00',visibilidade:'geral',organizador_nome:profile.nome,organizador_id:profile.user_id,aceitos_por:[profile.nome],participantes:[],local:'Sala de teste',setor:'Teste'}],
};
tables.doodoo_canais.push({ ...tables.doodoo_canais[0], id: 'channel-ui', nome: 'Equipe UI', membros: [tables.doodoo_canais[0].membros[0]] });

async function mock(context, authenticated=true, missingProfile=false) {
 await context.routeWebSocket('**/*', socket => socket.close());
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='localhost'||url.hostname==='127.0.0.1') return route.continue();
  if(!url.hostname.endsWith('.supabase.co')) return route.abort();
  let data=[];
  if(url.pathname.startsWith('/auth/v1/')) data={user:profile,...profile,id:profile.user_id};
  else if(url.pathname.startsWith('/rest/v1/')) {
   const table=url.pathname.split('/').at(-1); data=structuredClone(tables[table]||[]);
   if(table==='doodoo_perfis' && url.searchParams.has('user_id')) data=missingProfile?[]:[profile];
   if(route.request().method!=='GET') {
    let body;try{body=route.request().postDataJSON();}catch{}
    if(route.request().method==='POST') { const rows=Array.isArray(body)?body:[body]; data=rows.filter(Boolean).map(r=>({id:'created-test',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...r})); }
   }
   if((route.request().headers().accept||'').includes('object+json')) data=data[0]||null;
  }
  return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','content-range':`0-${Math.max(0,data?.length-1||0)}/${data?.length||0}`},body:JSON.stringify(data)});
 });
 await context.routeWebSocket('**/*',ws=>ws.close());
 if(authenticated) {
  const env=fs.readFileSync('.env.local','utf8'); const raw=env.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
  const key=`sb-${new URL(raw).hostname.split('.')[0]}-auth-token`;
  const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:profile.user_id,exp:Math.floor(Date.now()/1000)+86400,role:'authenticated'})}.test-signature`;
  await context.addInitScript(({key,token,user})=>localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'local-mock-only',expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,token_type:'bearer',user})),{key,token,user:{...profile,id:profile.user_id}});
 }
}
const routes=['/','/dashboard','/dashboard/tarefas','/dashboard/conversas','/dashboard/agenda','/dashboard/notas','/dashboard/configuracoes'];
export { mock, tables, profile };
if(import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) (async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const results=[];
 for(const viewport of [{width:1440,height:900},{width:320,height:568}]) {
  for(const route of routes) {
   const context=await browser.newContext({viewport});await mock(context,route!=='/');const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://localhost:3100${route}`);await page.waitForFunction(() => document.body.innerText.length > 150 && !document.body.innerText.includes('Preparando Ambiente'), {timeout:20000}).catch(()=>{});await page.waitForTimeout(800);
   const name=route==='/'?'login':route.split('/').at(-1);
   await page.screenshot({path:path.join(output,`${name}-${viewport.width}.png`),fullPage:true});
   const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,bodyWidth:document.documentElement.scrollWidth,text:document.body.innerText.slice(0,350)}));
   results.push({route,viewport,...metrics,errors});console.log(route,viewport.width,JSON.stringify(metrics));
   await context.close();
  }
 }
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
