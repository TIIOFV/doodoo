export function notify(title: string, desc: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } }));
}
export function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Não foi possível concluir a operação. Tente novamente.';
}
export function requireResult<T>(response: { data: T | null; error: { message: string } | null }, requireRow = false): NonNullable<T> {
  if (response.error) throw new Error(response.error.message);
  if (response.data === null || (requireRow && Array.isArray(response.data) && !response.data.length)) throw new Error('Nenhum registro foi alterado. Verifique o acesso ou atualize a página.');
  return response.data as NonNullable<T>;
}
export function localISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function taskDeadline(date: string, time = '23:59'): Date | null {
  const [day, month, year] = date.split('/').map(Number);
  const [hour, minute] = (time || '23:59').split(':').map(Number);
  if (![day, month, year, hour, minute].every(Number.isFinite) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const value = new Date(year, month - 1, day, hour, minute);
  return value.getDate() === day && value.getMonth() === month - 1 ? value : null;
}
export function isTaskOverdue(date: string, time: string, status: string, now = new Date()): boolean {
  const deadline = taskDeadline(date, time);
  return status !== 'concluida' && deadline !== null && now.getTime() > deadline.getTime();
}
export function searchKey(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim(); }
/** Stable occurrence IDs use the existing primary key; no schema change is required. */
export async function occurrenceId(sourceId: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('doodoo:weekly:' + sourceId))).slice(0,16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(b => b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
