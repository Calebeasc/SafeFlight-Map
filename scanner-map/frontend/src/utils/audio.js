/**
 * Web Audio API alert tones.
 * AudioContext must be unlocked from a user gesture before tones will play on iOS.
 * We register a one-time touchstart/click listener to do this as early as possible.
 */

let _ctx = null

function getCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)()
  return _ctx
}

function unlockCtx() {
  const c = getCtx()
  if (c.state === 'suspended') c.resume()
}
document.addEventListener('touchstart', unlockCtx, { once: true, passive: true })
document.addEventListener('click',      unlockCtx, { once: true, passive: true })

async function ensureRunning() {
  const c = getCtx()
  if (c.state === 'suspended') await c.resume()
  return c
}

function tone(c, freq, type, startTime, duration, gain = 0.18) {
  const osc = c.createOscillator()
  const env = c.createGain()
  osc.connect(env); env.connect(c.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, startTime)
  env.gain.setValueAtTime(0, startTime)
  env.gain.linearRampToValueAtTime(gain, startTime + 0.02)
  env.gain.linearRampToValueAtTime(0, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.01)
}

// ── Watcher variants ──────────────────────────────────────────────────────────

export const WATCHER_SOUND_OPTIONS = [
  { value: 'chirp', label: 'Chirp (default)' },
  { value: 'ding',  label: 'Ding' },
  { value: 'beeps', label: 'Double Beep' },
]

function watcherChirp(c, now, g) {
  tone(c, 880,  'sine', now,        0.12, g)
  tone(c, 1108, 'sine', now + 0.14, 0.12, g)
  tone(c, 1318, 'sine', now + 0.28, 0.18, g * 1.2)
}

function watcherDing(c, now, g) {
  // Single warm bell — long sustain
  const osc = c.createOscillator()
  const env = c.createGain()
  osc.connect(env); env.connect(c.destination)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1047, now) // C6
  env.gain.setValueAtTime(0, now)
  env.gain.linearRampToValueAtTime(g * 1.4, now + 0.01)
  env.gain.exponentialRampToValueAtTime(0.001, now + 1.0)
  osc.start(now); osc.stop(now + 1.05)
}

function watcherBeeps(c, now, g) {
  tone(c, 900, 'square', now,       0.09, g * 0.6)
  tone(c, 900, 'square', now + 0.18, 0.09, g * 0.6)
}

// ── Stopper variants ──────────────────────────────────────────────────────────

export const STOPPER_SOUND_OPTIONS = [
  { value: 'siren', label: 'Siren (default)' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'horn',  label: 'Horn' },
]

function stopperSiren(c, now, g) {
  for (let i = 0; i < 3; i++) {
    const t = now + i * 0.22
    const osc = c.createOscillator()
    const env = c.createGain()
    osc.connect(env); env.connect(c.destination)
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(550, t)
    osc.frequency.linearRampToValueAtTime(950, t + 0.18)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(g, t + 0.03)
    env.gain.linearRampToValueAtTime(0, t + 0.20)
    osc.start(t); osc.stop(t + 0.22)
  }
}

function stopperPulse(c, now, g) {
  for (let i = 0; i < 4; i++) {
    tone(c, 660, 'square', now + i * 0.13, 0.08, g * 0.85)
  }
}

function stopperHorn(c, now, g) {
  // Deep descending two-blast horn
  const osc1 = c.createOscillator()
  const env1 = c.createGain()
  osc1.connect(env1); env1.connect(c.destination)
  osc1.type = 'sawtooth'
  osc1.frequency.setValueAtTime(320, now)
  osc1.frequency.linearRampToValueAtTime(220, now + 0.3)
  env1.gain.setValueAtTime(0, now)
  env1.gain.linearRampToValueAtTime(g * 1.2, now + 0.03)
  env1.gain.linearRampToValueAtTime(0, now + 0.32)
  osc1.start(now); osc1.stop(now + 0.35)

  const osc2 = c.createOscillator()
  const env2 = c.createGain()
  osc2.connect(env2); env2.connect(c.destination)
  osc2.type = 'sawtooth'
  osc2.frequency.setValueAtTime(320, now + 0.42)
  osc2.frequency.linearRampToValueAtTime(220, now + 0.72)
  env2.gain.setValueAtTime(0, now + 0.42)
  env2.gain.linearRampToValueAtTime(g * 1.2, now + 0.45)
  env2.gain.linearRampToValueAtTime(0, now + 0.74)
  osc2.start(now + 0.42); osc2.stop(now + 0.78)
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function playWatcherAlert(vol = 0.7, style = 'chirp') {
  try {
    const c = await ensureRunning()
    const now = c.currentTime
    const g = 0.10 + vol * 0.25
    if (style === 'ding')  watcherDing(c, now, g)
    else if (style === 'beeps') watcherBeeps(c, now, g)
    else watcherChirp(c, now, g)
  } catch {}
}

export async function playStopperAlert(vol = 0.7, style = 'siren') {
  try {
    const c = await ensureRunning()
    const now = c.currentTime
    const g = 0.12 + vol * 0.28
    if (style === 'pulse') stopperPulse(c, now, g)
    else if (style === 'horn') stopperHorn(c, now, g)
    else stopperSiren(c, now, g)
  } catch {}
}

export async function playGenericAlert(vol = 0.7) {
  try {
    const c = await ensureRunning()
    const now = c.currentTime
    const g = 0.08 + vol * 0.18
    tone(c, 660, 'sine', now,       0.15, g)
    tone(c, 660, 'sine', now + 0.2, 0.15, g * 0.7)
  } catch {}
}

// ── Tail detection alert (Feature 2) ─────────────────────────────────────────
// Distinct triple-pulse with rising pitch — sounds urgent but different from Stopper siren.
export async function playTailAlert(vol = 0.7) {
  try {
    const c = await ensureRunning()
    const now = c.currentTime
    const g = 0.14 + vol * 0.30
    // Three rapid ascending bursts
    const freqs = [440, 587, 740]
    freqs.forEach((f, i) => {
      const t = now + i * 0.18
      tone(c, f,       'sawtooth', t,        0.10, g)
      tone(c, f * 1.5, 'sine',     t + 0.06, 0.08, g * 0.7)
    })
  } catch {}
}

// ── Hotspot proximity alert (Feature 4) ──────────────────────────────────────
// Two low booming pulses — feels ominous, different from all other alert types.
export async function playHotspotAlert(vol = 0.7) {
  try {
    const c = await ensureRunning()
    const now = c.currentTime
    const g = 0.16 + vol * 0.32
    ;[now, now + 0.38].forEach(t => {
      const osc = c.createOscillator()
      const env = c.createGain()
      osc.connect(env); env.connect(c.destination)
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(180, t)
      osc.frequency.linearRampToValueAtTime(110, t + 0.28)
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(g, t + 0.04)
      env.gain.linearRampToValueAtTime(0, t + 0.30)
      osc.start(t); osc.stop(t + 0.32)
    })
  } catch {}
}

export function resumeAudio() {
  try { unlockCtx() } catch {}
}
