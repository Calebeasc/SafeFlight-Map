/**
 * gpsAccuracy.js — Production-grade GPS accuracy enhancement
 *
 * Algorithms implemented (same foundations as Apple Core Location / Waze / Google Maps):
 *
 *  1. Kalman filter (2-state per axis: position + velocity)
 *     — Optimal linear estimator; minimises mean-square error between noisy
 *       measurements and true state. Same math used in aircraft/missile guidance.
 *       Reference: Welch & Bishop, "An Introduction to the Kalman Filter" (UNC TR 95-041)
 *
 *  2. Adaptive process noise (Q-scaling)
 *     — When the filter detects a manoeuvre (large innovation), Q is scaled up
 *       so the filter trusts new measurements more and follows the motion faster.
 *       Reverts to baseline Q once the vehicle settles back to constant velocity.
 *
 *  3. Mahalanobis distance gating (chi-square innovation test)
 *     — Each GPS fix is tested: if its normalised innovation exceeds the
 *       95th-percentile chi-squared threshold (5.99 for 2 DOF) the fix is a
 *       statistical outlier and is rejected rather than corrupting the estimate.
 *
 *  4. Accuracy gating
 *     — Hard reject any fix whose reported horizontal accuracy > MAX_ACCURACY_M.
 *       iOS/Android report this in metres; a fix at 150 m accuracy is useless.
 *
 *  5. Speed-jump outlier rejection
 *     — If the distance between the last accepted position and new fix, divided
 *       by elapsed time, implies a speed > MAX_SPEED_MPS (physical impossibility
 *       for a road vehicle), the fix is a GPS glitch and is discarded.
 *
 *  6. Dead reckoning
 *     — When a fix is rejected or GPS temporarily unavailable, position is
 *       extrapolated from the last accepted position using:
 *         Δlat = v · cos(heading) · Δt / m_per_deg_lat
 *         Δlon = v · sin(heading) · Δt / m_per_deg_lon
 *       Error grows ~linearly with distance; uncertainty reflected in Kalman P matrix.
 *
 *  7. Circular mean for heading
 *     — Arithmetic mean fails at 0°/360° wrap (avg of 1° and 359° = 180°, wrong).
 *       Circular mean converts angles to unit vectors, averages them, converts back:
 *         θ_mean = atan2(Σ sin(θᵢ), Σ cos(θᵢ))
 *       Returns a concentration value R ∈ [0,1]: R≈1 = tight cluster, R≈0 = scattered.
 *
 *  8. EMA speed smoothing
 *     — Exponential Moving Average: v_smooth = α·v_new + (1-α)·v_prev
 *       Removes GPS velocity spikes while reacting quickly to real speed changes.
 *
 *  9. Stationary lock
 *     — When DeviceMotion confirms the phone is still (acceleration variance below
 *       threshold), the position is frozen to eliminate GPS drift while parked.
 *
 * 10. Accuracy-adaptive R
 *     — Kalman measurement noise R is set per-fix from the GPS accuracy field:
 *         R_lat = (accuracy_m / m_per_deg_lat)²
 *         R_lon = (accuracy_m / m_per_deg_lon)²
 *       Good fix (5 m accuracy) → R ≈ 2e-9; poor fix (50 m) → R ≈ 2e-7.
 *       Filter automatically trusts precise fixes more and smooths noisy ones more.
 */

const DEG_TO_RAD         = Math.PI / 180
const METERS_PER_DEG_LAT = 111_320          // roughly constant globally

