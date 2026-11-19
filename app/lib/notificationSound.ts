export interface SoundPreference {
  enabled: boolean;
  volume: number;
  tone: 'soft' | 'chime';
}

export const defaultSound: SoundPreference = {
  enabled: true,
  volume: 0.35,
  tone: 'soft',
};

export function readSoundPreference(userId: string): SoundPreference {
  try {
    const value = JSON.parse(localStorage.getItem('doodoo:sound:' + userId) || 'null');
    return {
      enabled: typeof value?.enabled === 'boolean' ? value.enabled : true,
      volume: typeof value?.volume === 'number' ? Math.max(0, Math.min(0.5, value.volume)) : defaultSound.volume,
      tone: value?.tone === 'chime' ? 'chime' : 'soft',
    };
  } catch {
    return { ...defaultSound };
  }
}

export function saveSoundPreference(userId: string, value: SoundPreference) {
  localStorage.setItem('doodoo:sound:' + userId, JSON.stringify(value));
  window.dispatchEvent(new Event('doodoo:sound_changed'));
}

let context: AudioContext | null = null;
let lastPlayed = 0;
let lastBuzzPlayed = 0;

function isDoNotDisturbActive(): boolean {
  return typeof document !== 'undefined' && document.documentElement?.dataset?.userPresence === 'ocupado';
}

/** Called only by a user gesture. Suspended audio is never queued for later playback. */
export async function unlockPortalAudio() {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') await context.resume();
  } catch {
    /* Audio may be blocked by browser policy. */
  }
}

export function playPortalSound(userId: string, preview = false) {
  const prefs = readSoundPreference(userId);
  if (
    !context ||
    context.state !== 'running' ||
    (!preview && isDoNotDisturbActive()) ||
    (!preview && !prefs.enabled) ||
    (!preview && Date.now() - lastPlayed < 5000) ||
    prefs.volume === 0
  ) {
    return false;
  }

  const now = context.currentTime;
  lastPlayed = Date.now();

  // Scale stored volume (0..0.5) cleanly up to 0.85 peak gain with richer triangle harmonics
  // so the chime is clearly audible on laptop/desktop speakers without clipping.
  const peakGain = Math.min(0.85, Math.max(0.04, prefs.volume * 1.65));
  const tones = prefs.tone === 'chime' ? [783.99, 1174.66] : [587.33, 880];
  const spacing = prefs.tone === 'chime' ? 0.105 : 0.115;
  const decay = prefs.tone === 'chime' ? 0.4 : 0.36;

  tones.forEach((frequency, index) => {
    const osc = context!.createOscillator();
    const gain = context!.createGain();
    const start = now + index * spacing;
    osc.type = 'triangle';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peakGain, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    osc.connect(gain);
    gain.connect(context!.destination);
    osc.start(start);
    osc.stop(start + decay + 0.02);
  });

  return true;
}

/** Distinctive Spark-style double-pulse attention chime ("Chamar atenção / Vibrar tela"). */
export function playBuzzSound(userId: string) {
  const prefs = readSoundPreference(userId);
  if (
    !context ||
    context.state !== 'running' ||
    isDoNotDisturbActive() ||
    !prefs.enabled ||
    Date.now() - lastBuzzPlayed < 4000 ||
    prefs.volume === 0
  ) {
    return false;
  }

  const now = context.currentTime;
  lastBuzzPlayed = Date.now();
  const peakGain = Math.min(0.9, Math.max(0.08, prefs.volume * 1.75));
  const pattern = [
    { freq: 880, offset: 0, duration: 0.16 },
    { freq: 1174.66, offset: 0.1, duration: 0.19 },
    { freq: 880, offset: 0.34, duration: 0.16 },
    { freq: 1318.51, offset: 0.44, duration: 0.28 },
  ];

  pattern.forEach(({ freq, offset, duration }) => {
    const osc = context!.createOscillator();
    const gain = context!.createGain();
    const start = now + offset;
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peakGain, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(context!.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  });

  return true;
}
