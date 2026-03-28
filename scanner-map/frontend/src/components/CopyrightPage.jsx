/**
 * Legal / Copyright page — accessed via /#legal
 * Covers copyright notice, IP registration guidance, trademark, and trade secrets.
 */
import React, { useState } from 'react'

const C = {
  bg: '#080c14', panel: '#0d1322', border: 'rgba(255,255,255,0.08)',
  text: '#e8edf5', dim: 'rgba(180,195,220,0.65)', dim2: 'rgba(180,195,220,0.38)',
  accent: '#00c8ff', green: '#30D158', orange: '#FF9F0A', purple: '#bf5af2',
  font: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
}

const YEAR = new Date().getFullYear()

const SECTIONS = [
  {
    id: 'copyright',
    icon: '©',
    title: 'Copyright Notice',
    color: C.accent,
    content: (
      <div>
        <div style={{ fontSize:15, color:C.text, marginBottom:16, lineHeight:1.7 }}>
          <strong style={{ color:C.accent }}>© {YEAR} Invincible.Inc. All rights reserved.</strong>
        </div>
        <p style={{ fontSize:13, color:C.dim, lineHeight:1.8, marginBottom:12 }}>
          All source code, designs, algorithms, database schemas, API structures, user interface
          layouts, written content, and documentation produced for the Invincible.Inc Scanner
          platform are original works protected by copyright law under{' '}
          <strong style={{ color:C.text }}>17 U.S.C. § 101 et seq.</strong> (the Copyright Act of 1976)
          and the{' '}
          <strong style={{ color:C.text }}>Berne Convention for the Protection of Literary and Artistic Works</strong>.
        </p>
        <p style={{ fontSize:13, color:C.dim, lineHeight:1.8, marginBottom:12 }}>
          Copyright protection attaches <em>automatically</em> at the moment of creation and
          fixation in a tangible medium. No registration is required for protection to exist —
          however, registration with the U.S. Copyright Office provides significant legal
          advantages including the ability to sue for statutory damages (up to $150,000 per
          willful infringement) and attorney's fees.
        </p>
        <div style={{ background:'rgba(0,200,255,0.06)', border:'1px solid rgba(0,200,255,0.15)', borderRadius:10, padding:'12px 14px', fontSize:12, color:C.dim }}>
          <strong style={{ color:C.accent }}>Notice:</strong> Unauthorized copying, redistribution, reverse-engineering,
          or derivative use of any part of this platform without written permission is strictly prohibited.
        </div>
      </div>
    ),
  },
  {
    id: 'registration',
    icon: '📋',
    title: 'How to Register Your Copyright',
    color: C.green,
    content: (
      <div>
        <p style={{ fontSize:13, color:C.dim, lineHeight:1.8, marginBottom:16 }}>
          To maximize legal protection, register with the{' '}
          <strong style={{ color:C.text }}>U.S. Copyright Office</strong> at copyright.gov.
          Registration within 3 months of publication or before infringement occurs gives you
          the strongest legal standing.
        </p>
        {[
          ['1', 'Go to copyright.gov', 'Navigate to copyright.gov/registration and create an account. Use the eCO (Electronic Copyright Office) system — it\'s the fastest and cheapest method.'],
          ['2', 'Choose "Computer Program"', 'For software, select "Literary Works → Computer Program". This covers all source code, scripts, and compiled executables.'],
          ['3', 'Fill in the claim', 'Enter "Invincible.Inc Scanner Platform" as the title. Set Author as your legal name or company name. Year of creation and publication date.'],
          ['4', 'Upload a deposit copy', 'Submit the first 25 + last 25 pages of your source code (or the entire codebase if under 50 pages). Redact any trade secrets if desired — this is allowed.'],
          ['5', 'Pay the fee', 'Single-author online registration: $45. Standard online: $65. Processing takes 3–7 months but legal protection is retroactive to filing date.'],
          ['6', 'Register updates', 'Each major version that adds significant new authorship should be registered separately or as a revised work.'],
        ].map(([num, title, desc]) => (
          <div key={num} style={{ display:'flex', gap:12, marginBottom:14 }}>
            <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(48,209,88,0.15)', border:'1px solid rgba(48,209,88,0.3)', color:C.green, fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>{num}</div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:3 }}>{title}</div>
              <div style={{ fontSize:12, color:C.dim, lineHeight:1.7 }}>{desc}</div>
            </div>
          </div>
        ))}
        <div style={{ background:'rgba(48,209,88,0.05)', border:'1px solid rgba(48,209,88,0.15)', borderRadius:10, padding:'12px 14px', fontSize:12, color:C.dim }}>
          <strong style={{ color:C.green }}>Pro tip:</strong> You can register multiple works in one "group registration" if they were all first published within the same 3-month period. Saves money on fees.
        </div>
      </div>
    ),
  },
  {
    id: 'trademark',
    icon: '™',
    title: 'Trademark — Brand Protection',
    color: C.purple,
    content: (
      <div>
        <p style={{ fontSize:13, color:C.dim, lineHeight:1.8, marginBottom:16 }}>
          The <strong style={{ color:C.text }}>Invincible.Inc</strong> name, logo, and
          taglines may be eligible for trademark registration through the{' '}
          <strong style={{ color:C.text }}>U.S. Patent and Trademark Office (USPTO)</strong>.
          Trademark protects <em>brand identity</em> — it's distinct from copyright which
          protects <em>creative expression</em>.
        </p>
        {[
          ['Search first', 'Run a TESS (Trademark Electronic Search System) search at tmsearch.uspto.gov before filing to ensure no conflicting marks exist.'],
          ['Choose classes', 'File under International Class 42 (Software as a Service, computer programming) and optionally Class 9 (software applications, downloadable apps).'],
          ['File online', 'Use the USPTO\'s TEAS Plus application at uspto.gov. Cost: $250/class for TEAS Plus (most common). Processing: 8–12 months.'],
          ['Use ™ now', 'You can use ™ immediately after filing (or even before filing if you\'re using the mark commercially). ® is only for federally registered marks.'],
          ['Maintain it', 'Trademarks must be renewed: file a Declaration of Use between years 5–6, then again between years 9–10, then every 10 years.'],
        ].map(([title, desc]) => (
          <div key={title} style={{ padding:'10px 0', borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.purple, marginBottom:3 }}>{title}</div>
            <div style={{ fontSize:12, color:C.dim, lineHeight:1.7 }}>{desc}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'trade-secrets',
    icon: '🔒',
    title: 'Trade Secrets',
    color: C.orange,
    content: (
      <div>
        <p style={{ fontSize:13, color:C.dim, lineHeight:1.8, marginBottom:16 }}>
          Unlike copyright (which requires disclosure), trade secrets protect confidential
          business information indefinitely as long as you take reasonable steps to keep
          them secret. Protected under the{' '}
          <strong style={{ color:C.text }}>Defend Trade Secrets Act (18 U.S.C. § 1836)</strong>{' '}
          and the <strong style={{ color:C.text }}>Uniform Trade Secrets Act</strong> (adopted
          in most states).
        </p>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.dim2, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>What qualifies as a trade secret</div>
          {['Proprietary scanning algorithms and detection heuristics', 'Database schema optimizations for real-time geospatial queries', 'Behavioral fingerprinting logic for device classification', 'Internal threat scoring formulas', 'Unreleased features and roadmap details'].map(item => (
            <div key={item} style={{ display:'flex', gap:8, marginBottom:6, alignItems:'flex-start' }}>
              <span style={{ color:C.orange, flexShrink:0, marginTop:1 }}>▸</span>
              <span style={{ fontSize:12, color:C.dim }}>{item}</span>
            </div>
          ))}
        </div>
        <div style={{ background:'rgba(255,159,10,0.06)', border:'1px solid rgba(255,159,10,0.2)', borderRadius:10, padding:'12px 14px', fontSize:12, color:C.dim }}>
          <strong style={{ color:C.orange }}>Action required:</strong> To protect trade secrets, implement NDAs with contributors, restrict access to sensitive modules, and document your reasonable-steps policy. Without active protection measures, courts may decline to recognize the trade secret status.
        </div>
      </div>
    ),
  },
  {
    id: 'open-source',
    icon: '⚖️',
    title: 'License Considerations',
    color: C.accent,
    content: (
      <div>
        <p style={{ fontSize:13, color:C.dim, lineHeight:1.8, marginBottom:16 }}>
          If you ever choose to open-source any portion of this platform, here are the most
          relevant licenses for this use case:
        </p>
        {[
          ['GPL v3', 'Requires any derivative work to also be open-sourced. Strong copyleft. Good if you want to prevent commercial exploitation without your permission.', 'Strong protection'],
          ['AGPL v3', 'Like GPL but also applies to server-side use (SaaS loophole closed). Best choice if you want anyone running a modified version publicly to release their changes.', 'Strongest for APIs'],
          ['BSL 1.1 (Business Source License)', 'Used by MariaDB, HashiCorp. Code is source-available but not open-source until a specified date (e.g., 4 years). Commercial use requires a license from you.', 'Best commercial control'],
          ['Proprietary / All Rights Reserved', 'Current status. No redistribution, modification, or commercial use without written permission. Maximum legal protection.', 'Current status'],
        ].map(([name, desc, badge]) => (
          <div key={name} style={{ padding:'12px 0', borderBottom:`1px solid ${C.border}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{name}</span>
              <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:'rgba(0,200,255,0.1)', border:'1px solid rgba(0,200,255,0.2)', color:C.accent }}>{badge}</span>
            </div>
            <div style={{ fontSize:12, color:C.dim, lineHeight:1.7 }}>{desc}</div>
          </div>
        ))}
      </div>
    ),
  },
]

export default function CopyrightPage() {
  const [openSection, setOpenSection] = useState('copyright')

  return (
    <div style={{
      position: 'fixed', inset: 0, background: C.bg, color: C.text,
      fontFamily: C.font, overflowY: 'auto',
      backgroundImage: 'linear-gradient(rgba(0,200,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,0.025) 1px,transparent 1px)',
      backgroundSize: '50px 50px',
    }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <a href="/" style={{ fontSize: 11, color: C.dim2, textDecoration: 'none', letterSpacing: '0.06em', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 32 }}>
            ← Back to app
          </a>
          <div style={{ fontSize: 11, letterSpacing: 4, color: 'rgba(0,200,255,0.5)', textTransform: 'uppercase', marginBottom: 12 }}>Invincible.Inc</div>
          <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, marginBottom: 12 }}>
            Legal &amp; <span style={{ background: 'linear-gradient(135deg,#00c8ff,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>IP Protection</span>
          </h1>
          <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, maxWidth: 560 }}>
            Copyright notices, registration guides, trademark info, and trade secret
            protection for the Invincible.Inc Scanner platform.
          </p>
        </div>

        {/* Current copyright banner */}
        <div style={{ background: 'linear-gradient(135deg,rgba(0,200,255,0.08),rgba(124,58,237,0.08))', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 14, padding: '20px 24px', marginBottom: 32, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 32 }}>©</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              © {YEAR} Invincible.Inc. All Rights Reserved.
            </div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>
              Scanner Map Platform · Proprietary Software · Unauthorized use prohibited
            </div>
          </div>
        </div>

        {/* Sections */}
        {SECTIONS.map(sec => (
          <div key={sec.id} style={{ marginBottom: 12, background: C.panel, border: `1px solid ${openSection === sec.id ? `rgba(0,200,255,0.2)` : C.border}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.2s' }}>
            <button
              onClick={() => setOpenSection(openSection === sec.id ? null : sec.id)}
              style={{ width: '100%', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', color: C.text, cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ fontSize: 20, flexShrink: 0 }}>{sec.icon}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, fontFamily: C.font }}>{sec.title}</span>
              <span style={{ fontSize: 11, color: C.dim2, transform: openSection === sec.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
            </button>
            {openSection === sec.id && (
              <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                {sec.content}
              </div>
            )}
          </div>
        ))}

        {/* Disclaimer */}
        <div style={{ marginTop: 32, padding: '16px 20px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 11, color: C.dim2, lineHeight: 1.8 }}>
          <strong style={{ color: C.dim }}>Disclaimer:</strong> This page provides general informational guidance only and does not constitute legal advice. Consult a licensed intellectual property attorney for advice specific to your situation. IP law varies by jurisdiction.
        </div>
      </div>
    </div>
  )
}
