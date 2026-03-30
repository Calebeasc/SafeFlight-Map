import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useSovereign } from '../context/SovereignContext'
import useDevBuildDownload from '../hooks/useDevBuildDownload'
import { useTrophyRoadStore } from '../stores/trophyRoadStore'

const VehicleModelPreview = lazy(() => import('./VehicleModelPreview'))

function assetById(assets) {
  return Object.fromEntries((assets || []).map((asset) => [asset.asset_filename, asset]))
}

function createBuilderId(assetFilename = 'asset') {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${assetFilename}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

export default function DevAssetOps() {
  const { authHeaders, isDeveloper } = useSovereign()
  const { assets, milestones, hydrate, connect } = useTrophyRoadStore()
  const [uploadFiles, setUploadFiles] = useState([])
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [builder, setBuilder] = useState([])
  const [dragAsset, setDragAsset] = useState('')
  const {
    error: downloadError,
    phase: downloadPhase,
    triggerDownload: requestDownload,
  } = useDevBuildDownload()
  const assetsMap = useMemo(() => assetById(assets), [assets])

  useEffect(() => {
    hydrate()
    connect()
  }, [hydrate, connect])

  useEffect(() => {
    setBuilder(milestones.map((m) => ({
      id: m.id != null ? String(m.id) : createBuilderId(m.asset_filename),
      asset_filename: m.asset_filename,
      milestone_title: m.milestone_title,
      required_xp: m.required_xp,
    })))
  }, [milestones])

  useEffect(() => () => {
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl)
  }, [uploadPreviewUrl])

  const handleFile = (file) => {
    if (!file) return
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl)
    setUploadFiles([file])
    setUploadProgress(0)
    setUploadPreviewUrl(URL.createObjectURL(file))
  }

  const handleFiles = (incoming) => {
    const picked = Array.from(incoming || [])
    if (!picked.length) return
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl)
    const preview = picked.find((file) => /\.(glb|gltf|obj)$/i.test(file.name)) || picked[0]
    setUploadFiles(picked)
    setUploadProgress(0)
    setUploadPreviewUrl(URL.createObjectURL(preview))
  }

  const uploadAsset = async () => {
    if (!uploadFiles.length) return
    const formData = new FormData()
    uploadFiles.forEach((file) => formData.append('files', file))
    await axios.post('/api/dev/upload-asset', formData, {
      headers: { ...authHeaders, 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (!progressEvent.total) return
        setUploadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
      },
    })
    setUploadFiles([])
    setUploadProgress(100)
    hydrate()
  }

  const pushBuilder = async () => {
    setSyncing(true)
    try {
      await fetch('/api/dev/sync-trophy-road', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ milestones: builder.map(({ id, ...item }) => item) }),
      }).then((r) => r.json())
      await hydrate()
    } finally {
      setSyncing(false)
    }
  }

  const addMilestone = (assetFilename) => {
    const asset = assetsMap[assetFilename]
    setBuilder((current) => [
      ...current,
      {
        id: createBuilderId(assetFilename),
        asset_filename: assetFilename,
        milestone_title: asset?.display_name || assetFilename,
        required_xp: current.length ? (Number(current[current.length - 1].required_xp) || 0) + 1000 : 0,
      },
    ])
  }

  const triggerDevBuildDownload = async () => {
    if (!isDeveloper) return
    await requestDownload({ transport: 'location', resetDelayMs: 4500 })
  }

  const maxXp = builder.reduce((acc, item) => Math.max(acc, Number(item.required_xp) || 0), 0)

  return (
    <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'flex-start', alignItems:'flex-start', gap:20, width:'100%', boxSizing:'border-box', overflowX:'hidden' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:14, flex:'1 1 350px', minWidth:'min(350px, 100%)', maxWidth:'100%' }}>
        {isDeveloper && (
          <div className="dev-card" style={{ minWidth:'min(350px, 100%)' }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>Developer Build</div>
            <div style={{ fontSize:12, color:'rgba(180,195,220,0.65)', marginBottom:12 }}>
              Issue a short-lived download ticket and stream the latest privileged Windows binary from the secure distribution path.
            </div>
            <button
              onClick={triggerDevBuildDownload}
              disabled={downloadPhase === 'authorizing' || downloadPhase === 'downloading'}
              style={{
                width:'100%',
                padding:'11px 12px',
                borderRadius:10,
                border:`1px solid ${downloadError ? 'rgba(255,69,58,0.25)' : 'rgba(0,200,255,0.24)'}`,
                background:downloadError ? 'rgba(255,69,58,0.08)' : 'rgba(0,200,255,0.12)',
                color:downloadError ? '#FF453A' : '#00d4ff',
                fontWeight:800,
                cursor:downloadPhase === 'authorizing' || downloadPhase === 'downloading' ? 'wait' : 'pointer',
              }}
            >
              {downloadPhase === 'authorizing' ? 'Authorizing...' : downloadPhase === 'downloading' ? 'Download Started' : 'Download Dev Build'}
            </button>
            <div style={{ marginTop:8, fontSize:11, color:downloadError ? '#FF453A' : 'rgba(180,195,220,0.45)' }}>
              {downloadError || 'Download the latest Windows developer executable from this lane without leaving the console.'}
            </div>
          </div>
        )}

        <div className="dev-card" style={{ minWidth:'min(350px, 100%)' }}>
          <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>Asset Ingestion Zone</div>
          <div style={{ fontSize:12, color:'rgba(180,195,220,0.65)', marginBottom:12 }}>
            Drop `.glb`, `.gltf`, `.obj`, `.mtl`, or `.blend` models here, preview them in WebGL, then ingest them into the live asset pool.
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              handleFiles(e.dataTransfer.files)
            }}
            style={{
              border:'1px dashed rgba(0,200,255,0.35)',
              borderRadius:14,
              minHeight:220,
              background:'rgba(0,200,255,0.04)',
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              padding:16,
            }}
          >
            <div style={{ width:'100%' }}>
              <div style={{ textAlign:'center', fontSize:12, color:'rgba(180,195,220,0.65)', marginBottom:8 }}>
                Drag a 3D file here or choose one manually.
              </div>
              <input type="file" multiple accept=".glb,.gltf,.obj,.mtl,.blend" onChange={(e) => handleFiles(e.target.files)} />
              <div style={{ marginTop:12, borderRadius:12, overflow:'hidden', background:'rgba(8,12,20,0.55)' }}>
                <Suspense fallback={<div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center' }}>Loading preview...</div>}>
                  <VehicleModelPreview modelUrl={uploadPreviewUrl} height={180} />
                </Suspense>
              </div>
            </div>
          </div>
          <div style={{ marginTop:12 }}>
            <div style={{ height:8, borderRadius:999, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
              <div style={{ width:`${uploadProgress}%`, height:'100%', background:'linear-gradient(90deg,#00d4ff,#30D158)' }} />
            </div>
          </div>
          <button
            onClick={uploadAsset}
            disabled={!uploadFiles.length}
            style={{ marginTop:12, width:'100%', padding:'11px 12px', borderRadius:10, border:'1px solid rgba(0,200,255,0.24)', background:'rgba(0,200,255,0.12)', color:'#00d4ff', fontWeight:800, cursor:uploadFiles.length ? 'pointer' : 'not-allowed' }}
          >
            Commit Upload
          </button>
          <div style={{ marginTop:8, fontSize:11, color:'rgba(180,195,220,0.45)', wordBreak:'break-word' }}>
            {uploadFiles.length ? `${uploadFiles.length} file(s) staged: ${uploadFiles.map((file) => file.name).join(', ')}` : 'No staged files'}
          </div>
        </div>

        <div className="dev-card" style={{ minWidth:0 }}>
          <div style={{ fontSize:16, fontWeight:800, marginBottom:10 }}>Asset Pool</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:20, width:'100%', boxSizing:'border-box' }}>
            {assets.map((asset) => (
              <div
                key={asset.asset_filename}
                draggable
                onDragStart={() => setDragAsset(asset.asset_filename)}
                onDoubleClick={() => addMilestone(asset.asset_filename)}
                style={{ border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:10, background:'rgba(255,255,255,0.03)', cursor:'grab' }}
              >
                <div style={{ height:120, borderRadius:10, overflow:'hidden', background:'rgba(8,12,20,0.55)' }}>
                  <Suspense fallback={<div style={{ height:120, display:'flex', alignItems:'center', justifyContent:'center' }}>...</div>}>
                    <VehicleModelPreview modelUrl={asset.asset_url || ''} builtinVehicleId={asset.source_type === 'builtin' ? asset.asset_filename : ''} height={120} />
                  </Suspense>
                </div>
                <div style={{ marginTop:8, fontWeight:700, fontSize:12, overflowWrap:'anywhere' }}>{asset.display_name}</div>
                <div style={{ fontSize:10, color:'rgba(180,195,220,0.6)' }}>{asset.source_type}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dev-card" style={{ flex:'1 1 350px', minWidth:'min(350px, 100%)', boxSizing:'border-box' }}>
        <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>Trophy Road Builder</div>
        <div style={{ fontSize:12, color:'rgba(180,195,220,0.65)', marginBottom:12 }}>
          Drag assets from the pool and drop them here to snap milestones onto the progression timeline.
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (dragAsset) addMilestone(dragAsset)
            setDragAsset('')
          }}
          style={{ minHeight:120, width:'100%', boxSizing:'border-box', border:'1px dashed rgba(255,159,10,0.28)', borderRadius:14, padding:12, background:'rgba(255,159,10,0.04)', overflowX:'hidden' }}
        >
          {builder.map((milestone, index) => (
            <div key={milestone.id} style={{ display:'flex', flexWrap:'wrap', justifyContent:'flex-start', gap:10, alignItems:'center', width:'100%', boxSizing:'border-box', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ height:72, width:92, flex:'0 0 92px', borderRadius:10, overflow:'hidden', background:'rgba(8,12,20,0.55)' }}>
                <Suspense fallback={<div style={{ height:72, display:'flex', alignItems:'center', justifyContent:'center' }}>...</div>}>
                  <VehicleModelPreview
                    modelUrl={assetsMap[milestone.asset_filename]?.asset_url || ''}
                    builtinVehicleId={assetsMap[milestone.asset_filename]?.source_type === 'builtin' ? milestone.asset_filename : ''}
                    height={72}
                  />
                </Suspense>
              </div>
              <input
                value={milestone.milestone_title}
                onChange={(e) => setBuilder((current) => current.map((item, idx) => idx === index ? { ...item, milestone_title: e.target.value } : item))}
                style={{ flex:'1 1 220px', minWidth:'min(220px, 100%)', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, color:'#fff', padding:'10px 12px' }}
              />
              <input
                type="number"
                value={milestone.required_xp}
                onChange={(e) => setBuilder((current) => current.map((item, idx) => idx === index ? { ...item, required_xp: Number(e.target.value || 0) } : item))}
                style={{ flex:'0 1 120px', minWidth:112, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, color:'#fff', padding:'10px 12px' }}
              />
              <button
                onClick={() => setBuilder((current) => current.filter((_, idx) => idx !== index))}
                style={{ flex:'0 0 auto', marginLeft:'auto', padding:'10px 12px', borderRadius:10, border:'1px solid rgba(255,69,58,0.22)', background:'rgba(255,69,58,0.08)', color:'#FF453A' }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={pushBuilder}
          disabled={syncing}
          style={{ marginTop:12, width:'100%', padding:'11px 12px', borderRadius:10, border:'1px solid rgba(48,209,88,0.24)', background:'rgba(48,209,88,0.12)', color:'#30D158', fontWeight:800, cursor:'pointer' }}
        >
          {syncing ? 'Syncing…' : 'Sync Trophy Road'}
        </button>
        <div style={{ marginTop:14, padding:'12px 14px', borderRadius:12, background:'rgba(8,12,20,0.75)', border:'1px solid rgba(48,209,88,0.18)' }}>
          <div style={{ fontSize:10, fontWeight:800, letterSpacing:'0.14em', textTransform:'uppercase', color:'rgba(48,209,88,0.72)', marginBottom:8 }}>Trophy Road Output</div>
          <div style={{ height:10, borderRadius:999, overflow:'hidden', background:'rgba(255,255,255,0.06)', display:'flex' }}>
            {builder.length ? builder.map((milestone, index) => {
              const currentXp = Number(milestone.required_xp) || 0
              const fallbackXp = maxXp || 1000
              const nextXp = Number(builder[index + 1]?.required_xp ?? fallbackXp)
              const segmentSpan = (nextXp - currentXp) || fallbackXp
              const width = maxXp > 0 ? Math.max(8, (segmentSpan / fallbackXp) * 100) : 100 / builder.length
              return (
                <div
                  key={`${milestone.asset_filename}-${index}-bar`}
                  style={{ width:`${width}%`, background:index % 2 ? 'linear-gradient(90deg,#0fd3ff,#30D158)' : 'linear-gradient(90deg,#30D158,#8BFF4D)' }}
                  title={`${milestone.milestone_title} · ${currentXp} XP`}
                />
              )
            }) : <div style={{ width:'100%', background:'linear-gradient(90deg,#17324a,#112233)' }} />}
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', gap:8, flexWrap:'wrap', marginTop:8, fontSize:10, color:'rgba(180,195,220,0.55)' }}>
            <span>{builder.length} milestones armed</span>
            <span>{maxXp} XP cap</span>
          </div>
        </div>
      </div>
    </div>
  )
}
