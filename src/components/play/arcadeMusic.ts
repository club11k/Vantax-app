// Música de fondo "arcade" de Vantax Play — generada en directo con la Web
// Audio API, sin ningún archivo de audio en el proyecto (igual que el
// "clunk" de monedas de ChestOpenModal.tsx). Especificación exacta que pasó
// Esther (portada del agente/mockup original, sin tocar ningún parámetro):
// un solo bajo en pizzicato (onda triangular, filtro paso bajo 500 Hz Q 0.5),
// envolvente de 6 ms de ataque hasta 0.05 de volumen y caída exponencial
// hasta cortarse a los 0.3 s, pulso cada 0.375 s alternando fundamental y
// quinta, sobre una progresión de 8 acordes (Cmaj7→Am7→Fmaj7→G7→Em7→Am7→
// Dm7→G7) en bucle de 11.2 s con duraciones propias por acorde -- el cambio
// de acorde y el pulso del bajo van con temporizadores independientes a
// propósito (las duraciones no son múltiplos de 0.375 s, así que los
// cambios de acorde no caen siempre justo en el pulso, es parte del efecto).
//
// Estado a nivel de módulo (no de componente) a propósito: solo tiene
// sentido una música de fondo sonando a la vez para toda la pantalla de
// Vantax Play, así que un simple singleton evita tener que sincronizar el
// estado entre componentes si el árbol se remonta.

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioCtxClass();
  }
  // Los navegadores suspenden el AudioContext hasta el primer gesto del
  // usuario -- como esto solo se llama desde el onClick del botón de
  // música, ya hay gesto, pero el contexto puede quedar "suspended" igualmente.
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

let musicOn = false;
let musicPulseTimer: ReturnType<typeof setTimeout> | null = null;
let pulseStep = 0;
let chordStep = 0;
let chordTimer: ReturnType<typeof setTimeout> | null = null;
let currentChordRoot = 130.81;
let currentChordFifth = 196.0;
const PULSE_INTERVAL = 0.375;

const CHORDS: Record<string, number[]> = {
  Cmaj7: [130.81, 164.81, 196.0, 246.94],
  Am7: [110.0, 130.81, 164.81, 196.0],
  Fmaj7: [87.31, 110.0, 130.81, 164.81],
  G7: [98.0, 123.47, 146.83, 174.61],
  Em7: [82.41, 98.0, 123.47, 146.83],
  Dm7: [73.42, 87.31, 110.0, 130.81],
};

const CHORD_SEQUENCE = [
  { chord: CHORDS.Cmaj7, dur: 1.55 },
  { chord: CHORDS.Am7, dur: 1.25 },
  { chord: CHORDS.Fmaj7, dur: 1.55 },
  { chord: CHORDS.G7, dur: 1.4 },
  { chord: CHORDS.Em7, dur: 1.25 },
  { chord: CHORDS.Am7, dur: 1.5 },
  { chord: CHORDS.Dm7, dur: 1.25 },
  { chord: CHORDS.G7, dur: 1.45 },
];

function playPulse(ctx: AudioContext, t: number, freq: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 500;
  lp.Q.value = 0.5;
  osc.type = "triangle";
  osc.frequency.value = freq;
  osc.connect(lp);
  lp.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.05, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  osc.start(t);
  osc.stop(t + 0.3);
}

function scheduleBassPulse() {
  if (!musicOn) return;
  const ctx = getAudioCtx();
  const t = ctx.currentTime + 0.02;
  const freq = pulseStep % 2 === 0 ? currentChordRoot : currentChordFifth;
  playPulse(ctx, t, freq);
  pulseStep++;
  musicPulseTimer = setTimeout(scheduleBassPulse, PULSE_INTERVAL * 1000);
}

function scheduleChordChange() {
  if (!musicOn) return;
  const step = CHORD_SEQUENCE[chordStep % CHORD_SEQUENCE.length];
  currentChordRoot = step.chord[0];
  currentChordFifth = step.chord[2];
  chordStep++;
  chordTimer = setTimeout(scheduleChordChange, step.dur * 1000);
}

export function startArcadeMusic() {
  if (musicOn) return;
  getAudioCtx();
  musicOn = true;
  chordStep = 0;
  pulseStep = 0;
  scheduleChordChange();
  scheduleBassPulse();
}

export function stopArcadeMusic() {
  musicOn = false;
  if (chordTimer) clearTimeout(chordTimer);
  if (musicPulseTimer) clearTimeout(musicPulseTimer);
}

export function isArcadeMusicOn() {
  return musicOn;
}

export function toggleArcadeMusic(): boolean {
  if (musicOn) {
    stopArcadeMusic();
  } else {
    startArcadeMusic();
  }
  return musicOn;
}
