import React from 'react'

const TIME_RANGES = [
  { label: '15m', ms: 15 * 60 * 1000 },
  { label: '1h',  ms: 60 * 60 * 1000 },
  { label: '6h',  ms: 6 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: 'ALL', ms: 0 },
]

function fmt(enc) {
  return `${new Date(enc.peak_ts_ms).toLocaleTimeString()} · ${enc.rssi_max?.toFixed(0)} dBm · ${enc.hit_count} hits`
}

const ADAPTER_LABELS = { wifi: '📶 Wi-Fi', ble: '🔵 BLE', fake: '🧪 Demo' }

export default function Sidebar({
  running, loading, timeRange, setTimeRange,
  showMarkers, setShowMarkers, onToggle,
  heatCells, encounters, userPos, adapters,
  onSettings, api,
}) {
  const watchers  = encounters.filter(e => e.label === 'Fun-Watcher')
  const stoppers  = encounters.filter(e => e.label === 'Fun-Stopper')

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h1>Invincible.Inc</h1>
          <button className="gear-btn" onClick={onSettings} title="Settings">⚙</button>
        </div>
        <p>Signal Scanner · Authorized Targets Only</p>
        {adapters.length > 0 && (
          <div className="adapter-pills">
            {adapters.map(a => <span key={a} className={`adapter-pill ${a}`}>{ADAPTER_LABELS[a] || a}</span>)}
          </div>
        )}
      </div>

      <div className="sidebar-body">
        <button
          className={`btn-scan${running ? ' running' : ''}${loading ? ' loading' : ''}`}
          onClick={onToggle} disabled={loading}
        >
          {loading ? 'WAIT...' : running ? '⬛ STOP SCANNING' : '▶ START SCANNING'}
        </button>

        <div>
          <div className="section-label">Time Range</div>
          <div className="range-row">
            {TIME_RANGES.map(r => (
              <button key={r.ms} className={`range-btn${timeRange === r.ms ? ' active' : ''}`} onClick={() => setTimeRange(r.ms)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="section-label">Display</div>
          <div className="toggle-row">
            <label>Encounter markers</label>
            <div className={`toggle${showMarkers ? ' on' : ''}`} onClick={() => setShowMarkers(v => !v)} role="switch" aria-checked={showMarkers} />
          </div>
        </div>

        <div>
          <div className="section-label">Stats</div>
          <div className="stats-grid">
            <div className="stat-card"><div className="val">{heatCells.length}</div><div className="lbl">Heat Cells</div></div>
            <div className="stat-card"><div className="val">{encounters.length}</div><div className="lbl">Encounters</div></div>
            <div className="stat-card" style={{ borderLeftColor:'var(--watcher)', borderLeftWidth:3 }}>
              <div className="val" style={{ color:'var(--watcher)' }}>{watchers.length}</div>
              <div className="lbl">📷 Fun-Watcher</div>
            </div>
            <div className="stat-card" style={{ borderLeftColor:'var(--stopper)', borderLeftWidth:3 }}>
              <div className="val" style={{ color:'var(--stopper)' }}>{stoppers.length}</div>
              <div className="lbl">🚔 Fun-Stopper</div>
            </div>
          </div>
        </div>

        {userPos && (
          <div>
            <div className="section-label">Position 🏍</div>
            <div className="stat-card">
              <div style={{ color:'var(--accent)', fontSize:11 }}>{userPos.lat.toFixed(5)}, {userPos.lon.toFixed(5)}</div>
              <div className="lbl">Browser GPS active</div>
            </div>
          </div>
        )}

        {encounters.length > 0 && (
          <div>
            <div className="section-label">Recent Encounters</div>
            <div className="enc-list">
              {encounters.slice(0, 12).map(enc => (
                <div key={enc.id} className={`enc-item${enc.label === 'Fun-Watcher' ? ' watcher' : enc.label === 'Fun-Stopper' ? ' stopper' : ''}`}>
                  <div className="enc-label">{enc.label === 'Fun-Watcher' ? '📷 ' : enc.label === 'Fun-Stopper' ? '🚔 ' : ''}{enc.label || 'Target'}</div>
                  <div className="enc-meta">{fmt(enc)}</div>
                  {enc.show_timestamp && <div className="enc-meta" style={{ color:'var(--stopper)' }}>{new Date(enc.peak_ts_ms).toLocaleString()}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="section-label">Export</div>
          <div className="export-row">
            <a href={`${api}/export/csv`} className="btn-export" download>RAW CSV</a>
            <a href={`${api}/export/encounters`} className="btn-export" download>ENC CSV</a>
            <a href={`${api}/export/geojson`} className="btn-export" download>GEOJSON</a>
          </div>
        </div>
      </div>
    </aside>
  )
}
