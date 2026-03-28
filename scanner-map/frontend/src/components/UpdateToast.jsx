/**
 * UpdateToast — polls /version.json every 60s.
 * When the version changes from what was last acknowledged, shows a floating
 * banner at the top of the screen. Dismissing stores the version so it won't
 * re-appear until the next update.
 */
import React, { useState, useEffect, useRef } from 'react'

const SEEN_KEY = 'sfm_seen_version'

export default function UpdateToast() {
  const [toast, setToast]   = useState(null)   // { version, notes }
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)

  const dismiss = (version) => {
    setVisible(false)
    localStorage.setItem(SEEN_KEY, version)
    if (timerRef.current) clearTimeout(timerRef.current)
    setTimeout(() => setToast(null), 400)
  }

  const check = async () => {
    try {
      const r = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      if (!r.ok) return
      const data = await r.json()
      const { version, notes } = data
      const seen = localStorage.getItem(SEEN_KEY)
      if (version && version !== seen) {
        setToast({ version, notes })
        setVisible(true)
        // Auto-dismiss after 12 seconds
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => dismiss(version), 12000)
      }
    } catch {}
  }

  useEffect(() => {
    check()
    const id = setInterval(check, 60 * 1000)
    return () => { clearInterval(id); if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  if (!toast) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
      display: 'flex', justifyContent: 'center',
      transform: visible ? 'translateY(0)' : 'translateY(-110%)',
      transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      pointerEvents: visible ? 'auto' : 'none',
      padding: '10px 12px 0',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'linear-gradient(135deg,rgba(0,200,255,0.18),rgba(124,58,237,0.18))',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(0,200,255,0.3)',
        borderRadius: 14, padding: '10px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        maxWidth: 520, width: '100%',
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
      }}>
        <div style={{ fontSize: 18, flexShrink: 0 }}>🚀</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
            Updated to <span style={{ color: '#00c8ff' }}>v{toast.version}</span>
          </div>
          {toast.notes && (
            <div style={{ fontSize: 11, color: 'rgba(180,195,220,0.7)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {toast.notes}
            </div>
          )}
        </div>
        <a
          href="/explainer/#changelog"
          target="_blank"
          rel="noopener"
          style={{ fontSize: 11, color: '#00c8ff', textDecoration: 'none', fontWeight: 600, flexShrink: 0, padding: '4px 8px', background: 'rgba(0,200,255,0.12)', borderRadius: 6, border: '1px solid rgba(0,200,255,0.2)' }}
        >
          What's new
        </a>
        <button
          onClick={() => dismiss(toast.version)}
          style={{ background: 'none', border: 'none', color: 'rgba(180,195,220,0.5)', cursor: 'pointer', fontSize: 16, padding: '2px 4px', flexShrink: 0 }}
          aria-label="Dismiss"
        >×</button>
      </div>
    </div>
  )
}
