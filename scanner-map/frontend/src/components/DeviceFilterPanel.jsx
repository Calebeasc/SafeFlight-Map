/**
 * Device Signal Filter panel — shared between DevPanel (Devices tab)
 * and user-facing Sidebar (Devices tab).
 *
 * Draft pattern: clicking tiles updates local state only.
 * "Save Changes" button commits to the backend via PUT /devices/filter.
 */
import React, { useState, useEffect, useCallback } from 'react'

const EMOJI = {
  ring:'🔔', axon:'📹', flock:'📷', drone:'🚁', smartglasses:'🕶️',
  phone:'📱', tablet:'📟', laptop:'💻', headphones:'🎧', speaker:'🔊',
  tv:'📺', streaming:'📡', gaming:'🎮', smartwatch:'⌚', smarthome:'🏠',
  car:'🚗', wifi_ap:'📶', unknown:'❓',
}

function chipBtn(color, disabled) {
  return {
    background: disabled ? 'transparent' : 'none',
    border: `1px solid ${disabled ? 'rgba(84,84,88,0.4)' : color}`,
    borderRadius: 8,
    color: disabled ? 'rgba(84,84,88,0.6)' : color,
    fontFamily: '-apple-system,BlinkMacSystemFont,system-ui,sans-serif',
    fontSize: 11,
    fontWeight: 600,
    padding: '5px 10px',
    cursor: disabled ? 'default' : 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  }
}

export default function DeviceFilterPanel({ encounters = [], compact = false }) {
  const [serverTypes, setServerTypes] = useState([])
  const [draftTypes,  setDraftTypes]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/devices/filter')
      const d = await r.json()
      const types = d.types || []
      setServerTypes(types.map(t => ({ ...t })))
      setDraftTypes(types.map(t => ({ ...t })))
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Encounter counts per type
  const counts = {}
  for (const enc of encounters) {
    const k = enc.device_type
      || (enc.label === 'Fun-Watcher' ? '__watcher'
        : enc.label === 'Fun-Stopper' ? '__stopper' : '__misc')
    counts[k] = (counts[k] || 0) + 1
  }

  const isDirty = draftTypes.some((dt, i) => serverTypes[i] && dt.enabled !== serverTypes[i].enabled)

  const toggleDraft = (key) => {
    setDraftTypes(ts => ts.map(t => t.key === key ? { ...t, enabled: !t.enabled } : t))
  }

  const toggleAllDraft = (enabled) => {
    setDraftTypes(ts => ts.map(t => ({ ...t, enabled })))
  }

  const save = async () => {
    setSaving(true)
    const map = {}
    draftTypes.forEach(t => { map[t.key] = t.enabled })
    try {
      await fetch('/devices/filter', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: map }),
      })
      setServerTypes(draftTypes.map(t => ({ ...t })))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    setSaving(false)
  }

  const allOn  = draftTypes.every(t => t.enabled)
  const allOff = draftTypes.every(t => !t.enabled)

  if (loading) return (
    <div style={{ color: 'rgba(235,235,245,0.4)', fontSize: 13, padding: 20, textAlign: 'center' }}>
      Loading…
    </div>
  )

  const labelStyle = {
    fontSize: 11, fontWeight: 700,
    color: 'rgba(235,235,245,0.3)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 10 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <span style={labelStyle}>Device Signal Filter</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={chipBtn('#30D158', allOn)}  onClick={() => !allOn  && toggleAllDraft(true)}>All On</button>
          <button style={chipBtn('#FF453A', allOff)} onClick={() => !allOff && toggleAllDraft(false)}>All Off</button>
        </div>
      </div>

      {/* ── Info note (full only) ── */}
      {!compact && (
        <div style={{
          background: 'rgba(10,132,255,0.08)',
          border: '1px solid rgba(10,132,255,0.20)',
          borderRadius: 10, padding: '8px 12px',
          fontSize: 12, color: 'rgba(235,235,245,0.55)', lineHeight: 1.6,
        }}>
          Controls which nearby devices appear on the map.
          Allowlisted targets (Fun-Watcher, Fun-Stopper) are always logged.
        </div>
      )}

      {/* ── Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: compact ? 6 : 8 }}>
        {draftTypes.map(t => {
          const count = counts[t.key] || 0
          return (
            <div
              key={t.key}
              onClick={() => toggleDraft(t.key)}
              style={{
                background:   t.enabled ? `${t.color}14` : 'rgba(44,44,46,0.9)',
                border:       `1px solid ${t.enabled ? t.color + '55' : 'rgba(84,84,88,0.45)'}`,
                borderRadius: compact ? 10 : 12,
                padding:      compact ? '8px 10px' : '12px 14px',
                cursor:       'pointer',
                transition:   'all 0.15s',
                display:      'flex',
                alignItems:   'center',
                gap:          compact ? 6 : 10,
              }}
            >
              {/* Check circle */}
              <div style={{
                width: compact ? 14 : 18, height: compact ? 14 : 18,
                borderRadius: '50%', flexShrink: 0,
                background:  t.enabled ? t.color : 'transparent',
                border:      `2px solid ${t.enabled ? t.color : 'rgba(235,235,245,0.3)'}`,
                display:     'flex', alignItems: 'center', justifyContent: 'center',
                transition:  'all 0.15s',
              }}>
                {t.enabled && (
                  <div style={{ width: compact ? 5 : 7, height: compact ? 5 : 7, borderRadius: '50%', background: '#000' }} />
                )}
              </div>

              {/* Label */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: compact ? 13 : 16 }}>{EMOJI[t.key] || '●'}</span>
                  <span style={{
                    fontSize: compact ? 11 : 13,
                    fontWeight: 600,
                    color: t.enabled ? '#fff' : 'rgba(235,235,245,0.45)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{t.label}</span>
                </div>
                {!compact && (
                  <div style={{ fontSize: 10, color: t.enabled ? t.color : 'rgba(235,235,245,0.25)', marginTop: 2 }}>
                    {count > 0 ? `${count} encounter${count !== 1 ? 's' : ''}` : 'none seen yet'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Save button ── */}
      <button
        onClick={isDirty && !saving ? save : undefined}
        style={{
          background:   saved  ? 'rgba(48,209,88,0.15)'
                       : isDirty ? 'rgba(10,132,255,0.15)' : 'rgba(84,84,88,0.08)',
          border:       `1px solid ${saved ? '#30D158' : isDirty ? '#0A84FF' : 'rgba(84,84,88,0.35)'}`,
          borderRadius: 10,
          color:        saved  ? '#30D158' : isDirty ? '#0A84FF' : 'rgba(84,84,88,0.5)',
          fontFamily:   '-apple-system,BlinkMacSystemFont,system-ui,sans-serif',
          fontSize:     14, fontWeight: 600,
          padding:      '10px 0', width: '100%',
          cursor:       isDirty && !saving ? 'pointer' : 'default',
          transition:   'all 0.2s',
        }}
      >
        {saved ? '✓ Saved' : saving ? 'Saving…' : isDirty ? '💾 Save Changes' : 'No Changes'}
      </button>

      <div style={{ fontSize: 10, color: 'rgba(235,235,245,0.2)', textAlign: 'center' }}>
        Tap to toggle · Save applies immediately
      </div>
    </div>
  )
}
