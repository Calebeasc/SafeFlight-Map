import React, { useState } from 'react';

/**
 * GhostGuardian — Engineered by @ghost for OpSec & Anti-Forensics.
 * Mandates informed consent for invasive tool usage.
 */

const GhostGuardian = ({ toolName, description, risks, onConfirm, onCancel }) => {
  const [understood, setUnderstood] = useState(false);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(10, 14, 20, 0.95)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', fontFamily: '"JetBrains Mono", monospace'
    }}>
      <div style={{
        maxWidth: '500px', width: '100%',
        background: '#0A0E14', border: '1px solid #FF453A',
        borderRadius: '12px', padding: '32px',
        boxShadow: '0 0 40px rgba(255, 69, 58, 0.2)'
      }}>
        <div style={{ color: '#FF453A', fontSize: '12px', fontWeight: 800, letterSpacing: '0.2em', marginBottom: '8px' }}>
          ⚠️ GHOST GUARDIAN: OPSEC ALERT
        </div>
        
        <h2 style={{ color: '#FFF', fontSize: '20px', margin: '0 0 16px 0' }}>
          Confirm {toolName} Activation
        </h2>

        <div style={{ color: 'rgba(180, 195, 220, 0.8)', fontSize: '13px', lineHeight: '1.6', marginBottom: '20px' }}>
          <strong>DESCRIPTION:</strong><br/>
          {description}
        </div>

        <div style={{ 
          background: 'rgba(255, 69, 58, 0.05)', 
          border: '1px solid rgba(255, 69, 58, 0.2)',
          padding: '16px', borderRadius: '8px', marginBottom: '24px'
        }}>
          <div style={{ color: '#FF453A', fontSize: '11px', fontWeight: 800, marginBottom: '8px' }}>TACTICAL RISKS:</div>
          <ul style={{ color: '#FFD60A', fontSize: '12px', paddingLeft: '18px', margin: 0 }}>
            {risks.map((risk, i) => <li key={i} style={{ marginBottom: '4px' }}>{risk}</li>)}
          </ul>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '32px' }}>
          <input 
            type="checkbox" 
            checked={understood} 
            onChange={(e) => setUnderstood(e.target.checked)}
            style={{ width: '18px', height: '18px', accentColor: '#FF453A' }}
          />
          <span style={{ color: '#FFF', fontSize: '12px' }}>
            I accept the risk of detection and authorize this fingerprint.
          </span>
        </label>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={onCancel}
            style={{ 
              flex: 1, padding: '12px', borderRadius: '6px', 
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: '#FFF', cursor: 'pointer'
            }}
          >
            Abort
          </button>
          <button 
            disabled={!understood}
            onClick={onConfirm}
            style={{ 
              flex: 2, padding: '12px', borderRadius: '6px', 
              background: understood ? '#FF453A' : 'rgba(255,69,58,0.2)',
              color: '#FFF', fontWeight: 800, border: 'none',
              cursor: understood ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s'
            }}
          >
            Execute Tool
          </button>
        </div>
      </div>
    </div>
  );
};

export default GhostGuardian;
