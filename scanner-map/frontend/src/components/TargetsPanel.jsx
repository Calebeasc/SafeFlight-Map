import React, { useState, useEffect } from 'react'

const EMPTY_WIFI = { bssid: '', label: '' }
const EMPTY_BLE  = { address: '', label: '' }

function macValid(s) {
  return /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(s.trim())
}

function OuiTag({ mac }) {
  const oui = mac.toUpperCase().slice(0,8)
  if (oui === '00:25:DF') return <span className="oui-tag watcher">📷 Fun-Watcher</span>
  if (oui === 'B4:1E:52') return <span className="oui-tag stopper">🚔 Fun-Stopper</span>
  return null
}

function TargetRow({ entry, type, onUpdate, onRemove }) {
  const idField = type === 'wifi' ? 'bssid' : 'address'
  const placeholder = type === 'wifi' ? 'AA:BB:CC:DD:EE:FF' : 'AA:BB:CC:DD:EE:FF'
  const valid = macValid(entry[idField] || '')
  const isDirty = entry[idField] !== ''

  return (
    <div className={`target-row${!valid && isDirty ? ' invalid' : ''}`}>
      <div className="target-fields">
        <div className="target-id-wrap">
          <input
            className="target-input target-id"
            placeholder={placeholder}
            value={entry[idField] || ''}
            onChange={e => onUpdate({ ...entry, [idField]: e.target.value })}
            spellCheck={false}
          />
          {valid && <OuiTag mac={entry[idField]} />}
        </div>
        <input
          className="target-input target-label"
          placeholder="Label (optional)"
          value={entry.label || ''}
          onChange={e => onUpdate({ ...entry, label: e.target.value })}
        />
      </div>
      <button className="target-remove" onClick={onRemove} title="Remove">✕</button>
    </div>
  )
}

export default function TargetsPanel({ onClose }) {
  const [wifi, setWifi]   = useState([])
  const [ble, setBle]     = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/targets').then(r => r.json()).then(data => {
      setWifi(data.wifi || [])
      setBle(data.ble  || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setError('')
    // Validate — filter out blank rows, check MACs
    const cleanWifi = wifi.filter(e => e.bssid?.trim())
    const cleanBle  = ble.filter(e  => e.address?.trim())
    const bad = [
      ...cleanWifi.filter(e => !macValid(e.bssid)),
      ...cleanBle.filter(e  => !macValid(e.address)),
    ]
    if (bad.length) {
      setError(`Invalid MAC address format on ${bad.length} row(s). Expected: AA:BB:CC:DD:EE:FF`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wifi: cleanWifi, ble: cleanBle }),
      })
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
      else setError('Save failed — check backend logs')
    } catch (e) {
      setError(String(e))
    } finally { setSaving(false) }
  }

  if (loading) return (
    <div className="settings-overlay">
      <div className="settings-panel"><div className="settings-loading">Loading targets…</div></div>
    </div>
  )

  return (
    <div className="settings-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="settings-panel targets-panel">

        <div className="settings-header">
          <div>
            <div className="settings-title">🎯 Targets</div>
            <div className="settings-sub">Allowlist — only these devices are tracked</div>
          </div>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">

          {/* Privacy notice */}
          <div className="privacy-notice">
            🔒 Identifiers are <b>HMAC-SHA256 hashed</b> before storage. Raw MACs never written to disk.
          </div>

          {/* Wi-Fi targets */}
          <section className="settings-section">
            <div className="settings-section-label" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>📡 Wi-Fi Targets ({wifi.length})</span>
              <button className="btn-add-target" onClick={() => setWifi(w => [...w, {...EMPTY_WIFI}])}>+ Add</button>
            </div>
            {wifi.length === 0
              ? <div className="target-empty">No Wi-Fi targets. Click + Add to add your router's BSSID.</div>
              : wifi.map((entry, i) => (
                <TargetRow key={i} entry={entry} type="wifi"
                  onUpdate={v => setWifi(w => w.map((x,j) => j===i?v:x))}
                  onRemove={() => setWifi(w => w.filter((_,j) => j!==i))} />
              ))
            }
          </section>

          {/* BLE targets */}
          <section className="settings-section">
            <div className="settings-section-label" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>🔵 BLE Targets ({ble.length})</span>
              <button className="btn-add-target" onClick={() => setBle(b => [...b, {...EMPTY_BLE}])}>+ Add</button>
            </div>
            {ble.length === 0
              ? <div className="target-empty">No BLE targets. Click + Add to add your beacon's MAC address.</div>
              : ble.map((entry, i) => (
                <TargetRow key={i} entry={entry} type="ble"
                  onUpdate={v => setBle(b => b.map((x,j) => j===i?v:x))}
                  onRemove={() => setBle(b => b.filter((_,j) => j!==i))} />
              ))
            }
          </section>

          {/* Help */}
          <section className="settings-section">
            <div className="settings-section-label">How to find your device's MAC</div>
            <div className="target-help">
              <div className="help-row"><span className="help-tag">Wi-Fi router</span> Check the sticker on the bottom of your router, or router admin page → Wireless settings</div>
              <div className="help-row"><span className="help-tag">Windows</span> Run: <code>netsh wlan show networks mode=bssid</code> in cmd</div>
              <div className="help-row"><span className="help-tag">BLE beacon</span> Use a BLE scanner app (e.g. nRF Connect) to find the MAC address</div>
              <div className="help-row"><span className="help-tag">OUIs</span> <span style={{color:'#2979ff'}}>00:25:DF</span> = Fun-Watcher · <span style={{color:'#ff4d6d'}}>B4:1E:52</span> = Fun-Stopper</div>
            </div>
          </section>

          {error && <div className="target-error">⚠ {error}</div>}
        </div>

        <div className="settings-footer">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className={`btn-save${saving?' loading':saved?' saved':''}`}
            onClick={save} disabled={saving}
          >
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Targets'}
          </button>
        </div>
      </div>
    </div>
  )
}
