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
