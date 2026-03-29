import React, { useEffect, useState } from 'react'
import {
  WATCHER_SOUND_OPTIONS, STOPPER_SOUND_OPTIONS,
  playWatcherAlert, playStopperAlert, resumeAudio,
} from '../utils/audio'
import { useSovereign } from '../context/SovereignContext'

const FIELD_DEFS = [
  { key: 'alert_radius_m', label: 'Alert radius', unit: 'm', type: 'number', min: 50, max: 2000, step: 50 },
  { key: 'alert_cooldown_s', label: 'Alert cooldown', unit: 's', type: 'number', min: 5, max: 300, step: 5 },
  { key: 'wifi_scan_interval_s', label: 'Wi-Fi scan interval', unit: 's', type: 'number', min: 1, max: 30, step: 0.5 },
  { key: 'heat_cell_m', label: 'Heat cell size', unit: 'm', type: 'number', min: 25, max: 500, step: 25 },
  { key: 'rssi_floor', label: 'RSSI floor', unit: 'dBm', type: 'number', min: -110, max: -60, step: 1 },
  { key: 'wifi_scan_enabled', label: 'Wi-Fi scanning', unit: '', type: 'bool' },
  { key: 'ble_scan_enabled', label: 'BLE scanning', unit: '', type: 'bool' },
  { key: 'fake_data_enabled', label: 'Fake data (demo)', unit: '', type: 'bool' },
]

export default function SettingsPanel({ onClose, onOpenUserModal, onOpenSystemAccess }) {
  const [values, setValues] = useState(null)
  const [saved, setSaved] = useState(false)
  const [gps, setGps] = useState(null)
  const [watcherSound, setWatcherSound] = useState(() => localStorage.getItem('sfm_watcher_sound') || 'chirp')
  const [stopperSound, setStopperSound] = useState(() => localStorage.getItem('sfm_stopper_sound') || 'siren')
  const { configured, isDev, userEmail, decommission } = useSovereign()

  useEffect(() => {
    fetch('/settings').then((r) => r.json()).then(setValues).catch(() => {})
    fetch('/gps/status').then((r) => r.json()).then(setGps).catch(() => {})
    const id = setInterval(() => {
      fetch('/gps/status').then((r) => r.json()).then(setGps).catch(() => {})
    }, 3000)
    return () => clearInterval(id)
  }, [])

  const set = (key, val) => setValues((v) => ({ ...v, [key]: val }))

  const handleSave = async () => {
    await fetch('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const laptopUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port || 8742}/gps/phone`

  return (
    <div className="settings-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-panel">
        <div className="settings-header">
          <span>⚙ Settings</span>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          <div className="settings-section">
            <div className="section-label">GPS Source</div>
            <div className="gps-status-card">
              <div className={`gps-dot ${gps?.available ? 'on' : ''}`} />
              <div>
                <div style={{ color: gps?.available ? '#00e676' : '#5a7a96', fontSize: 12, fontWeight: 700 }}>
                  {gps?.available ? `LOCK · ${gps.source?.toUpperCase()} · ${gps.age_s}s ago` : 'NO FIX'}
                </div>
                {gps?.lat && <div style={{ fontSize: 10, color: '#5a7a96', marginTop: 2 }}>{gps.lat?.toFixed(5)}, {gps.lon?.toFixed(5)}</div>}
              </div>
            </div>

            <div className="settings-section-label" style={{ marginTop: 12 }}>📱 Phone GPS</div>
            <div style={{ fontSize: 10, color: '#5a7a96', lineHeight: 1.6, marginBottom: 6 }}>
              Open this URL on your phone (must be on same Wi-Fi/hotspot):
            </div>
            <div className="gps-url-box">
              <span>{laptopUrl}</span>
              <button className="copy-btn" onClick={() => navigator.clipboard.writeText(laptopUrl)}>COPY</button>
            </div>
            <div style={{ fontSize: 10, color: '#5a7a96', marginTop: 4 }}>
              The phone page streams GPS back here automatically.
            </div>
          </div>

          <div className="settings-section">
            <div className="section-label">Scanning</div>
            {values && FIELD_DEFS.map((f) => (
              <div key={f.key} className="settings-row">
                <label className="settings-label">{f.label}</label>
                {f.type === 'bool' ? (
                  <div
                    className={`toggle${values[f.key] ? ' on' : ''}`}
                    onClick={() => set(f.key, !values[f.key])}
                    role="switch"
                    aria-checked={values[f.key]}
                  />
                ) : (
                  <div className="settings-num-row">
                    <input
                      type="range"
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      value={values[f.key] ?? f.min}
                      onChange={(e) => set(f.key, parseFloat(e.target.value))}
                      className="settings-slider"
                    />
                    <span className="settings-val">{values[f.key]} {f.unit}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="settings-section">
            <div className="section-label">Alert Sounds</div>

            <div className="settings-row">
              <label className="settings-label">📷 Watcher tone</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  className="sound-select"
                  value={watcherSound}
                  onChange={(e) => { setWatcherSound(e.target.value); localStorage.setItem('sfm_watcher_sound', e.target.value) }}
                >
                  {WATCHER_SOUND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button className="sound-preview-btn" onClick={() => { resumeAudio(); playWatcherAlert(0.6, watcherSound) }}>▶</button>
              </div>
            </div>

            <div className="settings-row">
              <label className="settings-label">🚔 Stopper tone</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  className="sound-select"
                  value={stopperSound}
                  onChange={(e) => { setStopperSound(e.target.value); localStorage.setItem('sfm_stopper_sound', e.target.value) }}
                >
                  {STOPPER_SOUND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button className="sound-preview-btn" onClick={() => { resumeAudio(); playStopperAlert(0.6, stopperSound) }}>▶</button>
              </div>
            </div>
          </div>

          <button className="btn-save" onClick={handleSave}>
            {saved ? '✓ SAVED' : 'SAVE SETTINGS'}
          </button>

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => { onClose(); onOpenUserModal('auth') }}
              style={{
                width: '100%', padding: '12px', borderRadius: 8,
                background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.2)',
                color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              🔐 LOGIN
            </button>

            <button
              onClick={() => { onClose(); onOpenSystemAccess?.() }}
              style={{
                width: '100%', padding: '12px', borderRadius: 8,
                background: 'rgba(255, 69, 58, 0.05)', border: '1px solid rgba(255, 69, 58, 0.15)',
                color: '#FF453A', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {configured ? '⚡ DEV ELEVATION' : '⚡ FORTRESS LOGIN SETUP'}
            </button>

            {isDev && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ color: 'rgba(180,195,220,0.6)', fontSize: 11, lineHeight: 1.5 }}>
                  Elevated as {userEmail || 'operator'}
                </div>
                <button
                  onClick={decommission}
                  style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                    color: '#8E8E93', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  SIGN OUT
                </button>
              </div>
            )}
          </div>

          <p style={{ fontSize: 10, color: '#5a7a96', textAlign: 'center', marginTop: 8 }}>
            Scanning must be restarted for adapter changes to take effect.
          </p>
        </div>
      </div>
    </div>
  )
}
