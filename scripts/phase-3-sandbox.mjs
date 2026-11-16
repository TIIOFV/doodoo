import { randomUUID } from 'node:crypto';
import { tables as original, profile as originalProfile } from './ui-audit.mjs';

const roles = ['administrador','gestor','coordenador','supervisor','analista','colaborador'];
export function createSandbox({origin='http://127.0.0.1:3300'}={}) {
 if(!['http://127.0.0.1:3300','http://127.0.0.1:3301'].includes(origin))throw Error('Only isolated local origins allowed');
 const a={...originalProfile,nome:'Ana Teste',email:'ana@example.invalid',read_receipts:true,setor:'TI'};
 const b={...a,id:'profile-b',user_id:'22222222-2222-4222-8222-222222222222',nome:'Bruno Teste',email:'bruno@example.invalid',cargo:'colaborador'};
 const c={...b,id:'profile-c',user_id:'33333333-3333-4333-8333-333333333333',nome:'Carla Teste',email:'carla@example.invalid',setor:'RH'};
 const tables=structuredClone(original);tables.doodoo_perfis=[a,b,c];
 tables.doodoo_permissoes=original.doodoo_permissoes.map(p=>({...p,cargos_permitidos:roles}));
 tables.doodoo_tarefas=tables.doodoo_tarefas.map(t=>({...t,setor:'TI',responsavel:a.nome,atribuido_por:a.nome,usuario_id:a.user_id,updated_at:new Date().toISOString()}));
 tables.doodoo_notas=tables.doodoo_notas.map(n=>({...n,usuario_id:a.user_id}));
 tables.doodoo_canais=tables.doodoo_canais.map(ch=>({...ch,setor:'TI',membros:[a,b].map(p=>({user_id:p.user_id,name:p.nome,role:p.cargo,isAdmin:p===a}))}));
 tables.doodoo_agenda=tables.doodoo_agenda.map(e=>({...e,setor:'TI',organizador_id:a.user_id,organizador_nome:a.nome,aceitos_por:[a.nome]}));
 tables.doodoo_logs=[];tables.doodoo_chat_notas=[];
 const state={tables,users:[a,b,c],requests:[],blocked:[],failures:[],sockets:new Set(),auth:[],a,b,c};
 const host='doodoo-test.invalid';const key='sb-doodoo-test-auth-token';
 const token=user=>`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.user_id,exp:Math.floor(Date.now()/1000)+86400,role:'authenticated'})).toString('base64url')}.local-test-only`;
 const session=user=>({access_token:token(user),refresh_token:`fixture-${user.user_id}`,expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,token_type:'bearer',user:{id:user.user_id,email:user.email,app_metadata:{provider:'email'},user_metadata:{}}});
 const actor=request=>{try{const jwt=request.headers().authorization?.split(' ')[1];const id=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url')).sub;return state.users.find(u=>u.user_id===id);}catch{return null}};
 const canRead=(table,row,user)=>{
  if(!user)return false;
  if(table==='doodoo_notas')return row.usuario_id===user.user_id;
  if(table==='doodoo_canais')return row.membros?.some(m=>m.user_id===user.user_id);
  if(['doodoo_mensagens','doodoo_chat_notas'].includes(table))return tables.doodoo_canais.some(ch=>ch.id===row.canal_id&&ch.membros?.some(m=>m.user_id===user.user_id));
  if(table==='doodoo_tarefas')return row.setor===user.setor;
  if(table==='doodoo_agenda')return row.visibilidade==='geral'||row.organizador_id===user.user_id||(row.visibilidade==='setor'&&row.setor===user.setor)||row.aceitos_por?.includes(user.nome);
  if(table==='doodoo_perfis')return user.cargo==='administrador'||row.setor===user.setor;
  return true;
 };
 const same=(value,raw)=>{if(raw==='null')return value==null;try{return JSON.stringify(value)===JSON.stringify(JSON.parse(raw))}catch{return String(value)===raw}};
 const matches=(row,url)=>[...url.searchParams].every(([column,value])=>{
  if(['select','order','limit','offset','on_conflict','or'].includes(column))return true;
  const dot=value.indexOf('.');const op=value.slice(0,dot),query=value.slice(dot+1),field=column.includes('->>')?row[column.split('->>')[0]]?.[column.split('->>')[1]]:row[column];
  if(op==='eq')return same(field,query);if(op==='neq')return !same(field,query);if(op==='is')return query==='null'?field==null:query==='true'?field===true:field===false;
  if(op==='in')return query.slice(1,-1).split(',').some(v=>same(field,v.replaceAll('"','')));
  if(op==='gte')return field>=query;if(op==='lt')return field<query;if(op==='gt')return field>query;
  if(op==='ilike')return String(field).toLowerCase().includes(query.replaceAll('%','').toLowerCase());return true;
 });
 function send(client,message){client.ws.send(JSON.stringify(client.v2?[message.join_ref??null,message.ref??null,message.topic,message.event,message.payload]:message));}
 function broadcast(table,type,record,old){for(const client of state.sockets){if(!client.user||!canRead(table,type==='DELETE'?old:record,client.user))continue;for(const [topic,filters]of client.topics){const ids=filters.filter(f=>f.table===table&&(f.event==='*'||f.event===type)).filter(f=>!f.filter||matches(record,new URL('http://fixture/?'+f.filter.replace('=eq.','=eq.')))).map(f=>f.id);if(ids.length)send(client,{topic,event:'postgres_changes',payload:{ids,data:{schema:'public',table,commit_timestamp:new Date().toISOString(),type,record,old_record:old,columns:[],errors:null}},ref:null});}}}
 state.attach=async(context,user=a)=>{
  await context.addInitScript(({key,session})=>{if(!sessionStorage.getItem('fixture-started')){if(session)localStorage.setItem(key,JSON.stringify(session));else localStorage.removeItem(key);sessionStorage.setItem('fixture-started','yes');}},{key,session:user?session(user):null});
  await context.routeWebSocket('**/*',ws=>{
   if(new URL(ws.url()).hostname!==host){ws.close();return;}
   const client={ws,user,topics:new Map()};state.sockets.add(client);
   ws.onMessage(raw=>{let msg;try{msg=JSON.parse(String(raw));if(Array.isArray(msg)){client.v2=true;const[join_ref,ref,topic,event,payload]=msg;msg={join_ref,ref,topic,event,payload};}}catch{return;}
    if(msg.event==='phx_join'){
     try{const id=JSON.parse(Buffer.from(msg.payload.access_token.split('.')[1],'base64url')).sub;client.user=state.users.find(u=>u.user_id===id)||client.user;}catch{}

     const filters=(msg.payload?.config?.postgres_changes||[]).map((f,i)=>({...f,id:i+1}));client.topics.set(msg.topic,filters);
     send(client,{topic:msg.topic,event:'phx_reply',payload:{status:'ok',response:{postgres_changes:filters}},ref:msg.ref,join_ref:msg.join_ref});
     send(client,{topic:msg.topic,event:'system',payload:{status:'ok',extension:'postgres_changes',message:'fixture'},ref:null});
    } else if(msg.event==='phx_leave'){client.topics.delete(msg.topic);send(client,{...msg,event:'phx_reply',payload:{status:'ok',response:{}}});}
    else if(msg.event==='heartbeat')send(client,{...msg,event:'phx_reply',payload:{status:'ok',response:{}}});
   });ws.onClose(()=>state.sockets.delete(client));
  });
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===origin){if(url.pathname==='/__fixture__/file.txt')return route.fulfill({body:'Fixture file',contentType:'text/plain'});return route.continue();}
   if(url.hostname!==host){state.blocked.push(url.hostname);return route.abort();}
   const method=request.method(),user=actor(request);let body=null;try{body=request.postDataJSON()}catch{}
   const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:status===204?'':JSON.stringify(data)});
   if(url.pathname.startsWith('/auth/v1/')){
    const action=url.pathname.split('/').at(-1);state.auth.push({action});
    if(action==='logout')return reply(null,204);
    if(action==='user')return user?reply(session(user).user):reply({message:'Sessão inválida'},401);
    if(action==='signup'){const created={...b,user_id:randomUUID(),email:body.email,id:randomUUID(),nome:body.data?.nome||'Nova Pessoa'};state.users.push(created);return reply(session(created));}
    if(action==='token'){const target=body?.email?state.users.find(u=>u.email===body.email):state.users.find(u=>`fixture-${u.user_id}`===body?.refresh_token);return target&&(body.password==='Fixture-only-123!'||!body.password)?reply(session(target)):reply({message:'Invalid login credentials',error_code:'invalid_credentials'},400);}
    return reply({});
   }
   if(url.pathname.startsWith('/storage/v1/')){
    state.requests.push({table:'storage',method});const failure=state.failures.findIndex(f=>f.table==='storage'&&(!f.method||f.method===method)&&(!f.path||url.pathname.includes(f.path)));if(failure>=0){const item=state.failures.splice(failure,1)[0];return reply({message:'Storage denied (mock)'},item.status||500);}
    if(url.pathname.includes('/sign/')&&method==='POST')return reply({signedURL:url.pathname.slice('/storage/v1'.length)+'?token=fixture-'+(++state.signCount)});
    if(method==='GET'&&/\.png$/.test(url.pathname))return route.fulfill({body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6R1sAAAAASUVORK5CYII=','base64'),contentType:'image/png'});
    if(method==='GET')return route.fulfill({body:'Disposable attachment fixture',contentType:'text/plain',headers:{'content-disposition':'attachment; filename="fixture.txt"','access-control-allow-origin':'*'}});
    state.objects??=[];if(method==='POST')state.objects.push(url.pathname);return reply({Key:'fixture/file.txt'});
   }
   if(url.pathname.startsWith('/rest/v1/rpc/'))return state.rpc(url.pathname.split('/').at(-1),body,user,reply);
   const table=url.pathname.split('/').at(-1);state.requests.push({table,method});
   const failure=state.failures.findIndex(f=>f.table===table&&(!f.method||f.method===method));
   if(failure>=0){const item=state.failures.splice(failure,1)[0];if(item.delay)await new Promise(resolve=>setTimeout(resolve,item.delay));if(item.status)return reply({message:'Falha simulada de persistência',code:'FIXTURE'},item.status);if(item.empty)return reply([]);}
   if(!user)return reply({message:'JWT necessário'},401);
   if(!tables[table])return reply({message:'Unknown fixture table'},400);
   let rows=(tables[table]||[]).filter(row=>canRead(table,row,user)&&matches(row,url));
   if(method==='POST'){
    const incoming=(Array.isArray(body)?body:[body]).filter(Boolean);const created=[];
    for(const row of incoming){if(tables[table]?.some(r=>r.id===row.id&&row.id))return reply({message:'Duplicate key',code:'23505'},409);const value={id:randomUUID(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...row};(tables[table]??=[]).push(value);created.push(value);broadcast(table,'INSERT',value,{});}rows=created;
   }else if(method==='PATCH'){
    if(table==='doodoo_perfis'&&user.cargo!=='administrador'&&rows.some(r=>r.user_id!==user.user_id))return reply({message:'Permissão negada'},403);
    for(const row of rows){const old=structuredClone(row);Object.assign(row,body);broadcast(table,'UPDATE',row,old);}
   }else if(method==='DELETE'){
    tables[table]=(tables[table]||[]).filter(row=>!rows.includes(row));for(const row of rows)broadcast(table,'DELETE',{},row);
   }
   if(method==='DELETE'&&table==='doodoo_canais')for(const channel of rows){tables.doodoo_mensagens=tables.doodoo_mensagens.filter(m=>m.canal_id!==channel.id);tables.doodoo_chat_notas=tables.doodoo_chat_notas.filter(n=>n.canal_id!==channel.id);}
   if(method==='POST'&&state.lostAck===table){state.lostAck=null;return reply({message:'Response lost after commit (mock)'},502);}
   const order=url.searchParams.get('order');if(order){const [field,dir]=order.split('.');rows.sort((a,b)=>String(a[field]??'').localeCompare(String(b[field]??''))*(dir==='desc'?-1:1));}
   const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||rows.length);rows=rows.slice(offset,offset+limit);
   if(request.headers().accept?.includes('object+json'))return rows.length===1?reply(rows[0]):reply({code:'PGRST116',message:'Nenhum registro confirmado'},406);
   return reply(rows);
  });
 };
 state.signCount=0;
 state.rpc=async(name,args,user,reply)=>{
  state.requests.push({table:name,method:'POST',mockRpc:true});
  const failure=state.failures.findIndex(f=>f.table===name);if(failure>=0){state.failures.splice(failure,1);return reply({message:'RPC unavailable (mock)'},500);}
  if(!user||!tables.doodoo_perfis.some(p=>p.user_id===user.user_id&&p.status==='ativo'))return reply({message:'Denied'},403);
  const tab=name==='doodoo_accept_event'?'agenda':'tarefas';const access=tables.doodoo_permissoes.some(p=>p.aba_key===tab&&(p.cargos_permitidos.includes(user.cargo)||p.usuarios_permitidos.includes(user.user_id)));if(!access)return reply({message:'Denied tab'},403);
  if(name==='doodoo_accept_event'){
   const row=tables.doodoo_agenda.find(e=>e.id===args.p_event_id);if(!row||!canRead('doodoo_agenda',row,user))return reply({message:'Denied event'},403);
   row.aceitos_por=[...new Set([...(row.aceitos_por||[]),user.nome])];row.updated_at=new Date().toISOString();broadcast('doodoo_agenda','UPDATE',row,{});return reply(row);
  }
  const live=tables.doodoo_tarefas.find(t=>t.id===args.p_task_id);if(!live||!canRead('doodoo_tarefas',live,user))return reply({message:'Denied task'},403);
  const task=structuredClone(live);
  if(name==='doodoo_update_task_comment'){
   const comment=task.chat?.find(c=>String(c.id)===args.p_comment_id);if(!comment||comment.authorId!==user.user_id)return reply({message:'Verified authorship required'},403);
   if(comment.text!==args.p_expected_text)return reply({message:'Comment changed'},409);
   if(args.p_action==='edit'&&args.p_text?.trim())Object.assign(comment,{text:args.p_text.trim(),editedAt:new Date().toISOString()});else if(args.p_action==='delete')task.chat=task.chat.filter(c=>c!==comment);else return reply({message:'Invalid action'},400);
   Object.assign(live,task);broadcast('doodoo_tarefas','UPDATE',live,{});return reply(live);
  }
  if(name==='doodoo_complete_routine'){
   if(!task.rotina)return reply({message:'Not routine'},400);
   if(args.p_final_steps&&JSON.stringify(args.p_expected_steps)!==JSON.stringify(task.etapas||[]))return reply({message:'Checklist changed'},409);
   const existing=tables.doodoo_tarefas.find(t=>t.metadata?.clonedFrom===task.id);if(existing)return reply({task:live,next_task:existing});
   const steps=args.p_final_steps||task.etapas||[];const done=!args.p_final_steps||(steps.length>0&&steps.every(s=>s.done));task.etapas=steps;task.status=done?'concluida':steps.some(s=>s.done)?'andamento':'pendente';
   let next=null;if(done){const [d,m,y]=task.data_limite.split('/').map(Number),date=new Date(y,m-1,d+7);next={...structuredClone(task),id:randomUUID(),status:'pendente',meu_dia:false,chat:[],etapas:steps.map(s=>({...s,done:false})),metadata:{clonedFrom:task.id},data_limite:[String(date.getDate()).padStart(2,'0'),String(date.getMonth()+1).padStart(2,'0'),date.getFullYear()].join('/')};}
   if(state.failAtomicNext&&done){state.failAtomicNext=false;return reply({message:'Insert next failed, transaction rolled back (mock)'},500);}
   Object.assign(live,task);if(next)tables.doodoo_tarefas.push(next);broadcast('doodoo_tarefas','UPDATE',live,{});if(next)broadcast('doodoo_tarefas','INSERT',next,{});return reply({task:live,next_task:next});
  }
  return reply({message:'Unknown mock RPC'},404);
 };
 state.fail=(table,method='PATCH',status=500)=>state.failures.push({table,method,status});
 state.broadcast=broadcast;state.session=session;return state;
}
