'use client';import { useRef,useState } from 'react';
import { messageOf,notify } from '../lib/domain';

/** Serialize each record's writes and keep failures visible to the user. */
export function useRecordActions() {
  const locks = useRef(new Set<string>());
  const [pending, setPending] = useState(0);
  const run = async <T,>(key: string, action: () => Promise<T>): Promise<T | undefined> => {
    if (locks.current.has(key)) return undefined;
    locks.current.add(key); setPending(count => count + 1);
    try { return await action(); }
    catch (error) { notify('Não foi possível salvar', messageOf(error)); return undefined; }
    finally { locks.current.delete(key); setPending(count => count - 1); }
  };
  return { run, pending };
}
