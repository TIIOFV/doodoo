'use client';

import { useRouter } from 'next/navigation';
import { notify } from './domain';
import { supabase } from './supabase';

export function useSignOut() {
  const router = useRouter();
  return async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user?.id) {
        await supabase
          .from('doodoo_perfis')
          .update({ status_presenca: 'offline', last_seen: new Date().toISOString() })
          .eq('user_id', data.user.id);
      }
    } catch {
      /* Never block sign-out if presence update fails. */
    }
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      notify('Não foi possível sair', 'Tente novamente. Sua sessão ainda está ativa.');
      return;
    }
    router.replace('/');
  };
}
