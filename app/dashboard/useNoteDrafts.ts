'use client';import { useEffect,useRef,useState } from 'react';
import { notify } from '../lib/domain';
import { supabase } from '../lib/supabase';

export interface NotePatch { titulo?: string; conteudo?: string; cor?: string; }
export function storedNoteDrafts(userId:string):{id:string;patch:NotePatch;version:string|null}[]{
  const saved:unknown=JSON.parse(localStorage.getItem('doodoo:drafts:'+userId)||'[]');
  if(!Array.isArray(saved))return [];
  return saved.flatMap(d=>{
    if(!d||typeof d.id!=='string'||!d.patch||typeof d.patch!=='object'||!(typeof d.version==='string'||d.version===null))return [];
    const patch:NotePatch={};for(const field of ['titulo','conteudo','cor'] as const)if(typeof d.patch[field]==='string')patch[field]=d.patch[field];
    return Object.keys(patch).length?[{id:d.id,patch,version:d.version}]:[];
  });
}
interface Draft { patch: NotePatch; version: string | null; running?: Promise<boolean>; timer?: ReturnType<typeof setTimeout>; error?: boolean; }
/** A queue per note: merge fields, serialize writes and compare the last confirmed version. */
export function useNoteDrafts(userId: string | null) {
  const drafts = useRef(new Map<string, Draft>());
  const [status, setStatus] = useState<'saved'|'saving'|'error'>('saved');
  const alive = useRef(true);
  const key = 'doodoo:drafts:' + userId;
  const store = () => {
    if (!userId) return;
    try { localStorage.setItem(key, JSON.stringify([...drafts.current].filter(([,v]) => Object.keys(v.patch).length).map(([id,v])=>({id,patch:v.patch,version:v.version})))); }
    catch { notify('Rascunho local indisponível', 'Mantenha esta página aberta até concluir o salvamento.'); }
  };
  const flush = async (id: string): Promise<boolean> => {
    const draft = drafts.current.get(id);
    if (!draft || !Object.keys(draft.patch).length) return true;
    clearTimeout(draft.timer);
    if (draft.running) { const ok = await draft.running; return ok ? flush(id) : false; }
    const patch = { ...draft.patch };
    draft.error = false;
    if (alive.current) setStatus('saving');
    const operation = async () => {
      try {
        const update = { ...patch, updated_at: new Date().toISOString() };
        const { data, error } = await supabase.from('doodoo_notas').update(update).eq('id',id).eq('usuario_id',userId).filter('updated_at',draft.version == null ? 'is' : 'eq',draft.version == null ? 'null' : draft.version).select('id,updated_at').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('A versão da nota mudou, foi removida ou o acesso não foi confirmado. Seu rascunho foi preservado; revise antes de salvar.');
        draft.version = data.updated_at;
        for (const field of Object.keys(patch) as (keyof NotePatch)[]) if (draft.patch[field] === patch[field]) delete draft.patch[field];
        store(); return true;
      } catch (error) {
        draft.error = true; store();
        if (alive.current) { setStatus('error'); notify('Anotação não salva', error instanceof Error ? error.message : 'Falha de conexão ou permissão. Seu texto permanece no editor. Tente novamente.'); }
        return false;
      }
    };
    draft.running = operation();
    const ok = await draft.running; draft.running = undefined;
    if (ok && Object.keys(draft.patch).length && alive.current) return flush(id);
    if (ok && alive.current) setStatus([...drafts.current.values()].some(d=>d.error)?'error':[...drafts.current.values()].some(d=>Object.keys(d.patch).length)?'saving':'saved');
    return ok;
  };
  const edit = (id: string, patch: NotePatch, version: string) => {
    const draft = drafts.current.get(id) || { patch:{},version };
    Object.assign(draft.patch,patch);draft.error=false;drafts.current.set(id,draft);store();setStatus('saving');
    clearTimeout(draft.timer);draft.timer=setTimeout(()=>{void flush(id);},600);
  };
  const restore = (id: string, version: string): NotePatch => {
    if (!userId) return {};
    if (!drafts.current.size) {
      try { for(const d of storedNoteDrafts(userId))drafts.current.set(d.id,{patch:d.patch,version:d.version}); } catch { notify('Rascunho inválido','Não foi possível recuperar o rascunho local.'); }
    }
    const draft=drafts.current.get(id);
    if (!draft) { drafts.current.set(id,{patch:{},version});return {}; }
    if(Object.keys(draft.patch).length) { draft.timer=setTimeout(()=>{void flush(id);},600);setStatus('saving'); }
    return draft.patch;
  };
  const resolve = async (id:string) => {
    if(!window.confirm('Mesclar os campos do seu rascunho com a versão atual? Os campos editados por você substituirão esses mesmos campos no servidor.'))return;
    const {data,error}=await supabase.from('doodoo_notas').select('updated_at').eq('id',id).eq('usuario_id',userId).single();
    const draft=drafts.current.get(id);if(error||!data||!draft){notify('Nota indisponível','O rascunho continua preservado. Não foi possível consultar a versão atual.');return;}
    draft.version=data.updated_at;await flush(id);
  };
  const flushAll = async () => (await Promise.all([...drafts.current.keys()].map(flush))).every(Boolean);
  const forget = (id: string) => {if(userId&&!drafts.current.size)for(const d of storedNoteDrafts(userId))drafts.current.set(d.id,{patch:d.patch,version:d.version});const d=drafts.current.get(id);clearTimeout(d?.timer);drafts.current.delete(id);store();};
  useEffect(()=>{alive.current=true;const map=drafts.current;return()=>{alive.current=false;map.forEach(d=>clearTimeout(d.timer));};},[userId]);
  return { edit,restore,flush,flushAll,forget,resolve,status,version:(id:string)=>drafts.current.get(id)?.version };
}
