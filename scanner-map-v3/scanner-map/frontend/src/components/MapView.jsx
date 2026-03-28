import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

let heatPlugin = null
async function ensureHeatPlugin() {
  if (!heatPlugin) { await import('leaflet.heat'); heatPlugin = true }
}

const DEFAULT_CENTER = [33.4484, -112.074]
const DEFAULT_ZOOM   = 13
// alert radius now comes from props
const MOVE_THRESHOLD_M = 50
// cooldown now comes from props

// ── SVG icons ─────────────────────────────────────────────────────────────────

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

const BIKE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 56" width="28" height="40">
  <defs><filter id="gc" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="3" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter></defs>
  <ellipse cx="20" cy="46" rx="8" ry="5" fill="#0a1a2a" stroke="#00d4ff" stroke-width="1.5"/>
  <ellipse cx="20" cy="46" rx="4" ry="2.5" fill="#00d4ff" opacity="0.4"/>
  <path d="M13,38 Q12,22 20,10 Q28,22 27,38 Z" fill="#0d1e30" stroke="#00d4ff" stroke-width="1.5" filter="url(#gc)"/>
  <ellipse cx="20" cy="30" rx="6" ry="9" fill="#091522" stroke="#00d4ff" stroke-width="1"/>
  <path d="M15,18 Q20,8 25,18 Q22,14 20,13 Q18,14 15,18Z" fill="#00d4ff" opacity="0.6"/>
  <ellipse cx="20" cy="8" rx="6" ry="4" fill="#0a1a2a" stroke="#00d4ff" stroke-width="1.5"/>
  <ellipse cx="20" cy="8" rx="3" ry="2" fill="#00d4ff" opacity="0.4"/>
  <circle cx="20" cy="22" r="4.5" fill="#0d1e30" stroke="#00d4ff" stroke-width="1.2"/>
  <ellipse cx="13" cy="38" rx="2" ry="1" fill="#00d4ff" opacity="0.5"/>
  <line x1="7" y1="28" x2="3" y2="28" stroke="#00d4ff" stroke-width="0.8" opacity="0.4"/>
  <line x1="7" y1="32" x2="2" y2="32" stroke="#00d4ff" stroke-width="0.8" opacity="0.3"/>
