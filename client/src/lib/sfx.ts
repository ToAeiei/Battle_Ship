/**
 * Sound effects synthesised with the Web Audio API — no audio files to ship,
 * no loading delay, and every sound is a few lines you can tweak.
 */

let ctx: AudioContext | null = null;
let enabled = localStorage.getItem('bs.sound') !== 'off';

const audio = () => {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
};

export const soundEnabled = () => enabled;
export const setSoundEnabled = (v: boolean) => {
  enabled = v;
  localStorage.setItem('bs.sound', v ? 'on' : 'off');
};

type ToneOpts = {
  freq: number; to?: number; dur?: number; type?: OscillatorType;
  gain?: number; delay?: number;
};

function tone({ freq, to, dur = 0.18, type = 'sine', gain = 0.16, delay = 0 }: ToneOpts) {
  if (!enabled) return;
  const c = audio();
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur = 0.25, gain = 0.14, filterHz = 900, delay = 0) {
  if (!enabled) return;
  const c = audio();
  const t0 = c.currentTime + delay;
  const frames = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = filterHz;
  const amp = c.createGain();
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(lp).connect(amp).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  click:  () => tone({ freq: 520, dur: 0.05, type: 'triangle', gain: 0.07 }),
  place:  () => tone({ freq: 300, to: 420, dur: 0.1, type: 'square', gain: 0.08 }),
  fire:   () => noise(0.14, 0.1, 1600),
  miss:   () => { noise(0.3, 0.12, 700); tone({ freq: 240, to: 120, dur: 0.22, type: 'sine', gain: 0.1 }); },
  hit:    () => { noise(0.35, 0.2, 380); tone({ freq: 150, to: 55, dur: 0.4, type: 'sawtooth', gain: 0.16 }); },
  sunk:   () => {
    noise(0.6, 0.24, 300);
    [220, 175, 130, 98].forEach((f, i) => tone({ freq: f, to: f * 0.6, dur: 0.28, type: 'sawtooth', gain: 0.14, delay: i * 0.1 }));
  },
  turn:   () => tone({ freq: 880, to: 1180, dur: 0.12, type: 'sine', gain: 0.1 }),
  tick:   () => tone({ freq: 1400, dur: 0.035, type: 'square', gain: 0.05 }),
  win:    () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.14, delay: i * 0.11 })),
  lose:   () => [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.34, type: 'triangle', gain: 0.13, delay: i * 0.13 })),
  invite: () => { tone({ freq: 660, dur: 0.12, type: 'sine', gain: 0.12 }); tone({ freq: 990, dur: 0.14, type: 'sine', gain: 0.12, delay: 0.14 }); },
};
