import React, { useMemo } from 'react'
import useDevBuildDownload from '../hooks/useDevBuildDownload'

function HardwareGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#30D158" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="11" rx="2.5" />
      <path d="M7.5 9.5h9" />
      <path d="M9 19.5h6" />
      <path d="M12 15.5v4" />
      <path d="M7.5 7.5v4" />
      <path d="M16.5 7.5v4" />
    </svg>
  )
}

export default function SecureDevBuildCard() {
  const { error, isDeveloper, phase, toast, triggerDownload: requestDownload } = useDevBuildDownload()

  const buttonLabel = useMemo(() => {
    if (phase === 'authorizing') return 'AUTHORIZING SIGNATURE...'
    if (phase === 'downloading') return 'STREAM INITIALIZED'
    return 'DEPLOY FULL INVINCIBLE WINDOWS APP'
  }, [phase])

  const triggerDownload = async () => {
    await requestDownload({ transport: 'location', resetDelayMs: 3200 })
  }

  if (!isDeveloper) return null

  return (
    <div
      style={{
        position: 'relative',
        minHeight: 220,
        borderRadius: 18,
        padding: 22,
        overflow: 'hidden',
        background: 'linear-gradient(145deg, rgba(4,8,12,0.98), rgba(8,14,22,0.96) 58%, rgba(9,24,18,0.96))',
        border: '1px solid rgba(48,209,88,0.32)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.42), inset 0 0 0 1px rgba(48,209,88,0.08)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at top right, rgba(48,209,88,0.14), transparent 42%)' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 0 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(48,209,88,0.12)',
              border: '1px solid rgba(48,209,88,0.28)',
              boxShadow: '0 0 24px rgba(48,209,88,0.12)',
              flexShrink: 0,
            }}
          >
            <HardwareGlyph />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(48,209,88,0.72)', marginBottom: 6 }}>
              Distribution Node
            </div>
            <div style={{ fontSize: 24, lineHeight: 1.08, fontWeight: 900, letterSpacing: '-0.03em', color: '#f4f8fb', maxWidth: 480 }}>
              DEPLOY FULL INVINCIBLE WINDOWS APP
            </div>
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.65, color: 'rgba(180,195,220,0.66)', maxWidth: 560 }}>
              Standalone Nuitka-Compiled Binary • Zero Dependencies • All Administrative Tools Enabled.
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          type="button"
          onClick={triggerDownload}
          disabled={phase === 'authorizing' || phase === 'downloading'}
          style={{
            width: '100%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '14px 18px',
            borderRadius: 13,
            border: `1px solid ${error ? 'rgba(255,69,58,0.34)' : 'rgba(48,209,88,0.4)'}`,
            background: error ? 'rgba(255,69,58,0.08)' : 'rgba(48,209,88,0.14)',
            color: error ? '#FF453A' : '#30D158',
            fontWeight: 900,
            fontSize: 13,
            cursor: phase === 'authorizing' || phase === 'downloading' ? 'wait' : 'pointer',
            boxShadow: error ? 'none' : '0 14px 32px rgba(48,209,88,0.12)',
            transition: 'all 0.2s ease',
          }}
        >
          {buttonLabel}
        </button>
        <div style={{ minHeight: 18, fontSize: 11, lineHeight: 1.6, color: error ? '#FF453A' : toast ? '#30D158' : 'rgba(180,195,220,0.46)' }}>
          {error || toast || 'Available immediately after unlocking the dashboard. No separate app sign-in is required before the short-lived ticket is minted.'}
        </div>
      </div>
    </div>
  )
}
