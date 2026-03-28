import React from 'react'

const ADAPTER_COLORS = { wifi: '#00d4ff', ble: '#8866ff', fake: '#ffaa00' }

export default function StatusBar({ running, lastPoll, cellCount, userPos, adapters = [] }) {
  return (
    <div className="status-bar">
      <div className={`status-dot${running ? ' active' : ''}`} />
      <span>{running ? 'SCANNING' : 'IDLE'}</span>
      {lastPoll && <span>Updated {lastPoll.toLocaleTimeString()}</span>}
      <span>{cellCount} cells</span>
      {adapters.map(a => (
        <span key={a} style={{ color: ADAPTER_COLORS[a] || '#aaa', fontSize: 10 }}>
          {a === 'wifi' ? '📶' : a === 'ble' ? '🔵' : '🧪'} {a.toUpperCase()}
        </span>
      ))}
      {userPos
        ? <span style={{ color:'#00d4ff' }}>🏍 GPS</span>
        : <span style={{ color:'#5a7a96' }}>🏍 NO GPS</span>}
      <div className="legend-row">
        <div className="legend-item"><div className="legend-dot" style={{ background:'#2979ff' }} /><span>📷 Watcher</span></div>
        <div className="legend-item"><div className="legend-dot" style={{ background:'#ff4d6d' }} /><span>🚔 Stopper</span></div>
      </div>
    </div>
  )
}
