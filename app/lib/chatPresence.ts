export type UserStatusType = 'online' | 'ausente' | 'ocupado' | 'indisponivel' | 'offline';
export const PRESENCE_HEARTBEAT_MS = 25_000;
export const PRESENCE_TTL_MS = 100_000;
export const PRESENCE_IDLE_MS = 180_000;
export const validPresence = (value: unknown): value is UserStatusType => ['online','ausente','ocupado','indisponivel','offline'].includes(String(value));
export function getRealUserStatus(profile?: {status_presenca?: UserStatusType; last_seen?: string} | null, now = Date.now()) {
 const seen = Date.parse(profile?.last_seen || '');
 const fresh = Number.isFinite(seen) && now-seen < PRESENCE_TTL_MS;
 const status:UserStatusType = !fresh || !profile || profile.status_presenca === 'offline' ? 'offline' : validPresence(profile.status_presenca)?profile.status_presenca:'online';
 const labels = {online:'Online',ausente:'Ausente',ocupado:'Ocupado',indisponivel:'Indisponível',offline:'Offline'};
 const colors = {online:'bg-emerald-500',ausente:'bg-amber-500',ocupado:'bg-red-500',indisponivel:'bg-purple-500',offline:'bg-gray-400'};
 let lastSeenText = 'Sem atividade recente';
 if(Number.isFinite(seen)) {
  const date=new Date(seen),time=date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  lastSeenText=date.toDateString()===new Date(now).toDateString()?`Visto hoje às ${time}`:`Visto em ${date.toLocaleDateString('pt-BR')} às ${time}`;
 }
 if(status==='online')lastSeenText='Ativo no portal';
 if(status==='ocupado')lastSeenText='Não perturbe';
 if(status==='indisponivel')lastSeenText='Em atendimento';
 return {status,label:labels[status],color:colors[status],lastSeenText};
}
