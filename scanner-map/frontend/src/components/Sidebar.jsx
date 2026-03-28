import React, { useState, useRef, useEffect } from 'react'
import { resumeAudio } from '../utils/audio'
import DeviceFilterPanel from './DeviceFilterPanel'

const TIME_RANGES = [
  {label:'15m', ms:15*60*1000},
  {label:'1h',  ms:60*60*1000},
  {label:'6h',  ms:6*60*60*1000},
  {label:'24h', ms:24*60*60*1000},
  {label:'ALL', ms:0},
]

const MODE_COLORS = {idle:'#5a7a96',fake:'#5a7a96',wifi:'#00d4ff',ble:'#2979ff',both:'#00e676'}
const MODE_LABELS = {idle:'SCANNER',fake:'🎲 DEMO',wifi:'📡 WI-FI',ble:'🔵 BLE',both:'⚡ BOTH'}

const VEHICLE_EMOJI = { motorcycle:'🏍', car:'🚗', van:'🚐', truck:'🚛', bicycle:'🚴', foot:'🚶' }

function fmt(enc) {
  return `${new Date(enc.peak_ts_ms).toLocaleTimeString()} · ${enc.rssi_max?.toFixed(0)} dBm · ${enc.hit_count} hits`
}

// ── Sidebar tabs ──────────────────────────────────────────────────────────────
const SIDEBAR_TABS = [
  { id: 'scan',  label: '📡 Scan'  },
  { id: 'rank',  label: '🏆 Rank'  },
  { id: 'team',  label: '👥 Team'  },
]

// ── Misc device breakdown helper ──────────────────────────────────────────────
const MISC_LABELS = {
  phone:'📱 Phone', tablet:'📟 Tablet', laptop:'💻 Laptop', headphones:'🎧 Headphones',
  speaker:'🔊 Speaker', tv:'📺 TV', streaming:'📡 Stream', gaming:'🎮 Gaming',
  smartwatch:'⌚ Watch', smarthome:'🏠 Smart Home', car:'🚗 Car', wifi_ap:'📶 Wi-Fi AP', unknown:'· Unknown',
}

