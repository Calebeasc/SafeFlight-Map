import React, { useState, useEffect, useCallback } from 'react'

const VEHICLE_EMOJI = { motorcycle: '🏍', car: '🚗', van: '🚐', truck: '🚛', bicycle: '🚴', foot: '🚶' }

const MPS_TO_MPH = 2.23694
const MPS_TO_KPH = 3.6

function fmt(mps) {
  const mph = (mps * MPS_TO_MPH).toFixed(1)
  const kph = (mps * MPS_TO_KPH).toFixed(1)
  return `${mph} mph  ·  ${kph} km/h`
}

function timeSince(ts_ms) {
  if (!ts_ms) return ''
  const s = Math.floor((Date.now() - ts_ms) / 1000)
  if (s < 60)   return `${s}s ago`
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

const MEDAL = ['🥇', '🥈', '🥉']

export default function LeaderboardPanel({ onClose, myUsername }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/users/leaderboard')
      const d = await r.json()
      setEntries(d.leaderboard || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  // Refresh every 15 s
  useEffect(() => { const id = setInterval(load, 15000); return () => clearInterval(id) }, [load])

  const myEntry = entries.find(e => e.username === myUsername)
  const myRank  = myEntry ? entries.indexOf(myEntry) + 1 : null

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#0b0f14',
      display: 'flex', flexDirection: 'column', zIndex: 1100,
      fontFamily: 'monospace',
    }}>
      {/* Header — padded for Dynamic Island / notch */}
      <div style={{
        background: '#111820', borderBottom: '1px solid #1e2d3d',
        paddingTop: 'max(14px, calc(env(safe-area-inset-top, 0px) + 14px))',
        paddingBottom: '14px', paddingLeft: '18px', paddingRight: '18px',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🏆</span>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#c8d8e8' }}>Top Speed Leaderboard</span>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: '1px solid #1e2d3d', borderRadius: 8,
          color: '#5a7a96', fontSize: 18, width: 34, height: 34,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>
      </div>

      {/* Your rank badge (if on board) */}
      {myEntry && (
        <div style={{
          background: 'rgba(0,212,255,0.07)', borderBottom: '1px solid rgba(0,212,255,0.15)',
          padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <span style={{ fontSize: 22 }}>{MEDAL[myRank - 1] || `#${myRank}`}</span>
          <div>
            <div style={{ color: '#00d4ff', fontWeight: 700, fontSize: 14 }}>Your rank: #{myRank}</div>
            <div style={{ color: '#5a7a96', fontSize: 12 }}>{fmt(myEntry.top_speed_mps)}</div>
          </div>
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && (
          <div style={{ color: '#5a7a96', textAlign: 'center', marginTop: 40, fontSize: 14 }}>Loading…</div>
        )}
        {!loading && entries.length === 0 && (
          <div style={{ color: '#5a7a96', textAlign: 'center', marginTop: 40, fontSize: 14 }}>
            No speed records yet — get moving!
          </div>
        )}
        {entries.map((e, i) => {
          const isMe = e.username === myUsername
          const medal = MEDAL[i] || null
          return (
            <div key={e.username} style={{
              background: isMe ? 'rgba(0,212,255,0.08)' : '#111820',
              border: `1px solid ${isMe ? 'rgba(0,212,255,0.3)' : '#1e2d3d'}`,
              borderRadius: 10, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              {/* Rank */}
              <div style={{
                minWidth: 36, textAlign: 'center',
                fontSize: medal ? 22 : 15,
                color: medal ? undefined : '#5a7a96',
                fontWeight: 700,
              }}>
                {medal || `#${i + 1}`}
              </div>

              {/* Name + vehicle */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                  <span style={{ fontSize: 16 }}>{VEHICLE_EMOJI[e.vehicle] || '🏍'}</span>
                  <span style={{
                    color: isMe ? '#00d4ff' : '#c8d8e8',
                    fontWeight: isMe ? 700 : 600,
                    fontSize: 15,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {e.username}
                    {isMe && <span style={{ color: '#00d4ff', fontSize: 11, marginLeft: 6 }}>(you)</span>}
                  </span>
                </div>
                <div style={{ color: '#5a7a96', fontSize: 11 }}>{timeSince(e.top_speed_ts_ms)}</div>
              </div>

              {/* Speed */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  color: i === 0 ? '#ffd60a' : i === 1 ? '#e0e0e0' : i === 2 ? '#cd7f32' : '#00e676',
                  fontWeight: 700, fontSize: 16,
                }}>
                  {(e.top_speed_mps * MPS_TO_MPH).toFixed(1)}
                </div>
                <div style={{ color: '#5a7a96', fontSize: 10 }}>mph</div>
                <div style={{ color: '#3a5a6a', fontSize: 10 }}>
                  {(e.top_speed_mps * MPS_TO_KPH).toFixed(1)} km/h
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer — padded for home bar */}
      <div style={{
        padding: '10px 18px',
        paddingBottom: 'max(10px, calc(env(safe-area-inset-bottom, 0px) + 10px))',
        borderTop: '1px solid #1e2d3d',
        color: '#3a5a6a', fontSize: 11, textAlign: 'center', flexShrink: 0,
      }}>
        Updates every 15 s · Top speed is recorded automatically while riding
      </div>
    </div>
  )
}
