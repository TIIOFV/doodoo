export interface SoundPreference { enabled:boolean; volume:number; tone:'soft'|'chime'; }
export const defaultSound:SoundPreference={enabled:true,volume:.18,tone:'soft'};
export function readSoundPreference(userId:string):SoundPreference {
  try{const value=JSON.parse(localStorage.getItem('doodoo:sound:'+userId)||'null');return {enabled:typeof value?.enabled==='boolean'?value.enabled:true,volume:typeof value?.volume==='number'?Math.max(0,Math.min(.5,value.volume)):.18,tone:value?.tone==='chime'?'chime':'soft'};}catch{return {...defaultSound};}
}
export function saveSoundPreference(userId:string,value:SoundPreference){localStorage.setItem('doodoo:sound:'+userId,JSON.stringify(value));window.dispatchEvent(new Event('doodoo:sound_changed'));}
let context:AudioContext|null=null,lastPlayed=0;
/** Called only by a user gesture. Suspended audio is never queued for later playback. */
export async function unlockPortalAudio(){try{context??=new AudioContext();if(context.state==='suspended')await context.resume();}catch{}}
export function playPortalSound(userId:string,preview=false){
  const prefs=readSoundPreference(userId);
  if(!context||context.state!=='running'||(!preview&&!prefs.enabled)||(!preview&&Date.now()-lastPlayed<5000)||prefs.volume===0)return false;
  const now=context.currentTime;lastPlayed=Date.now();
  const tones=prefs.tone==='chime'?[659.25,880]:[523.25,659.25];
  tones.forEach((frequency,index)=>{const osc=context!.createOscillator(),gain=context!.createGain(),start=now+index*.095;osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(prefs.volume*.12,start+.015);gain.gain.exponentialRampToValueAtTime(.0001,start+.25);osc.connect(gain);gain.connect(context!.destination);osc.start(start);osc.stop(start+.27);});
  return true;
}