// ── Leaderboard helpers ───────────────────────────────────────────────────────
const VEHICLE_EMOJI_LB = { motorcycle:'🏍', car:'🚗', van:'🚐', truck:'🚛', bicycle:'🚴', foot:'🚶' }
const MPS_TO_MPH = 2.23694
const MEDAL = ['🥇','🥈','🥉']
function timeSince(ts) {
  if (!ts) return ''
  const s = Math.floor((Date.now()-ts)/1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

// ── Trophy rank system ────────────────────────────────────────────────────────
// Clean geometric rank insignia: chevrons (I–III) → shield → star → gem → crown
const RANK_SVG = {
  // Bronze: single chevron stripe
  Bronze: (c) => `<svg viewBox="0 0 40 28" xmlns="http://www.w3.org/2000/svg">
    <polyline points="4,22 20,6 36,22" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`,

  // Copper: double chevron
  Copper: (c) => `<svg viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg">
    <polyline points="4,30 20,14 36,30" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <polyline points="4,18 20,2 36,18" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`,

  // Silver: triple chevron
  Silver: (c) => `<svg viewBox="0 0 40 44" xmlns="http://www.w3.org/2000/svg">
    <polyline points="4,38 20,22 36,38" stroke="${c}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <polyline points="4,26 20,10 36,26" stroke="${c}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <polyline points="4,14 20,-2 36,14" stroke="${c}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`,

  // Gold: bold shield with center line
  Gold: (c) => `<svg viewBox="0 0 40 46" xmlns="http://www.w3.org/2000/svg">
    <path d="M20,2 L38,10 L38,26 Q38,40 20,44 Q2,40 2,26 L2,10 Z" fill="${c}"/>
    <path d="M20,10 L20,36 M12,18 L28,18" stroke="rgba(0,0,0,0.28)" stroke-width="3" stroke-linecap="round"/>
  </svg>`,

  // Platinum: shield with inner ring detail
  Platinum: (c) => `<svg viewBox="0 0 40 46" xmlns="http://www.w3.org/2000/svg">
    <path d="M20,2 L38,10 L38,26 Q38,40 20,44 Q2,40 2,26 L2,10 Z" fill="${c}"/>
    <path d="M20,9 L31,14 L31,25 Q31,34 20,37 Q9,34 9,25 L9,14 Z" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="2"/>
    <circle cx="20" cy="23" r="4" fill="rgba(0,0,0,0.2)"/>
  </svg>`,

  // Diamond: classic gem facet shape
  Diamond: (c) => `<svg viewBox="0 0 40 44" xmlns="http://www.w3.org/2000/svg">
    <polygon points="20,2 38,16 20,42 2,16" fill="${c}"/>
    <polygon points="20,2 38,16 20,22 2,16" fill="rgba(255,255,255,0.18)"/>
    <line x1="2" y1="16" x2="38" y2="16" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>
    <line x1="20" y1="2" x2="20" y2="22" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
  </svg>`,

  // Elite: crown
  Elite: (c) => `<svg viewBox="0 0 40 34" xmlns="http://www.w3.org/2000/svg">
    <polygon points="2,30 2,12 11,20 20,4 29,20 38,12 38,30" fill="${c}"/>
    <rect x="2" y="28" width="36" height="5" rx="2.5" fill="${c}"/>
    <circle cx="20" cy="4"  r="3.5" fill="${c}"/>
    <circle cx="2"  cy="12" r="3"   fill="${c}" opacity="0.85"/>
    <circle cx="38" cy="12" r="3"   fill="${c}" opacity="0.85"/>
    <polygon points="2,30 2,12 11,20 20,4 29,20 38,12 38,30" fill="rgba(255,255,255,0.1)"/>
  </svg>`,
}

const RANKS = [
  { name:'Bronze',   min:0,     max:499,   svgKey:'Bronze',   color:'#CD7F32' },
  { name:'Copper',   min:500,   max:1999,  svgKey:'Copper',   color:'#DA8F5A' },
  { name:'Silver',   min:2000,  max:5999,  svgKey:'Silver',   color:'#C0C0C0' },
  { name:'Gold',     min:6000,  max:14999, svgKey:'Gold',     color:'#FFD700' },
  { name:'Platinum', min:15000, max:39999, svgKey:'Platinum', color:'#8BE8FF' },
  { name:'Diamond',  min:40000, max:99999, svgKey:'Diamond',  color:'#A8EDFF' },
  { name:'Elite',    min:100000,max:Infinity,svgKey:'Elite',  color:'#FF6B35' },
]

function getRank(score) {
  return RANKS.find(r => score >= r.min && score <= r.max) || RANKS[0]
}

function RankIcon({ rank, size=36 }) {
  const svgStr = RANK_SVG[rank.svgKey]?.(rank.color) || ''
  return (
    <div
      style={{width:size, height:size, display:'flex', alignItems:'center', justifyContent:'center'}}
      dangerouslySetInnerHTML={{__html: svgStr}}
    />
  )
}

function RankBar({ trophyScore }) {
  const rank    = getRank(trophyScore)
  const rankIdx = RANKS.indexOf(rank)
  const next    = RANKS[rankIdx + 1]
  const pct     = next
    ? Math.min(100, ((trophyScore - rank.min) / (next.min - rank.min)) * 100)
    : 100

  return (
    <div style={{
      background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)',
      borderRadius:14, padding:'12px 14px', margin:'4px 0',
    }}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <RankIcon rank={rank} size={40} />
          <div>
            <div style={{fontSize:14, fontWeight:800, color:rank.color, letterSpacing:'0.02em'}}>{rank.name}</div>
            <div style={{fontSize:11, color:'var(--text-dim)', marginTop:1}}>{trophyScore.toLocaleString()} pts</div>
          </div>
        </div>
        {next && (
          <div style={{textAlign:'right', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4}}>
            <div style={{fontSize:9, color:'var(--text-dim)', letterSpacing:'0.04em', textTransform:'uppercase'}}>Next unlock</div>
            <RankIcon rank={next} size={28} />
            <div style={{fontSize:10, color:next.color, fontWeight:700}}>{next.name}</div>
          </div>
        )}
      </div>
      {/* Progress bar */}
      <div style={{background:'rgba(255,255,255,0.08)', borderRadius:6, height:7, overflow:'hidden'}}>
        <div style={{
          width:`${pct}%`, height:'100%',
          background:`linear-gradient(90deg, ${rank.color}88, ${rank.color})`,
          borderRadius:6, transition:'width 0.8s ease',
          boxShadow:`0 0 8px ${rank.color}66`,
        }}/>
      </div>
      {next && (
        <div style={{display:'flex', justifyContent:'space-between', marginTop:5}}>
          <div style={{fontSize:9, color:rank.color, fontWeight:600}}>{rank.name}</div>
          <div style={{fontSize:9, color:'var(--text-dim)'}}>{next.min.toLocaleString()} pts → {next.name}</div>
        </div>
      )}
      {/* All rank tier strip */}
      <div style={{display:'flex', gap:4, marginTop:12, justifyContent:'space-between'}}>
        {RANKS.map((r) => {
          const unlocked = trophyScore >= r.min
          return (
            <div key={r.name} style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:3,
              opacity: unlocked ? 1 : 0.28,
              flex:1,
            }}>
              <RankIcon rank={r} size={unlocked ? 26 : 22} />
              <div style={{
                fontSize:8, fontWeight:700, textAlign:'center', lineHeight:1.1,
                color: unlocked ? r.color : 'var(--text-dim)',
              }}>{r.name}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Sidebar({
  running, loading, timeRange, setTimeRange,
  showMarkers, setShowMarkers, showRoute, setShowRoute,
  showFlockCameras, setShowFlockCameras, flockCameraCount=0,
  onToggle, heatCells, encounters, routePoints, userPos,
  api, scanMode, onOpenSettings, onOpenTargets, onOpenData, onOpenLeaderboard,
  onOpenReplay,
  username, vehicle, activeUsers=[],
  sidebarState='closed', onSidebarState, onClose,
  deviceId='',
  accountId='',
  onAccountLinked,
  trophyScore=0,
  sessionStats={ topSpeed:0, totalDist:0, speedSum:0, speedCount:0 },
  hotspotCount=0, tailKeys=new Set(),
}) {
  const watcherCount = encounters.filter(e=>e.label==='Fun-Watcher').length
  const stopperCount = encounters.filter(e=>e.label==='Fun-Stopper').length
  const miscCount    = encounters.filter(e=>e.label!=='Fun-Watcher'&&e.label!=='Fun-Stopper').length

  const otherUsers = activeUsers.filter(u => u.username !== username)
  const [alertTarget, setAlertTarget] = useState('')
  const [alertSent, setAlertSent]     = useState(false)
  const [sidebarTab, setSidebarTab]   = useState('scan')

  // Aggressive mode + scan frequency
  const [aggressiveMode, setAggressiveMode] = useState(false)
  const [scanInterval, setScanInterval]     = useState(3)   // seconds
  const [aggrHits, setAggrHits]            = useState({fleet_wifi_count:0,axon_ble_count:0,axon_probe_count:0,avl_node_count:0,fleet_wifi:[],axon_probers:[]})

  const toggleAggressive = async (on) => {
    setAggressiveMode(on)
    await fetch('/scan/aggressive/toggle', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ enabled: on, interval_s: scanInterval }),
    }).catch(()=>{})
  }

  const applyInterval = async (val) => {
    setScanInterval(val)
    await fetch('/scan/interval', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ interval_s: val }),
    }).catch(()=>{})
    if (aggressiveMode) {
      await fetch('/scan/aggressive/toggle', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ enabled: true, interval_s: val }),
      }).catch(()=>{})
    }
  }

  // Poll aggressive hits when mode is on
  useEffect(() => {
    if (!aggressiveMode) return
    const id = setInterval(async () => {
      try {
        const d = await fetch('/scan/aggressive').then(r=>r.json())
        setAggrHits(d)
      } catch {}
    }, 2000)
    return () => clearInterval(id)
  }, [aggressiveMode])
  const [devicesOpen, setDevicesOpen] = useState(false)
  const [expandedStat, setExpandedStat] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [lbLoading, setLbLoading]     = useState(false)
  const [myBadges, setMyBadges]       = useState([])
  const [achLeader, setAchLeader]     = useState({})

  // Leaderboard row action dropdown
  const [lbDropdown, setLbDropdown]   = useState(null)  // username of open dropdown

  // User stats modal
  const [statsUser, setStatsUser]     = useState(null)  // leaderboard entry clicked
  const [statsData, setStatsData]     = useState(null)  // fetched public stats
  const [statsLoading, setStatsLoading] = useState(false)
  const [accountStats, setAccountStats] = useState(null) // aggregated across devices

  // Account linking
  const [accountOpen, setAccountOpen]   = useState(false)
  const [acctIdentifier, setAcctIdentifier] = useState('')
  const [acctOtp, setAcctOtp]           = useState('')
  const [acctStep, setAcctStep]         = useState('input')  // 'input'|'verify'|'linked'
  const [acctCode, setAcctCode]         = useState('')       // code returned from server
  const [acctLoading, setAcctLoading]   = useState(false)
  const [acctMsg, setAcctMsg]           = useState('')
  const [linkedDevices, setLinkedDevices] = useState([])

  // Friends state
  const [friends, setFriends]         = useState([])
  const [pendingIn, setPendingIn]     = useState([])
  const [pendingOut, setPendingOut]   = useState([])
  const [friendSearch, setFriendSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [friendMsg, setFriendMsg]     = useState('')

  // Fetch leaderboard + achievements when Rank tab is shown
  useEffect(() => {
    if (sidebarTab !== 'rank') return
    setLbLoading(true)
    fetch('/users/leaderboard').then(r=>r.json()).then(d=>{
      setLeaderboard(d.leaderboard||[])
      setLbLoading(false)
    }).catch(()=>setLbLoading(false))
    // Fetch achievement leaderboard
    fetch('/achievements/leaderboard').then(r=>r.json()).then(d=>{
      setAchLeader(d.leaderboard || {})
    }).catch(()=>{})
    // Fetch this user's badges
    if (username) {
      fetch(`/achievements/user/${encodeURIComponent(username)}`).then(r=>r.json()).then(d=>{
        setMyBadges(d.achievements || [])
      }).catch(()=>{})
    }
  }, [sidebarTab, username])

  // Fetch friends when Team tab is shown
  useEffect(() => {
    if (sidebarTab !== 'team' || !username) return
    fetch(`/users/friends?username=${encodeURIComponent(username)}`)
      .then(r=>r.json())
      .then(d=>{
        setFriends(d.friends||[])
        setPendingIn(d.pending_in||[])
        setPendingOut(d.pending_out||[])
      }).catch(()=>{})
  }, [sidebarTab, username])

  // Fetch public stats when a user is selected
  useEffect(() => {
    if (!statsUser) { setStatsData(null); setAccountStats(null); return }
    setStatsLoading(true)
    fetch(`/users/public-stats?username=${encodeURIComponent(statsUser.username)}`)
      .then(r=>r.json())
      .then(d=>{
        setStatsData(d.stats)
        setStatsLoading(false)
        // If user has an account_id, also fetch aggregated stats
        if (d.stats?.account_id || statsUser.account_id) {
          const aid = d.stats?.account_id || statsUser.account_id
          fetch(`/accounts/aggregated-stats?account_id=${encodeURIComponent(aid)}`)
            .then(r=>r.json()).then(d2=>setAccountStats(d2.stats)).catch(()=>{})
        }
      })
      .catch(()=>setStatsLoading(false))
  }, [statsUser])

  // Load linked devices when account panel opens
  useEffect(() => {
    if (!accountOpen || !accountId) return
    fetch(`/accounts/linked-devices?account_id=${encodeURIComponent(accountId)}`)
      .then(r=>r.json()).then(d=>setLinkedDevices(d.devices||[])).catch(()=>{})
  }, [accountOpen, accountId])

  // Friend search debounce
  useEffect(() => {
    if (friendSearch.length < 2) { setSearchResults([]); return }
    setSearchLoading(true)
    const t = setTimeout(() => {
      fetch(`/users/search?q=${encodeURIComponent(friendSearch)}`)
        .then(r=>r.json())
        .then(d=>{ setSearchResults(d.users||[]); setSearchLoading(false) })
        .catch(()=>setSearchLoading(false))
    }, 350)
    return () => clearTimeout(t)
  }, [friendSearch])

  const sendFriendRequest = async (toUsername) => {
    const r = await fetch('/users/friends/request', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ from_username: username, to_username: toUsername }),
    }).then(r=>r.json()).catch(()=>({error:'Network error'}))
    if (r.ok) {
      setFriendMsg(`Request sent to ${toUsername}`)
      setPendingOut(p=>[...p,{recipient:toUsername,created_ms:Date.now()}])
      setSearchResults(prev=>prev.filter(u=>u.username!==toUsername))
    } else {
      setFriendMsg(r.error || 'Failed')
    }
    setTimeout(()=>setFriendMsg(''),3000)
  }

  const respondToRequest = async (requester, accept) => {
    await fetch('/users/friends/respond', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username, requester, accept }),
    }).catch(()=>{})
    setPendingIn(p=>p.filter(r=>r.requester!==requester))
    if (accept) setFriends(f=>[...f,{friend_username:requester,created_ms:Date.now()}])
    setFriendMsg(accept ? `Now friends with ${requester}` : `Declined ${requester}`)
    setTimeout(()=>setFriendMsg(''),3000)
  }

  const removeFriend = async (friendUsername) => {
    await fetch('/users/friends', {
      method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username, friend_username: friendUsername }),
    }).catch(()=>{})
    setFriends(f=>f.filter(fr=>fr.friend_username!==friendUsername))
  }

  const requestOtp = async () => {
    if (!acctIdentifier.trim()) return
    setAcctLoading(true); setAcctMsg('')
    const r = await fetch('/accounts/request-otp', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ identifier: acctIdentifier.trim(), device_id: deviceId }),
    }).then(r=>r.json()).catch(()=>({error:'Network error'}))
    setAcctLoading(false)
    if (r.error) { setAcctMsg(r.error); return }
    setAcctCode(r.otp)
    setAcctStep('verify')
    setAcctMsg(r.email_sent ? `Code sent to ${acctIdentifier}` : '')
  }

  const verifyOtp = async () => {
    if (!acctOtp.trim()) return
    setAcctLoading(true); setAcctMsg('')
    const r = await fetch('/accounts/verify-otp', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ identifier: acctIdentifier.trim(), otp: acctOtp.trim(), device_id: deviceId }),
    }).then(r=>r.json()).catch(()=>({error:'Network error'}))
    setAcctLoading(false)
    if (r.error) { setAcctMsg(r.error); return }
    onAccountLinked?.(r.account_id)
    setLinkedDevices(r.devices || [])
    setAcctStep('linked')
    setAcctMsg(`Linked! ${r.devices?.length || 1} device(s) on this account.`)
  }

  const unlinkDevice = async (did) => {
    await fetch('/accounts/unlink-device', {
      method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ device_id: did, account_id: accountId }),
    }).catch(()=>{})
    setLinkedDevices(prev => prev.filter(d=>d.device_id!==did))
    if (did === deviceId) { onAccountLinked?.(''); setAcctStep('input') }
  }

  // Misc device breakdown
  const miscBreakdown = React.useMemo(() => {
    const map = {}
    encounters.filter(e=>e.label!=='Fun-Watcher'&&e.label!=='Fun-Stopper').forEach(e=>{
      const k = e.device_type||'unknown'
      map[k] = (map[k]||0)+1
    })
    return Object.entries(map).sort((a,b)=>b[1]-a[1])
  }, [encounters])

  const sidebarRef = useRef(null)
  const handleRef  = useRef(null)

  // Waze-style 3-snap drag: peek ↔ half ↔ full
  // Only hijacks scroll when genuinely dragging the sheet handle or swiping down from top
  useEffect(() => {
    const el     = sidebarRef.current
    const handle = handleRef.current
    if (!el) return

    let startY         = 0
    let currentY       = 0
    let startScrollTop = 0
    let onHandle       = false
    let direction      = null   // 'up' | 'down' | null
    let dragConfirmed  = false  // true once we know this is a sheet-drag, not a scroll

    const body = el.querySelector('.sidebar-body')

    const onStart = (e) => {
      startY         = e.touches[0].clientY
      currentY       = startY
      onHandle       = !!(handle && handle.contains(e.target))
      startScrollTop = body ? body.scrollTop : 0
      direction      = null
      dragConfirmed  = false
    }

    const onMove = (e) => {
      currentY = e.touches[0].clientY
      const delta = currentY - startY

      // Determine swipe direction once clear (6px threshold)
      if (direction === null) {
        if (Math.abs(delta) < 6) return
        direction = delta > 0 ? 'down' : 'up'
      }

      // Decide once whether this gesture should be a sheet drag
      if (!dragConfirmed) {
        const atTop = startScrollTop <= 0
        const isDrag =
          onHandle ||                                   // always drag from handle
          (atTop && direction === 'down') ||             // swipe-down to close when at top
          (atTop && direction === 'up' && sidebarState !== 'full')  // swipe-up to expand when at top
        if (!isDrag) return  // let browser handle scroll
        dragConfirmed = true
        el.style.transition = 'none'
      }

      e.preventDefault()

      // Compute drag offset relative to current snap
      if (sidebarState === 'full') {
        el.style.transform = `translateY(${Math.max(0, delta)}px)`
      } else if (sidebarState === 'half') {
        const upLimit = -(window.innerHeight * 0.44)
        const downLimit = window.innerHeight * 0.6
        el.style.transform = `translateY(calc(44vh + ${Math.max(upLimit, Math.min(downLimit, delta))}px))`
      } else {
        // closed — only allow upward drag (peek → half)
        if (direction === 'up') {
          el.style.transform = `translateY(calc(100% - 52px + ${Math.min(0, delta)}px))`
        }
      }
    }

    const onEnd = () => {
      if (!dragConfirmed) { direction = null; return }
      const delta = currentY - startY

      // Restore CSS-driven transition smoothly
      requestAnimationFrame(() => {
        el.style.transition = ''
        el.style.transform  = ''
      })

      if (direction === 'up') {
        if (sidebarState === 'closed') onSidebarState?.('half')
        else if (sidebarState === 'half' && delta < -60) onSidebarState?.('full')
      } else if (direction === 'down') {
        if (sidebarState === 'full' && delta > 80) onSidebarState?.('half')
        else if (sidebarState === 'half' && delta > 80) onSidebarState?.('closed')
      }

      direction     = null
      dragConfirmed = false
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove',  onMove,  { passive: false })
    el.addEventListener('touchend',   onEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove',  onMove)
      el.removeEventListener('touchend',   onEnd)
      el.style.transform  = ''
      el.style.transition = ''
    }
  }, [sidebarState, onSidebarState])

  const sendTestAlert = async () => {
    resumeAudio()
    const target = alertTarget || otherUsers[0]?.username
    if (!target) return
    await fetch('/users/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, type: 'Fun-Stopper', color: 'red', distance: 42, rssi: -68 }),
    }).catch(() => {})
    setAlertSent(true)
    setTimeout(() => setAlertSent(false), 2000)
  }

  return (
    <aside ref={sidebarRef} className={`sidebar${sidebarState !== 'closed' ? ` ${sidebarState}` : ''}`}>
      <div className="sheet-handle" ref={handleRef}>
        <div className="sheet-handle-pill" />
        <div className="sheet-handle-strip">
          <span className="sheet-handle-strip-title">Invincible.Inc</span>
          <span className="sheet-handle-strip-status" style={{color: MODE_COLORS[scanMode]||'var(--text-dim)'}}>
            {MODE_LABELS[scanMode]||'SCANNER'}
          </span>
        </div>
      </div>

      {/* ── Header ── */}
      <div className="sidebar-header">
        <div>
          <h1>Invincible.Inc</h1>
          <p style={{color: MODE_COLORS[scanMode]||'var(--text-dim)'}}>
            {MODE_LABELS[scanMode]||scanMode?.toUpperCase()||'SCANNER'}
          </p>
          {username && (
            <p style={{color:'var(--text-dim)',fontSize:13,marginTop:2}}>
              {VEHICLE_EMOJI[vehicle]||'🚗'} {username}
              {activeUsers.length > 0 && ` · ${activeUsers.length} online`}
            </p>
          )}
        </div>
        <div className="header-btns">
          <button className="btn-settings" onClick={onOpenReplay}   title="Replay drive session">⏮</button>
          <button className="btn-settings" onClick={onOpenTargets}  title="Edit targets">🎯</button>
          <button className="btn-settings" onClick={onOpenData}     title="Data manager">🗄</button>
          <button className="btn-settings" onClick={onOpenSettings} title="Settings">⚙</button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="sidebar-tab-bar">
        {SIDEBAR_TABS.map(t => (
          <button
            key={t.id}
            className={`sidebar-tab-btn${sidebarTab === t.id ? ' active' : ''}`}
            onClick={() => setSidebarTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="sidebar-body">

        {/* ════ SCAN tab ════ */}
        {sidebarTab === 'scan' && <>

          <button
            className={`btn-scan${running?' running':''}${loading?' loading':''}`}
            onClick={onToggle} disabled={loading}
          >
            {loading?'Wait…':running?'⬛ Stop Scanning':'▶ Start Scanning'}
          </button>

          {/* ── Scan Frequency slider ── */}
          <div style={{marginTop:4}}>
            <div className="section-label" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>Scan Frequency</span>
              <span style={{color:'var(--accent)',fontWeight:700,fontFamily:'monospace',fontSize:13}}>
                {scanInterval < 2 ? `${scanInterval.toFixed(1)}s` : `${scanInterval}s`}
              </span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0 8px'}}>
              <span style={{fontSize:10,color:'var(--text-dim)',width:28,textAlign:'right'}}>Fast</span>
              <input
                type="range" min={1} max={30} step={0.5}
                value={scanInterval}
                onChange={e => applyInterval(parseFloat(e.target.value))}
                style={{flex:1,accentColor:'var(--accent)',cursor:'pointer'}}
              />
              <span style={{fontSize:10,color:'var(--text-dim)',width:28}}>Slow</span>
            </div>
          </div>

          {/* ── Aggressive Mode ── */}
          <div style={{
            margin:'4px 0 8px',
            padding:'12px 14px',
            background: aggressiveMode ? 'rgba(255,69,58,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${aggressiveMode ? 'rgba(255,69,58,0.35)' : 'var(--border)'}`,
            borderRadius:12,
          }}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom: aggressiveMode ? 10 : 0}}>
              <div>
                <div style={{fontWeight:700,fontSize:13,color: aggressiveMode ? '#ff453a' : 'var(--text)'}}>
                  {aggressiveMode ? '🔴 Aggressive Mode ON' : '⚪ Aggressive Mode'}
                </div>
                <div style={{fontSize:11,color:'var(--text-dim)',marginTop:2}}>
                  Fleet · Axon · AVL · body cam detection
                </div>
              </div>
              <div
                className={`toggle${aggressiveMode?' on':''}`}
                style={aggressiveMode ? {background:'#ff453a'} : {}}
                onClick={()=>toggleAggressive(!aggressiveMode)}
              />
            </div>

            {aggressiveMode && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                <div style={{background:'rgba(0,0,0,0.2)',borderRadius:8,padding:'8px 10px',textAlign:'center'}}>
                  <div style={{fontSize:20,fontWeight:900,color:'#ff453a'}}>{aggrHits.fleet_wifi_count}</div>
                  <div style={{fontSize:10,color:'var(--text-dim)'}}>Fleet WiFi APs</div>
                </div>
                <div style={{background:'rgba(0,0,0,0.2)',borderRadius:8,padding:'8px 10px',textAlign:'center'}}>
                  <div style={{fontSize:20,fontWeight:900,color:'#ff9f0a'}}>{aggrHits.avl_node_count}</div>
                  <div style={{fontSize:10,color:'var(--text-dim)'}}>AVL Nodes</div>
                </div>
                <div style={{background:'rgba(0,0,0,0.2)',borderRadius:8,padding:'8px 10px',textAlign:'center'}}>
                  <div style={{fontSize:20,fontWeight:900,color:'#0a84ff'}}>{aggrHits.axon_ble_count}</div>
                  <div style={{fontSize:10,color:'var(--text-dim)'}}>Axon BLE</div>
                </div>
                <div style={{background:'rgba(0,0,0,0.2)',borderRadius:8,padding:'8px 10px',textAlign:'center'}}>
                  <div style={{fontSize:20,fontWeight:900,color:'#30d158'}}>{aggrHits.axon_probe_count}</div>
                  <div style={{fontSize:10,color:'var(--text-dim)'}}>Body Cam Probes</div>
                </div>
                {aggrHits.fleet_wifi?.slice(0,5).map((h,i)=>(
                  <div key={i} style={{gridColumn:'1/-1',background:'rgba(255,69,58,0.06)',borderRadius:6,padding:'6px 10px',fontSize:11}}>
                    <div style={{color:'#ff453a',fontWeight:600}}>{h.label}</div>
                    <div style={{color:'var(--text-dim)',fontFamily:'monospace',fontSize:10}}>
                      {h.meta?.ssid||h.meta?.bssid||'—'} · {h.rssi?.toFixed(0)} dBm
                    </div>
                  </div>
                ))}
                {aggrHits.axon_probers?.slice(0,3).map((p,i)=>(
                  <div key={i} style={{gridColumn:'1/-1',background:'rgba(10,132,255,0.06)',borderRadius:6,padding:'6px 10px',fontSize:11}}>
                    <div style={{color:'#0a84ff',fontWeight:600}}>📷 Body Cam Detected</div>
                    <div style={{color:'var(--text-dim)',fontFamily:'monospace',fontSize:10}}>
                      {p.mac} → {p.axon_ssids?.[0]}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="section-label">Time Range</div>
            <div className="range-row">
              {TIME_RANGES.map(r=>(
                <button key={r.ms} className={`range-btn${timeRange===r.ms?' active':''}`} onClick={()=>setTimeRange(r.ms)}>{r.label}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="section-label">Display</div>
            <div className="toggle-row">
              <label>Encounter markers</label>
              <div className={`toggle${showMarkers?' on':''}`} onClick={()=>setShowMarkers(v=>!v)}/>
            </div>
            <div className="toggle-row">
              <label>Stopper route</label>
              <div className={`toggle${showRoute?' on':''}`} onClick={()=>setShowRoute(v=>!v)}/>
            </div>
            <div className="toggle-row">
              <label>
                📷 Flock cameras
                {flockCameraCount > 0 && <span style={{marginLeft:5,fontSize:10,opacity:0.55}}>({flockCameraCount})</span>}
              </label>
              <div className={`toggle${showFlockCameras?' on':''}`} onClick={()=>setShowFlockCameras(v=>!v)}/>
            </div>
          </div>

          {/* ── Device Filters collapsible ── */}
          <div>
            <button
              onClick={()=>setDevicesOpen(v=>!v)}
              style={{
                width:'100%', background:'none', border:'none',
                display:'flex', alignItems:'center', justifyContent:'space-between',
                cursor:'pointer', padding:'0 2px',
              }}
            >
              <div className="section-label" style={{margin:0}}>🎛 Device Filters</div>
              <span style={{color:'var(--text-dim)', fontSize:12, transition:'transform 0.2s', display:'inline-block', transform:devicesOpen?'rotate(180deg)':'none'}}>▼</span>
            </button>
            {devicesOpen && (
              <div style={{marginTop:8}}>
                <DeviceFilterPanel encounters={encounters} compact={true} />
              </div>
            )}
          </div>

          {/* ── Stats ── */}
          <div>
            <div className="section-label">Stats</div>
            <div className="stats-grid">

              {/* Heat Cells */}
              <div className={`stat-card${expandedStat==='heatcells'?' expanded':''}`}
                   onClick={()=>setExpandedStat(s=>s==='heatcells'?null:'heatcells')} style={{cursor:'pointer'}}>
                <div className="val">{heatCells.length}</div>
                <div className="lbl">Heat Cells</div>
                {expandedStat==='heatcells' && (
                  <div className="stat-detail">~100m grid squares with detection activity. More cells = wider coverage area.</div>
                )}
              </div>

              {/* Route Pts */}
              <div className={`stat-card${expandedStat==='route'?' expanded':''}`}
                   onClick={()=>setExpandedStat(s=>s==='route'?null:'route')} style={{cursor:'pointer'}}>
                <div className="val">{routePoints.length}</div>
                <div className="lbl">Route Pts</div>
                {expandedStat==='route' && (
                  <div className="stat-detail">GPS breadcrumbs logged. 1 pt ≈ every few seconds of movement.</div>
                )}
              </div>

              {/* Watchers */}
              <div className={`stat-card watcher-card${expandedStat==='watcher'?' expanded':''}`}
                   onClick={()=>setExpandedStat(s=>s==='watcher'?null:'watcher')} style={{cursor:'pointer'}}>
                <div className="val watcher-val">{watcherCount}</div>
                <div className="lbl">📷 Watcher</div>
                {expandedStat==='watcher' && watcherCount > 0 && (
                  <div className="stat-detail">
                    {encounters.filter(e=>e.label==='Fun-Watcher').slice(0,5).map(e=>(
                      <div key={e.id} style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:4,marginTop:4}}>
                        <div style={{color:'#2979ff',fontSize:10,fontWeight:600}}>{e.device_name||e.mac_addr||'Unknown'}</div>
                        <div style={{color:'var(--text-dim)',fontSize:9}}>{e.rssi_max?.toFixed(0)} dBm · {new Date(e.peak_ts_ms).toLocaleTimeString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stoppers */}
              <div className={`stat-card stopper-card${expandedStat==='stopper'?' expanded':''}`}
                   onClick={()=>setExpandedStat(s=>s==='stopper'?null:'stopper')} style={{cursor:'pointer'}}>
                <div className="val stopper-val">{stopperCount}</div>
                <div className="lbl">🚔 Stopper</div>
                {expandedStat==='stopper' && stopperCount > 0 && (
                  <div className="stat-detail">
                    {encounters.filter(e=>e.label==='Fun-Stopper').slice(0,5).map(e=>(
                      <div key={e.id} style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:4,marginTop:4}}>
                        <div style={{color:'#ff4d6d',fontSize:10,fontWeight:600}}>{e.device_name||e.mac_addr||'Unknown'}</div>
                        <div style={{color:'var(--text-dim)',fontSize:9}}>{e.rssi_max?.toFixed(0)} dBm · {new Date(e.peak_ts_ms).toLocaleTimeString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Misc */}
              <div className={`stat-card misc-card${expandedStat==='misc'?' expanded':''}`}
                   onClick={()=>setExpandedStat(s=>s==='misc'?null:'misc')} style={{cursor:'pointer'}}>
                <div className="val misc-val">{miscCount}</div>
                <div className="lbl">📱 Misc</div>
                {expandedStat==='misc' && miscCount > 0 && (
                  <div className="stat-detail">
                    {miscBreakdown.slice(0,8).map(([type,n])=>(
                      <div key={type} style={{display:'flex',justifyContent:'space-between',fontSize:9,padding:'2px 0'}}>
                        <span style={{color:'var(--text-dim)'}}>{MISC_LABELS[type]||type}</span>
                        <span style={{color:'#00e676',fontWeight:700}}>{n}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {hotspotCount > 0 && (
                <div className={`stat-card${expandedStat==='hotspot'?' expanded':''}`}
                     style={{borderColor:'#FF453A',cursor:'pointer'}}
                     onClick={()=>setExpandedStat(s=>s==='hotspot'?null:'hotspot')}>
                  <div className="val" style={{color:'#FF453A'}}>{hotspotCount}</div>
                  <div className="lbl">🔥 Hotspots</div>
                  {expandedStat==='hotspot' && (
                    <div className="stat-detail">Recurring Stopper zones detected on multiple days. Stay alert in these areas.</div>
                  )}
                </div>
              )}

              {tailKeys.size > 0 && (
                <div className={`stat-card${expandedStat==='tailing'?' expanded':''}`}
                     style={{borderColor:'#FF9F0A',cursor:'pointer'}}
                     onClick={()=>setExpandedStat(s=>s==='tailing'?null:'tailing')}>
                  <div className="val" style={{color:'#FF9F0A'}}>{tailKeys.size}</div>
                  <div className="lbl">🔁 Tailing</div>
                  {expandedStat==='tailing' && (
                    <div className="stat-detail">
                      <div style={{color:'var(--text-dim)',fontSize:9,marginBottom:4}}>Devices seen 3+ times this session:</div>
                      {[...tailKeys].slice(0,5).map(k=>(
                        <div key={k} style={{color:'#FF9F0A',fontSize:9,padding:'1px 0',fontFamily:'monospace'}}>{k}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {userPos ? (
            <div className="gps-card">
              <span className="gps-dot active"/>
              <div>
                <div className="gps-coords">{userPos.lat.toFixed(5)}, {userPos.lon.toFixed(5)}</div>
                <div className="gps-label">GPS Active</div>
              </div>
            </div>
          ) : (
            <div className="gps-card">
              <span className="gps-dot"/>
              <div>
                <div className="gps-coords" style={{color:'var(--text-dim)'}}>No GPS fix</div>
                <div className="gps-label">Allow location in browser settings</div>
              </div>
            </div>
          )}

          {encounters.length > 0 && (
            <div>
              <div className="section-label">Recent Encounters</div>
              <div className="enc-list">
                {encounters.slice(0,10).map(enc=>(
                  <div key={enc.id} className={`enc-item${enc.label==='Fun-Watcher'?' watcher':enc.label==='Fun-Stopper'?' stopper':''}`}>
                    <div className="enc-label">
                      {enc.label==='Fun-Watcher'?'📷 ':enc.label==='Fun-Stopper'?'🚔 ':''}
                      {enc.label||'Target'}
                    </div>
                    <div className="enc-meta">{fmt(enc)}</div>
                    {enc.show_timestamp&&<div className="enc-ts">{new Date(enc.peak_ts_ms).toLocaleString()}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="section-label">Export</div>
            <div className="export-row">
              <a href={`${api}/export/csv`}        className="btn-export" download>RAW CSV</a>
              <a href={`${api}/export/encounters`}  className="btn-export" download>ENC CSV</a>
              <a href={`${api}/export/geojson`}     className="btn-export" download>GEOJSON</a>
            </div>
          </div>

        </>}

        {/* ════ RANK tab ════ */}
        {sidebarTab === 'rank' && <>

          <RankBar trophyScore={trophyScore} />

          {/* ── Session stats ── */}
          <div>
            <div className="section-label">📊 This Session</div>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="val" style={{color:'#FF9F0A'}}>
                  {sessionStats.topSpeed > 0 ? sessionStats.topSpeed.toFixed(1) : '—'}
                </div>
                <div className="lbl">Top Speed mph</div>
              </div>
              <div className="stat-card">
                <div className="val" style={{color:'#30D158'}}>
                  {sessionStats.speedCount > 0
                    ? (sessionStats.speedSum / sessionStats.speedCount).toFixed(1)
                    : '—'}
                </div>
                <div className="lbl">Avg Speed mph</div>
              </div>
              <div className="stat-card">
                <div className="val" style={{color:'#0A84FF'}}>
                  {sessionStats.totalDist > 0
                    ? (sessionStats.totalDist / 1609.34).toFixed(2)
                    : '—'}
                </div>
                <div className="lbl">Miles Driven</div>
              </div>
              <div className="stat-card">
                <div className="val">{trophyScore.toLocaleString()}</div>
                <div className="lbl">Total Points</div>
              </div>
            </div>
          </div>

          <div>
            <div className="section-label">🏎 Top Speed Leaderboard</div>
            {lbLoading && <div style={{color:'var(--text-dim)',fontSize:13,textAlign:'center',padding:'16px 0'}}>Loading…</div>}
            {!lbLoading && leaderboard.length === 0 && (
              <div style={{color:'var(--text-dim)',fontSize:12,textAlign:'center',padding:'16px 0'}}>
                No speed records yet — get moving!
              </div>
            )}
            <div className="enc-list" style={{gap:6}}>
              {leaderboard.map((e,i)=>{
                const isMe = e.username === username
                const medal = MEDAL[i] || null
                const isOpen = lbDropdown === e.username
                const alreadyFriend = friends.some(f=>f.friend_username===e.username)
                const pendingReq    = pendingOut.some(p=>p.recipient===e.username)
                return (
                  <div key={e.username} style={{position:'relative'}}>
                    <div className={`enc-item${isMe?' watcher':''}`}
                      onClick={()=>setLbDropdown(isOpen ? null : e.username)}
                      style={{
                        display:'flex', alignItems:'center', gap:10, cursor:'pointer',
                        background: isOpen ? 'rgba(255,255,255,0.06)' : isMe ? 'rgba(0,212,255,0.06)' : undefined,
                        borderColor: isMe ? 'rgba(0,212,255,0.3)' : undefined,
                      }}>
                      <div style={{minWidth:28,fontSize:medal?18:13,textAlign:'center',color:medal?undefined:'var(--text-dim)',fontWeight:700}}>
                        {medal||`#${i+1}`}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:5}}>
                          <span style={{fontSize:13}}>{VEHICLE_EMOJI_LB[e.vehicle]||'🏍'}</span>
                          <span style={{fontSize:13,fontWeight:isMe?700:600,color:isMe?'#00d4ff':'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {e.username}{isMe&&<span style={{fontSize:10,color:'#00d4ff',marginLeft:4}}>(you)</span>}
                          </span>
                        </div>
                        <div style={{fontSize:10,color:'var(--text-dim)'}}>{timeSince(e.top_speed_ts_ms)}</div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0,display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}}>
                        <div style={{fontSize:15,fontWeight:700,color:i===0?'#FFD60A':i===1?'#C0C0C0':i===2?'#CD7F32':'#00e676'}}>
                          {(e.top_speed_mps*MPS_TO_MPH).toFixed(1)}
                        </div>
                        <div style={{fontSize:9,color:isOpen?'var(--accent)':'var(--text-dim)'}}>
                          mph {isOpen ? '▲' : '▼'}
                        </div>
                      </div>
                    </div>

                    {/* Action dropdown */}
                    {isOpen && (
                      <div style={{
                        display:'flex', gap:6, padding:'8px 10px 10px',
                        background:'rgba(0,0,0,0.18)', borderRadius:'0 0 12px 12px',
                        borderTop:'1px solid rgba(255,255,255,0.06)',
                      }}>
                        {!isMe && (
                          alreadyFriend ? (
                            <span style={{fontSize:11,color:'#30D158',padding:'6px 10px'}}>✓ Friends</span>
                          ) : pendingReq ? (
                            <span style={{fontSize:11,color:'var(--text-dim)',padding:'6px 10px'}}>Request sent</span>
                          ) : (
                            <button onClick={(ev)=>{ev.stopPropagation();sendFriendRequest(e.username);setLbDropdown(null)}} style={{
                              flex:1, background:'rgba(10,132,255,0.15)', border:'1px solid rgba(10,132,255,0.35)',
                              color:'#0A84FF', borderRadius:8, padding:'6px 0', fontSize:12, fontWeight:700, cursor:'pointer',
                            }}>+ Add Friend</button>
                          )
                        )}
                        <button onClick={(ev)=>{ev.stopPropagation();setStatsUser(e);setLbDropdown(null)}} style={{
                          flex:1, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)',
                          color:'var(--text)', borderRadius:8, padding:'6px 0', fontSize:12, fontWeight:600, cursor:'pointer',
                        }}>📊 View Stats</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

        </>}

        {/* ════ BADGES ════ */}
        {sidebarTab === 'rank' && myBadges.length > 0 && (
          <div>
            <div className="section-label">🏅 Your Badges</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              {myBadges.map(b => {
                const top = (achLeader[b.id] || [])[0]
                const isTop = top && username && top.username === username
                const hasScore = b.score > 0
                return (
                  <div key={b.id} style={{
                    background: hasScore ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${hasScore ? (b.color || 'rgba(0,212,255,0.3)') + '44' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius:12, padding:'10px 11px',
                    opacity: hasScore ? 1 : 0.45,
                    position:'relative', overflow:'hidden',
                  }}>
                    {isTop && (
                      <div style={{position:'absolute',top:4,right:6,fontSize:10,color:'#FFD60A'}}>👑</div>
                    )}
                    <div style={{fontSize:20,marginBottom:4}}>{b.icon}</div>
                    <div style={{fontSize:11,fontWeight:700,color: hasScore ? (b.color||'#fff') : 'var(--text-dim)',lineHeight:1.2,marginBottom:3}}>{b.name}</div>
                    {hasScore
                      ? <div style={{fontSize:12,fontWeight:700,color:b.color||'var(--accent)'}}>{b.score.toLocaleString()}</div>
                      : <div style={{fontSize:10,color:'var(--text-dim)'}}>not yet</div>
                    }
                    {b.rank && <div style={{fontSize:9,color:'var(--text-dim)',marginTop:1}}>#{b.rank} overall</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ════ TEAM tab ════ */}
        {sidebarTab === 'team' && <>

          {/* Friends online now */}
          <div>
            <div className="section-label">Online Friends ({activeUsers.filter(u=>u.username!==username).length})</div>
            {activeUsers.filter(u=>u.username!==username).length === 0 ? (
              <div className="gps-card">
                <span className="gps-dot" style={{background:'var(--text-dim)'}}/>
                <div>
                  <div className="gps-coords" style={{color:'var(--text-dim)',fontSize:12}}>No friends online</div>
                  <div className="gps-label">Add friends below to see their location</div>
                </div>
              </div>
            ) : (
              <div className="enc-list">
                {activeUsers.filter(u=>u.username!==username).map(u => {
                  const speed = u.speed != null ? `${(u.speed * 2.23694).toFixed(0)} mph` : null
                  return (
                    <div key={u.username} className="enc-item">
                      <div className="enc-label">
                        <span style={{color:'#30D158',marginRight:4,fontSize:9}}>●</span>
                        {VEHICLE_EMOJI[u.vehicle]||'🚗'} {u.username}
                      </div>
                      <div className="enc-meta">
                        {u.lat!=null ? `${u.lat.toFixed(4)}, ${u.lon.toFixed(4)}` : 'No GPS'}
                        {speed && ` · ${speed}`}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pending incoming requests */}
          {pendingIn.length > 0 && (
            <div>
              <div className="section-label">Friend Requests ({pendingIn.length})</div>
              <div className="enc-list">
                {pendingIn.map(r => (
                  <div key={r.requester} className="enc-item" style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{flex:1,fontSize:13,fontWeight:600}}>{r.requester}</div>
                    <button onClick={()=>respondToRequest(r.requester,true)} style={{
                      background:'#30D158',border:'none',color:'#fff',borderRadius:8,
                      padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer',
                    }}>Accept</button>
                    <button onClick={()=>respondToRequest(r.requester,false)} style={{
                      background:'rgba(255,255,255,0.1)',border:'none',color:'var(--text-dim)',
                      borderRadius:8,padding:'4px 10px',fontSize:11,cursor:'pointer',
                    }}>Decline</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Friends list */}
          {friends.length > 0 && (
            <div>
              <div className="section-label">Friends ({friends.length})</div>
              <div className="enc-list" style={{gap:6}}>
                {friends.map(f => {
                  const onlineUser = activeUsers.find(u=>u.username===f.friend_username)
                  const topMph = f.top_speed_mps ? (f.top_speed_mps*MPS_TO_MPH).toFixed(1) : null
                  const lastSeen = f.last_seen_ms ? timeSince(f.last_seen_ms) : null
                  return (
                    <div key={f.friend_username} className="enc-item" style={{flexDirection:'column',gap:6,cursor:'pointer'}}
                      onClick={()=>{const fake={username:f.friend_username,vehicle:f.vehicle};setStatsUser(fake)}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:9,color:onlineUser?'#30D158':'var(--text-dim)'}}>●</span>
                        <span style={{fontSize:13,fontWeight:700,flex:1}}>
                          {VEHICLE_EMOJI[f.vehicle||'motorcycle']||'🏍'} {f.friend_username}
                        </span>
                        {onlineUser ? (
                          <span style={{fontSize:11,color:'#30D158',fontWeight:600}}>
                            {onlineUser.speed!=null ? `${(onlineUser.speed*2.23694).toFixed(0)} mph` : 'online'}
                          </span>
                        ) : (
                          <span style={{fontSize:10,color:'var(--text-dim)'}}>{lastSeen||'offline'}</span>
                        )}
                        <button onClick={(e)=>{e.stopPropagation();removeFriend(f.friend_username)}} style={{
                          background:'none',border:'none',color:'var(--text-dim)',
                          fontSize:14,cursor:'pointer',padding:'2px 4px',lineHeight:1,marginLeft:2,
                        }}>✕</button>
                      </div>
                      {(topMph || f.mutual_friends > 0) && (
                        <div style={{display:'flex',gap:12,paddingLeft:16,fontSize:10,color:'var(--text-dim)'}}>
                          {topMph && <span>🏎 Top: <b style={{color:'#FF9F0A'}}>{topMph} mph</b></span>}
                          {f.mutual_friends > 0 && <span>👥 {f.mutual_friends} mutual</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Pending outgoing */}
          {pendingOut.length > 0 && (
            <div>
              <div className="section-label" style={{opacity:0.6}}>Sent Requests</div>
              <div className="enc-list">
                {pendingOut.map(r=>(
                  <div key={r.recipient} className="enc-item" style={{opacity:0.6,fontSize:12}}>
                    ⏳ {r.recipient} — waiting
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add friends */}
          <div>
            <div className="section-label">Add Friend</div>
            <div style={{display:'flex',gap:8,marginBottom:8}}>
              <input
                className="alert-target-select"
                style={{flex:1,background:'var(--card)',border:'1px solid rgba(84,84,88,0.4)',
                  color:'var(--text)',borderRadius:10,padding:'8px 12px',fontSize:13}}
                placeholder="Search by username…"
                value={friendSearch}
                onChange={e=>setFriendSearch(e.target.value)}
              />
              {searchLoading && <span style={{alignSelf:'center',color:'var(--text-dim)',fontSize:12}}>…</span>}
            </div>
            {searchResults.length > 0 && (
              <div className="enc-list">
                {searchResults.filter(u=>u.username!==username).map(u=>{
                  const alreadyFriend = friends.some(f=>f.friend_username===u.username)
                  const pending = pendingOut.some(p=>p.recipient===u.username)
                  return (
                    <div key={u.username} className="enc-item" style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{flex:1,fontSize:13}}>{VEHICLE_EMOJI_LB[u.vehicle]||'🏍'} {u.username}</span>
                      {alreadyFriend ? (
                        <span style={{fontSize:11,color:'#30D158'}}>✓ Friends</span>
                      ) : pending ? (
                        <span style={{fontSize:11,color:'var(--text-dim)'}}>Pending</span>
                      ) : (
                        <button onClick={()=>sendFriendRequest(u.username)} style={{
                          background:'rgba(10,132,255,0.18)',border:'1px solid rgba(10,132,255,0.4)',
                          color:'#0A84FF',borderRadius:8,padding:'4px 12px',fontSize:11,
                          fontWeight:700,cursor:'pointer',
                        }}>+ Add</button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {friendSearch.length >= 2 && !searchLoading && searchResults.length === 0 && (
              <div style={{fontSize:12,color:'var(--text-dim)',textAlign:'center',padding:'8px 0'}}>No users found</div>
            )}
            {friendMsg && (
              <div style={{fontSize:12,color:'#30D158',textAlign:'center',padding:'6px 0',fontWeight:600}}>{friendMsg}</div>
            )}
          </div>

          {/* Test alert (friends only) */}
          {otherUsers.length > 0 && (
            <div className="alert-test-section">
              <div className="section-label">Send Test Alert</div>
              <div className="alert-test-row">
                <select className="alert-target-select"
                  value={alertTarget || otherUsers[0]?.username}
                  onChange={e=>setAlertTarget(e.target.value)}>
                  {otherUsers.map(u=>(
                    <option key={u.username} value={u.username}>
                      {VEHICLE_EMOJI[u.vehicle]||'🚗'} {u.username}
                    </option>
                  ))}
                </select>
                <button className={`btn-send-alert${alertSent?' sent':''}`} onClick={sendTestAlert}>
                  {alertSent ? '✓ Sent' : '🚔 Send'}
                </button>
              </div>
            </div>
          )}

          {/* ── Account / Device Sync ───────────────────────────────────── */}
          <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:12,marginTop:4}}>
            <button onClick={()=>setAccountOpen(v=>!v)} style={{
              display:'flex',alignItems:'center',justifyContent:'space-between',
              width:'100%',background:'none',border:'none',cursor:'pointer',padding:'2px 0',
            }}>
              <div className="section-label" style={{margin:0}}>
                🔗 Account {accountId ? <span style={{fontSize:10,color:'#30D158'}}>● Linked</span> : <span style={{fontSize:10,color:'var(--text-dim)'}}>Not linked</span>}
              </div>
              <span style={{color:'var(--text-dim)',fontSize:12,transform:accountOpen?'rotate(180deg)':'none',transition:'transform 0.2s'}}>▼</span>
            </button>

            {accountOpen && (
              <div style={{marginTop:10}}>
                {!accountId || acctStep === 'input' ? (
                  <>
                    <div style={{fontSize:11,color:'var(--text-dim)',marginBottom:10,lineHeight:1.5}}>
                      Link your devices to one account. Stats will sync across all linked devices. Enter your email or phone number to get a verification code.
                    </div>
                    <div style={{display:'flex',gap:8,marginBottom:8}}>
                      <input
                        className="alert-target-select"
                        style={{flex:1,background:'var(--card)',border:'1px solid rgba(84,84,88,0.4)',
                          color:'var(--text)',borderRadius:10,padding:'8px 12px',fontSize:13}}
                        placeholder="Email or phone number"
                        value={acctIdentifier}
                        onChange={e=>setAcctIdentifier(e.target.value)}
                        onKeyDown={e=>e.key==='Enter'&&requestOtp()}
                      />
                      <button onClick={requestOtp} disabled={acctLoading||!acctIdentifier.trim()} style={{
                        background:'rgba(10,132,255,0.2)',border:'1px solid rgba(10,132,255,0.4)',
                        color:'#0A84FF',borderRadius:10,padding:'8px 14px',fontSize:13,
                        fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',
                      }}>{acctLoading ? '…' : 'Get Code'}</button>
                    </div>
                    {acctMsg && <div style={{fontSize:11,color:'#FF453A',marginBottom:6}}>{acctMsg}</div>}
                  </>
                ) : acctStep === 'verify' ? (
                  <>
                    {acctCode && (
                      <div style={{
                        background:'rgba(48,209,88,0.1)',border:'1px solid rgba(48,209,88,0.3)',
                        borderRadius:12,padding:'12px 14px',marginBottom:12,textAlign:'center',
                      }}>
                        <div style={{fontSize:11,color:'var(--text-dim)',marginBottom:4}}>Your verification code</div>
                        <div style={{fontSize:32,fontWeight:800,letterSpacing:'0.2em',color:'#30D158',fontFamily:'monospace'}}>{acctCode}</div>
                        <div style={{fontSize:10,color:'var(--text-dim)',marginTop:4}}>Enter this on your other device · expires in 10 min</div>
                      </div>
                    )}
                    {acctMsg && <div style={{fontSize:11,color:'#30D158',marginBottom:6}}>{acctMsg}</div>}
                    <div style={{fontSize:11,color:'var(--text-dim)',marginBottom:8}}>Enter the code sent to <b>{acctIdentifier}</b>:</div>
                    <div style={{display:'flex',gap:8}}>
                      <input
                        className="alert-target-select"
                        style={{flex:1,background:'var(--card)',border:'1px solid rgba(84,84,88,0.4)',
                          color:'var(--text)',borderRadius:10,padding:'8px 12px',fontSize:18,
                          letterSpacing:'0.2em',fontFamily:'monospace',textAlign:'center'}}
                        placeholder="000000"
                        maxLength={6}
                        value={acctOtp}
                        onChange={e=>setAcctOtp(e.target.value.replace(/\D/g,''))}
                        onKeyDown={e=>e.key==='Enter'&&verifyOtp()}
                      />
                      <button onClick={verifyOtp} disabled={acctLoading||acctOtp.length!==6} style={{
                        background:'rgba(48,209,88,0.2)',border:'1px solid rgba(48,209,88,0.4)',
                        color:'#30D158',borderRadius:10,padding:'8px 14px',fontSize:13,
                        fontWeight:700,cursor:'pointer',
                      }}>{acctLoading ? '…' : 'Verify'}</button>
                    </div>
                    <button onClick={()=>{setAcctStep('input');setAcctCode('');setAcctOtp('');setAcctMsg('')}} style={{
                      background:'none',border:'none',color:'var(--text-dim)',fontSize:11,
                      cursor:'pointer',marginTop:8,padding:0,
                    }}>← Use a different email/phone</button>
                  </>
                ) : (
                  /* Linked state */
                  <>
                    <div style={{fontSize:12,color:'#30D158',fontWeight:700,marginBottom:10}}>
                      ✓ {acctMsg || 'Account linked'}
                    </div>
                    <div style={{fontSize:11,color:'var(--text-dim)',marginBottom:8}}>Linked devices:</div>
                    {linkedDevices.map(d=>{
                      const isThis = d.device_id === deviceId
                      const lastMs = d.last_seen_ms ? timeSince(d.last_seen_ms) : '—'
                      const mph    = d.top_speed_mps ? (d.top_speed_mps*MPS_TO_MPH).toFixed(0) : null
                      return (
                        <div key={d.device_id} className="enc-item" style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                          <div style={{flex:1}}>
                            <div style={{fontSize:12,fontWeight:700}}>
                              {VEHICLE_EMOJI[d.vehicle]||'🏍'} {d.username||'Unknown'}
                              {isThis&&<span style={{fontSize:10,color:'#0A84FF',marginLeft:6}}>(this device)</span>}
                            </div>
                            <div style={{fontSize:10,color:'var(--text-dim)'}}>
                              Last seen {lastMs}{mph ? ` · Top: ${mph} mph` : ''}
                            </div>
                          </div>
                          {!isThis && (
                            <button onClick={()=>unlinkDevice(d.device_id)} style={{
                              background:'none',border:'none',color:'var(--text-dim)',
                              fontSize:13,cursor:'pointer',padding:'2px 6px',
                            }} title="Remove device">✕</button>
                          )}
                        </div>
                      )
                    })}
                    <div style={{display:'flex',gap:8,marginTop:10}}>
                      <button onClick={()=>{setAcctStep('input');setAcctCode('');setAcctOtp('');setAcctMsg('')}} style={{
                        flex:1,background:'rgba(10,132,255,0.15)',border:'1px solid rgba(10,132,255,0.3)',
                        color:'#0A84FF',borderRadius:8,padding:'7px 0',fontSize:11,fontWeight:700,cursor:'pointer',
                      }}>+ Link Another Device</button>
                      <button onClick={()=>unlinkDevice(deviceId)} style={{
                        background:'rgba(255,69,58,0.12)',border:'1px solid rgba(255,69,58,0.3)',
                        color:'#FF453A',borderRadius:8,padding:'7px 14px',fontSize:11,fontWeight:700,cursor:'pointer',
                      }}>Unlink</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

        </>}

        {/* ════ User Stats Modal ════ */}
        {statsUser && (
          <div style={{
            position:'absolute', inset:0, zIndex:200,
            background:'rgba(0,0,0,0.7)', backdropFilter:'blur(12px)',
            display:'flex', flexDirection:'column', justifyContent:'flex-end',
          }} onClick={e=>{ if(e.target===e.currentTarget) setStatsUser(null) }}>
            <div style={{
              background:'var(--surface)', borderRadius:'20px 20px 0 0',
              padding:'24px 20px 32px', maxHeight:'70vh', overflowY:'auto',
            }}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:28}}>{VEHICLE_EMOJI_LB[statsUser.vehicle]||'🏍'}</span>
                  <div>
                    <div style={{fontSize:18,fontWeight:800,color:'var(--text)'}}>{statsUser.username}</div>
                    <div style={{fontSize:12,color:'var(--text-dim)',textTransform:'capitalize'}}>{statsUser.vehicle}</div>
                  </div>
                </div>
                <button onClick={()=>setStatsUser(null)} style={{
                  background:'rgba(255,255,255,0.1)',border:'none',color:'var(--text)',
                  borderRadius:'50%',width:32,height:32,fontSize:16,cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',
                }}>✕</button>
              </div>

              {statsLoading ? (
                <div style={{textAlign:'center',color:'var(--text-dim)',padding:'20px 0'}}>Loading stats…</div>
              ) : statsData ? (
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="val" style={{color:'#FF9F0A'}}>
                      {statsData.top_speed_mps ? (statsData.top_speed_mps*MPS_TO_MPH).toFixed(1) : '—'}
                    </div>
                    <div className="lbl">Top Speed mph</div>
                  </div>
                  <div className="stat-card">
                    <div className="val" style={{color:'#30D158'}}>
                      {statsData.avg_speed_mps ? (statsData.avg_speed_mps*MPS_TO_MPH).toFixed(1) : '—'}
                    </div>
                    <div className="lbl">Avg Speed mph</div>
                  </div>
                  <div className="stat-card">
                    <div className="val" style={{color:'#0A84FF'}}>
                      {statsData.total_distance_m ? (statsData.total_distance_m/1609.34).toFixed(1) : '—'}
                    </div>
                    <div className="lbl">Total Miles</div>
                  </div>
                  <div className="stat-card">
                    <div className="val">
                      {statsData.driving_time_s
                        ? statsData.driving_time_s >= 3600
                          ? `${(statsData.driving_time_s/3600).toFixed(1)}h`
                          : `${Math.round(statsData.driving_time_s/60)}m`
                        : '—'}
                    </div>
                    <div className="lbl">Drive Time</div>
                  </div>
                </div>
              ) : (
                <div style={{textAlign:'center',color:'var(--text-dim)',padding:'20px 0'}}>No stats available</div>
              )}
              {statsData?.top_speed_ts_ms && (
                <div style={{fontSize:11,color:'var(--text-dim)',textAlign:'center',marginTop:12}}>
                  Top speed set {timeSince(statsData.top_speed_ts_ms)}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </aside>
  )
}
