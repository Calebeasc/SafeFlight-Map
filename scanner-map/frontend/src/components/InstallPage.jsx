import React, { useState } from 'react'

const C = {
  bg:'#080c14', panel:'#0d1322', border:'rgba(255,255,255,0.08)',
  text:'#e8edf5', dim:'rgba(180,195,220,0.65)', dim2:'rgba(180,195,220,0.38)',
  accent:'#00c8ff', green:'#30D158', orange:'#FF9F0A', red:'#FF453A',
  font:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
}

const PLATFORMS = [
  {
    id: 'ios',
    icon: '🍎',
    label: 'iPhone / iPad',
    sub: 'iOS 14+ · No App Store needed',
    color: C.accent,
    bg: 'rgba(0,200,255,0.08)',
    border: 'rgba(0,200,255,0.2)',
  },
  {
    id: 'android',
    icon: '🤖',
    label: 'Android',
    sub: 'Android 8+ · Chrome or Edge',
    color: C.green,
    bg: 'rgba(48,209,88,0.08)',
    border: 'rgba(48,209,88,0.2)',
  },
  {
    id: 'pc',
    icon: '🖥️',
    label: 'Windows / Mac / Linux',
    sub: 'Desktop app + local backend',
    color: C.orange,
    bg: 'rgba(255,159,10,0.08)',
    border: 'rgba(255,159,10,0.2)',
  },
  {
    id: 'altstore',
    icon: '🔧',
    label: 'AltStore / Sideloadly',
    sub: 'iOS sideload · Free · 7-day re-sign',
    color: '#bf5af2',
    bg: 'rgba(191,90,242,0.08)',
    border: 'rgba(191,90,242,0.2)',
  },
]

