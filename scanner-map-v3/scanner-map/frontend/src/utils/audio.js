/**
 * Web Audio API alert tones.
 * Fun-Watcher: rising two-tone chirp (non-threatening, informational)
 * Fun-Stopper: urgent pulsing buzz (attention-grabbing)
 */

let _ctx = null

function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)()
  return _ctx
}

function tone(freq, type, startTime, duration, gain = 0.18) {
  const c = ctx()
  const osc = c.createOscillator()
  const env = c.createGain()
  osc.connect(env)
  env.connect(c.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, startTime)
  env.gain.setValueAtTime(0, startTime)
  env.gain.linearRampToValueAtTime(gain, startTime + 0.02)
  env.gain.linearRampToValueAtTime(0, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.01)
}

/**
 * Play a 3-chirp ascending tone — Fun-Watcher (blue camera detected)
 */
export function playWatcherAlert() {
  try {
    const c = ctx()
    const now = c.currentTime
    // Three quick ascending tones: 880 → 1108 → 1318 Hz (A5-C#6-E6)
    tone(880,  'sine',   now,       0.12, 0.15)
    tone(1108, 'sine',   now + 0.14, 0.12, 0.15)
    tone(1318, 'sine',   now + 0.28, 0.18, 0.20)
  } catch {}
}

/**
 * Play an urgent pulsing alarm — Fun-Stopper (cop car detected)
 */
export function playStopperAlert() {
  try {
    const c = ctx()
    const now = c.currentTime
    // Rapid yelp pattern: 600→900 Hz sweep × 3
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.22
      const osc = c.createOscillator()
      const env = c.createGain()
      osc.connect(env); env.connect(c.destination)
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(550,  t)
      osc.frequency.linearRampToValueAtTime(950, t + 0.18)
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(0.22, t + 0.03)
      env.gain.linearRampToValueAtTime(0, t + 0.20)
      osc.start(t); osc.stop(t + 0.22)
    }
  } catch {}
}

/**
 * Generic proximity ping for unlabeled targets
 */
export function playGenericAlert() {
  try {
    const c = ctx()
    const now = c.currentTime
    tone(660, 'sine', now, 0.15, 0.12)
    tone(660, 'sine', now + 0.2, 0.15, 0.08)
  } catch {}
}

export function resumeAudio() {
  try { ctx().resume() } catch {}
}
