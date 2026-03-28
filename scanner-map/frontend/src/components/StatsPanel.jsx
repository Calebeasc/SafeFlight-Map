import React, { useState, useEffect, useCallback } from 'react'

const MPS_TO_MPH = 2.23694
const MPS_TO_KPH = 3.6
const VEHICLE_EMOJI = { motorcycle:'🏍', car:'🚗', van:'🚐', truck:'🚛', bicycle:'🚴', foot:'🚶' }
const MEDAL = ['🥇', '🥈', '🥉']

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtSpeed(mps) {
  if (!mps) return '—'
  return (mps * MPS_TO_MPH).toFixed(1)
}
function fmtSpeedKph(mps) {
  if (!mps) return ''
  return `${(mps * MPS_TO_KPH).toFixed(1)} km/h`
}
function fmtTime(s) {
  if (!s) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}
function fmtDist(meters) {
  if (!meters || meters < 1) return '—'
  const mi = meters / 1609.34
  if (mi >= 0.1) return mi.toFixed(1)
  return `${Math.round(meters)} m`
}
function fmtDistUnit(meters) {
  if (!meters || meters < 160) return ''
  return meters / 1609.34 >= 0.1 ? 'mi' : ''
}
function fmtDistSub(meters) {
  if (!meters || meters < 1) return ''
  return `${(meters / 1000).toFixed(1)} km`
}
function timeSince(ts_ms) {
  if (!ts_ms) return ''
  const s = Math.floor((Date.now() - ts_ms) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function StatCard({ icon, label, value, unit, sub, color = '#00d4ff' }) {
  return (
    <div style={{
      background: '#111820',
      border: `1px solid ${color}28`,
      borderRadius: 12,
      padding: '14px 14px 12px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{
          fontSize: 10, color: '#5a7a96',
          textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: '#5a7a96' }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#3a5a6a', lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

function LeaderboardRow({ entry, rank, isMe }) {
  const medal = MEDAL[rank - 1]
  const speedColor = rank === 1 ? '#ffd60a' : rank === 2 ? '#e0e0e0' : rank === 3 ? '#cd7f32' : '#00e676'
  return (
    <div style={{
      background: isMe ? 'rgba(0,212,255,0.07)' : '#111820',
      border: `1px solid ${isMe ? 'rgba(0,212,255,0.28)' : '#1e2d3d'}`,
      borderRadius: 10, padding: '11px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      {/* Rank */}
      <div style={{
        minWidth: 34, textAlign: 'center',
        fontSize: medal ? 22 : 14,
        color: medal ? undefined : '#5a7a96',
        fontWeight: 700,
      }}>
        {medal || `#${rank}`}
      </div>

      {/* Name + time */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 15 }}>{VEHICLE_EMOJI[entry.vehicle] || '🏍'}</span>
          <span style={{
            color: isMe ? '#00d4ff' : '#c8d8e8',
            fontWeight: isMe ? 700 : 600, fontSize: 14,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {entry.username}
            {isMe && <span style={{ color: '#00d4ff', fontSize: 10, marginLeft: 5 }}>(you)</span>}
          </span>
        </div>
        <div style={{ color: '#5a7a96', fontSize: 11 }}>{timeSince(entry.top_speed_ts_ms)}</div>
      </div>

      {/* Speed */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ color: speedColor, fontWeight: 700, fontSize: 19, lineHeight: 1 }}>
          {(entry.top_speed_mps * MPS_TO_MPH).toFixed(1)}
        </div>
        <div style={{ color: '#5a7a96', fontSize: 10, marginTop: 2 }}>mph</div>
        <div style={{ color: '#3a5a6a', fontSize: 10 }}>
          {(entry.top_speed_mps * MPS_TO_KPH).toFixed(1)} km/h
        </div>
      </div>
    </div>
  )
}

// ── Tab: My Stats ─────────────────────────────────────────────────────────────

function TabMyStats({ deviceId, myUsername }) {
  const [stats, setStats]   = useState(null)
  const [allLb, setAllLb]   = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [sRes, lRes] = await Promise.all([
        fetch(`/users/stats?device_id=${encodeURIComponent(deviceId)}`).then(r => r.json()),
        fetch('/users/leaderboard').then(r => r.json()),
      ])
      setStats(sRes.stats || null)
      setAllLb(lRes.leaderboard || [])
    } catch {}
    setLoading(false)
  }, [deviceId])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 15000); return () => clearInterval(id) }, [load])

  const myRank = allLb.findIndex(e => e.username === myUsername) + 1

  if (loading) return (
    <div style={{ textAlign: 'center', marginTop: 60, color: '#5a7a96', fontSize: 14 }}>Loading…</div>
  )

  if (!stats || (!stats.top_speed_mps && !stats.driving_time_s)) return (
    <div style={{ textAlign: 'center', marginTop: 60, color: '#5a7a96', fontSize: 14, padding: '0 32px', lineHeight: 1.7 }}>
      No stats yet — head out for a ride!<br />
      <span style={{ fontSize: 12, color: '#3a5a6a' }}>Stats accumulate automatically while driving above 10 mph.</span>
    </div>
  )

  return (
    <div style={{ padding: '14px 0 24px' }}>
      {/* All-time rank banner */}
      {myRank > 0 && stats.top_speed_mps && (
        <div style={{
          margin: '0 14px 14px',
          background: 'rgba(0,212,255,0.06)',
          border: '1px solid rgba(0,212,255,0.18)',
          borderRadius: 12, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 34 }}>{MEDAL[myRank - 1] || `#${myRank}`}</span>
          <div>
            <div style={{ color: '#00d4ff', fontWeight: 700, fontSize: 15 }}>
              All-Time Rank #{myRank}
            </div>
            <div style={{ color: '#5a7a96', fontSize: 12 }}>Top speed leaderboard</div>
          </div>
        </div>
      )}

      {/* Stat cards 2×2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 14px' }}>
        <StatCard
          icon="🏎" label="Top Speed" unit="mph"
          value={fmtSpeed(stats.top_speed_mps)}
          sub={stats.top_speed_mps
            ? `${fmtSpeedKph(stats.top_speed_mps)} · ${timeSince(stats.top_speed_ts_ms)}`
            : 'Not recorded yet'}
          color="#ffd60a"
        />
        <StatCard
          icon="⚡" label="Avg Driving Speed" unit="mph"
          value={fmtSpeed(stats.avg_speed_mps)}
          sub={stats.avg_speed_mps
            ? fmtSpeedKph(stats.avg_speed_mps)
            : 'While above 10 mph'}
          color="#00d4ff"
        />
        <StatCard
          icon="⏱" label="Time Driving"
          value={fmtTime(stats.driving_time_s)}
          sub="Cumulative total"
          color="#30d158"
        />
        <StatCard
          icon="🛣" label="Distance Driven"
          value={fmtDist(stats.total_distance_m)}
          unit={fmtDistUnit(stats.total_distance_m)}
          sub={fmtDistSub(stats.total_distance_m) || 'Estimated from speed'}
          color="#bf5af2"
        />
      </div>

      {/* Tip */}
      <div style={{
        margin: '14px 14px 0',
        padding: '10px 14px',
        background: '#0d1117',
        border: '1px solid #1e2d3d',
        borderRadius: 8,
        fontSize: 11, color: '#3a5a6a', lineHeight: 1.6,
      }}>
        ⚡ Speed and distance are tracked automatically whenever you're moving above 10 mph.
        Stats persist across sessions.
      </div>
    </div>
  )
}

// ── Tab: Leaderboard (shared by Today and All Time) ───────────────────────────

function TabLeaderboard({ endpoint, myUsername, emptyMsg }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch(endpoint)
      const d = await r.json()
      setEntries(d.leaderboard || [])
    } catch {}
    setLoading(false)
  }, [endpoint])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 15000); return () => clearInterval(id) }, [load])

  const myEntry = entries.find(e => e.username === myUsername)
  const myRank  = myEntry ? entries.indexOf(myEntry) + 1 : null

  if (loading) return (
    <div style={{ textAlign: 'center', marginTop: 60, color: '#5a7a96', fontSize: 14 }}>Loading…</div>
  )

  if (!entries.length) return (
    <div style={{ textAlign: 'center', marginTop: 60, color: '#5a7a96', fontSize: 14, padding: '0 32px', lineHeight: 1.7 }}>
      {emptyMsg}
    </div>
  )

  return (
    <div style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* My rank callout (if not in top 3) */}
      {myRank && myRank > 3 && (
        <div style={{
          background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.18)',
          borderRadius: 10, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4,
        }}>
          <span style={{ fontSize: 22 }}>#{myRank}</span>
          <div>
            <div style={{ color: '#00d4ff', fontWeight: 700, fontSize: 13 }}>Your rank: #{myRank}</div>
            <div style={{ color: '#5a7a96', fontSize: 11 }}>
              {fmtSpeed(myEntry.top_speed_mps)} mph · {fmtSpeedKph(myEntry.top_speed_mps)}
            </div>
          </div>
        </div>
      )}

      {entries.map((e, i) => (
        <LeaderboardRow
          key={e.username + i}
          entry={e}
          rank={i + 1}
          isMe={e.username === myUsername}
        />
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'me',      label: 'My Stats' },
  { id: 'today',   label: "Today's Best" },
  { id: 'alltime', label: 'All Time' },
]

export default function StatsPanel({ onClose, myUsername, deviceId }) {
  const [tab, setTab] = useState('me')

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#0b0f14',
      display: 'flex', flexDirection: 'column',
      zIndex: 1100, fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{
        background: '#111820', borderBottom: '1px solid #1e2d3d',
        paddingTop: 'max(14px, calc(env(safe-area-inset-top, 0px) + 14px))',
        paddingBottom: 14, paddingLeft: 18, paddingRight: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🏆</span>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#c8d8e8' }}>
            Stats &amp; Leaderboards
          </span>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: '1px solid #1e2d3d', borderRadius: 8,
          color: '#5a7a96', fontSize: 18, width: 34, height: 34,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>
      </div>

      {/* Tab pills */}
      <div style={{
        display: 'flex', gap: 8, padding: '10px 14px',
        background: '#0d1117', borderBottom: '1px solid #1e2d3d',
        flexShrink: 0,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '8px 4px',
            borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'monospace',
            background:  tab === t.id ? 'rgba(0,212,255,0.12)' : 'transparent',
            border: `1px solid ${tab === t.id ? 'rgba(0,212,255,0.4)' : '#1e2d3d'}`,
            color:       tab === t.id ? '#00d4ff' : '#5a7a96',
            transition: 'all 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'me'      && <TabMyStats deviceId={deviceId} myUsername={myUsername} />}
        {tab === 'today'   && (
          <TabLeaderboard
            endpoint="/users/leaderboard/today"
            myUsername={myUsername}
            emptyMsg="No riders in the last 24 hours — be the first out today!"
          />
        )}
        {tab === 'alltime' && (
          <TabLeaderboard
            endpoint="/users/leaderboard"
            myUsername={myUsername}
            emptyMsg="No records yet — get moving!"
          />
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 18px',
        paddingBottom: 'max(10px, calc(env(safe-area-inset-bottom, 0px) + 10px))',
        borderTop: '1px solid #1e2d3d',
        color: '#3a5a6a', fontSize: 11, textAlign: 'center', flexShrink: 0,
      }}>
        Updates every 15 s · Speed tracked automatically while riding
      </div>
    </div>
  )
}