const STEPS = {
  ios: [
    {
      icon: '🌐',
      title: 'Open Safari on your iPhone',
      desc: 'Must be Safari — Chrome on iOS cannot install PWAs to the home screen. Navigate to the app URL.',
    },
    {
      icon: '⬆️',
      title: 'Tap the Share button',
      desc: 'The □↑ icon at the bottom center of the screen (or top-right on iPad). It looks like a box with an arrow pointing up.',
    },
    {
      icon: '➕',
      title: 'Tap "Add to Home Screen"',
      desc: 'Scroll down in the share sheet until you see "Add to Home Screen". Tap it.',
    },
    {
      icon: '✏️',
      title: 'Name it and tap Add',
      desc: 'You can rename it (default: "I.INC"). Tap Add in the top-right corner of the dialog.',
    },
    {
      icon: '🚀',
      title: 'Open from your home screen',
      desc: 'The app icon appears on your home screen. Tap it — it launches fullscreen with no browser chrome, just like a native app.',
    },
    {
      icon: '📍',
      title: 'Allow location access',
      desc: 'When prompted, tap "Allow While Using App" for GPS tracking. Keep the screen on during scanning — iOS suspends PWAs when the screen locks.',
    },
  ],
  android: [
    {
      icon: '🌐',
      title: 'Open Chrome on your Android phone',
      desc: 'Navigate to the app URL in Chrome (or Edge / Samsung Internet). Android supports PWA install natively.',
    },
    {
      icon: '⋮',
      title: 'Tap the three-dot menu',
      desc: 'Tap ⋮ in the top-right corner of Chrome. Or Chrome may automatically show an "Add to Home Screen" banner at the bottom — tap that instead.',
    },
    {
      icon: '➕',
      title: 'Tap "Add to Home Screen" or "Install App"',
      desc: 'Select Add to Home Screen or Install App from the menu. Confirm in the popup dialog.',
    },
    {
      icon: '🚀',
      title: 'Launch from home screen or app drawer',
      desc: 'The I.INC icon appears in your home screen and app drawer. Launches fullscreen.',
    },
    {
      icon: '📍',
      title: 'Allow location and notification access',
      desc: 'Tap Allow when prompted for location. For background GPS retention, leave the app in the foreground or enable "Background Activity" in Android battery settings for the app.',
    },
    {
      icon: '✅',
      title: 'Android advantage',
      desc: 'Android grants better background execution for PWAs than iOS. GPS tracking, scanner alerts, and the live map continue even when the screen is off.',
    },
  ],
  pc: [
    {
      icon: '⬇️',
      title: 'Download the installer',
      desc: 'Download the latest release for your platform from the releases page. Windows: InvincibleInc-Setup.exe. Mac: InvincibleInc.dmg. Linux: InvincibleInc.AppImage.',
    },
    {
      icon: '🛡️',
      title: 'Windows: bypass SmartScreen if needed',
      desc: 'Windows Defender SmartScreen may flag the unsigned installer. Click "More info" → "Run anyway". The app is not malware — it\'s just not submitted to Microsoft for signing.',
    },
    {
      icon: '⚙️',
      title: 'Run the installer',
      desc: 'Windows: double-click the .exe and follow the setup wizard. Mac: open the .dmg, drag to Applications. Linux: chmod +x the .AppImage and run it.',
    },
    {
      icon: '🖥️',
      title: 'The app starts a local backend',
      desc: 'The desktop app bundles a Python backend that starts automatically on port 8000. A system tray icon appears when it\'s running.',
    },
    {
      icon: '🌐',
      title: 'Open the web UI',
      desc: 'The app opens automatically in your browser at http://localhost:8000. You can also access it from other devices on the same network.',
    },
    {
      icon: '📡',
      title: 'Plug in the WiFi adapter',
      desc: 'For scanning, plug in a monitor-mode capable USB WiFi adapter (e.g. Alfa AWUS036ACH). The backend auto-detects it. Without an adapter, GPS tracking and the map still work.',
    },
    {
      icon: '🔐',
      title: 'Access the Dev Console',
      desc: 'Navigate to http://localhost:8000/#dev and sign in with your dev credentials to access scanner controls, the data panel, and all dev tools.',
    },
  ],
  altstore: [
    {
      icon: '💻',
      title: 'Install AltStore on your PC or Mac',
      desc: 'Download AltInstaller (Windows) or AltServer (Mac) from altstore.io. Run it — it sits in your system tray and enables sideloading to your iPhone.',
    },
    {
      icon: '🔌',
      title: 'Connect your iPhone via USB',
      desc: 'Plug your iPhone into the computer. Trust the computer when prompted on your iPhone. Make sure iTunes (Windows) or Finder (Mac) recognizes the device.',
    },
    {
      icon: '📲',
      title: 'Install AltStore to your iPhone',
      desc: 'In AltServer/AltInstaller, click "Install AltStore" and select your iPhone. Enter your Apple ID when prompted — this is your free Apple ID, not a developer account.',
    },
    {
      icon: '🔑',
      title: 'Trust the AltStore certificate',
      desc: 'On your iPhone: Settings → General → VPN & Device Management → tap your Apple ID email → Trust. This is required once.',
    },
    {
      icon: '➕',
      title: 'Add the app in AltStore',
      desc: 'Open AltStore on your iPhone. Tap the + button and enter the .ipa URL, or paste the app\'s URL if it supports AltStore source. The app installs directly.',
    },
    {
      icon: '🔄',
      title: 'Re-sign every 7 days',
      desc: 'Free Apple IDs only sign apps for 7 days. To auto-renew: keep AltServer running on your PC/Mac and connect to the same WiFi network — AltStore refreshes apps automatically in the background.',
    },
    {
      icon: '⚠️',
      title: 'Limitations',
      desc: 'Free Apple ID: max 3 apps sideloaded at once. 7-day signing expiry. Requires AltServer running on same WiFi for auto-refresh. No TestFlight or App Store distribution.',
    },
  ],
}

const NOTE = {
  ios: { color: C.orange, icon: '⚠️', text: 'Keep the screen on while scanning. iOS suspends PWAs when the display locks — GPS tracking will pause.' },
  android: { color: C.green, icon: '✅', text: 'Android grants better background GPS than iOS. The app can track location with screen off if Background Activity is enabled.' },
  pc: { color: C.accent, icon: 'ℹ️', text: 'The WiFi adapter is only needed for the signal scanner. GPS, map, and all other features work without it.' },
  altstore: { color: '#bf5af2', icon: '🔧', text: 'AltStore is the best free option for iOS. The 7-day re-sign is automatic if AltServer stays running on your computer.' },
}

