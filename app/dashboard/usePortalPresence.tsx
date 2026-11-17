'use client';
import {createContext,useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';
import {PRESENCE_HEARTBEAT_MS,PRESENCE_IDLE_MS,PRESENCE_TTL_MS,validPresence,type UserStatusType} from '../lib/chatPresence';

interface Profile {user_id:string;status_presenca?:UserStatusType;}
interface PresenceValue {status:UserStatusType;preference:UserStatusType;sync:'saving'|'saved'|'error';choose:(status:UserStatusType)=>void;retry:()=>void;}
export const PortalPresenceContext=createContext<PresenceValue>({status:'offline',preference:'online',sync:'saving',choose:()=>{},retry:()=>{}});
/** One writer per mounted portal; moving between pages never resets a manual status. */
export function usePortalPresence(profile:Profile|null,enabled:boolean):PresenceValue {
 const [status,setStatus]=useState<UserStatusType>('offline'),[preference,setPreference]=useState<UserStatusType>('online'),[sync,setSync]=useState<PresenceValue['sync']>('saving');
 const controller=useRef<{choose:(v:UserStatusType)=>void;retry:()=>void}|null>(null);
 const userId=enabled?profile?.user_id:undefined;
 const initialStatus=useRef(profile?.status_presenca);
 useEffect(()=>{initialStatus.current=profile?.status_presenca;},[profile?.status_presenca]);
 useEffect(()=>{
  if(!userId)return;
  let active=true,writing=false,pending=false,departing=false,hiddenTimer:ReturnType<typeof setTimeout>|undefined,writeAbort:AbortController|null=null,lastWrite=0,lastStatus:UserStatusType|undefined,lastActivity=Date.now();
  const key='doodoo:presence:'+userId,prefix=key+':tab:',tabKey=prefix+crypto.randomUUID();
  let manual:UserStatusType=initialStatus.current||'online';
  try{const saved=localStorage.getItem(key);if(validPresence(saved))manual=saved;}catch{}
  setPreference(manual);
  const effective=():UserStatusType=>{
   if(manual!=='online')return manual;
   let recent=document.visibilityState==='visible'&&Date.now()-lastActivity<PRESENCE_IDLE_MS;
   try{for(let i=0;i<localStorage.length;i++){const name=localStorage.key(i);if(!name?.startsWith(prefix)||name===tabKey)continue;const tab=JSON.parse(localStorage.getItem(name)||'null');if(tab?.visible&&Date.now()-tab.updatedAt<PRESENCE_TTL_MS&&Date.now()-tab.lastActivity<PRESENCE_IDLE_MS)recent=true;}}catch{}
   return recent?'online':'ausente';
  };
  const lease=()=>{try{localStorage.setItem(tabKey,JSON.stringify({visible:document.visibilityState==='visible',updatedAt:Date.now(),lastActivity}));}catch{}};
  const publish=async(force=false)=>{
   if(!active||departing)return;
   const next=effective();setStatus(next);
   if(writing){pending=true;return;}
   if(!force&&next===lastStatus&&Date.now()-lastWrite<PRESENCE_HEARTBEAT_MS)return;
   writing=true;writeAbort=new AbortController();setSync('saving');
   try{
    const {data,error}=await supabase.from('doodoo_perfis').update({status_presenca:next,last_seen:new Date().toISOString()}).eq('user_id',userId).select('user_id').abortSignal(writeAbort.signal).maybeSingle();
    if(error||!data)throw error||new Error('Presence update not confirmed');
    if(active){lastWrite=Date.now();lastStatus=next;setSync('saved');}
   }catch{if(active&&!departing)setSync('error');}finally{writing=false;if(pending&&active&&!departing){pending=false;void publish();}}
  };
  controller.current={choose:value=>{manual=value;setPreference(value);try{localStorage.setItem(key,value);}catch{}lease();void publish(true);},retry:()=>{lease();void publish(true);}};
  const activity=()=>{const now=Date.now(),wasIdle=now-lastActivity>=PRESENCE_IDLE_MS;lastActivity=now;if(wasIdle||now-lastWrite>10_000){lease();void publish();}};
  const visibility=()=>{
   clearTimeout(hiddenTimer);
   if(document.visibilityState==='visible'){departing=false;lastActivity=Date.now();lease();void publish(true);}
   else {lease();hiddenTimer=setTimeout(()=>{if(!departing)void publish(true);},100);}
  };
  const storage=(e:StorageEvent)=>{if(e.key===key&&validPresence(e.newValue)){manual=e.newValue;setPreference(manual);void publish(true);}else if(e.key?.startsWith(prefix))void publish();};
  const unload=()=>{departing=true;clearTimeout(hiddenTimer);writeAbort?.abort();try{localStorage.removeItem(tabKey);}catch{}};
  lease();void publish(true);
  const heartbeat=window.setInterval(()=>{if(document.visibilityState==='visible'){lease();void publish(true);}},PRESENCE_HEARTBEAT_MS);
  const idle=window.setInterval(()=>{if(document.visibilityState==='visible')void publish();},5000);
  const events=['pointerdown','pointermove','keydown','touchstart'];for(const event of events)window.addEventListener(event,activity,{passive:true});
  document.addEventListener('visibilitychange',visibility);window.addEventListener('online',visibility);window.addEventListener('focus',visibility);window.addEventListener('pageshow',visibility);window.addEventListener('pagehide',unload);window.addEventListener('storage',storage);
  return()=>{active=false;controller.current=null;unload();clearInterval(heartbeat);clearInterval(idle);for(const event of events)window.removeEventListener(event,activity);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',visibility);window.removeEventListener('focus',visibility);window.removeEventListener('pageshow',visibility);window.removeEventListener('pagehide',unload);window.removeEventListener('storage',storage);};
 },[userId]);
 const choose=useCallback((v:UserStatusType)=>controller.current?.choose(v),[]),retry=useCallback(()=>controller.current?.retry(),[]);
 return {status,preference,sync,choose,retry};
}
