'use client';
import {useEffect,useState} from 'react';
import {Volume2,Bell,Keyboard} from 'lucide-react';
import {readSoundPreference,saveSoundPreference,unlockPortalAudio,playPortalSound,type SoundPreference} from '../../lib/notificationSound';

export default function NotificationPreferences({userId}:{userId:string}){
 const [sound,setSound]=useState<SoundPreference>(()=>readSoundPreference(userId)),[typing,setTyping]=useState(()=>{try{return localStorage.getItem('doodoo:typing:'+userId)!=='off';}catch{return true;}}),[feedback,setFeedback]=useState('');
 useEffect(()=>{const restore=()=>{setSound(readSoundPreference(userId));try{setTyping(localStorage.getItem('doodoo:typing:'+userId)!=='off');}catch{}};window.addEventListener('storage',restore);return()=>window.removeEventListener('storage',restore);},[userId]);
 const update=(patch:Partial<SoundPreference>)=>{const next={...sound,...patch};setSound(next);try{saveSoundPreference(userId,next);setFeedback('Preferências salvas neste dispositivo.');}catch{setFeedback('Não foi possível guardar as preferências neste dispositivo.');}};
 return <section className="settings-preferences">
  <div className="settings-section-title"><span><Volume2 size={20}/></span><div><h3>Som das notificações</h3><p>Um toque curto e suave, sem repetição contínua.</p></div></div>
  <label className="settings-preference-row"><span><strong>Ativar som</strong><small>Para novas mensagens e avisos recebidos no portal.</small></span><input aria-label="Ativar som das notificações" type="checkbox" checked={sound.enabled} onChange={e=>update({enabled:e.target.checked})}/></label>
  <div className="settings-sound-controls"><label>Toque<select aria-label="Toque de notificação" value={sound.tone} onChange={e=>update({tone:e.target.value as SoundPreference['tone']})}><option value="soft">Suave</option><option value="chime">Cristalino</option></select></label><label>Volume · {Math.round(sound.volume*200)}%<input aria-label="Volume das notificações" type="range" min="0" max="0.5" step="0.025" value={sound.volume} onChange={e=>update({volume:Number(e.target.value)})}/></label><button type="button" onClick={async()=>{await unlockPortalAudio();const played=playPortalSound(userId,true);setFeedback(played?'Toque de teste reproduzido.':'Verifique o volume e se o navegador permite áudio.');}}><Bell size={16}/>Ouvir toque</button></div>
  <div className="settings-section-title"><span><Keyboard size={20}/></span><div><h3>Indicador de digitação</h3><p>Sem compartilhar o texto que você está escrevendo.</p></div></div>
  <label className="settings-preference-row"><span><strong>Mostrar quando estou digitando</strong><small>Visível apenas para participantes da conversa, por alguns segundos.</small></span><input aria-label="Mostrar quando estou digitando" type="checkbox" checked={typing} onChange={e=>{setTyping(e.target.checked);try{localStorage.setItem('doodoo:typing:'+userId,e.target.checked?'on':'off');window.dispatchEvent(new Event('doodoo:typing_preference'));setFeedback('Preferência salva neste dispositivo.');}catch{setFeedback('Não foi possível salvar esta preferência.');}}}/></label>
  <p className="settings-local-note">Preferências deste navegador. O áudio pode precisar de um toque seu para ser liberado pelo iPhone.</p><p role="status" className="settings-preference-feedback">{feedback}</p>
 </section>;
}
