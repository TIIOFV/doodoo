'use client';import { useRouter } from 'next/navigation';
import { notify } from './domain';
import { supabase } from './supabase';

export function useSignOut() {
 const router=useRouter();
 return async()=>{
  const {error}=await supabase.auth.signOut({scope:'local'});
  if(error){notify('Não foi possível sair','Tente novamente. Sua sessão ainda está ativa.');return;}
  router.replace('/');
 };
}
