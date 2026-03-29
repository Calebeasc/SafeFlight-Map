import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import KineticThreatOverlay from './KineticThreatOverlay'

let heatPlugin = null
async function ensureHeatPlugin() {
  if (!heatPlugin) {
    await import('leaflet.heat')
    heatPlugin = true
  }
}

const DEFAULT_CENTER = [33.4484, -112.074]
const DEFAULT_ZOOM = 15

const TILE_LAYERS = [
  { id: 'dark', label: 'Dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '&copy; CARTO &copy; OSM', subdomains: 'abcd' },
  { id: 'street', label: 'Street', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap', subdomains: 'abc' },
  { id: 'satellite', label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '&copy; Esri', subdomains: '' },
]

const SPECIAL_INFO = {
  ring: { label: 'Ring Camera', color: '#FF8C00', emoji: '🔔' },
  axon: { label: 'Axon Body Camera', color: '#007AFF', emoji: '📹' },
  flock: { label: 'Flock Safety/ALPR', color: '#FF2D55', emoji: '📷' },
  drone: { label: 'Drone', color: '#5AC8FA', emoji: '🚁' },
  smartglasses: { label: 'Smart Glasses', color: '#AF52DE', emoji: '🕶' },
}

const VEHICLE_EMOJI = {
  motorcycle: '🏍',
  car: '🚗',
  van: '🚐',
  truck: '🚛',
  bicycle: '🚴',
  foot: '🚶',
}

const USER_COLORS = ['#00e676', '#00d4ff', '#ffab40', '#ea80fc', '#ff6d6d', '#b2ff59', '#40c4ff']

function userColor(name = '') {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return USER_COLORS[Math.abs(h) % USER_COLORS.length]
}

function distM(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function makeEmojiIcon(emoji, size = 22, label = '') {
  const labelHtml = label
    ? `<div style="margin-top:2px;background:rgba(8,12,20,0.88);color:#fff;padding:1px 6px;border-radius:999px;font-size:10px;font-weight:700;font-family:monospace;white-space:nowrap">${label}</div>`
    : ''
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-4px)">
      <div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.85))">${emoji}</div>
      ${labelHtml}
    </div>`,
    iconSize: [size + 20, size + 22],
    iconAnchor: [(size + 20) / 2, size + 18],
    popupAnchor: [0, -size],
  })
}

function routeFromPoints(points = []) {
  return points
    .filter((pt) => pt && pt.lat != null && pt.lon != null)
    .map((pt) => [pt.lat, pt.lon])
}

export default function MapView({
  heatCells = [],
  encounters = [],
  showMarkers = true,
  userPos = null,
  routePoints = [],
  showRoute = true,
  onAlert = null,
  alertRadiusM = 300,
  alertCooldownMs = 30000,
  activeUsers = [],
  myUsername = '',
  myVehicle = 'motorcycle',
  hotspots = [],
  tailKeys = new Set(),
  stopperTrails = [],
  aircraftData = [],
  velocityWindows = [],
  interceptionVectors = [],
  flockCameras = [],
  showFlockCameras = true,
  replayMode = false,
  replayEncounters = null,
  replayRoute = null,
  replayHeatCells = null,
  sidebarState = 'closed',
}) {
  const [tileId, setTileId] = useState(() => localStorage.getItem('sfm_tile_id') || 'dark')
  const [showTilePicker, setShowTilePicker] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const tileLayerRef = useRef(null)
  const heatLayerRef = useRef(null)
  const markerLayerRef = useRef(null)
  const routeLayerRef = useRef(null)
  const userLayerRef = useRef(null)
  const usersLayerRef = useRef(null)
  const hotspotLayerRef = useRef(null)
  const stopperTrailLayerRef = useRef(null)
  const flockLayerRef = useRef(null)
  const alertTimestampsRef = useRef({})

  const displayEncounters = replayMode ? (replayEncounters || []) : encounters
  const displayHeatCells = replayMode ? (replayHeatCells || []) : heatCells
  const displayRoute = replayMode ? (replayRoute || []) : routePoints

  useEffect(() => {
    let resizeHandler = null

    ensureHeatPlugin().then(() => {
      if (mapRef.current || !containerRef.current) return

      const map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,
      })

      const def = TILE_LAYERS.find((t) => t.id === tileId) || TILE_LAYERS[0]
      tileLayerRef.current = L.tileLayer(def.url, {
        attribution: def.attr,
        subdomains: def.subdomains || '',
        maxZoom: 19,
      }).addTo(map)

      mapRef.current = map
      setMapReady(true)

      resizeHandler = () => map.invalidateSize()
      window.addEventListener('resize', resizeHandler)
      setTimeout(() => map.invalidateSize(), 120)
    })

    return () => {
      if (resizeHandler) window.removeEventListener('resize', resizeHandler)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const def = TILE_LAYERS.find((t) => t.id === tileId) || TILE_LAYERS[0]
    localStorage.setItem('sfm_tile_id', def.id)
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    tileLayerRef.current = L.tileLayer(def.url, {
      attribution: def.attr,
      subdomains: def.subdomains || '',
      maxZoom: 19,
    }).addTo(map)
    tileLayerRef.current.bringToBack()
  }, [tileId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !heatPlugin) return

    const pts = displayHeatCells
      .filter((c) => c && c.lat != null && c.lon != null)
      .map((c) => [c.lat, c.lon, c.intensity || 0.5])

    if (!heatLayerRef.current) {
      heatLayerRef.current = L.heatLayer(pts, {
        radius: 35,
        blur: 25,
        maxZoom: 17,
        gradient: { 0: '#0a1628', 0.3: '#0d3b6e', 0.5: '#0077cc', 0.7: '#00d4ff', 1: '#ffffff' },
      }).addTo(map)
    } else {
      heatLayerRef.current.setLatLngs(pts)
    }
  }, [displayHeatCells, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current)
      routeLayerRef.current = null
    }
    if (!showRoute) return

    let coords = routeFromPoints(displayRoute)
    if (coords.length < 2) {
      coords = displayEncounters
        .filter((e) => e && e.label === 'Fun-Stopper' && e.lat != null && e.lon != null)
        .sort((a, b) => (a.peak_ts_ms || 0) - (b.peak_ts_ms || 0))
        .map((e) => [e.lat, e.lon])
    }
    if (coords.length < 2) return

    routeLayerRef.current = L.polyline(coords, {
      color: replayMode ? '#40C8FF' : '#FF453A',
      weight: 3,
      opacity: 0.7,
      dashArray: replayMode ? '10 6' : '7 5',
      lineJoin: 'round',
    }).addTo(map)
  }, [displayRoute, displayEncounters, showRoute, replayMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (markerLayerRef.current) markerLayerRef.current.clearLayers()
    else markerLayerRef.current = L.layerGroup().addTo(map)
    if (!showMarkers) return

    const byRecency = [...displayEncounters].sort((a, b) => (b.peak_ts_ms || 0) - (a.peak_ts_ms || 0))
    byRecency.slice(0, 200).forEach((enc) => {
      if (!enc || enc.lat == null || enc.lon == null) return

      const special = SPECIAL_INFO[enc.device_type]
      const isWatcher = enc.label === 'Fun-Watcher'
      const isStopper = enc.label === 'Fun-Stopper'
      const icon = special
        ? makeEmojiIcon(special.emoji, 20, tailKeys.has(enc.target_key) ? 'TAIL' : '')
        : isWatcher
          ? makeEmojiIcon('📷', 22, tailKeys.has(enc.target_key) ? 'TAIL' : '')
          : isStopper
            ? makeEmojiIcon('🚔', 24, tailKeys.has(enc.target_key) ? 'TAIL' : '')
            : makeEmojiIcon('📡', 16)

      const color = special?.color || (isWatcher ? '#2979ff' : isStopper ? '#ff4d6d' : '#00e676')
      const popup = [
        `<div style="font-family:monospace;color:#e0e0e0;background:#111820;padding:10px 12px;min-width:180px;max-width:240px;border-left:3px solid ${color}">`,
        `<div style="font-weight:700;color:${color};font-size:13px;margin-bottom:5px">${enc.label || special?.label || 'Device'}</div>`,
        special ? `<div style="font-size:11px;color:${special.color};margin-bottom:3px">${special.label}</div>` : '',
        enc.device_name ? `<div style="color:#c8d8e8;margin-bottom:4px">${enc.device_name}</div>` : '',
        enc.mac_addr ? `<div style="color:#5a7a96;font-size:10px;margin-bottom:3px">MAC: ${enc.mac_addr}</div>` : '',
        `<div style="font-size:11px;color:#c8d8e8">RSSI: <b>${enc.rssi_max?.toFixed?.(1) ?? enc.rssi_max ?? 'n/a'} dBm</b> · Hits: ${enc.hit_count || 1}</div>`,
        `<div style="font-size:10px;color:#5a7a96">${enc.source?.toUpperCase?.() || 'SCAN'} · ${enc.peak_ts_ms ? new Date(enc.peak_ts_ms).toLocaleTimeString() : 'unknown time'}</div>`,
        '</div>',
      ].join('')

      L.marker([enc.lat, enc.lon], { icon })
        .bindPopup(popup, { className: 'dark-popup', maxWidth: 260 })
        .addTo(markerLayerRef.current)

      if (special) {
        L.circle([enc.lat, enc.lon], {
          radius: 120,
          color: special.color,
          weight: 1.5,
          opacity: 0.5,
          fillColor: special.color,
          fillOpacity: 0.05,
          dashArray: '6 4',
        }).addTo(markerLayerRef.current)
      }
    })
  }, [displayEncounters, mapReady, showMarkers, tailKeys])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (userLayerRef.current) userLayerRef.current.clearLayers()
    else userLayerRef.current = L.layerGroup().addTo(map)

    if (!userPos || userPos.lat == null || userPos.lon == null) return

    const icon = makeEmojiIcon(VEHICLE_EMOJI[myVehicle] || '🚗', 28, 'You')
    L.marker([userPos.lat, userPos.lon], { icon, zIndexOffset: 1000 }).addTo(userLayerRef.current)
    L.circle([userPos.lat, userPos.lon], {
      radius: alertRadiusM,
      color: '#00D4FF',
      weight: 1,
      opacity: 0.25,
      fillColor: '#00D4FF',
      fillOpacity: 0.03,
    }).addTo(userLayerRef.current)

    const zoom = userPos.speed && userPos.speed > 20 ? 13 : userPos.speed && userPos.speed > 8 ? 15 : 17
    map.setView([userPos.lat, userPos.lon], zoom, { animate: true, duration: 0.45 })
  }, [userPos, myVehicle, alertRadiusM])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (usersLayerRef.current) usersLayerRef.current.clearLayers()
    else usersLayerRef.current = L.layerGroup().addTo(map)

    activeUsers
      .filter((u) => u && u.username !== myUsername && u.lat != null && u.lon != null)
      .forEach((u) => {
        const color = userColor(u.username)
        const icon = L.divIcon({
          className: '',
          html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
            <div style="font-size:22px;filter:drop-shadow(0 0 4px ${color})">${VEHICLE_EMOJI[u.vehicle] || '🚗'}</div>
            <div style="background:${color};color:#000;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;white-space:nowrap;font-family:monospace">${u.username}</div>
          </div>`,
          iconSize: [60, 44],
          iconAnchor: [30, 44],
        })
        L.marker([u.lat, u.lon], { icon, zIndexOffset: 900 }).addTo(usersLayerRef.current)
      })
  }, [activeUsers, myUsername])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (hotspotLayerRef.current) hotspotLayerRef.current.clearLayers()
    else hotspotLayerRef.current = L.layerGroup().addTo(map)

    hotspots.forEach((hs) => {
      if (!hs || hs.lat == null || hs.lon == null) return
      const radius = hs.radius_m || 150
      L.circle([hs.lat, hs.lon], {
        radius,
        color: '#FF453A',
        weight: 2,
        opacity: 0.7,
        fillColor: '#FF2D20',
        fillOpacity: 0.12,
      }).bindPopup(
        `<div style="font-family:monospace;font-size:12px;color:#e0e0e0;background:#111820;padding:8px 10px;border-left:3px solid #FF453A">
          <b style="color:#FF453A">🔥 Stopper Hotspot</b><br/>
          Seen on <b>${hs.day_count || 0}</b> days<br/>
          Total hits: ${hs.hit_count || 0}
        </div>`,
      ).addTo(hotspotLayerRef.current)
    })
  }, [hotspots])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (stopperTrailLayerRef.current) stopperTrailLayerRef.current.clearLayers()
    else stopperTrailLayerRef.current = L.layerGroup().addTo(map)

    stopperTrails.forEach((trail) => {
      const pts = routeFromPoints(trail.points || [])
      if (pts.length < 2) return
      const ageMs = Date.now() - (trail.last_seen_ms || 0)
      const color = ageMs < 5 * 60 * 1000 ? '#FF453A' : ageMs < 15 * 60 * 1000 ? '#FF9F0A' : '#8E8E93'
      const dashArray = ageMs < 5 * 60 * 1000 ? null : '8 6'
      L.polyline(pts, {
        color,
        weight: 3,
        opacity: 0.75,
        dashArray: dashArray || undefined,
      }).addTo(stopperTrailLayerRef.current)
    })
  }, [stopperTrails])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (flockLayerRef.current) flockLayerRef.current.clearLayers()
    else flockLayerRef.current = L.layerGroup().addTo(map)
    if (!showFlockCameras) return

    flockCameras.forEach((cam) => {
      if (!cam || cam.lat == null || cam.lng == null) return
      L.marker([cam.lat, cam.lng], { icon: makeEmojiIcon('📷', 18) })
        .bindPopup(
          `<div style="font-family:monospace;font-size:12px;color:#e0e0e0;background:#111820;padding:8px 10px;border-left:3px solid #FF2D55">
            <b style="color:#FF2D55">${cam.label || 'Flock Camera'}</b><br/>
            ${cam.city || ''} ${cam.source ? `· ${cam.source}` : ''}
          </div>`,
        )
        .addTo(flockLayerRef.current)
    })
  }, [flockCameras, showFlockCameras])

  useEffect(() => {
    if (!userPos || !onAlert || replayMode) return

    const now = Date.now()
    displayEncounters.forEach((enc) => {
      if (!enc || enc.lat == null || enc.lon == null || !enc.target_key) return
      const last = alertTimestampsRef.current[enc.target_key] || 0
      if (now - last < alertCooldownMs) return
      if (distM(userPos.lat, userPos.lon, enc.lat, enc.lon) > alertRadiusM) return

      alertTimestampsRef.current[enc.target_key] = now
      onAlert({
        key: enc.target_key,
        label: enc.label || 'Device',
        color: enc.label === 'Fun-Stopper' ? '#FF453A' : '#00D4FF',
        distance_m: Math.round(distM(userPos.lat, userPos.lon, enc.lat, enc.lon)),
      })
    })
  }, [alertCooldownMs, alertRadiusM, displayEncounters, onAlert, replayMode, userPos])

  const mapInset = sidebarState === 'full' ? 320 : sidebarState === 'half' ? 180 : 0

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, paddingBottom: mapInset }} />

      {mapReady && (
        <KineticThreatOverlay
          map={mapRef.current}
          aircraftData={aircraftData}
          velocityWindows={velocityWindows}
          interceptionVectors={interceptionVectors}
        />
      )}

      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 900, display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setShowTilePicker((v) => !v)}
          style={{
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(8,12,20,0.88)',
            color: '#E8EDF5',
            borderRadius: 10,
            padding: '8px 10px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Layers
        </button>
        {showTilePicker && (
          <div style={{
            display: 'flex',
            gap: 6,
            padding: 6,
            borderRadius: 12,
            background: 'rgba(8,12,20,0.92)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {TILE_LAYERS.map((layer) => (
              <button
                key={layer.id}
                type="button"
                onClick={() => {
                  setTileId(layer.id)
                  setShowTilePicker(false)
                }}
                style={{
                  border: `1px solid ${tileId === layer.id ? '#00D4FF' : 'rgba(255,255,255,0.08)'}`,
                  background: tileId === layer.id ? 'rgba(0,212,255,0.15)' : 'transparent',
                  color: tileId === layer.id ? '#00D4FF' : '#E8EDF5',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {layer.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
