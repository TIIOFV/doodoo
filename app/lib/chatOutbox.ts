import {notify} from './domain';
import type {MessageRow} from './models';
const key=(userId:string)=>'doodoo:outbox:'+userId;
export function pendingOutgoing(userId:string):MessageRow[]{
  try{
    const rows:unknown=JSON.parse(localStorage.getItem(key(userId))||'[]');
    if(!Array.isArray(rows))return [];
    return rows.filter((row):row is MessageRow=>Boolean(row&&typeof row==='object'&&row.sender_id===userId&&typeof row.id==='string'&&typeof row.canal_id==='string'&&typeof row.texto==='string'&&['text','image','file','event'].includes(row.tipo)&&row.metadata&&typeof row.metadata==='object')).slice(0,50);
  }catch{return [];}
}
export function retainOutgoing(userId:string,row:MessageRow){
  try{
    const rows=pendingOutgoing(userId).filter(r=>r.id!==row.id);
    if(rows.length>=50)throw new Error('Outbox full');
    localStorage.setItem(key(userId),JSON.stringify([...rows,row]));
    return true;
  }catch{notify('Recuperação local indisponível','Mantenha o chat aberto até confirmar o envio. Não foi possível guardar esta mensagem no dispositivo.');return false;}
}
export function confirmOutgoing(userId:string,id:string|string[]){
  const ids=new Set(Array.isArray(id)?id:[id]);
  try{localStorage.setItem(key(userId),JSON.stringify(pendingOutgoing(userId).filter(r=>!ids.has(r.id))));}
  catch{ /* A later retry uses the same ID and reconciles with the confirmed row. */ }
}
