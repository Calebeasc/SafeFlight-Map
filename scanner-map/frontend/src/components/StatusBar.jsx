import React from 'react'

export default function StatusBar({ running, watcherCount, stopperCount }) {
  return (
    <div className="status-bar">
      <div className={`status-dot${running ? ' active' : ''}`} />
      <span style={{ fontWeight: 600, color: running ? 'var(--text)' : 'var(--text-dim)' }}>
        {running ? 'Scanning' : 'Idle'}
      </span>
      <span style={{ marginLeft: 'auto', color: 'var(--watcher)', fontWeight: 600, fontSize: 13 }}>
        📷 {watcherCount}
      </span>
      <span style={{ color: 'var(--stopper)', fontWeight: 600, fontSize: 13 }}>
        🚔 {stopperCount}
      </span>
    </div>
  )
}
