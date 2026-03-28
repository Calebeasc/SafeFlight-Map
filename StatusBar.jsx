import React from 'react'

export default function StatusBar({ running, lastPoll, cellCount }) {
  return (
    <div className="status-bar">
      <div className={`status-dot${running ? ' active' : ''}`} />
      <span>{running ? 'SCANNING' : 'IDLE'}</span>
      {lastPoll && (
        <span>Last update: {lastPoll.toLocaleTimeString()}</span>
      )}
      <div className="legend-row">
        <div className="legend-item">
          <div className="legend-dot" style={{ background: '#2979ff' }} />
          <span>Fun-Watcher</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot" style={{ background: '#ff4d6d' }} />
          <span>Fun-Stopper</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot" style={{ background: '#00d4ff' }} />
          <span>Heat map</span>
        </div>
      </div>
    </div>
  )
}
