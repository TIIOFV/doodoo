'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {RealtimeChannel} from '@supabase/supabase-js';
import {supabase} from '../../lib/supabase';

interface TypingChannel {id:string;members:{user_id:string;name:string}[];}
type Connection='connecting'|'ready'|'error';
const PAUSE_MS=1800,LEASE_MS=5000;
export function useChatTyping(userId:string|undefined,channels:TypingChannel[],activeId:string|null){
 const [signals,setSignals]=useState<Record<string,Record<string,number>>>({});
 const [connections,setConnections]=useState<Record<string,Connection>>({});
 const [revision,setRevision]=useState(0);
 const sockets=useRef(new Map<string,RealtimeChannel>());
 const activity=useRef({id:null as string|null,at:0,lastSent:0,sent:false});
 const enabled=useRef(true);
 // Only authorization changes rebuild sockets, not names or message previews.
 const signature=JSON.stringify(channels.filter(c=>!c.id.startsWith('temp_')&&c.members.some(m=>m.user_id===userId)).map(c=>({id:c.id,ids:c.members.map(m=>m.user_id).sort()})).sort((a,b)=>a.id.localeCompare(b.id)));
 const send=useCallback((id:string,typing:boolean)=>{
  const channel=sockets.current.get(id);
  if(!userId||channel?.state!=='joined')return false;
  void channel.send({type:'broadcast',event:'typing',payload:{userId,typing}}).then(result=>{if(result!=='ok'&&sockets.current.get(id)===channel)setConnections(prev=>({...prev,[id]:'error'}));});
  return true;
 },[userId]);
 const stop=useCallback(()=>{const item=activity.current;if(item.id&&item.sent)send(item.id,false);activity.current={id:null,at:0,lastSent:0,sent:false};},[send]);
 useEffect(()=>{
  const read=()=>{try{enabled.current=localStorage.getItem('doodoo:typing:'+userId)!=='off';}catch{}if(!enabled.current)stop();};
  const storage=(e:StorageEvent)=>{if(e.key==='doodoo:typing:'+userId)read();};read();window.addEventListener('doodoo:typing_preference',read);window.addEventListener('storage',storage);
  return()=>{window.removeEventListener('doodoo:typing_preference',read);window.removeEventListener('storage',storage);};
 },[userId,stop]);
 useEffect(()=>{
  if(!userId)return;
  let mounted=true;const ownedSockets=sockets.current;
  const list=JSON.parse(signature) as {id:string;ids:string[]}[];
  const connect=async()=>{
   try{await supabase.realtime.setAuth();}catch{if(mounted)setConnections(Object.fromEntries(list.map(c=>[c.id,'error'])));return;}
   if(!mounted)return;
   setSignals({});setConnections({});
   for(const item of list){
    setConnections(prev=>({...prev,[item.id]:'connecting'}));
    const channel=supabase.channel('doodoo:typing:'+item.id,{config:{private:true,broadcast:{self:false,ack:true}}})
     .on('broadcast',{event:'typing'},message=>{
      const value=message.payload;
      if(!mounted||typeof value?.userId!=='string'||typeof value?.typing!=='boolean'||value.userId===userId||!item.ids.includes(value.userId))return;
      setSignals(prev=>{const entries={...prev[item.id]};if(value.typing)entries[value.userId]=Date.now()+LEASE_MS;else delete entries[value.userId];return {...prev,[item.id]:entries};});
     }).subscribe(status=>{
      if(!mounted)return;
      setConnections(prev=>({...prev,[item.id]:status==='SUBSCRIBED'?'ready':status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'?'error':'connecting'}));
      if(status!=='SUBSCRIBED')setSignals(prev=>({...prev,[item.id]:{}}));
      else {const current=activity.current;if(current.id===item.id&&Date.now()-current.at<PAUSE_MS){current.lastSent=Date.now();current.sent=send(item.id,true);}}
     });
    sockets.current.set(item.id,channel);
   }
  };
  void connect();
  return()=>{mounted=false;stop();for(const channel of ownedSockets.values())void supabase.removeChannel(channel);ownedSockets.clear();};
 },[signature,userId,revision,send,stop]);
 useEffect(()=>{stop();},[activeId,stop]);
 useEffect(()=>{
  const tick=window.setInterval(()=>{
   const now=Date.now(),item=activity.current;
   if(item.id){if(!enabled.current||document.visibilityState!=='visible'||now-item.at>=PAUSE_MS)stop();else if(now-item.lastSent>=1000&&send(item.id,true)){item.lastSent=now;item.sent=true;}}
   setSignals(prev=>{let changed=false;const next:typeof prev={};for(const [id,entries]of Object.entries(prev)){next[id]={};for(const [person,until]of Object.entries(entries)){if(until>now)next[id][person]=until;else changed=true;}}return changed?next:prev;});
  },250);
  const hidden=()=>{if(document.visibilityState!=='visible')stop();};window.addEventListener('blur',stop);window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',hidden);
  return()=>{clearInterval(tick);stop();window.removeEventListener('blur',stop);window.removeEventListener('pagehide',stop);document.removeEventListener('visibilitychange',hidden);};
 },[send,stop]);
 const input=(value:string)=>{
  if(!activeId||!value.trim()||!enabled.current||document.visibilityState!=='visible'){stop();return;}
  const item=activity.current;item.id=activeId;item.at=Date.now();
  if(!item.sent||Date.now()-item.lastSent>=1000){item.sent=send(activeId,true);if(item.sent)item.lastSent=Date.now();}
 };
 const label=(channelId:string)=>{const ids=Object.keys(signals[channelId]||{});const names=channels.find(c=>c.id===channelId)?.members.filter(m=>ids.includes(m.user_id)).map(m=>m.name.split(' ')[0])||[];return names.length===0?'':names.length===1?names[0]+' está digitando…':names.slice(0,2).join(' e ')+(names.length>2?' e outras pessoas estão digitando…':' estão digitando…');};
 return {label,input,stop,unavailable:!!activeId&&connections[activeId]==='error',retry:()=>setRevision(n=>n+1)};
}
