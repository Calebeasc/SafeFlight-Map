import React, { useState, useEffect, useCallback, useRef } from 'react'
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
import StatusBar from './components/StatusBar'
import SettingsPanel from './components/SettingsPanel'
import { playWatcherAlert, playStopperAlert, playGenericAlert, resumeAudio } from './utils/audio'
import './App.css'

const API = ''

export default function App() {
  const [running, setRunning]         = useState(false)
  const [timeRange, setTimeRange]     = useState(3600000)
  const [heatCells, setHeatCells]     = useState([])
  const [encounters, setEncounters]   = useState([])
  const [showMarkers, setShowMarkers] = useState(true)
  const [loading, setLoading]         = useState(false)
  const [lastPoll, setLastPoll]       = useState(null)
  const [userPos, setUserPos]         = useState(null)
  const [alerts, setAlerts]           = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [adapters, setAdapters]       = useState([])
  const [alertRadius, setAlertRadius] = useState(300)
  const alertIdRef = useRef(0)

  // Load alert radius from settings on mount
  useEffect(() => {
    fetch('/settings').then(r => r.json()).then(s => {
      if (s.alert_radius_m) setAlertRadius(s.alert_radius_m)
    }).catch(() => {})
  }, [])

  // Unlock audio on first click anywhere
  useEffect(() => {
    const unlock = () => { resumeAudio(); document.removeEventListener('click', unlock) }
    document.addEventListener('click', unlock)
    return () => document.removeEventListener('click', unlock)
  }, [])

  // Geolocation
  useEffect(() => {
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      pos => setUserPos({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => console.warn('GPS:', err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // Notification permission
  useEffect(() => {
    if (Notification.permission === 'default') Notification.requestPermission()
  }, [])

  // Alert handler
  const handleAlert = useCallback((alert) => {
    const id = ++alertIdRef.current
    setAlerts(prev => [...prev.slice(-4), { ...alert, id }])

    // Audio
    if (alert.type === 'Fun-Watcher') playWatcherAlert()
    else if (alert.type === 'Fun-Stopper') playStopperAlert()
    else playGenericAlert()

    // Browser notification
    if (Notification.permission === 'granted') {
      new Notification(`${alert.type === 'Fun-Watcher' ? '📷' : '🚔'} ${alert.type} nearby`, {
        body: `${alert.distance}m · ${alert.rssi?.toFixed(0)} dBm`,
        silent: true,
      })
    }
    setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 8000)
  }, [])

  // Poll backend
  const refresh = useCallback(async () => {
    const sinceParam = timeRange === 0 ? '' : `since=${Date.now() - timeRange}`
    try {
      const [hRes, eRes] = await Promise.all([
        fetch(`${API}/heatmap?${sinceParam}`),
        fetch(`${API}/encounters?${sinceParam}&limit=30`),
      ])
      if (hRes.ok) setHeatCells((await hRes.json()).cells || [])
      if (eRes.ok) setEncounters((await eRes.json()).encounters || [])
      setLastPoll(new Date())
    } catch {}
  }, [timeRange])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => {
    fetch(`${API}/control/status`).then(r => r.json()).then(d => setRunning(d.running)).catch(() => {})
  }, [])

  const toggleScanning = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}${running ? '/control/stop' : '/control/start'}`, { method: 'POST' })
      const data = await res.json()
      setRunning(!running)
      if (data.adapters) setAdapters(data.adapters)
    } finally { setLoading(false) }
  }

  return (
    <div className="app-shell">
      {/* Alert toasts */}
      <div className="alert-stack">
        {alerts.map(a => (
          <div key={a.id} className={`alert-toast alert-${a.color}`}>
            <span className="alert-icon">{a.type === 'Fun-Watcher' ? '📷' : a.type === 'Fun-Stopper' ? '🚔' : '⚠'}</span>
            <div className="alert-body">
              <div className="alert-title">{a.type} DETECTED</div>
              <div className="alert-sub">{a.distance}m away &nbsp;·&nbsp; {a.rssi?.toFixed(0)} dBm</div>
            </div>
            <button className="alert-close" onClick={() => setAlerts(p => p.filter(x => x.id !== a.id))}>✕</button>
          </div>
        ))}
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      <Sidebar
        running={running} loading={loading}
        timeRange={timeRange} setTimeRange={setTimeRange}
        showMarkers={showMarkers} setShowMarkers={setShowMarkers}
        onToggle={toggleScanning}
        heatCells={heatCells} encounters={encounters}
        userPos={userPos} adapters={adapters}
        onSettings={() => setShowSettings(true)}
        api={API}
      />
      <div className="map-area">
        <MapView
          heatCells={heatCells} encounters={encounters}
          showMarkers={showMarkers} userPos={userPos}
          onAlert={handleAlert} alertRadius={alertRadius}
        />
        <StatusBar running={running} lastPoll={lastPoll} cellCount={heatCells.length} userPos={userPos} adapters={adapters} />
      </div>
    </div>
  )
}