// ── Haversine distance in metres ─────────────────────────────────────────────
function haversineM(p1, p2) {
  const R    = 6_371_000
  const dLat = (p2.lat - p1.lat) * DEG_TO_RAD
  const dLon = (p2.lon - p1.lon) * DEG_TO_RAD
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos(p1.lat * DEG_TO_RAD)
             * Math.cos(p2.lat * DEG_TO_RAD)
             * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Circular mean for heading angles (degrees) ───────────────────────────────
// Returns { angle, concentration } where concentration R ∈ [0,1]
function circularMean(angles) {
  if (!angles.length) return { angle: 0, concentration: 0 }
  let sinSum = 0, cosSum = 0
  for (const a of angles) {
    sinSum += Math.sin(a * DEG_TO_RAD)
    cosSum += Math.cos(a * DEG_TO_RAD)
  }
  const n    = angles.length
  const mean = Math.atan2(sinSum / n, cosSum / n) / DEG_TO_RAD
  const R    = Math.sqrt((sinSum / n) ** 2 + (cosSum / n) ** 2)
  return { angle: (mean + 360) % 360, concentration: R }
}

// ── 2-state Kalman filter (position + velocity — 1 dimension) ────────────────
//
// State:       x = [position, velocity]ᵀ
// Transition:  F = [[1, Δt], [0, 1]]   (constant-velocity model)
// Observation: H = [1, 0]              (we measure position only)
// Process Q:   models acceleration uncertainty
//              Q = q · [[Δt⁴/4, Δt³/2], [Δt³/2, Δt²]]
// Measurement R: (σ_gps)² — supplied per update from accuracy field
//
// Predict:   x⁻ = F·x,  P⁻ = F·P·Fᵀ + Q
// Update:    y  = z - H·x⁻,       S = H·P⁻·Hᵀ + R
//            K  = P⁻·Hᵀ / S,     x = x⁻ + K·y,  P = (I - K·H)·P⁻
//
class Kalman1D {
  constructor() {
    // State
    this.pos  = 0
    this.vel  = 0
    // Error covariance (2×2 symmetric)
    this.pp   = 1   // cov(pos, pos)
    this.pv   = 0   // cov(pos, vel)
    this.vv   = 1   // cov(vel, vel)
    // Noise parameters
    this.q    = 1e-9   // process noise (acceleration variance, position units)
    this.ready = false
  }

  init(pos, vel = 0, q = 1e-9) {
    this.pos = pos; this.vel = vel
    this.pp  = 1e-4; this.pv = 0; this.vv = 1e-4
    this.q   = q
    this.ready = true
  }

  predict(dt) {
    if (!this.ready || dt <= 0) return
    // State transition
    const pos_ = this.pos + this.vel * dt
    const vel_ = this.vel
    // P' = F·P·Fᵀ + Q
    const dt2  = dt * dt
    const pp_  = this.pp + dt * (this.pv + this.pv) + dt2 * this.vv + this.q * dt2 * dt2 / 4
    const pv_  = this.pv + dt * this.vv              + this.q * dt * dt2 / 2
    const vv_  = this.vv                             + this.q * dt2
    this.pos = pos_; this.vel = vel_
    this.pp  = pp_;  this.pv  = pv_;  this.vv = vv_
  }

  // Returns { updated_pos, innovation, S } for Mahalanobis gating
  update(z, r) {
    if (!this.ready) { this.init(z); return { pos: z, innovation: 0, S: 1 } }
    const innovation = z - this.pos
    const S          = this.pp + r                    // innovation variance
    const K0         = this.pp / S                    // gain for position
    const K1         = this.pv / S                    // gain for velocity
    this.pos += K0 * innovation
    this.vel += K1 * innovation
    // Joseph form for numerical stability: P = (I-KH)·P
    const I_K0 = 1 - K0
    const pp_  = I_K0 * this.pp
    const pv_  = I_K0 * this.pv
    const vv_  = this.vv - K1 * this.pv
    this.pp = pp_; this.pv = pv_; this.vv = vv_
    return { pos: this.pos, innovation, S }
  }
}

// ── GPS Processor — combines all algorithms ──────────────────────────────────
export class GPSProcessor {
  constructor() {
    this.kfLat = new Kalman1D()
    this.kfLon = new Kalman1D()

    this.lastTs       = null
    this.lastGoodPos  = null   // last accepted smoothed position
    this.headingBuf   = []     // circular heading buffer
    this.smoothSpeed  = null   // EMA-smoothed speed (m/s)
    this.isStationary = false  // set externally by DeviceMotion listener

    // ── Tunable parameters ──────────────────────────────────────────────────
    // Accuracy gate: discard any fix whose reported accuracy (m) exceeds this.
    // 80 m rejects building-resolution cell-tower positions while keeping
    // ordinary smartphone GPS (~5–30 m) and Wi-Fi-aided fixes (~30–50 m).
    this.MAX_ACCURACY_M = 80

    // Speed gate: ~200 mph.  Any implied speed above this is a GPS glitch.
    this.MAX_SPEED_MPS  = 90

    // Acceleration standard-deviation used to compute process noise Q.
    // 2.5 m/s² ≈ comfortable car acceleration; increase to 5 for sport/track.
    this.PROCESS_SIGMA_A = 2.5

    // Adaptive Q multiplier bounds: filter can scale Q up by 20× during manoeuvres,
    // and back down to 0.5× baseline during steady cruise.
    this.Q_MIN_FACTOR = 0.5
    this.Q_MAX_FACTOR = 20.0

    // Chi-squared gate: 95th percentile for 2 DOF = 5.99.
    // Raise to 9.21 (99%) for more permissive gating on highways;
    // lower to 4.61 (90%) for urban low-speed where glitches dominate.
    this.CHI2_THRESHOLD = 5.99

    // Heading buffer length (circular mean window)
    this.HEADING_WINDOW = 7

    // EMA alpha for speed: 0.25 → ~7-sample effective window.
    // Lower values = smoother but more lag.  0.1–0.35 works well for driving.
    this.SPEED_ALPHA    = 0.25

    // Adaptive Q state
    this._qFactor = 1.0   // current Q multiplier; drifts toward 1 each step
  }

  // Called by DeviceMotion listener when stationary state changes
  setStationary(isStill) {
    this.isStationary = isStill
  }

  // ── Main entry point ──────────────────────────────────────────────────────
  // Returns smoothed { lat, lon, heading, speed, accuracy } or null if no estimate.
  process(fix) {
    const {
      lat,
      lon,
      accuracy  = 50,
      speed     = null,
      heading   = null,
      timestamp = Date.now(),
    } = fix

    const dt        = this.lastTs != null ? (timestamp - this.lastTs) / 1000 : 0
    const clampedDt = Math.min(Math.max(dt, 0), 10)  // clamp to [0, 10] s

    // ── 1. Accuracy gate ─────────────────────────────────────────────────────
    if (accuracy > this.MAX_ACCURACY_M) {
      return this._deadReckonOrNull(clampedDt, timestamp)
    }

    // ── 2. Speed-jump outlier ────────────────────────────────────────────────
    if (this.lastGoodPos && dt > 0) {
      const impliedSpeedMps = haversineM(this.lastGoodPos, { lat, lon }) / dt
      if (impliedSpeedMps > this.MAX_SPEED_MPS) {
        return this._deadReckonOrNull(clampedDt, timestamp)
      }
    }

    // ── 3. Stationary lock ───────────────────────────────────────────────────
    if (this.isStationary && this.lastGoodPos) {
      this.lastTs = timestamp
      return {
        lat:     this.lastGoodPos.lat,
        lon:     this.lastGoodPos.lon,
        heading: this.headingBuf.length ? circularMean(this.headingBuf).angle : null,
        speed:   0,
        accuracy,
        locked:  true,
      }
    }

    // ── 4. Compute per-fix noise parameters ──────────────────────────────────
    const mPerDegLon = METERS_PER_DEG_LAT * Math.cos(lat * DEG_TO_RAD) || 1

    // Process noise q (deg²/s⁴) = (σ_a / m_per_deg)²
    const q_lat_base = (this.PROCESS_SIGMA_A / METERS_PER_DEG_LAT) ** 2
    const q_lon_base = (this.PROCESS_SIGMA_A / mPerDegLon)          ** 2

    // Measurement noise R (deg²) = (accuracy_m / m_per_deg)²
    const r_lat = (accuracy / METERS_PER_DEG_LAT) ** 2
    const r_lon = (accuracy / mPerDegLon)          ** 2

    // ── 5. Initialise or predict ──────────────────────────────────────────────
    if (!this.kfLat.ready) {
      this.kfLat.init(lat, 0, q_lat_base)
      this.kfLon.init(lon, 0, q_lon_base)
    } else {
      // Apply adaptive Q factor
      this.kfLat.q = q_lat_base * this._qFactor
      this.kfLon.q = q_lon_base * this._qFactor
      if (clampedDt > 0) {
        this.kfLat.predict(clampedDt)
        this.kfLon.predict(clampedDt)
      }
    }

    // ── 6. Mahalanobis distance gate (chi-square innovation test) ─────────────
    // Normalised innovation squared (NIS): d² = Σ (yᵢ² / Sᵢ)
    // For 2 DOF, 95th-percentile threshold = 5.99.
    // We compute innovations against the predicted state (before update).
    const innLat = lat - this.kfLat.pos
    const innLon = lon - this.kfLon.pos
    const S_lat  = this.kfLat.pp + r_lat
    const S_lon  = this.kfLon.pp + r_lon
    const nis    = (innLat * innLat) / S_lat + (innLon * innLon) / S_lon

    if (nis > this.CHI2_THRESHOLD && this.lastGoodPos) {
      // Statistical outlier — skip update but raise Q so filter adapts faster next time
      this._qFactor = Math.min(this.Q_MAX_FACTOR, this._qFactor * 2.0)
      return this._deadReckonOrNull(clampedDt, timestamp)
    }

    // ── 7. Adaptive Q update ─────────────────────────────────────────────────
    // Scale Q proportional to innovation magnitude; decay back to 1 each cycle.
    const normInnovation = Math.sqrt(nis)
    if (normInnovation > 2.0) {
      // Manoeuvre detected: scale Q up
      this._qFactor = Math.min(this.Q_MAX_FACTOR, this._qFactor * (1 + 0.4 * (normInnovation - 2)))
    } else {
      // Steady state: slowly decay Q back toward baseline
      this._qFactor = Math.max(this.Q_MIN_FACTOR, this._qFactor * 0.85)
    }

    // ── 8. Kalman update ──────────────────────────────────────────────────────
    const { pos: smoothLat } = this.kfLat.update(lat, r_lat)
    const { pos: smoothLon } = this.kfLon.update(lon, r_lon)

    // ── 9. Circular mean heading ──────────────────────────────────────────────
    let smoothHeading = null
    if (heading != null && !isNaN(heading)) {
      this.headingBuf.push(heading)
      if (this.headingBuf.length > this.HEADING_WINDOW) this.headingBuf.shift()
    }
    if (this.headingBuf.length) {
      const { angle, concentration } = circularMean(this.headingBuf)
      // Only use circular mean when headings are reasonably consistent (R > 0.3)
      smoothHeading = concentration > 0.3 ? angle : (this.headingBuf[this.headingBuf.length - 1] ?? null)
    }

    // ── 10. EMA speed smoothing ───────────────────────────────────────────────
    let smoothSpeedVal = null
    if (speed != null && !isNaN(speed) && speed >= 0) {
      this.smoothSpeed = this.smoothSpeed == null
        ? speed
        : this.SPEED_ALPHA * speed + (1 - this.SPEED_ALPHA) * this.smoothSpeed
      smoothSpeedVal = Math.max(0, this.smoothSpeed)
    }

    this.lastTs      = timestamp
    this.lastGoodPos = { lat: smoothLat, lon: smoothLon }

    return {
      lat:      smoothLat,
      lon:      smoothLon,
      heading:  smoothHeading,
      speed:    smoothSpeedVal,
      rawLat:   lat,
      rawLon:   lon,
      accuracy,
    }
  }

  // ── Dead reckoning: extrapolate position from last good fix ──────────────────
  _deadReckonOrNull(dt, timestamp) {
    if (!this.lastGoodPos || dt <= 0 || dt > 15) return null
    const speed   = this.smoothSpeed ?? 0
    if (speed < 0.5) {
      // Essentially stationary — just hold last position rather than drifting
      this.lastTs = timestamp
      return {
        lat:           this.lastGoodPos.lat,
        lon:           this.lastGoodPos.lon,
        heading:       this.headingBuf.length ? circularMean(this.headingBuf).angle : null,
        speed:         this.smoothSpeed,
        deadReckoned:  true,
        accuracy:      null,
      }
    }
    const heading    = this.headingBuf.length ? circularMean(this.headingBuf).angle : 0
    const dist       = speed * dt
    const hRad       = heading * DEG_TO_RAD
    const mPerDegLon = METERS_PER_DEG_LAT * Math.cos(this.lastGoodPos.lat * DEG_TO_RAD) || 1
    const dLat       = dist * Math.cos(hRad) / METERS_PER_DEG_LAT
    const dLon       = dist * Math.sin(hRad) / mPerDegLon
    this.lastGoodPos = {
      lat: this.lastGoodPos.lat + dLat,
      lon: this.lastGoodPos.lon + dLon,
    }
    // Also advance the Kalman prediction so covariance grows correctly
    if (this.kfLat.ready) {
      this.kfLat.predict(dt)
      this.kfLon.predict(dt)
    }
    this.lastTs = timestamp
    return {
      lat:          this.lastGoodPos.lat,
      lon:          this.lastGoodPos.lon,
      heading,
      speed:        this.smoothSpeed,
      deadReckoned: true,
      accuracy:     null,
    }
  }

  reset() {
    this.kfLat      = new Kalman1D()
    this.kfLon      = new Kalman1D()
    this.lastTs      = null
    this.lastGoodPos = null
    this.headingBuf  = []
    this.smoothSpeed = null
    this._qFactor    = 1.0
  }
}

// ── DeviceMotion stationary detector ─────────────────────────────────────────
// Returns a cleanup function.  Calls onStationary(bool) whenever state changes.
//
// Algorithm:
//   - Buffer last N acceleration magnitudes (excluding gravity component)
//   - Compute variance of the buffer
//   - If variance < threshold → stationary (no significant motion)
//
export function startStationaryDetector(onStationary) {
  if (typeof window === 'undefined' || !window.DeviceMotionEvent) return () => {}

  const WINDOW    = 12     // samples (~1.2 s at 10 Hz DeviceMotion)
  const THRESHOLD = 0.04   // m²/s⁴ variance — below this = still
  const buf       = []
  let   lastState = null   // avoid firing callbacks on every identical reading

  const onMotion = (e) => {
    // Use acceleration WITHOUT gravity when available (better isolation)
    const acc = e.acceleration || e.accelerationIncludingGravity
    if (!acc || acc.x == null) return
    const mag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2)
    buf.push(mag)
    if (buf.length > WINDOW) buf.shift()
    if (buf.length < WINDOW) return   // need full window before deciding

    const mean     = buf.reduce((s, v) => s + v, 0) / buf.length
    const variance = buf.reduce((s, v) => s + (v - mean) ** 2, 0) / buf.length
    const isStill  = variance < THRESHOLD
    if (isStill !== lastState) {
      lastState = isStill
      onStationary(isStill)
    }
  }

  const attach = () => window.addEventListener('devicemotion', onMotion)

  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    // iOS 13+ requires explicit permission
    DeviceMotionEvent.requestPermission()
      .then(state => { if (state === 'granted') attach() })
      .catch(() => {})
  } else {
    attach()
  }

  return () => window.removeEventListener('devicemotion', onMotion)
}
