import React, { useState } from 'react'
import { useSovereign } from '../context/SovereignContext'

const fieldStyle = {
  width: '100%',
  padding: '12px',
  background: '#000',
  border: '1px solid #333',
  color: '#00D4FF',
  marginBottom: '16px',
  borderRadius: '6px',
}

export default function SystemAccessModal({ onClose }) {
  const { configured, elevate } = useSovereign()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setErr] = useState('')

  const mode = configured ? 'login' : 'setup'

  const handleAccess = async () => {
    if (!email.trim()) {
      setErr('Operator email is required')
      return
    }
    if (pass.length < 10) {
      setErr('Password must be at least 10 characters')
      return
    }
    if (mode === 'setup' && pass !== confirm) {
      setErr('Passwords do not match')
      return
    }

    setLoading(true)
    setErr('')
    const result = await elevate(email, pass, mode)
    setLoading(false)
    if (!result.ok) {
      setErr(result.error)
      return
    }
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 11000,
      background: 'rgba(10, 14, 20, 0.98)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace',
      padding: 20,
    }}>
      <div style={{
        maxWidth: '420px', width: '100%', padding: '32px',
        border: '1px solid #FF453A', borderRadius: '12px',
        background: '#0A0E14',
        boxShadow: '0 0 50px rgba(255, 69, 58, 0.15)',
      }}>
        <div style={{ color: '#FF453A', fontSize: '10px', fontWeight: 800, marginBottom: '20px', letterSpacing: '0.3em' }}>
          DEV ELEVATION
        </div>
        <h2 style={{ color: '#FFF', margin: '0 0 10px 0' }}>
          {mode === 'setup' ? 'Initialize Fortress Login' : 'Privilege Elevation'}
        </h2>
        <div style={{ color: 'rgba(180,195,220,0.68)', fontSize: 12, lineHeight: 1.6, marginBottom: 24 }}>
          {mode === 'setup'
            ? 'Create the first developer operator account. Credentials are stored server-side with Argon2id hashing and sessions are issued as JWTs.'
            : 'Authenticate with the configured operator account to unlock developer mode for this client.'}
        </div>

        <input
          type="email"
          placeholder="Operator Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={fieldStyle}
        />
        <input
          type="password"
          placeholder={mode === 'setup' ? 'Create Password' : 'Password'}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          style={fieldStyle}
        />
        {mode === 'setup' && (
          <input
            type="password"
            placeholder="Confirm Password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={{ ...fieldStyle, marginBottom: 24 }}
          />
        )}

        {error && <div style={{ color: '#FF453A', fontSize: '11px', marginBottom: '20px' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #333', color: '#8E8E93', cursor: 'pointer' }}>Abort</button>
          <button onClick={handleAccess} disabled={loading} style={{ flex: 2, padding: '12px', background: '#FF453A', border: 'none', color: '#FFF', fontWeight: 800, cursor: 'pointer', opacity: loading ? 0.75 : 1 }}>
            {loading ? 'Working…' : mode === 'setup' ? 'Initialize' : 'Authenticate'}
          </button>
        </div>
      </div>
    </div>
  )
}