</svg>`

function makeDivIcon(svg, w, h) {
  return L.divIcon({
    className: '',
    html: svg,
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
    popupAnchor: [0, -h / 2],
  })
}

function distM(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

const stablePositions = {}
function getStablePos(enc) {
  const prev = stablePositions[enc.id]
  if (!prev) { stablePositions[enc.id] = { lat: enc.lat, lon: enc.lon }; return stablePositions[enc.id] }
  if (distM(prev.lat, prev.lon, enc.lat, enc.lon) > MOVE_THRESHOLD_M)
    stablePositions[enc.id] = { lat: enc.lat, lon: enc.lon }
  return stablePositions[enc.id]
}

const alertedAt = {}

export default function MapView({ heatCells, encounters, showMarkers, userPos, onAlert, alertRadiusM = 300, alertCooldownMs = 30000 }) {
  const containerRef   = useRef(null)
  const mapRef         = useRef(null)
  const heatLayerRef   = useRef(null)
  const markerLayerRef = useRef(null)
  const userMarkerRef  = useRef(null)

  // Init map
  useEffect(() => {
    ensureHeatPlugin().then(() => {
      if (mapRef.current) return
      const map = L.map(containerRef.current, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO &copy; OSM', subdomains: 'abcd', maxZoom: 19,
      }).addTo(map)
      mapRef.current = map
      setTimeout(() => map.invalidateSize(), 100)
      window.addEventListener('resize', () => map.invalidateSize())
    })
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }
  }, [])

  // Heat layer
  useEffect(() => {
    const map = mapRef.current
    if (!map || !heatPlugin) return
    const points = heatCells.filter(c => c.lat && c.lon).map(c => [c.lat, c.lon, c.intensity])
    if (heatLayerRef.current) heatLayerRef.current.setLatLngs(points)
    else heatLayerRef.current = L.heatLayer(points, {
      radius: 35, blur: 25, maxZoom: 17,
      gradient: { 0:'#0a1628', 0.3:'#0d3b6e', 0.5:'#0077cc', 0.7:'#00d4ff', 1:'#ffffff' },
    }).addTo(map)
  }, [heatCells])

  // Encounter markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (markerLayerRef.current) markerLayerRef.current.clearLayers()
    else markerLayerRef.current = L.layerGroup().addTo(map)
    if (!showMarkers) return

    const watchers  = encounters.filter(e => e.label === 'Fun-Watcher').slice(0, 8)
    const stoppers  = encounters.filter(e => e.label === 'Fun-Stopper').slice(0, 8)
    const unlabeled = encounters.filter(e => !e.label).slice(0, 3)

    ;[...watchers, ...stoppers, ...unlabeled].forEach(enc => {
      if (!enc.lat || !enc.lon) return
      const isWatcher = enc.label === 'Fun-Watcher'
      const isStopper = enc.label === 'Fun-Stopper'
      const pos = isWatcher ? getStablePos(enc) : { lat: enc.lat, lon: enc.lon }
      const icon = isWatcher ? makeDivIcon(CAMERA_SVG, 36, 36)
        : isStopper ? makeDivIcon(COP_SVG, 52, 36)
        : L.divIcon({ className:'', html:`<div style="width:10px;height:10px;border-radius:50%;background:#00d4ff;border:2px solid #fff;box-shadow:0 0 6px #00d4ff"></div>`, iconSize:[10,10], iconAnchor:[5,5] })
      const color = isWatcher ? '#2979ff' : isStopper ? '#ff4d6d' : '#00d4ff'
      const ts = enc.show_timestamp
        ? `<br/><span style="color:#ff9999;font-size:10px">🕐 ${new Date(enc.peak_ts_ms).toLocaleString()}</span>` : ''
      const popup = `<div style="font-family:monospace;font-size:12px;color:#e0e0e0;background:#111820;padding:8px 10px;min-width:160px;border-left:3px solid ${color}">
        <b style="color:${color}">${enc.label || 'Target'}</b><br/>
        RSSI: ${enc.rssi_max?.toFixed(1)} dBm &nbsp; Hits: ${enc.hit_count}${ts}</div>`
      L.marker([pos.lat, pos.lon], { icon })
        .bindPopup(popup, { className:'dark-popup', maxWidth:220 })
        .addTo(markerLayerRef.current)
    })
  }, [encounters, showMarkers])

  // User position
  useEffect(() => {
    const map = mapRef.current
    if (!map || !userPos) return
    const icon = makeDivIcon(BIKE_SVG, 28, 40)
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userPos.lat, userPos.lon])
    } else {
      userMarkerRef.current = L.marker([userPos.lat, userPos.lon], { icon, zIndexOffset: 1000 }).addTo(map)
      map.setView([userPos.lat, userPos.lon], map.getZoom())
    }
  }, [userPos])

  // Proximity alerts
  useEffect(() => {
    if (!userPos) return
    encounters.forEach(enc => {
      if (!enc.lat || !enc.lon) return
      const d = distM(userPos.lat, userPos.lon, enc.lat, enc.lon)
      if (d <= alertRadiusM) {
        const now = Date.now()
        if ((now - (alertedAt[enc.id] || 0)) > alertCooldownMs) {
          alertedAt[enc.id] = now
          onAlert?.({ type: enc.label || 'Target', color: enc.color || 'cyan', distance: Math.round(d), rssi: enc.rssi_max, ts: enc.peak_ts_ms })
        }
      }
    })
  }, [userPos, encounters, onAlert])

  return <div ref={containerRef} className="map-container" style={{ flex:1, width:'100%' }} />
}
