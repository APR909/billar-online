// ============================================================
// SOUND EFFECTS — synthesized live with the Web Audio API.
// No audio files to host/license: every sound below is a short
// burst of filtered noise and/or a sine "thump", shaped with a
// fast decay envelope. Volume/pitch scale with impact speed so
// soft touches stay quiet and hard hits punch through.
//
// Browsers block audio until a user gesture — getCtx() lazily
// creates/resumes the context, so just calling any play*()
// function from a click/pointer handler is enough.
// ============================================================

let ctx = null;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** Short filtered noise burst — the "click" of hard resin/plastic contact. */
function noiseClick({ freq = 2000, q = 3, duration = 0.04, volume = 0.4 } = {}) {
  const c = getCtx();
  const now = c.currentTime;
  const size = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, size, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;

  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  src.connect(filter).connect(gain).connect(c.destination);
  src.start(now);
  src.stop(now + duration);
}

/** Low sine "thump" for weight/body under a click. */
function thump({ freq = 150, duration = 0.08, volume = 0.3 } = {}) {
  const c = getCtx();
  const now = c.currentTime;
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, now + duration);

  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + duration);
}

/** Cue tip striking the cue ball. power: 0..1 (drag distance / max). */
export function playStrike(power = 1) {
  noiseClick({ freq: 1800, q: 2.2, duration: 0.035, volume: 0.22 + power * 0.28 });
  thump({ freq: 120, duration: 0.06, volume: 0.12 + power * 0.18 });
}

/** Ball-on-ball contact. impactSpeed roughly 0..900 px/s. */
export function playBallHit(impactSpeed = 300) {
  const t = Math.min(1, impactSpeed / 700);
  if (t < 0.04) return; // inaudible graze, skip
  noiseClick({ freq: 3000 + t * 800, q: 4, duration: 0.03, volume: 0.12 + t * 0.38 });
}

/** Ball bouncing off a cushion. */
export function playCushionHit(impactSpeed = 200) {
  const t = Math.min(1, impactSpeed / 700);
  if (t < 0.04) return;
  noiseClick({ freq: 850, q: 1.4, duration: 0.05, volume: 0.08 + t * 0.22 });
  thump({ freq: 90, duration: 0.07, volume: 0.06 + t * 0.12 });
}

/** A ball drops into a pocket — physical thud plus a small rewarding chime. */
export function playPot() {
  const c = getCtx();
  const now = c.currentTime;
  thump({ freq: 220, duration: 0.18, volume: 0.32 });

  [660, 880].forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = "sine";
    const gain = c.createGain();
    const start = now + 0.05 + i * 0.07;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + 0.25);
  });
}

// ============================================================
// BACKGROUND MUSIC — a looping, generative "hell pool" ambience.
// No audio files: a sustained drone plus a sparse minor/phrygian
// melodic motif and a soft heartbeat-like pulse, all scheduled
// ahead of time each loop so it stays gapless and drift-free.
// ============================================================
let musicGain = null;
let musicPlaying = false;
let musicTimer = null;
let musicVolumeTarget = 0.18;

const DRONE_FREQ = 55; // A1
// A phrygian-ish scale rooted on A — gives that dark, unsettled feel
const SCALE = { A2: 110, Bb2: 116.54, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0 };
const PHRASE_SECONDS = 16;

function getMusicGain() {
  const c = getCtx();
  if (!musicGain) {
    musicGain = c.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(c.destination);
  }
  return musicGain;
}

function scheduleDrone(startAt, duration) {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(DRONE_FREQ, startAt);

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 220;
  filter.Q.value = 0.7;

  const gain = c.createGain();
  // slow breathing swell across the phrase
  gain.gain.setValueAtTime(0.05, startAt);
  gain.gain.linearRampToValueAtTime(0.11, startAt + duration * 0.5);
  gain.gain.linearRampToValueAtTime(0.05, startAt + duration);

  osc.connect(filter).connect(gain).connect(getMusicGain());
  osc.start(startAt);
  osc.stop(startAt + duration);
}

function scheduleNote(freq, startAt, duration, volume = 0.06) {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, startAt);

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + duration * 0.15);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

  osc.connect(filter).connect(gain).connect(getMusicGain());
  osc.start(startAt);
  osc.stop(startAt + duration);
}

function schedulePulse(startAt) {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(70, startAt);
  osc.frequency.exponentialRampToValueAtTime(35, startAt + 0.35);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.14, startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.4);

  osc.connect(gain).connect(getMusicGain());
  osc.start(startAt);
  osc.stop(startAt + 0.4);
}

function scheduleWind(startAt, duration) {
  const c = getCtx();
  const size = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, size, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 500;
  filter.Q.value = 0.6;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.012, startAt);

  src.connect(filter).connect(gain).connect(getMusicGain());
  src.start(startAt);
  src.stop(startAt + duration);
}

/** Schedules one full phrase starting at `startAt` (an AudioContext time). */
function schedulePhrase(startAt) {
  scheduleDrone(startAt, PHRASE_SECONDS);
  scheduleWind(startAt, PHRASE_SECONDS);
  [0, 4, 8, 12].forEach((t) => schedulePulse(startAt + t));

  scheduleNote(SCALE.A2, startAt + 0, 2.2, 0.055);
  scheduleNote(SCALE.C3, startAt + 3, 1.4, 0.05);
  scheduleNote(SCALE.Bb2, startAt + 5, 1.0, 0.045);
  scheduleNote(SCALE.E3, startAt + 8, 2.6, 0.05);
  scheduleNote(SCALE.D3, startAt + 11, 1.4, 0.045);
  scheduleNote(SCALE.F3, startAt + 13, 1.1, 0.05);
}

function musicLoop() {
  if (!musicPlaying) return;
  const c = getCtx();
  schedulePhrase(c.currentTime + 0.05);
  musicTimer = setTimeout(musicLoop, (PHRASE_SECONDS - 0.5) * 1000);
}

export function startMusic() {
  const c = getCtx();
  const gain = getMusicGain();
  if (musicPlaying) return;
  musicPlaying = true;
  gain.gain.cancelScheduledValues(c.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, c.currentTime);
  gain.gain.linearRampToValueAtTime(musicVolumeTarget, c.currentTime + 1.5);
  musicLoop();
}

export function stopMusic() {
  musicPlaying = false;
  if (musicTimer) clearTimeout(musicTimer);
  if (musicGain) {
    const c = getCtx();
    musicGain.gain.cancelScheduledValues(c.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, c.currentTime);
    musicGain.gain.linearRampToValueAtTime(0, c.currentTime + 0.8);
  }
}

export function toggleMusic() {
  if (musicPlaying) stopMusic();
  else startMusic();
  return musicPlaying;
}

export function isMusicPlaying() {
  return musicPlaying;
}
