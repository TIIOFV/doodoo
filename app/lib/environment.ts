/** These switches enable reviewed contracts only on an explicitly isolated target. */
export const environment = process.env.NEXT_PUBLIC_DOO_ENVIRONMENT || 'shared';
export const atomicWrites = environment !== 'shared' && process.env.NEXT_PUBLIC_DOO_ATOMIC_WRITES === 'true';

export function assertIsolatedConfiguration(url: string) {
  const host = new URL(url).hostname;
  if (environment === 'shared') {
    if (process.env.NEXT_PUBLIC_DOO_ATOMIC_WRITES === 'true') throw new Error('Operações novas exigem homologação independente.');
    return;
  }
  if (environment === 'mock' && host === 'doodoo-test.invalid') return;
  const expected = process.env.NEXT_PUBLIC_DOO_HOMOLOGATION_PROJECT_REF;
  const shared = process.env.NEXT_PUBLIC_DOO_SHARED_PROJECT_REF;
  if (environment !== 'homologation' || !expected || !shared || expected === shared || host !== `${expected}.supabase.co`) {
    throw new Error('Destino de homologação não confirmado. Configuração bloqueada.');
  }
}
