'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BellRing, ArrowUpRight, X } from 'lucide-react';
import './chat-attention.css';

export interface ChatAttentionNotice { id:string; channelId:string; senderId:string; sender:string; text:string; }

export default function ChatAttention({userId}:{userId:string}) {
  const [queue,setQueue]=useState<ChatAttentionNotice[]>([]);
  const seen=useRef(new Set<string>());
  const last=useRef(new Map<string,number>());
  const router=useRouter(), pathname=usePathname();
  useEffect(()=>{
    const receive=(event:Event)=>{
      const notice=(event as CustomEvent<ChatAttentionNotice>).detail;
      if(!notice?.id||notice.senderId===userId||seen.current.has(notice.id))return;
      seen.current.add(notice.id);
      const key=notice.senderId+':'+notice.channelId, now=Date.now();
      if(now-(last.current.get(key)||0)<60000)return;
      last.current.set(key,now);
      setQueue(prev=>[...prev,notice].slice(-5));
    };
    window.addEventListener('doodoo:chat_attention',receive);
    return()=>window.removeEventListener('doodoo:chat_attention',receive);
  },[userId]);
  const notice=queue[0];
  useEffect(()=>{
    if(!notice)return;
    const previous=document.title;document.title='Urgente · '+notice.sender;
    return()=>{document.title=previous;};
  },[notice]);
  if(!notice)return null;
  const dismiss=()=>setQueue(prev=>prev.slice(1));
  const open=()=>{
    router.push(`/dashboard/conversas?chatId=${encodeURIComponent(notice.channelId)}&messageId=${encodeURIComponent(notice.id)}`);
    if(pathname.startsWith('/dashboard/conversas'))window.dispatchEvent(new CustomEvent('doodoo:switch_chat',{detail:{chatId:notice.channelId,messageId:notice.id}}));
    dismiss();
  };
  return <aside key={notice.id} className="chat-attention" aria-label="Chamada urgente">
    <button type="button" className="chat-attention-dismiss" aria-label="Dispensar chamada urgente" onClick={dismiss}><X size={17}/></button>
    <div role="alert"><span className="chat-attention-kicker"><BellRing size={17}/>Chamando sua atenção</span><h2>{notice.sender} enviou uma urgência</h2><p>{notice.text}</p></div>
    <div className="chat-attention-actions"><button type="button" onClick={open}>Abrir conversa<ArrowUpRight size={16}/></button><span>{queue.length>1?`${queue.length-1} outras chamadas`:'Confirme “Ciente” na mensagem'}</span></div>
  </aside>;
}
