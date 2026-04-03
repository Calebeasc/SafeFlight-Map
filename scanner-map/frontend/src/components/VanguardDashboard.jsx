import React, { useState } from 'react';

/**
 * VanguardDashboard — Web Surface Reconnaissance & Protocol Auditing.
 * Engineered by @anderton for defensive infrastructure mapping.
 */

const VanguardDashboard = () => {
  const [url, setUrl] = useState('');
  const [roeAccepted, setRoeAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const runRecon = async () => {
    if (!roeAccepted) return;
    setLoading(true);
    try {
      const r = await fetch(`/vanguard/recon?url=${encodeURIComponent(url)}`);
      const d = await r.json();
      setResult(d);
    } catch (e) {
      alert("Recon failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', color: '#E0E0E0', fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 24 }}>🛡️</span>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#FF453A' }}>PROJECT VANGUARD</div>
          <div style={{ fontSize: 11, color: 'rgba(180, 195, 220, 0.5)' }}>Web Surface Analysis & Reconnaissance</div>
        </div>
      </div>

      {!roeAccepted ? (
        <div style={{ background: 'rgba(255, 69, 58, 0.05)', border: '1px solid rgba(255, 69, 58, 0.2)', padding: 24, borderRadius: 12 }}>
          <h3 style={{ color: '#FF453A', marginTop: 0 }}>RULES OF ENGAGEMENT</h3>
          <ol style={{ fontSize: 13, lineHeight: 1.6 }}>
            <li><strong>AUTHORIZATION:</strong> You affirm that you have explicit, written authorization to perform reconnaissance on the target.</li>
            <li><strong>NON-INVASIVE:</strong> Focus is strictly on passive discovery (Headers, Fingerprinting, Protocol Auditing).</li>
            <li><strong>LATENCY:</strong> Rate-limiting is enforced to prevent target degradation.</li>
          </ol>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 20 }}>
            <input type="checkbox" onChange={(e) => setRoeAccepted(e.target.checked)} />
            <span>I agree to the Rules of Engagement.</span>
          </label>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input 
              type="text" 
              placeholder="https://target-domain.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={{ flex: 1, padding: 12, background: '#000', border: '1px solid #333', color: '#00D4FF', borderRadius: 8 }}
            />
            <button 
              onClick={runRecon}
              disabled={loading || !url}
              style={{ padding: '0 24px', background: '#FF453A', border: 'none', color: '#FFF', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
            >
              {loading ? 'ANALYZING...' : 'RUN RECON'}
            </button>
          </div>

          {result && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Stack Analysis */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#00D4FF', marginBottom: 12 }}>TECH-STACK FINGERPRINT</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.fingerprint.stack.map(s => (
                    <span key={s} style={{ background: 'rgba(0,212,255,0.1)', color: '#00D4FF', padding: '4px 8px', borderRadius: 4, fontSize: 11 }}>{s}</span>
                  ))}
                </div>
              </div>

              {/* SSL/TLS Audit */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#30D158', marginBottom: 12 }}>PROTOCOL AUDIT</div>
                <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                  <div>Issuer: {result.ssl.issuer}</div>
                  <div>TLS: <span style={{ color: result.ssl.score === 'PASS' ? '#30D158' : '#FF9F0A' }}>{result.ssl.tls_version}</span></div>
                  <div>Cipher: {result.ssl.cipher}</div>
                </div>
              </div>

              {/* Security Headers */}
              <div style={{ gridColumn: '1 / -1', background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#FF9F0A', marginBottom: 12 }}>SECURITY HEADERS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {Object.entries(result.security_headers).map(([h, ok]) => (
                    <div key={h} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: 'rgba(180,195,220,0.6)' }}>{h}</span>
                      <span style={{ color: ok ? '#30D158' : '#FF453A', fontWeight: 800 }}>{ok ? 'PASS' : 'FAIL'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VanguardDashboard;
