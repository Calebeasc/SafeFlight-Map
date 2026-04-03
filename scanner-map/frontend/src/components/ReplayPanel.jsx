/**
 * ReplayPanel — Feature 1: Encounter Replay Mode
 *
 * Shows a bottom-of-screen overlay with:
 *  - Session picker (past drive sessions from /replay/sessions)
 *  - Timeline scrubber  (range input from session start to end)
 *  - Playback controls  (Play/Pause, speed ×0.5 ×1 ×2 ×5 ×10)
 *  - Current replay time display
 *
 * Props:
 *   onClose()                      — exit replay mode
 *   onReplayUpdate({cursor, encounters, route, playing})
 *                                  — parent calls this to update map
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'

const SPEEDS = [0.5, 1, 2, 5, 10, 30]

function fmtTime(ms) {
  const d = new Date(ms)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export default function ReplayPanel({ onClose, onReplayUpdate }) {
  const [sessions,        setSessions]        = useState([])
  const [selectedIdx,     setSelectedIdx]     = useState(0)
  const [replayData,      setReplayData]      = useState(null)
  const [loading,         setLoading]         = useState(false)
  const [cursor,          setCursor]          = useState(0)   // Unix ms
  const [playing,         setPlaying]         = useState(false)
  const [speedIdx,        setSpeedIdx]        = useState(1)   // index into SPEEDS

  const playRef      = useRef(false)
  const cursorRef    = useRef(0)
  const dataRef      = useRef(null)
  const intervalRef  = useRef(null)

  // Keep refs in sync with state for the animation loop
  useEffect(() => { playRef.current   = playing }, [playing])
  useEffect(() => { cursorRef.current = cursor  }, [cursor])
  useEffect(() => { dataRef.current   = replayData }, [replayData])

  // Load sessions on mount
  useEffect(() => {
    fetch('/replay/sessions')
      .then(r => r.json())
      .then(d => setSessions(d.sessions || []))
      .catch(() => {})
  }, [])

  const loadSession = useCallback(async (idx) => {
    const sess = sessions[idx]
    if (!sess) return
    setLoading(true)
    setPlaying(false)
    playRef.current = false
    try {
      const r = await fetch(`/replay/data?start_ms=${sess.start_ms}&end_ms=${sess.end_ms}`)
      if (!r.ok) return
      const data = await r.json()
      setReplayData(data)
      setCursor(sess.start_ms)
      cursorRef.current = sess.start_ms
      // Immediately push empty state to map
      onReplayUpdate({ cursor: sess.start_ms, data, playing: false })
    } catch {}
    finally { setLoading(false) }
  }, [sessions, onReplayUpdate])

  // Load first session when sessions arrive
  useEffect(() => {
    if (sessions.length > 0 && !replayData) loadSession(0)
  }, [sessions]) // eslint-disable-line react-hooks/exhaustive-deps

  // Animation loop
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (!playing) return

    const TICK_MS = 100   // real-ms per tick
    const speed   = SPEEDS[speedIdx]
    const advMs   = TICK_MS * speed * 1000  // virtual ms advanced per tick

    intervalRef.current = setInterval(() => {
      const data = dataRef.current
      if (!data) return
      const nextCursor = cursorRef.current + advMs
      const endMs = data.end_ms
      if (nextCursor >= endMs) {
        cursorRef.current = endMs
        setCursor(endMs)
        setPlaying(false)
        playRef.current = false
        onReplayUpdate({ cursor: endMs, data, playing: false })
        clearInterval(intervalRef.current)
        return
      }
      cursorRef.current = nextCursor
      setCursor(nextCursor)
      onReplayUpdate({ cursor: nextCursor, data, playing: true })
    }, TICK_MS)

    return () => clearInterval(intervalRef.current)
  }, [playing, speedIdx, onReplayUpdate])

  const handleScrub = (e) => {
    const val = Number(e.target.value)
    setCursor(val)
    cursorRef.current = val
    if (replayData) onReplayUpdate({ cursor: val, data: replayData, playing })
  }

  const handleSessionChange = (e) => {
    const idx = Number(e.target.value)
    setSelectedIdx(idx)
    loadSession(idx)
  }

  const togglePlay = () => {
    if (!replayData) return
    // If at end, restart
    if (cursor >= replayData.end_ms) {
      setCursor(replayData.start_ms)
      cursorRef.current = replayData.start_ms
    }
    setPlaying(v => !v)
  }

  const session = sessions[selectedIdx]
  const progress = replayData
    ? Math.max(0, Math.min(1, (cursor - replayData.start_ms) / Math.max(1, replayData.end_ms - replayData.start_ms)))
    : 0

  // Count what's visible at this cursor
  const visibleEncounters = replayData
    ? replayData.encounters.filter(e => e.peak_ts_ms <= cursor)
    : []
  const visibleRoute = replayData
    ? replayData.route.filter(p => p.ts <= cursor)
    : []

  return (
    <div className="replay-panel">
      {/* Header row */}
      <div className="replay-header">
        <div className="replay-title">
          <span className="replay-badge">⏮ REPLAY</span>
          {session && (
            <span className="replay-session-label">
              {session.label} · {fmtDuration(session.end_ms - session.start_ms)}
            </span>
          )}
        </div>
        <button className="replay-close-btn" onClick={onClose}>✕ Exit Replay</button>
      </div>

      {/* Session picker */}
      {sessions.length > 1 && (
        <div className="replay-session-row">
          <label className="replay-label">Session</label>
          <select
            className="replay-select"
            value={selectedIdx}
            onChange={handleSessionChange}
            disabled={loading}
          >
            {sessions.map((s, i) => (
              <option key={s.start_ms} value={i}>
                {s.label} ({s.encounter_count} enc · {s.route_count} pts)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Scrubber */}
      <div className="replay-scrubber-row">
        <span className="replay-time">{replayData ? fmtTime(cursor) : '—'}</span>
        <input
          type="range"
          className="replay-scrubber"
          min={replayData?.start_ms || 0}
          max={replayData?.end_ms   || 1}
          value={cursor}
          onChange={handleScrub}
          disabled={!replayData || loading}
        />
        <span className="replay-time">{replayData ? fmtTime(replayData.end_ms) : '—'}</span>
      </div>

      {/* Progress bar */}
      <div className="replay-progress-track">
        <div className="replay-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Controls row */}
      <div className="replay-controls">
        <button
          className={`replay-play-btn${playing ? ' playing' : ''}`}
          onClick={togglePlay}
          disabled={!replayData || loading}
        >
          {loading ? '⌛' : playing ? '⏸' : '▶'}
        </button>

        <div className="replay-speed-row">
          <span className="replay-label">Speed</span>
          {SPEEDS.map((s, i) => (
            <button
              key={s}
              className={`replay-speed-btn${speedIdx === i ? ' active' : ''}`}
              onClick={() => setSpeedIdx(i)}
            >
              {s < 1 ? `×${s}` : `×${s}`}
            </button>
          ))}
        </div>

        <div className="replay-counts">
          <span className="replay-count-pill watcher">
            📷 {visibleEncounters.filter(e => e.label === 'Fun-Watcher').length}
          </span>
          <span className="replay-count-pill stopper">
            🚔 {visibleEncounters.filter(e => e.label === 'Fun-Stopper').length}
          </span>
          <span className="replay-count-pill route">
            📍 {visibleRoute.length}
          </span>
        </div>
      </div>
    </div>
  )
}
