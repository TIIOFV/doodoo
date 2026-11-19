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
let cachedBuzzWavUrl: string | null = null;

function isDoNotDisturbActive(): boolean {
  return typeof document !== 'undefined' && document.documentElement?.dataset?.userPresence === 'ocupado';
}

/** Synthesizes a compact in-memory PCM WAV ringtone for Spark-style Buzz fallback when Web Audio is suspended. */
function getBuzzWavUrl(): string | null {
  if (typeof window === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return null;
  if (cachedBuzzWavUrl) return cachedBuzzWavUrl;
  try {
    const sampleRate = 22050;
    const durationSec = 0.92;
    const numSamples = Math.floor(sampleRate * durationSec);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    const pulses = [
      { start: 0.0, end: 0.14, f1: 880, f2: 1318.51 },
      { start: 0.11, end: 0.28, f1: 1174.66, f2: 1760 },
      { start: 0.36, end: 0.50, f1: 880, f2: 1318.51 },
      { start: 0.47, end: 0.84, f1: 1318.51, f2: 1975.53 },
    ];

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let sample = 0;
      for (const p of pulses) {
        if (t >= p.start && t <= p.end) {
          const localT = t - p.start;
          const dur = p.end - p.start;
          const attack = Math.min(1, localT / 0.012);
          const env = attack * Math.pow(Math.max(0, 1 - localT / dur), 1.45);
          const wave = 0.65 * Math.sin(2 * Math.PI * p.f1 * t) + 0.35 * Math.sin(2 * Math.PI * p.f2 * t);
          sample += wave * env * 0.72;
        }
      }
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
    }

    cachedBuzzWavUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    return cachedBuzzWavUrl;
  } catch {
    return null;
  }
}

function playBuzzHtmlAudioFallback(volume0to1: number) {
  const url = getBuzzWavUrl();
  if (!url) return false;
  try {
    const audio = new Audio(url);
    audio.volume = Math.min(1, Math.max(0.15, volume0to1));
    void audio.play().catch(() => {});
    return true;
  } catch {
    return false;
  }
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

function scheduleBuzzSynth(ctx: AudioContext, peakGain: number) {
  const now = ctx.currentTime;
  const pattern = [
    { freq: 880, harmonic: 1318.51, offset: 0, duration: 0.17 },
    { freq: 1174.66, harmonic: 1760, offset: 0.11, duration: 0.22 },
    { freq: 880, harmonic: 1318.51, offset: 0.37, duration: 0.17 },
    { freq: 1318.51, harmonic: 1975.53, offset: 0.48, duration: 0.36 },
  ];

  pattern.forEach(({ freq, harmonic, offset, duration }) => {
    const start = now + offset;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const harmGain = ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.value = freq;
    osc2.type = 'sine';
    osc2.frequency.value = harmonic;
    harmGain.gain.value = 0.32;

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peakGain, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc1.connect(gain);
    osc2.connect(harmGain);
    harmGain.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(start);
    osc2.start(start);
    osc1.stop(start + duration + 0.02);
    osc2.stop(start + duration + 0.02);
  });
}

/** Distinctive Spark-style double-pulse attention chime ("Chamar atenção / Vibrar tela"). */
export function playBuzzSound(userId: string) {
  const prefs = readSoundPreference(userId);
  if (isDoNotDisturbActive() || !prefs.enabled || prefs.volume === 0 || Date.now() - lastBuzzPlayed < 2500) {
    return false;
  }

  lastBuzzPlayed = Date.now();
  const peakGain = Math.min(0.92, Math.max(0.14, prefs.volume * 1.85));

  try {
    context ??= new AudioContext();
    if (context.state === 'running') {
      scheduleBuzzSynth(context, peakGain);
      return true;
    }
    if (context.state === 'suspended') {
      void context
        .resume()
        .then(() => {
          if (context && context.state === 'running') {
            scheduleBuzzSynth(context, peakGain);
          } else {
            playBuzzHtmlAudioFallback(peakGain);
          }
        })
        .catch(() => {
          playBuzzHtmlAudioFallback(peakGain);
        });
      return true;
    }
  } catch {
    /* Fall through to HTML5 audio fallback. */
  }

  return playBuzzHtmlAudioFallback(peakGain);
}

/** Subtle confirmation pop when the sender triggers "Vibrar tela". */
export function playBuzzSentSound(userId: string) {
  const prefs = readSoundPreference(userId);
  if (!prefs.enabled || prefs.volume === 0) return false;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    if (context.state !== 'running') return false;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.11);
    const level = Math.min(0.32, Math.max(0.05, prefs.volume * 0.65));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(now);
    osc.stop(now + 0.16);
    return true;
  } catch {
    return false;
  }
}
