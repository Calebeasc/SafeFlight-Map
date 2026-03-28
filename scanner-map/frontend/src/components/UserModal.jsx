import React, { useState, useRef } from 'react'

// Dev credential check — mirrors CRED_KEY in DevPanel
function getDevCreds() {
  try {
    const stored = JSON.parse(localStorage.getItem('sfm_dev_creds'))
    if (stored?.username && stored?.password) return stored
  } catch {}
  return { username: 'admin', password: 'invincible1' }
}

const VEHICLES = [
  { id: 'motorcycle', label: 'Motorcycle', emoji: '🏍' },
  { id: 'car',        label: 'Car',        emoji: '🚗' },
  { id: 'van',        label: 'Van / SUV',  emoji: '🚐' },
  { id: 'truck',      label: 'Truck',      emoji: '🚛' },
  { id: 'bicycle',    label: 'Bicycle',    emoji: '🚴' },
  { id: 'foot',       label: 'On Foot',    emoji: '🚶' },
]

export default function UserModal({ onDone }) {
  const [username, setUsername]   = useState('')
  const [vehicle, setVehicle]     = useState('motorcycle')
  const [err, setErr]             = useState('')
  const [devPassword, setDevPass] = useState('')
  const [devPrompt, setDevPrompt] = useState(false)
  const passRef = useRef(null)

  const devCreds = getDevCreds()
  const isDevUsername = username.trim().toLowerCase() === devCreds.username.toLowerCase()

  const submit = () => {
    const name = username.trim()
    if (!name) { setErr('Enter a username'); return }
    if (name.length > 20) { setErr('Max 20 characters'); return }

    // Check if this is a dev operator signing in
    if (isDevUsername && devPassword === devCreds.password) {
      setDevPrompt(true)
      return
    }

    localStorage.setItem('sfm_username', name)
    localStorage.setItem('sfm_vehicle', vehicle)
    onDone(name, vehicle)
  }

  const goToDev = () => {
    sessionStorage.setItem('sfm_dev_unlocked', '1')
    window.location.href = window.location.origin + '/#dev'
    window.location.reload()
  }

  const stayAsUser = () => {
    setDevPrompt(false)
    const name = username.trim()
    localStorage.setItem('sfm_username', name)
    localStorage.setItem('sfm_vehicle', vehicle)
    onDone(name, vehicle)
  }

  // Dev console redirect confirmation overlay
  if (devPrompt) {
    return (
      <div className="modal-overlay">
        <div className="modal-box" style={{ textAlign:'center' }}>
          <div className="modal-handle" />
          <div style={{ fontSize:32, marginBottom:12 }}>🔬</div>
          <div className="modal-title" style={{ marginBottom:6 }}>Dev Operator Detected</div>
          <div className="modal-sub" style={{ marginBottom:24 }}>
            Credentials match the dev console. Where do you want to go?
          </div>
          <button
            className="modal-submit"
            onClick={goToDev}
            style={{ marginBottom:10 }}
          >
            Open Dev Console →
          </button>
          <button
            onClick={stayAsUser}
            style={{
              width:'100%', background:'none', border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:12, color:'rgba(200,216,232,0.55)', fontSize:14,
              padding:'12px', cursor:'pointer', fontFamily:'inherit',
            }}
          >
            Continue as Regular User
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-handle" />
        <div className="modal-title">Invincible.Inc</div>
        <div className="modal-sub">Request access — an operator will approve you</div>

        <div className="modal-field">
          <label className="modal-label">Username</label>
          <input
            className="modal-input"
            placeholder="e.g. Rider1"
            maxLength={20}
            value={username}
            onChange={e => { setUsername(e.target.value); setErr(''); setDevPass('') }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (isDevUsername) passRef.current?.focus()
                else submit()
              }
            }}
            autoFocus
          />
        </div>

        {/* Dev password field — only visible when dev username is entered */}
        {isDevUsername && (
          <div className="modal-field" style={{ marginTop:-4 }}>
            <input
              ref={passRef}
              className="modal-input"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={devPassword}
              onChange={e => { setDevPass(e.target.value); setErr('') }}
              onKeyDown={e => e.key === 'Enter' && submit()}
            />
          </div>
        )}

        {err && <div className="modal-err">{err}</div>}

        {/* Only show vehicle + submit if not in dev-username mode (or dev pass filled) */}
        {(!isDevUsername || devPassword) && (
          <div className="modal-field">
            <label className="modal-label">Vehicle</label>
            <div className="vehicle-grid">
              {VEHICLES.map(v => (
                <button
                  key={v.id}
                  className={`vehicle-btn${vehicle === v.id ? ' selected' : ''}`}
                  onClick={() => setVehicle(v.id)}
                >
                  <span className="vehicle-emoji">{v.emoji}</span>
                  <span className="vehicle-label">{v.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {(!isDevUsername || devPassword) && (
          <button className="modal-submit" onClick={submit}>
            {isDevUsername ? 'Sign In →' : 'Request Access →'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── OTP identity verification modal ───────────────────────────────────────────
// Shown when the operator reprompts a device to verify their phone/email.
export function OtpVerifyModal({ deviceId, onVerified }) {
  const [identifier, setIdentifier] = useState('')
  const [otp, setOtp]               = useState('')
  const [step, setStep]             = useState('input')  // 'input' | 'code'
  const [shownCode, setShownCode]   = useState('')       // code shown on screen
  const [loading, setLoading]       = useState(false)
  const [err, setErr]               = useState('')
  const [smsSent, setSmsSent]       = useState(false)
  const codeInputRef = useRef(null)

  const requestCode = async () => {
    const id = identifier.trim()
    if (!id) { setErr('Enter your email or phone number'); return }
    setLoading(true); setErr('')
    try {
      const r = await fetch('/accounts/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: id, device_id: deviceId }),
      }).then(r => r.json())
      if (r.error) { setErr(r.error); setLoading(false); return }
      setShownCode(r.otp)
      setSmsSent(r.sms_sent || r.email_sent || false)
      setStep('code')
      setTimeout(() => codeInputRef.current?.focus(), 100)
    } catch { setErr('Network error') }
    setLoading(false)
  }

  const verify = async () => {
    const code = otp.trim()
    if (code.length !== 6) { setErr('Enter the 6-digit code'); return }
    setLoading(true); setErr('')
    try {
      const r = await fetch('/accounts/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), otp: code, device_id: deviceId }),
      }).then(r => r.json())
      if (r.error) { setErr(r.error); setLoading(false); return }
      // Clear the needs_reregister flag server-side
      await fetch(`/users/registry/${encodeURIComponent(deviceId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ needs_reregister: 0 }),
      }).catch(() => {})
      onVerified(r.account_id)
    } catch { setErr('Network error') }
    setLoading(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-handle" />
        <div className="modal-title">Verify Your Identity</div>
        <div className="modal-sub">
          {step === 'input'
            ? 'An operator has requested identity verification. Enter your email or phone number.'
            : smsSent
              ? 'A code was sent to your phone. It may appear above your keyboard — tap it to fill in automatically.'
              : `Your code is shown below. Enter it on this device.`}
        </div>

        {step === 'input' ? (
          <>
            <div className="modal-field">
              <label className="modal-label">Email or Phone Number</label>
              <input
                className="modal-input"
                type="text"
                inputMode="email"
                placeholder="you@email.com or +1 555 0100"
                value={identifier}
                onChange={e => { setIdentifier(e.target.value); setErr('') }}
                onKeyDown={e => e.key === 'Enter' && requestCode()}
                autoFocus
                autoComplete="username"
              />
              {err && <div className="modal-err">{err}</div>}
            </div>
            <button className="modal-submit" onClick={requestCode} disabled={loading}>
              {loading ? 'Sending…' : 'Send Code →'}
            </button>
          </>
        ) : (
          <>
            {/* Show code on-screen (for devices without SMS) */}
            {shownCode && !smsSent && (
              <div style={{
                margin: '12px 0', padding: '14px 0', textAlign: 'center',
                background: 'rgba(48,209,88,0.08)', borderRadius: 12,
                border: '1px solid rgba(48,209,88,0.25)',
              }}>
                <div style={{ fontSize: 11, color: 'rgba(200,216,232,0.5)', marginBottom: 6, letterSpacing: 1 }}>YOUR CODE</div>
                <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: 8, color: '#30d158', fontFamily: 'monospace' }}>
                  {shownCode}
                </div>
              </div>
            )}

            <div className="modal-field">
              <label className="modal-label">6-Digit Code</label>
              {/* autocomplete="one-time-code" triggers iOS/Android SMS autofill suggestion */}
              <input
                ref={codeInputRef}
                className="modal-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={e => { setOtp(e.target.value.replace(/\D/g,'')); setErr('') }}
                onKeyDown={e => e.key === 'Enter' && verify()}
                autoComplete="one-time-code"
              />
              {err && <div className="modal-err">{err}</div>}
            </div>

            <button className="modal-submit" onClick={verify} disabled={loading}>
              {loading ? 'Verifying…' : 'Verify →'}
            </button>
            <button
              onClick={() => { setStep('input'); setOtp(''); setErr('') }}
              style={{ background:'none', border:'none', color:'rgba(200,216,232,0.4)', fontSize:13, cursor:'pointer', marginTop:8, width:'100%' }}>
              ← Use different email / phone
            </button>
          </>
        )}
      </div>
    </div>
  )
}
