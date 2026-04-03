import React, { useState, useEffect, useCallback } from 'react'

function fmt(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`
  return `${(bytes/1048576).toFixed(2)} MB`
}

function fmtDate(ms) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString()
}

export default function DataPanel({ onClose }) {
  const [stats, setStats]     = useState(null)
  const [clearing, setClearing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [done, setDone]       = useState(false)

  const loadStats = useCallback(() => {
    fetch('/stats').then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  const clearMyRoute = async () => {
    setClearing(true)
    setConfirm(false)
    try {
      await fetch('/data/clear?table=route_points', { method: 'POST' })
      setDone(true)
      setTimeout(() => setDone(false), 3000)
      setTimeout(loadStats, 300)
    } finally { setClearing(false) }
  }

  const routeCount = stats?.route_points ?? '…'

  return (
    <div className="settings-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="settings-panel">

        <div className="settings-header">
          <div>
            <div className="settings-title">🛣 My GPS Data</div>
            <div className="settings-sub">Your personal route track</div>
          </div>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">

          {/* DB overview (read-only) */}
          {stats && (
            <section className="settings-section">
              <div className="settings-section-label">Database Overview</div>
              <div className="db-overview">
                <div className="db-stat">
                  <span className="db-val">{fmt(stats.db_size_bytes)}</span>
                  <span className="db-lbl">Total Size</span>
                </div>
                <div className="db-stat">
                  <span className="db-val">{(stats.raw_observations+stats.encounters+stats.heat_cells+stats.route_points).toLocaleString()}</span>
                  <span className="db-lbl">Total Rows</span>
                </div>
                <div className="db-stat">
                  <span className="db-val" style={{fontSize:11}}>{fmtDate(stats.oldest_obs_ms)}</span>
                  <span className="db-lbl">Oldest Data</span>
                </div>
              </div>
            </section>
          )}

          {/* Route points — only thing user can clear */}
          <section className="settings-section">
            <div className="settings-section-label">Your Route Track</div>
            <div className="data-table-row">
              <div className="data-table-info">
                <span className="data-table-icon">🛣</span>
                <div>
                  <div className="data-table-name">GPS Breadcrumbs</div>
                  <div className="data-table-desc">Your personal movement track — {typeof routeCount === 'number' ? routeCount.toLocaleString() : routeCount} points recorded</div>
                </div>
              </div>
              <div className="data-table-right">
                {confirm ? (
                  <div className="confirm-row">
                    <span className="confirm-label">Sure?</span>
                    <button className="btn-confirm-yes" onClick={clearMyRoute} disabled={clearing}>
                      {clearing ? '…' : 'Yes'}
                    </button>
                    <button className="btn-confirm-no" onClick={() => setConfirm(false)}>No</button>
                  </div>
                ) : (
                  <button
                    className={`btn-clear${clearing ? ' loading' : ''}`}
                    onClick={() => setConfirm(true)}
                    disabled={clearing || routeCount === 0}
                  >
                    {done ? '✓ Cleared' : clearing ? '…' : 'Clear'}
                  </button>
                )}
              </div>
            </div>
            <div className="settings-tip" style={{marginTop:8}}>
              This only removes your GPS trail — scan data, detected devices, and heat maps are managed by the system admin.
            </div>
          </section>

          {/* Scan data info (read-only) */}
          <section className="settings-section">
            <div className="settings-section-label">Scan Data (Read Only)</div>
            {[
              { icon:'📡', label:'Raw Observations', key:'raw_observations', desc:'Individual scan hits' },
              { icon:'📍', label:'Encounters',       key:'encounters',       desc:'Aggregated detection events' },
              { icon:'🔥', label:'Heat Map Grid',    key:'heat_cells',       desc:'Signal intensity cells' },
            ].map(t => (
              <div key={t.key} className="data-table-row" style={{opacity:0.6}}>
                <div className="data-table-info">
                  <span className="data-table-icon">{t.icon}</span>
                  <div>
                    <div className="data-table-name">{t.label}</div>
                    <div className="data-table-desc">{t.desc}</div>
                  </div>
                </div>
                <div className="data-table-right">
                  <span className="data-table-count">
                    {typeof stats?.[t.key] === 'number' ? stats[t.key].toLocaleString() : '…'}
                  </span>
                  <span style={{fontSize:10, color:'var(--text-dim)', marginLeft:6}}>🔒</span>
                </div>
              </div>
            ))}
            <div className="settings-tip" style={{marginTop:6}}>
              Scan data is managed by the admin via the dev dashboard.
            </div>
          </section>

          <button className="btn-refresh-stats" onClick={loadStats}>↻ Refresh Stats</button>

        </div>

        <div className="settings-footer">
          <button className="btn-save" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
