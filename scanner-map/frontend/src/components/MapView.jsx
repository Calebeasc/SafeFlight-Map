import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

let heatPlugin = null
async function ensureHeatPlugin() {
  if (!heatPlugin) { await import('leaflet.heat'); heatPlugin = true }
}

const DEFAULT_CENTER = [33.4484, -112.074]
const DEFAULT_ZOOM   = 15
const MOVE_THRESHOLD_M = 50

// ── Map tile layers ────────────────────────────────────────────────────────────
const TILE_LAYERS = [
  { id:'dark',      label:'Dark',      url:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',         attr:'&copy; CARTO &copy; OSM', subdomains:'abcd' },
  { id:'street',    label:'Street',    url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                    attr:'&copy; OpenStreetMap',    subdomains:'abc'  },
  { id:'satellite', label:'Satellite', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr:'&copy; Esri', subdomains:'' },
  { id:'hybrid',    label:'Hybrid',    url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr:'&copy; Esri', subdomains:'', labels:true },
]

// ── Speed → zoom mapping ───────────────────────────────────────────────────────
function speedToZoom(mph) {
  if (mph <  1) return 19
  if (mph <  5) return 18
  if (mph < 15) return 17
  if (mph < 30) return 16
  if (mph < 50) return 15
  if (mph < 70) return 14
  return 13
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const CAMERA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="36" height="36">
  <defs><filter id="gb" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur stdDeviation="2.5" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter></defs>
  <rect x="6" y="14" width="36" height="24" rx="4" fill="#1a2a4a" stroke="#2979ff" stroke-width="2" filter="url(#gb)"/>
  <circle cx="24" cy="26" r="9" fill="#0d1a2e" stroke="#2979ff" stroke-width="2"/>
  <circle cx="24" cy="26" r="5" fill="#2979ff" opacity="0.7"/>
  <circle cx="24" cy="26" r="2.5" fill="#a8d4ff"/>
  <rect x="18" y="10" width="12" height="6" rx="2" fill="#1a2a4a" stroke="#2979ff" stroke-width="1.5"/>
  <rect x="33" y="16" width="5" height="4" rx="1" fill="#2979ff" opacity="0.8"/>
  <circle cx="22" cy="24" r="1.2" fill="white" opacity="0.6"/>
</svg>`

const COP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 36" width="52" height="36">
  <defs><filter id="gr" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur stdDeviation="2.5" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter></defs>
  <rect x="4" y="18" width="44" height="14" rx="5" fill="#1a0a10" stroke="#ff4d6d" stroke-width="1.5" filter="url(#gr)"/>
  <rect x="12" y="10" width="28" height="11" rx="4" fill="#1a0a10" stroke="#ff4d6d" stroke-width="1.5"/>
  <rect x="17" y="7" width="18" height="5" rx="2.5" fill="#2a0a14" stroke="#ff4d6d" stroke-width="1"/>
  <rect x="18" y="8" width="6" height="3" rx="1.5" fill="#ff4d6d" opacity="0.9"/>
  <rect x="27" y="8" width="6" height="3" rx="1.5" fill="#4488ff" opacity="0.9"/>
  <rect x="14" y="11.5" width="10" height="7" rx="2" fill="#0d1a2e" stroke="#ff4d6d" stroke-width="0.8" opacity="0.8"/>
  <rect x="27" y="11.5" width="10" height="7" rx="2" fill="#0d1a2e" stroke="#ff4d6d" stroke-width="0.8" opacity="0.8"/>
  <circle cx="13" cy="31" r="4.5" fill="#111" stroke="#ff4d6d" stroke-width="1.2"/>
  <circle cx="13" cy="31" r="2" fill="#ff4d6d" opacity="0.5"/>
  <circle cx="39" cy="31" r="4.5" fill="#111" stroke="#ff4d6d" stroke-width="1.2"/>
  <circle cx="39" cy="31" r="2" fill="#ff4d6d" opacity="0.5"/>
  <text x="26" y="27" font-size="5" fill="#ff4d6d" text-anchor="middle" font-family="monospace" font-weight="bold">POLICE</text>
  <rect x="44" y="21" width="4" height="5" rx="1" fill="#ffe066" opacity="0.8"/>
  <rect x="4"  y="21" width="4" height="5" rx="1" fill="#ff4d6d" opacity="0.8"/>
</svg>`

// Tron lightcycle — side profile, used for the "You" marker when vehicle = motorcycle
const TRON_BIKE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 50" width="82" height="43">
  <defs>
    <filter id="tg" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <!-- Rear wheel -->
  <circle cx="16" cy="36" r="12" fill="#000912" stroke="#00d4ff" stroke-width="2.2" filter="url(#tg)"/>
  <circle cx="16" cy="36" r="6"  fill="#000d1a" stroke="#00d4ff" stroke-width="1.2"/>
  <circle cx="16" cy="36" r="2"  fill="#00d4ff" opacity="0.95"/>
  <line x1="16" y1="24.5" x2="16" y2="47.5" stroke="#00d4ff" stroke-width="0.8" opacity="0.4"/>
  <line x1="4.5" y1="36"  x2="27.5" y2="36"  stroke="#00d4ff" stroke-width="0.8" opacity="0.4"/>
  <!-- Front wheel -->
  <circle cx="80" cy="36" r="12" fill="#000912" stroke="#00d4ff" stroke-width="2.2" filter="url(#tg)"/>
  <circle cx="80" cy="36" r="6"  fill="#000d1a" stroke="#00d4ff" stroke-width="1.2"/>
  <circle cx="80" cy="36" r="2"  fill="#00d4ff" opacity="0.95"/>
  <line x1="80" y1="24.5" x2="80" y2="47.5" stroke="#00d4ff" stroke-width="0.8" opacity="0.4"/>
  <line x1="68.5" y1="36" x2="91.5" y2="36"  stroke="#00d4ff" stroke-width="0.8" opacity="0.4"/>
  <!-- Chassis — flat angular wedge -->
  <path d="M16,25 L26,14 L58,10 L80,20 L82,25 L80,26 L16,26 Z"
        fill="#000912" stroke="#00d4ff" stroke-width="1.7" filter="url(#tg)"/>
  <!-- Rider — hunched aero silhouette -->
  <path d="M30,14 Q34,2 48,3 L56,10 L42,14 Z"
        fill="#000912" stroke="#00d4ff" stroke-width="1.3" filter="url(#tg)"/>
  <!-- Helmet -->
  <ellipse cx="38" cy="2.5" rx="5.5" ry="4.5" fill="#000912" stroke="#00d4ff" stroke-width="1.3"/>
  <!-- Visor slit -->
  <line x1="33.5" y1="2.5" x2="42" y2="1" stroke="#00d4ff" stroke-width="0.9" opacity="0.75"/>
  <!-- Front nose fairing -->
  <path d="M80,20 L90,24 L88,26 L80,26 Z" fill="#000912" stroke="#00d4ff" stroke-width="1.2"/>
  <!-- Light trail behind rear -->
  <line x1="16" y1="22" x2="3"  y2="19" stroke="#00d4ff" stroke-width="1.6" opacity="0.75"/>
  <line x1="16" y1="24" x2="1"  y2="23" stroke="#00d4ff" stroke-width="1"   opacity="0.45"/>
  <line x1="16" y1="26" x2="3"  y2="28" stroke="#00d4ff" stroke-width="0.7" opacity="0.25"/>
</svg>`

function makeDivIcon(svg, w, h) {
  return L.divIcon({ className:'', html:svg, iconSize:[w,h], iconAnchor:[w/2,h/2], popupAnchor:[0,-h/2] })
}

function distM(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}

const stablePositions = {}
function getStablePos(enc) {
  const prev = stablePositions[enc.id]
  if (!prev) { stablePositions[enc.id]={lat:enc.lat,lon:enc.lon}; return stablePositions[enc.id] }
  if (distM(prev.lat,prev.lon,enc.lat,enc.lon) > MOVE_THRESHOLD_M)
    stablePositions[enc.id]={lat:enc.lat,lon:enc.lon}
  return stablePositions[enc.id]
}

const alertedAt = {}          // target_key → last alert timestamp (Stoppers)
const seenTargetKeys = new Set() // session dedup for Watchers + special devices

// Device types that NEVER generate proximity alerts (silently shown on map only)
const SILENT_TYPES = new Set(['phone','tablet','laptop','headphones','speaker',
  'tv','streaming','gaming','smartwatch','smarthome','car','wifi_ap','unknown'])

// Special device types — module-level so both marker and alert effects can use them
const SPECIAL_TYPES = new Set(['ring','axon','flock','drone','smartglasses'])
const SPECIAL_INFO = {
  ring:        { emoji:'🔔', label:'Ring Camera',        color:'#FF8C00' },
  axon:        { emoji:'📹', label:'Axon Body Camera',   color:'#007AFF' },
  flock:       { emoji:'📷', label:'Flock Safety/ALPR',  color:'#FF2D55' },
  drone:       { emoji:'🚁', label:'Drone',              color:'#5AC8FA' },
  smartglasses:{ emoji:'🕶', label:'Smart Glasses',      color:'#AF52DE' },
}

// Trophy road — point values per encounter type
const TROPHY_POINTS = {
  'Fun-Stopper': 50,
  'Fun-Watcher': 25,
  special:       15,
  misc:           5,
}

// Emoji icon for every misc device type
const MISC_EMOJI = {
  phone:'📱', tablet:'📟', laptop:'💻', headphones:'🎧', speaker:'🔊',
  tv:'📺', streaming:'📡', gaming:'🎮', smartwatch:'⌚', smarthome:'🏠',
  car:'🚗', wifi_ap:'📶', unknown:'·',
}

const VEHICLE_EMOJI = { motorcycle:'🏍', car:'🚗', van:'🚐', truck:'🚛', bicycle:'🚴', foot:'🚶' }
const USER_COLORS   = ['#00e676','#00d4ff','#ffab40','#ea80fc','#ff6d6d','#b2ff59','#40c4ff']
function userColor(name) {
  let h = 0; for (const c of name) h = (h*31 + c.charCodeAt(0)) & 0xffffffff
  return USER_COLORS[Math.abs(h) % USER_COLORS.length]
}

export default function MapView({
  heatCells, encounters, showMarkers, userPos, routePoints,
  showRoute, onAlert, alertRadiusM=300, alertCooldownMs=30000,
  activeUsers=[], myUsername='', myVehicle='motorcycle',
  hotspots=[], tailKeys=new Set(),
  stopperTrails=[],
  flockCameras=[], showFlockCameras=true,
  // Replay mode — when set, the map renders replay data instead of live data
  replayMode=false, replayEncounters=null, replayRoute=null, replayHeatCells=null,
  // Sidebar state — 'closed' | 'half' | 'full'
  sidebarState='closed',
}) {
  const [tileId, setTileId]       = useState(() => localStorage.getItem('sfm_tile_id') || 'dark')
  const [showTilePicker, setShowTilePicker] = useState(false)
  const [mapReady, setMapReady]   = useState(false)
  const containerRef      = useRef(null)
  const mapRef            = useRef(null)
  const heatLayerRef      = useRef(null)
  const markerLayerRef    = useRef(null)
  const userMarkerRef     = useRef(null)
  const usersLayerRef     = useRef(null)
  const routeLayerRef     = useRef(null)
  const tileLayerRef      = useRef(null)
  const followUserRef     = useRef(true)
  const tailBufferRef     = useRef([])
  const tailLayerRef      = useRef(null)
  const tailDecayRef      = useRef(null)
  const hotspotLayerRef       = useRef(null)
  const replayRouteRef        = useRef(null)
  const stopperTrailLayerRef  = useRef(null)
  const flockLayerRef         = useRef(null)

  // ── Init map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    ensureHeatPlugin().then(() => {
      if (mapRef.current) return
      const map = L.map(containerRef.current, { center:DEFAULT_CENTER, zoom:DEFAULT_ZOOM, zoomControl:false })
      const savedId = localStorage.getItem('sfm_tile_id') || 'dark'
      const def = TILE_LAYERS.find(t => t.id === savedId) || TILE_LAYERS[0]
      tileLayerRef.current = L.tileLayer(def.url, {
        attribution:def.attr, subdomains:def.subdomains||'', maxZoom:19,
      }).addTo(map)

      map.on('dragstart', () => { followUserRef.current = false })
      mapRef.current = map
      setMapReady(true)
      setTimeout(() => map.invalidateSize(), 150)
      window.addEventListener('resize', () => map.invalidateSize())
    })
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current=null } }
  }, [])

  // ── Tile layer switching ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const def = TILE_LAYERS.find(t => t.id === tileId) || TILE_LAYERS[0]
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    tileLayerRef.current = L.tileLayer(def.url, {
      attribution:def.attr, subdomains:def.subdomains||'', maxZoom:19,
    }).addTo(map)
    tileLayerRef.current.bringToBack()
  }, [tileId])

  // ── Heat layer ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !heatPlugin) return
    const cells = replayMode ? (replayHeatCells || []) : heatCells
    const pts = cells.filter(c=>c.lat&&c.lon).map(c=>[c.lat,c.lon,c.intensity])
    if (heatLayerRef.current) heatLayerRef.current.setLatLngs(pts)
    else heatLayerRef.current = L.heatLayer(pts, {
      radius:35, blur:25, maxZoom:17,
      gradient:{0:'#0a1628',0.3:'#0d3b6e',0.5:'#0077cc',0.7:'#00d4ff',1:'#ffffff'},
    }).addTo(map)
  }, [heatCells, replayMode, replayHeatCells])

  // ── Stopper route polyline ───────────────────────────────────────────────
  // Connects Fun-Stopper encounter points in chronological order
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (routeLayerRef.current) { map.removeLayer(routeLayerRef.current); routeLayerRef.current=null }
    if (!showRoute || replayMode) return
    const stoppers = encounters
      .filter(e => e.label === 'Fun-Stopper' && e.lat && e.lon)
      .sort((a, b) => a.peak_ts_ms - b.peak_ts_ms)
    if (stoppers.length < 2) return
    routeLayerRef.current = L.polyline(
      stoppers.map(s => [s.lat, s.lon]),
      { color: '#FF453A', weight: 2.5, opacity: 0.65, dashArray: '7 5', lineJoin: 'round' }
    ).addTo(map)
  }, [encounters, showRoute, replayMode])

  // ── Encounter markers ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (markerLayerRef.current) markerLayerRef.current.clearLayers()
    else markerLayerRef.current = L.layerGroup().addTo(map)
    if (!showMarkers) return

    const displayEncs = replayMode ? (replayEncounters || []) : encounters

    // RSSI → estimated distance in meters, capped at 4000 ft (1219 m)
    const rssiToMeters = (rssi) => {
      if (!rssi) return null
      const dist = Math.pow(10, (-40 - rssi) / (10 * 2.5))
      return Math.min(1219, Math.max(5, dist))
    }

    // Sort newest-first so large time ranges still show the most recent (GPS-valid) encounters
    const byRecency = [...displayEncs].sort((a,b) => (b.peak_ts_ms||0) - (a.peak_ts_ms||0))
    const watchers  = byRecency.filter(e=>e.label==='Fun-Watcher').slice(0,50)
    const stoppers  = byRecency.filter(e=>e.label==='Fun-Stopper').slice(0,50)
    const misc      = byRecency.filter(e=>e.label!=='Fun-Watcher'&&e.label!=='Fun-Stopper').slice(0,100)

    ;[...watchers,...stoppers,...misc].forEach(enc => {
      if (!enc.lat||!enc.lon) return
      const isW       = enc.label==='Fun-Watcher'
      const isS       = enc.label==='Fun-Stopper'
      const isTail    = tailKeys.has(enc.target_key)
      const isSpecial = SPECIAL_TYPES.has(enc.device_type)
      const sInfo     = SPECIAL_INFO[enc.device_type] || null
      const pos       = isW ? getStablePos(enc) : {lat:enc.lat,lon:enc.lon}

      // Tail badge overlay — orange "!" badge pinned to top-right of the icon
      const tailBadge = isTail
        ? `<div style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;
             background:#FF9F0A;border:2px solid #fff;display:flex;align-items:center;justify-content:center;
             font-size:10px;font-weight:900;color:#000;z-index:10;box-shadow:0 0 8px #FF9F0A">!</div>`
        : ''

      let icon
      if (isW) {
        icon = L.divIcon({
          className: '',
          html: `<div style="position:relative;display:inline-block">${CAMERA_SVG}${tailBadge}</div>`,
          iconSize: [36,36], iconAnchor: [18,18], popupAnchor: [0,-18],
        })
      } else if (isS) {
        icon = L.divIcon({
          className: '',
          html: `<div style="position:relative;display:inline-block">${COP_SVG}${tailBadge}</div>`,
          iconSize: [52,36], iconAnchor: [26,18], popupAnchor: [0,-18],
        })
      } else if (isSpecial && sInfo) {
        // Emoji badge icon with pulsing glow ring
        icon = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center">
            <div style="position:absolute;inset:0;border-radius:50%;background:${sInfo.color}22;border:2px solid ${sInfo.color};animation:sfmPing 1.5s ease-in-out infinite"></div>
            <span style="font-size:20px;line-height:1;position:relative;z-index:1">${sInfo.emoji}</span>
          </div>`,
          iconSize: [36,36], iconAnchor: [18,18], popupAnchor: [0,-20],
        })
      } else {
        // Generic device — small emoji icon, no glow, no pulse
        const em = MISC_EMOJI[enc.device_type] || '·'
        icon = L.divIcon({
          className: '',
          html: `<div style="font-size:14px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.8))">${em}</div>`,
          iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10],
        })
      }

      const color = isW ? '#2979ff' : isS ? '#ff4d6d' : isSpecial ? (sInfo?.color||'#00e676') : '#00e676'

      // Build popup content
      const nameLine   = enc.device_name ? `<div style="color:#c8d8e8;margin-bottom:4px">${enc.device_name}</div>` : ''
      const macLine    = enc.mac_addr    ? `<div style="color:#5a7a96;font-size:10px;letter-spacing:.05em;margin-bottom:3px">MAC: ${enc.mac_addr}</div>` : ''
      const typeLine   = isSpecial && sInfo ? `<div style="color:${sInfo.color};font-size:11px;margin-bottom:3px">${sInfo.emoji} ${sInfo.label}</div>` : ''
      const rssiLine   = `<div style="font-size:11px;color:#c8d8e8">RSSI: <b>${enc.rssi_max?.toFixed(1)} dBm</b> &nbsp; Hits: ${enc.hit_count}</div>`
      const srcLine    = `<div style="font-size:10px;color:#5a7a96">${enc.source?.toUpperCase()} · ${new Date(enc.peak_ts_ms).toLocaleTimeString()}</div>`
      const tsLine     = enc.show_timestamp ? `<div style="color:#ff9999;font-size:10px;margin-top:2px">🕐 ${new Date(enc.peak_ts_ms).toLocaleString()}</div>` : ''
      const tailLine   = isTail ? `<div style="color:#FF9F0A;font-size:10px;font-weight:700;margin-top:3px">⚠ Seen multiple times this session</div>` : ''

      const popup = `<div style="font-family:monospace;color:#e0e0e0;background:#111820;padding:10px 12px;min-width:180px;max-width:240px;border-left:3px solid ${color}">
        <div style="font-weight:700;color:${color};font-size:13px;margin-bottom:5px">${enc.label||'Device'}</div>
        ${typeLine}${nameLine}${macLine}${rssiLine}${srcLine}${tsLine}${tailLine}
      </div>`

      L.marker([pos.lat,pos.lon],{icon}).bindPopup(popup,{className:'dark-popup',maxWidth:260}).addTo(markerLayerRef.current)

      // Range circle for special device types — colored per device type
      if (isSpecial && sInfo) {
        const rangeMet = rssiToMeters(enc.rssi_max)
        if (rangeMet) {
          L.circle([enc.lat, enc.lon], {
            radius: rangeMet,
            color: sInfo.color, weight: 1.5, opacity: 0.55,
            fillColor: sInfo.color, fillOpacity: 0.04,
            dashArray: '6 4',
          }).addTo(markerLayerRef.current)
        }
      }
    })
  }, [encounters, showMarkers, tailKeys, replayMode, replayEncounters, mapReady])

  // ── User position + Tron tail + speed zoom ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !userPos) return

    const mph = userPos.speed != null ? userPos.speed * 2.23694 : 0

    // Speed → max tail length: longer at highway speed, short at walking pace
    const maxLen = mph < 1  ? 0
                 : mph < 5  ? 6
                 : mph < 15 ? 14
                 : mph < 30 ? 28
                 : mph < 50 ? 45
                 : mph < 70 ? 62
                 : 80

    // Redraws tail layer from current buffer (only reads refs, safe to call from interval)
    const drawTail = () => {
      const pts = tailBufferRef.current
      if (!tailLayerRef.current) tailLayerRef.current = L.layerGroup().addTo(mapRef.current)
      else tailLayerRef.current.clearLayers()
      for (let i = 1; i < pts.length; i++) {
        const t = i / pts.length  // 0 = oldest, 1 = newest
        L.polyline([pts[i-1], pts[i]], {
          color: '#0A84FF', weight: 2 + t * 8, opacity: t * 0.18,
          lineCap: 'round', lineJoin: 'round',
        }).addTo(tailLayerRef.current)
        L.polyline([pts[i-1], pts[i]], {
          color: '#40C8FF', weight: 1 + t * 2.5, opacity: 0.05 + t * 0.9,
          lineCap: 'round', lineJoin: 'round',
        }).addTo(tailLayerRef.current)
      }
    }

    // Add new point if moved >1 m
    const pt = [userPos.lat, userPos.lon]
    const buf = tailBufferRef.current
    if (buf.length === 0 || distM(buf[buf.length-1][0], buf[buf.length-1][1], pt[0], pt[1]) > 1) {
      tailBufferRef.current = [...buf.slice(-(maxLen - 1)), pt]
    } else {
      tailBufferRef.current = buf.slice(-maxLen)
    }

    if (mph >= 1) {
      // Moving: cancel any decay, draw at current length
      if (tailDecayRef.current) { clearInterval(tailDecayRef.current); tailDecayRef.current = null }
      drawTail()
    } else {
      // Stopped: draw current state, then start decaying if not already
      drawTail()
      if (!tailDecayRef.current) {
        tailDecayRef.current = setInterval(() => {
          if (tailBufferRef.current.length > 0) {
            tailBufferRef.current = tailBufferRef.current.slice(1)
            drawTail()
          } else {
            clearInterval(tailDecayRef.current)
            tailDecayRef.current = null
          }
        }, 120)
      }
    }

    // -- Update user marker
    const emoji = VEHICLE_EMOJI[myVehicle] || '🚗'
    const icon = L.divIcon({
      className: '',
      html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px">
        <div style="font-size:28px;filter:drop-shadow(0 0 6px rgba(255,255,255,0.5))">${emoji}</div>
        <div style="background:rgba(255,255,255,0.9);color:#000;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;white-space:nowrap;font-family:-apple-system,system-ui,sans-serif">You</div>
      </div>`,
      iconSize:    [56, 52],
      iconAnchor:  [28, 52],
      popupAnchor: [0, -52],
    })
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userPos.lat, userPos.lon])
      userMarkerRef.current.setIcon(icon)
    } else {
      userMarkerRef.current = L.marker([userPos.lat, userPos.lon], { icon, zIndexOffset:1000 }).addTo(map)
    }

    // -- Auto-zoom
    if (followUserRef.current) {
      const targetZoom = speedToZoom(mph)
      map.setView([userPos.lat, userPos.lon], targetZoom, { animate:true, duration:0.6 })
    }
  }, [userPos, myVehicle])

  // Clean up decay interval on unmount
  useEffect(() => () => { if (tailDecayRef.current) clearInterval(tailDecayRef.current) }, [])

  // ── Other users layer ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (usersLayerRef.current) usersLayerRef.current.clearLayers()
    else usersLayerRef.current = L.layerGroup().addTo(map)

    activeUsers.filter(u => u.username !== myUsername && u.lat && u.lon).forEach(u => {
      const color = userColor(u.username)
      const emoji = VEHICLE_EMOJI[u.vehicle] || '🚗'
      const icon = L.divIcon({
        className: '',
        html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
          <div style="font-size:22px;filter:drop-shadow(0 0 4px ${color})">${emoji}</div>
          <div style="background:${color};color:#000;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;white-space:nowrap;font-family:monospace">${u.username}</div>
        </div>`,
        iconSize: [60, 44],
        iconAnchor: [30, 44],
      })
      L.marker([u.lat, u.lon], { icon, zIndexOffset: 900 })
        .bindPopup(`<div style="font-family:monospace;font-size:12px;color:#e0e0e0;background:#111820;padding:8px 10px;border-left:3px solid ${color}">
          <b style="color:${color}">${emoji} ${u.username}</b><br/>
          ${u.speed != null ? 'Speed: ' + (u.speed * 3.6).toFixed(0) + ' km/h' : 'Speed: —'}
        </div>`, { className: 'dark-popup', maxWidth: 180 })
        .addTo(usersLayerRef.current)
    })
  }, [activeUsers, myUsername])

  // ── Hotspot overlay (Feature 4) ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (hotspotLayerRef.current) hotspotLayerRef.current.clearLayers()
    else hotspotLayerRef.current = L.layerGroup().addTo(map)

    hotspots.forEach(hs => {
      if (!hs.lat || !hs.lon) return
      // Outer glow ring
      L.circle([hs.lat, hs.lon], {
        radius:      (hs.radius_m || 150) * 1.6,
        color:       '#FF453A',
        weight:      1,
        opacity:     0.25,
        fillColor:   '#FF453A',
        fillOpacity: 0.04,
        dashArray:   '5 6',
      }).addTo(hotspotLayerRef.current)

      // Inner solid zone
      L.circle([hs.lat, hs.lon], {
        radius:      hs.radius_m || 150,
        color:       '#FF453A',
        weight:      2,
        opacity:     0.7,
        fillColor:   '#FF2D20',
        fillOpacity: 0.12,
      }).bindPopup(
        `<div style="font-family:monospace;font-size:12px;color:#e0e0e0;background:#111820;padding:8px 10px;border-left:3px solid #FF453A">
          <b style="color:#FF453A">🔥 Stopper Hotspot</b><br/>
          Seen on <b>${hs.day_count}</b> days (7-day window)<br/>
          Total hits: ${hs.hit_count}
         </div>`,
        { className: 'dark-popup', maxWidth: 200 }
      ).addTo(hotspotLayerRef.current)
    })
  }, [hotspots])

  // ── Replay route layer (Feature 1) ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (replayRouteRef.current) { map.removeLayer(replayRouteRef.current); replayRouteRef.current = null }
    if (!replayMode || !replayRoute || replayRoute.length < 2) return
    replayRouteRef.current = L.polyline(
      replayRoute.map(p => [p.lat, p.lon]),
      { color: '#FFD60A', weight: 3, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }
    ).addTo(map)
  }, [replayMode, replayRoute])

  // ── Live stopper trails ───────────────────────────────────────────────────
  // Draws per-stopper movement trails + a pulsing "live" dot at the last known position.
  // Active = seen < 5 min ago (solid red glow), recent = < 30 min (orange), older = gray.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (stopperTrailLayerRef.current) {
      map.removeLayer(stopperTrailLayerRef.current)
      stopperTrailLayerRef.current = null
    }
    if (!stopperTrails || stopperTrails.length === 0 || replayMode) return

    const now = Date.now()
    const layer = L.layerGroup().addTo(map)
    stopperTrailLayerRef.current = layer

    stopperTrails.forEach(stopper => {
      if (!stopper.trail || stopper.trail.length === 0) return
      const ageMs  = now - stopper.last_seen_ms
      const active = ageMs < 5 * 60 * 1000    // < 5 min
      const recent = ageMs < 15 * 60 * 1000   // < 15 min

      const trailColor = active ? '#FF453A' : recent ? '#FF9F0A' : 'rgba(200,80,60,0.4)'
      const dotColor   = active ? '#FF453A' : recent ? '#FF9F0A' : '#888'

      // Trail polyline (only draw if mobile and has 2+ GPS points)
      if (stopper.is_mobile && stopper.trail.length >= 2) {
        const pts = stopper.trail.map(p => [p.lat, p.lng])
        L.polyline(pts, {
          color:     trailColor,
          weight:    active ? 3 : 2,
          opacity:   active ? 0.85 : recent ? 0.55 : 0.3,
          dashArray: active ? null : '6 5',
          lineJoin:  'round',
        }).addTo(layer)
      }

      // Current-position marker
      const last = stopper.trail[stopper.trail.length - 1]
      if (!last?.lat || !last?.lng) return

      // Pulsing ring (active only)
      if (active) {
        L.circleMarker([last.lat, last.lng], {
          radius:      18,
          color:       '#FF453A',
          weight:      2,
          fillColor:   '#FF453A',
          fillOpacity: 0.08,
          className:   'stopper-pulse',
        }).addTo(layer)
      }

      // Solid dot
      const ageSecs = Math.round(ageMs / 1000)
      const ageLabel = ageSecs < 60
        ? `${ageSecs}s ago`
        : ageSecs < 3600
          ? `${Math.round(ageSecs / 60)}m ago`
          : `${Math.round(ageSecs / 3600)}h ago`

      L.circleMarker([last.lat, last.lng], {
        radius:      active ? 9 : recent ? 7 : 5,
        color:       '#000',
        weight:      1.5,
        fillColor:   dotColor,
        fillOpacity: active ? 0.95 : 0.7,
      })
        .bindTooltip(
          `<div style="font-size:11px;line-height:1.5;min-width:140px">
            <strong style="color:${dotColor}">🚔 ${stopper.label || 'Fleet Device'}</strong><br/>
            ${stopper.source} · ${stopper.rssi ?? '?'} dBm<br/>
            ${stopper.is_mobile ? '📍 Mobile' : '📌 Fixed'} · ${stopper.hit_count} hits<br/>
            <span style="opacity:0.6">${ageLabel}</span>
          </div>`,
          { permanent: false, direction: 'top', className: 'stopper-tip' }
        )
        .addTo(layer)
    })
  }, [stopperTrails, replayMode])

  // ── Flock / ALPR camera layer ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (flockLayerRef.current) { map.removeLayer(flockLayerRef.current); flockLayerRef.current = null }
    if (!showFlockCameras || !flockCameras || flockCameras.length === 0) return

    const layer = L.layerGroup().addTo(map)
    flockLayerRef.current = layer

    flockCameras.forEach(cam => {
      if (!cam.lat || !cam.lng) return
      const isLocal  = cam.source === 'local_scan'
      const fillCol  = isLocal ? '#BF5AF2' : '#aaaacc'
      const ringCol  = isLocal ? '#BF5AF2' : '#8888aa'

      // Outer glow ring
      L.circleMarker([cam.lat, cam.lng], {
        radius: 10, color: ringCol, weight: 1,
        fillColor: fillCol, fillOpacity: 0.08,
        interactive: false,
      }).addTo(layer)

      // Icon dot
      L.divIcon({
        className: '',
        html: `<div style="font-size:13px;line-height:1;filter:drop-shadow(0 0 3px ${isLocal ? '#BF5AF2' : '#666'})">📷</div>`,
        iconSize: [16, 16], iconAnchor: [8, 8],
      })

      L.marker([cam.lat, cam.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="font-size:13px;line-height:1;filter:drop-shadow(0 0 3px ${isLocal ? '#BF5AF2' : '#777'})">📷</div>`,
          iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10],
        }),
      })
        .bindTooltip(
          `<div style="font-size:11px;line-height:1.5;min-width:120px">
            <strong style="color:${isLocal ? '#BF5AF2' : '#ccc'}">📷 ALPR Camera</strong><br/>
            ${cam.label || 'Flock Safety'}<br/>
            ${cam.city  ? `<span style="opacity:0.6">${cam.city}</span><br/>` : ''}
            <span style="font-size:10px;opacity:0.5">${isLocal ? 'Locally scanned' : 'DeFlock.me'}</span>
          </div>`,
          { permanent: false, direction: 'top', className: 'stopper-tip' }
        )
        .addTo(layer)
    })
  }, [flockCameras, showFlockCameras])

  // ── Proximity alerts ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!userPos || replayMode) return
    encounters.forEach(enc => {
      if (!enc.lat || !enc.lon) return

      const isS       = enc.label === 'Fun-Stopper'
      const isW       = enc.label === 'Fun-Watcher'
      const isSpecial = SPECIAL_TYPES.has(enc.device_type)

      // Common devices never generate alerts — they silently appear on the map
      if (!isS && !isW && !isSpecial) return

      const d = distM(userPos.lat, userPos.lon, enc.lat, enc.lon)
      if (d > alertRadiusM) return

      const now = Date.now()
      const key = enc.target_key || enc.id

      if (isS) {
        // Stopper: alert every time it's in range (with cooldown between repeats)
        if ((now - (alertedAt[key] || 0)) > alertCooldownMs) {
          alertedAt[key] = now
          onAlert?.({ type: enc.label, color: enc.color || 'red',
            distance: Math.round(d), rssi: enc.rssi_max, ts: enc.peak_ts_ms })
        }
      } else {
        // Watcher / special device: only alert the very first time this session
        if (!seenTargetKeys.has(key)) {
          seenTargetKeys.add(key)
          onAlert?.({ type: enc.label || enc.device_type, color: enc.color || 'cyan',
            distance: Math.round(d), rssi: enc.rssi_max, ts: enc.peak_ts_ms,
            device_type: enc.device_type, device_name: enc.device_name,
            mac_addr: enc.mac_addr, firstSeen: true })
        }
      }
    })
  }, [userPos, encounters, alertRadiusM, alertCooldownMs, onAlert])

  // Re-center button handler (exposed via data-attr on container)
  const handleRecenter = () => {
    followUserRef.current = true
    if (mapRef.current && userPos) mapRef.current.setView([userPos.lat,userPos.lon],15,{animate:true})
  }

  // Show speedometer whenever GPS is active; default to 0 when speed is null
  // (iOS often returns null for speed even when moving)
  const speedMph = userPos != null
    ? Math.round((userPos.speed ?? 0) * 2.23694)
    : null

  // Sidebar state booleans for positioning
  const sidebarHalf = sidebarState === 'half'
  const sidebarFull = sidebarState === 'full'

  return (
    <div style={{flex:1,width:'100%',position:'relative'}}>
      <div ref={containerRef} className="map-container" style={{flex:1,width:'100%',height:'100%'}}/>

      {/* Replay mode badge */}
      {replayMode && (
        <div style={{
          position:'absolute', top:14, left:'50%', transform:'translateX(-50%)',
          zIndex:1100,
          background:'rgba(255,214,10,0.18)',
          backdropFilter:'blur(12px)',
          border:'1px solid rgba(255,214,10,0.5)',
          borderRadius:20, padding:'5px 14px',
          color:'#FFD60A', fontSize:12, fontWeight:700,
          fontFamily:'-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
          letterSpacing:'0.04em', pointerEvents:'none',
        }}>⏮ REPLAY MODE</div>
      )}

      {/* Speed display — bottom-left; shifts up when half-open, hidden when full */}
      {speedMph !== null && !sidebarFull && (
        <div style={{
          position:'absolute',
          bottom: sidebarHalf
            ? 'calc(56vh + 8px)'
            : 'max(10px, calc(env(safe-area-inset-bottom, 0px) + 10px))',
          left:'max(16px, calc(env(safe-area-inset-left, 0px) + 16px))',
          zIndex:1000,
          transition:'bottom 0.38s cubic-bezier(0.32,0.72,0,1)',
          background:'rgba(28,28,30,0.92)',
          backdropFilter:'blur(24px) saturate(180%)',
          WebkitBackdropFilter:'blur(24px) saturate(180%)',
          borderRadius:16,
          padding:'10px 18px 8px',
          display:'flex', flexDirection:'column', alignItems:'center',
          minWidth:72,
          boxShadow:'0 4px 20px rgba(0,0,0,0.45)',
        }}>
          <div style={{
            fontSize:36, fontWeight:700, color:'#fff',
            fontFamily:'-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
            letterSpacing:'-0.03em', lineHeight:1,
          }}>{speedMph}</div>
          <div style={{
            fontSize:11, color:'rgba(235,235,245,0.55)',
            fontFamily:'-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
            fontWeight:500, marginTop:4, letterSpacing:'0.01em',
          }}>mph</div>
        </div>
      )}

      {/* Map type picker — hidden when sidebar is open on mobile */}
      {sidebarState === 'closed' && <div style={{
        position:'absolute',
        top:'max(14px, calc(env(safe-area-inset-top, 0px) + 14px))',
        right:'max(14px, calc(env(safe-area-inset-right, 0px) + 14px))',
        zIndex:1000, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6,
      }}>
        <button onClick={() => setShowTilePicker(v=>!v)} style={{
          background:'rgba(28,28,30,0.88)',
          backdropFilter:'blur(20px) saturate(180%)',
          WebkitBackdropFilter:'blur(20px) saturate(180%)',
          border:'1px solid rgba(84,84,88,0.35)',
          color:'#fff',
          fontFamily:'-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
          fontSize:13, fontWeight:500,
          padding:'7px 13px',
          borderRadius:20,
          cursor:'pointer',
          boxShadow:'0 2px 10px rgba(0,0,0,0.35)',
        }}>🗺 {TILE_LAYERS.find(t=>t.id===tileId)?.label||'Map'}</button>
        {showTilePicker && (
          <div style={{
            background:'rgba(28,28,30,0.95)',
            backdropFilter:'blur(24px) saturate(180%)',
            WebkitBackdropFilter:'blur(24px) saturate(180%)',
            border:'1px solid rgba(84,84,88,0.35)',
            borderRadius:14,
            overflow:'hidden',
            boxShadow:'0 8px 24px rgba(0,0,0,0.5)',
            display:'flex', flexDirection:'column',
          }}>
            {TILE_LAYERS.map((t,i) => (
              <button key={t.id} onClick={() => { setTileId(t.id); localStorage.setItem('sfm_tile_id', t.id); setShowTilePicker(false) }} style={{
                background: t.id===tileId ? 'rgba(10,132,255,0.18)' : 'none',
                border:'none',
                borderBottom: i < TILE_LAYERS.length-1 ? '1px solid rgba(84,84,88,0.3)' : 'none',
                color: t.id===tileId ? '#0A84FF' : '#fff',
                fontFamily:'-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
                fontSize:14, fontWeight: t.id===tileId ? 600 : 400,
                padding:'10px 20px',
                cursor:'pointer', textAlign:'left', whiteSpace:'nowrap',
              }}>{t.label}</button>
            ))}
          </div>
        )}
      </div>}

      {/* Re-center button — bottom-right, hidden when sidebar open */}
      {userPos && sidebarState === 'closed' && (
        <button
          onClick={handleRecenter}
          title="Re-center on my location"
          style={{
            position:'absolute',
            bottom:'max(10px, calc(env(safe-area-inset-bottom, 0px) + 10px))',
            right:'max(16px, calc(env(safe-area-inset-right, 0px) + 16px))',
            zIndex:1000,
            background:'rgba(28,28,30,0.88)',
            backdropFilter:'blur(20px) saturate(180%)',
            WebkitBackdropFilter:'blur(20px) saturate(180%)',
            border:'1px solid rgba(84,84,88,0.35)',
            borderRadius:'50%',
            width:44, height:44,
            cursor:'pointer', fontSize:20,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 4px 14px rgba(0,0,0,0.4)',
          }}
        >🏍</button>
      )}
    </div>
  )
}
