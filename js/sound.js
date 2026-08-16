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
// BACKGROUND MUSIC — a looping, generative "hell pool" theme.
// No audio files: a rhythmic bass riff plus a bright-ish minor
// melodic line, more arcade/rock energy than horror-ambient dread.
// Scheduled a full phrase ahead each loop so it stays gapless.
// ============================================================
let musicGain = null;
let musicPlaying = false;
let musicTimer = null;
let musicVolumeTarget = 0.16;

// A natural minor (no phrygian flat-2, so it reads as driving/epic
// rather than unsettling) — root A2, riff notes, and a brighter lead octave
const BASS = { A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, G2: 98.0 };
const LEAD = { A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G4: 392.0, A5: 880 };
const PHRASE_SECONDS = 8; // shorter, punchier loop

function getMusicGain() {
  const c = getCtx();
  if (!musicGain) {
    musicGain = c.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(c.destination);
  }
  return musicGain;
}

/** One rhythmic bass note — square-ish wave, short and punchy, like a
 *  palm-muted riff hit rather than a sustained ominous drone. */
function scheduleBassHit(freq, startAt, duration, volume = 0.09) {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(freq, startAt);

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 1.2;

  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

  osc.connect(filter).connect(gain).connect(getMusicGain());
  osc.start(startAt);
  osc.stop(startAt + duration);
}

function scheduleLead(freq, startAt, duration, volume = 0.06) {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, startAt);

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2400;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + duration * 0.12);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

  osc.connect(filter).connect(gain).connect(getMusicGain());
  osc.start(startAt);
  osc.stop(startAt + duration);
}

/** A crisp rim-click for a light rhythmic pulse — energetic, not a "heartbeat". */
function scheduleClick(startAt, volume = 0.05) {
  const c = getCtx();
  const size = Math.floor(c.sampleRate * 0.03);
  const buffer = c.createBuffer(1, size, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);

  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 2000;

  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.03);

  src.connect(filter).connect(gain).connect(getMusicGain());
  src.start(startAt);
  src.stop(startAt + 0.03);
}

/** Schedules one full phrase starting at `startAt` (an AudioContext time).
 *  A steady driving bass riff carries the energy; the lead only answers
 *  every other bar so it stays punchy instead of busy. */
function schedulePhrase(startAt) {
  const beat = PHRASE_SECONDS / 8; // 8 driving eighth-note hits per phrase

  const riff = [BASS.A2, BASS.A2, BASS.C3, BASS.A2, BASS.G2, BASS.G2, BASS.D3, BASS.E3];
  riff.forEach((freq, i) => {
    scheduleBassHit(freq, startAt + i * beat, beat * 0.85, 0.1);
    scheduleClick(startAt + i * beat, 0.035);
  });

  scheduleLead(LEAD.A4, startAt + 0, beat * 1.8, 0.055);
  scheduleLead(LEAD.C5, startAt + beat * 2, beat * 0.9, 0.05);
  scheduleLead(LEAD.D5, startAt + beat * 3, beat * 0.9, 0.05);
  scheduleLead(LEAD.E5, startAt + beat * 4, beat * 1.8, 0.06);
  scheduleLead(LEAD.A5, startAt + beat * 6, beat * 1.8, 0.05);
}

function musicLoop() {
  if (!musicPlaying) return;
  const c = getCtx();
  schedulePhrase(c.currentTime + 0.05);
  musicTimer = setTimeout(musicLoop, (PHRASE_SECONDS - 0.3) * 1000);
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
