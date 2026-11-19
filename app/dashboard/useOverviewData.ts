'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {serverNowMs} from '../lib/serverClock';
import {supabase} from '../lib/supabase';
export interface OverviewProfile {user_id:string;nome:string;cargo:string;setor:string;}
export interface OverviewTask {id:string;titulo:string;status:string;prioridade:string;responsavel:string;atribuido_por:string;usuario_id?:string;data_limite:string;hora_limite:string;created_at:string;}
export interface OverviewNote {id:string;titulo:string;conteudo:string;updated_at:string;}
export interface OverviewEvent {id:string;titulo:string;data:string;hora_inicio:string;hora_fim:string;local?:string;visibilidade:string;setor:string;organizador_id:string;aceitos_por?:string[];}
interface Snapshot {profile:OverviewProfile|null;allowed:string[];tasks:OverviewTask[];notes:OverviewNote[];events:OverviewEvent[];errors:string[];loadedAt:number;}
const empty:Snapshot={profile:null,allowed:[],tasks:[],notes:[],events:[],errors:[],loadedAt:0};
export function useOverviewData(){
 const [data,setData]=useState<Snapshot>(empty),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false);
 const refreshRef=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let alive=true,running=false,queued=false,debounce:ReturnType<typeof setTimeout>;
  const load=async()=>{
   if(running){queued=true;return;}running=true;if(alive)setRefreshing(true);
   try{
    const {data:{session},error:authError}=await supabase.auth.getSession();if(authError||!session)throw Error('session');
    const [{data:profile,error:profileError},{data:permissions,error:permissionError}]=await Promise.all([
     supabase.from('doodoo_perfis').select('user_id,nome,cargo,setor').eq('user_id',session.user.id).single(),
     supabase.from('doodoo_permissoes').select('*')
    ]);
    if(profileError||permissionError||!profile)throw Error('access');
    const allowed=Array.from(new Set((permissions||[]).filter(p=>p.cargos_permitidos?.includes(profile.cargo)||p.usuarios_permitidos?.includes(profile.user_id)).map(p=>p.aba_key.replace('tarefas_todas','tarefas').replace('tarefas_minha','tarefas')))) as string[];
    const next:Snapshot={...empty,profile,allowed,errors:[],loadedAt:serverNowMs()};
    await Promise.all([
     (async()=>{if(!allowed.includes('tarefas'))return;const {data:rows,error}=await supabase.from('doodoo_tarefas').select('id,titulo,status,prioridade,responsavel,atribuido_por,usuario_id,data_limite,hora_limite,created_at').eq('setor',profile.setor);if(error){next.errors.push('tarefas');return;}next.tasks=(rows||[]).filter(t=>t.responsavel===profile.nome||(t.usuario_id?t.usuario_id===profile.user_id:t.atribuido_por===profile.nome));})(),
     (async()=>{if(!allowed.includes('anotacoes'))return;const {data:rows,error}=await supabase.from('doodoo_notas').select('id,titulo,conteudo,updated_at').eq('usuario_id',profile.user_id).order('updated_at',{ascending:false}).limit(3);if(error){next.errors.push('anotações');return;}next.notes=rows||[];})(),
     (async()=>{if(!allowed.includes('agenda'))return;const {data:rows,error}=await supabase.from('doodoo_agenda').select('id,titulo,data,hora_inicio,hora_fim,local,visibilidade,setor,organizador_id,aceitos_por').order('data',{ascending:true});if(error){next.errors.push('agenda');return;}next.events=(rows||[]).filter(e=>e.organizador_id===profile.user_id||e.visibilidade==='geral'||e.visibilidade==='setor'&&e.setor===profile.setor||e.aceitos_por?.includes(profile.nome));})()
    ]);
    if(alive)setData(next);
   }catch{if(alive)setData({...empty,errors:['acesso aos indicadores']});}finally{running=false;if(alive){setLoading(false);setRefreshing(false);if(queued){queued=false;void load();}}}
  };
  const schedule=()=>{clearTimeout(debounce);debounce=setTimeout(()=>void load(),250);};
  refreshRef.current=()=>void load();void load();
  const channel=supabase.channel('overview').on('postgres_changes',{event:'*',schema:'public',table:'doodoo_tarefas'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'doodoo_notas'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'doodoo_agenda'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'doodoo_permissoes'},schedule).subscribe();
  const visible=()=>{if(document.visibilityState==='visible')schedule();};document.addEventListener('visibilitychange',visible);window.addEventListener('online',schedule);window.addEventListener('focus',schedule);
  return()=>{alive=false;clearTimeout(debounce);refreshRef.current=()=>{};void supabase.removeChannel(channel);document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',schedule);window.removeEventListener('focus',schedule);};
 },[]);
 const refresh=useCallback(()=>refreshRef.current(),[]);
 return {data,loading,refreshing,refresh};
}
