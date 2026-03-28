/**
 * Multi-layer screen wake prevention.
 *
 * Layers (each independent — failure in one does not affect others):
 *  1. Screen Wake Lock API  — native, most reliable where supported (iOS 16.4+, Chrome Android)
 *  2. NoSleep.js            — silent looping video, works on older iOS/Safari
 *  3. Silent audio loop     — near-silent Web Audio buffer running continuously,
 *                             keeps audio engine active and prevents sleep on many devices
 *
 * All three re-activate automatically when the page becomes visible again.
 * Call enableWakePrevention() once from a user-gesture handler.
 */

import NoSleep from 'nosleep.js'

const noSleep = new NoSleep()
let _wakeLock    = null
let _silentCtx   = null
let _silentSrc   = null
let _enabled     = false

// ── Layer 1: Screen Wake Lock API ────────────────────────────────────────────
async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return
  try {
    _wakeLock = await navigator.wakeLock.request('screen')
    _wakeLock.addEventListener('release', () => { _wakeLock = null })
  } catch {}
}

// ── Layer 2: NoSleep.js silent video ─────────────────────────────────────────
function enableNoSleep() {
  try { if (!noSleep.isEnabled) noSleep.enable() } catch {}
}

// ── Layer 3: Silent Web Audio buffer loop ─────────────────────────────────────
// Uses a 1-second near-silent buffer (tiny random noise at gain 0.001)
// looping forever so the audio engine stays active.
function startSilentAudio() {
  try {
    if (_silentSrc) return   // already running
    _silentCtx = new (window.AudioContext || window.webkitAudioContext)()
    const rate = _silentCtx.sampleRate
    const buf  = _silentCtx.createBuffer(1, rate, rate)
    const data = buf.getChannelData(0)
    // near-silence — absolute zeros can be optimised away by the OS
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.0001

    _silentSrc = _silentCtx.createBufferSource()
    _silentSrc.buffer = buf
    _silentSrc.loop   = true

    const gain = _silentCtx.createGain()
    gain.gain.value = 0.001          // inaudible but nonzero
    _silentSrc.connect(gain)
    gain.connect(_silentCtx.destination)
    _silentSrc.start()
  } catch {}
}

function resumeSilentAudio() {
  try { if (_silentCtx?.state === 'suspended') _silentCtx.resume() } catch {}
}

// ── Visibility restore: re-activate all layers ───────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !_enabled) return
  acquireWakeLock()
  enableNoSleep()
  resumeSilentAudio()
})

// ── Public API ────────────────────────────────────────────────────────────────
// Must be called from a user-gesture handler (tap/click) due to browser restrictions.
export function enableWakePrevention() {
  _enabled = true
  acquireWakeLock()
  enableNoSleep()
  startSilentAudio()
}

// Call on app mount — Wake Lock API itself does NOT require a user gesture on
// Chrome/Android/desktop; only NoSleep.js + silent audio need one.
// Does NOT set _enabled so that the visibility handler won't trigger NoSleep
// without a user gesture (which can cause issues on iOS Safari).
export function tryAutoWakeLock() {
  acquireWakeLock()
}