export default function InstallPage() {
  const [platform, setPlatform] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('p')
    return PLATFORMS.find(pl => pl.id === p) ? p : null
  })

  const inp = {
    width:'100%', boxSizing:'border-box',
    background:'none', border:'none',
    color:'rgba(0,200,255,0.5)', fontFamily:C.font, fontSize:11,
    cursor:'pointer', padding:0, textAlign:'left',
    display:'flex', alignItems:'center', gap:6,
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:C.bg, color:C.text,
      fontFamily:C.font, overflowY:'auto',
      backgroundImage:'linear-gradient(rgba(0,200,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,0.02) 1px,transparent 1px)',
      backgroundSize:'50px 50px',
    }}>
      {/* Header */}
      <div style={{
        position:'sticky', top:0, zIndex:10,
        background:'rgba(8,12,20,0.95)', backdropFilter:'blur(20px)',
        borderBottom:`1px solid ${C.border}`,
        padding:'14px 20px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {platform && (
            <button onClick={() => setPlatform(null)} style={{ background:'none', border:'none', color:C.dim, cursor:'pointer', fontFamily:C.font, fontSize:13, padding:0, display:'flex', alignItems:'center', gap:4 }}>
              ← Back
            </button>
          )}
          <div style={{ fontSize:15, fontWeight:800, background:'linear-gradient(135deg,#00c8ff,#7c3aed)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
            INVINCIBLE.INC
          </div>
          <span style={{ fontSize:11, color:C.dim, borderLeft:`1px solid ${C.border}`, paddingLeft:12 }}>
            Install Guide
          </span>
        </div>
        <a href="/" style={{ fontSize:12, color:C.dim, textDecoration:'none', background:'rgba(255,255,255,0.05)', border:`1px solid ${C.border}`, borderRadius:8, padding:'5px 12px' }}>
          ← App
        </a>
      </div>

      <div style={{ maxWidth:680, margin:'0 auto', padding:'48px 20px 80px' }}>
        {!platform ? (
          <>
            {/* Hero */}
            <div style={{ textAlign:'center', marginBottom:48 }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.15em', color:'rgba(0,200,255,0.5)', textTransform:'uppercase', marginBottom:12 }}>
                No App Store · No Developer Fee
              </div>
              <h1 style={{ fontSize:32, fontWeight:900, lineHeight:1.15, marginBottom:16, letterSpacing:'-0.02em' }}>
                Install the App<br/>
                <span style={{ background:'linear-gradient(135deg,#00c8ff,#7c3aed)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
                  on Any Device
                </span>
              </h1>
              <p style={{ fontSize:15, color:C.dim, lineHeight:1.7, maxWidth:420, margin:'0 auto' }}>
                Select your platform to get step-by-step install instructions.
              </p>
            </div>

            {/* Platform cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16 }}>
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  style={{
                    background: p.bg,
                    border:`1px solid ${p.border}`,
                    borderRadius:16, padding:'24px 20px',
                    cursor:'pointer', fontFamily:C.font, textAlign:'left',
                    transition:'all 0.15s',
                    display:'flex', flexDirection:'column', gap:8,
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                >
                  <span style={{ fontSize:32 }}>{p.icon}</span>
                  <div style={{ fontSize:17, fontWeight:800, color:p.color }}>{p.label}</div>
                  <div style={{ fontSize:12, color:C.dim, lineHeight:1.5 }}>{p.sub}</div>
                  <div style={{ marginTop:4, fontSize:11, color:p.color, display:'flex', alignItems:'center', gap:4 }}>
                    View instructions →
                  </div>
                </button>
              ))}
            </div>

            {/* Comparison note */}
            <div style={{
              marginTop:40, padding:'16px 20px',
              background:'rgba(255,255,255,0.03)', border:`1px solid ${C.border}`,
              borderRadius:12, fontSize:12, color:C.dim, lineHeight:1.7,
            }}>
              <span style={{ color:C.text, fontWeight:700 }}>iOS vs Android:</span>{' '}
              For best background GPS performance, use Android. iOS PWAs keep GPS active only when the screen is on.
              AltStore gives you a proper installed iOS app but requires re-signing every 7 days.
              The PC version runs the full backend locally — required for WiFi/BLE scanning.
            </div>
          </>
        ) : (
          (() => {
            const plat = PLATFORMS.find(p => p.id === platform)
            const steps = STEPS[platform]
            const note = NOTE[platform]
            return (
              <>
                {/* Platform header */}
                <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:40 }}>
                  <div style={{
                    width:64, height:64, borderRadius:18,
                    background: plat.bg, border:`1px solid ${plat.border}`,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:32,
                    flexShrink:0,
                  }}>
                    {plat.icon}
                  </div>
                  <div>
                    <div style={{ fontSize:22, fontWeight:800, color:plat.color }}>{plat.label}</div>
                    <div style={{ fontSize:13, color:C.dim, marginTop:3 }}>{plat.sub}</div>
                  </div>
                </div>

                {/* Steps */}
                <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                  {steps.map((step, i) => (
                    <div key={i} style={{ display:'flex', gap:16, paddingBottom:28, position:'relative' }}>
                      {/* Step line */}
                      {i < steps.length - 1 && (
                        <div style={{
                          position:'absolute', left:19, top:44, bottom:0,
                          width:1, background:`rgba(255,255,255,0.06)`,
                        }}/>
                      )}
                      {/* Step number */}
                      <div style={{
                        width:40, height:40, borderRadius:'50%', flexShrink:0,
                        background: plat.bg, border:`1px solid ${plat.border}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:16, zIndex:1,
                      }}>
                        {step.icon}
                      </div>
                      <div style={{ paddingTop:8 }}>
                        <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:6 }}>
                          <span style={{ color:plat.color, marginRight:8, fontSize:12, fontWeight:800 }}>STEP {i+1}</span>
                          {step.title}
                        </div>
                        <div style={{ fontSize:13, color:C.dim, lineHeight:1.7 }}>{step.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Note */}
                <div style={{
                  marginTop:8, padding:'14px 16px',
                  background:`rgba(${note.color === C.orange ? '255,159,10' : note.color === C.green ? '48,209,88' : note.color === C.accent ? '0,200,255' : '191,90,242'},0.07)`,
                  border:`1px solid rgba(${note.color === C.orange ? '255,159,10' : note.color === C.green ? '48,209,88' : note.color === C.accent ? '0,200,255' : '191,90,242'},0.2)`,
                  borderRadius:12,
                }}>
                  <div style={{ fontSize:11, fontWeight:700, color:note.color, marginBottom:4 }}>{note.icon} Note</div>
                  <div style={{ fontSize:12, color:C.dim, lineHeight:1.7 }}>{note.text}</div>
                </div>

                {/* CTA */}
                <div style={{ marginTop:28, display:'flex', gap:12, flexWrap:'wrap' }}>
                  <a href="/" style={{
                    display:'inline-flex', alignItems:'center', gap:6,
                    background:`rgba(${plat.color === C.orange ? '255,159,10' : plat.color === C.green ? '48,209,88' : plat.color === C.accent ? '0,200,255' : '191,90,242'},0.15)`,
                    border:`1px solid ${plat.border}`,
                    borderRadius:12, padding:'12px 20px', textDecoration:'none',
                    color:plat.color, fontSize:14, fontWeight:700, fontFamily:C.font,
                  }}>
                    🚀 Open the App
                  </a>
                  <button onClick={() => setPlatform(null)} style={{
                    display:'inline-flex', alignItems:'center', gap:6,
                    background:'rgba(255,255,255,0.04)', border:`1px solid ${C.border}`,
                    borderRadius:12, padding:'12px 20px', cursor:'pointer',
                    color:C.dim, fontSize:14, fontFamily:C.font,
                  }}>
                    ← Other Platforms
                  </button>
                </div>
              </>
            )
          })()
        )}
      </div>
    </div>
  )
}
