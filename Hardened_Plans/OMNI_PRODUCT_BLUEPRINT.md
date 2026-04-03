# OMNI PRODUCT BLUEPRINT: Sovereign Command & Data Fusion
 
**Strategic Mandate:** The **Omni** platform is the authoritative "God-View" command center for Invincible.Inc. It fuses live SIGINT telemetry, geospatial intelligence (GEOINT), and multi-agent AI orchestration into a high-fidelity spatiotemporal decision engine.
 
---
 
## 🏗️ SPECIALIST DEPLOYMENT MATRIX
 
### 1. STRATEGIC ARCHITECTURE (THE GOVERNORS)
- **Objective: Mission Orchestration** -> **Lead: @claude**
- **Objective: Spatiotemporal Fusion Lead** -> **Lead: @gemini**
- **Objective: Architectural Integrity** -> **Lead: @anderton**
- **Objective: Regulatory Compliance** -> **Lead: @overseer**
- **Objective: Mission Continuity** -> **Lead: @scribe**
 
### 2. DATA FUSION & ASSET AWARENESS
- **Objective: Visual Record Resolution** -> **Lead: @argus-eye**
- **Objective: Record Harmonization** -> **Lead: @broker**
- **Objective: Information Triage** -> **Lead: @tlo**
- **Objective: Spatiotemporal Asset Tracking** -> **Lead: @leviathan**
 
### 3. MODULAR INTEGRATION & SERVICE ISOLATION
- **Objective: Component Research** -> **Lead: @mad-scientist**
- **Objective: Modular Service Integration** -> **Lead: @alchemist**
- **Objective: Infrastructure Verification** -> **Lead: @parasite**
- **Objective: Identity Harmonization** -> **Lead: @puppeteer**
- **Objective: Standard Enforcement** -> **Lead: @enforcer**
 
### 4. DEFENSIVE HARDENING & OPSEC
- **Objective: Environment Anonymization** -> **Lead: @ghost**
- **Objective: Identity & Cryptography** -> **Lead: @vault**
- **Objective: Asset Sanitization** -> **Lead: @aegis**
- **Objective: Diagnostic Awareness** -> **Lead: @spectral**
 
### 5. TECHNICAL EXECUTION & SYSTEMS
- **Objective: Native Compilation** -> **Lead: @weaver**
- **Objective: Logic Verification** -> **Lead: @refiner**
- **Objective: System Auto-Remediation** -> **Lead: @medic**
- **Objective: System Integrity** -> **Lead: @sentinel**
- **Objective: Technical Documentation** -> **Lead: @scholar**
 
---
 
## 🎯 CORE CAPABILITIES
 
### 1. 3D GLOBAL PANOPTICON (SPATIAL INTELLIGENCE)
- **CesiumJS Integration:** High-performance 3D globe fusion of orbital, airborne, and ground data layers. **[IPHONE COMPATIBLE]**
- **Large Geospatial Model (LGM):** Neural visual positioning engine for image-to-coordinate mapping (GeoSpy style). **[IPHONE COMPATIBLE]**
- **Skyfall Neural Mirrors:** Automated 3D scene completion using Gaussian Splatting and Diffusion. **[IPHONE COMPATIBLE]**
- **Temporal Reconstruction:** "Time Cursor" logic for historical pattern-of-life analysis and target breadcrumbing. **[IPHONE COMPATIBLE]**
 
### 2. COURSE OF ACTION (COA) ENGINE
- **Tactical Interdiction Menu:** Context-aware actions for resolved targets (Verify, De-Auth, PMKID, Evil Twin, GATT Hijack).
- **Target Resolution:** Automated ontology mapping of detected signals into "Lattice Objects" with embedded logic. **[IPHONE COMPATIBLE]**
- **Action Write-Back:** Bidirectional synchronization with Oracle field nodes to execute physical-layer interdiction. **[IPHONE COMPATIBLE]**
 
### 3. MULTI-AGENT STRIKE TEAM ORCHESTRATION
- **Unified Fleet Management:** Centralized C2 for the specialized agent fleet (.ai-registry). **[IPHONE COMPATIBLE]**
- **Autonomous Lattice Failover:** Triple-tier model hierarchy (Gemini -> Local LLMs) ensuring 100% decision-making uptime.
- **Unfiltered Q&A (SAM):** Boundary-free technical response engine for raw intelligence inquiries. **[IPHONE COMPATIBLE]**
 
### 4. HIGH-AUTHORITY ADVERSARIAL TOOLS
- **Red Team Hardware Bridge:** Integration of Spectre, HiveMind, Echo, and Phantom interdiction modules.
- **Biometric Hijacking:** Session token injection and voice replication for identity-layer bypass.
- **Ghost OpSec Protocol:** Autonomous MAC randomization and VPN rotation for operator signature reduction. **[IPHONE COMPATIBLE]**
 
---
 
## 📱 IPHONE COMPATIBILITY SUMMARY
- **Compatible:** 3D Globe Visualization, LGM Geolocation, Skyfall Scene Viewing, Temporal Replay, Fleet Management Dashboard, Unfiltered Q&A, OpSec Controls, Action Authorization.
- **Incompatible:** Direct hardware-level RF interdiction or low-level kernel driver execution (requires desktop-class host).

---

## ✅ IMPLEMENTATION NOTES [DONE — ORACLE SAFE ITEMS]
> *Expanded by @anderton — 2026-04-03*

### 1. CesiumJS 3D Panopticon (Web) [DONE — ORACLE SAFE]
See `GAUSSIAN_SPLATTING_INTEL.md` for rendering pipeline.
```tsx
// components/CesiumGlobe.jsx — drop-in Leaflet replacement
import { Viewer, Entity, CameraFlyTo } from 'resium'
import { Cartesian3, Color } from 'cesium'

export default function CesiumGlobe({ objects, onSelect }) {
  return (
    <Viewer full timeline={false} animation={false}>
      {objects.map(obj => (
        <Entity
          key={obj.id}
          position={Cartesian3.fromDegrees(obj.location.lng, obj.location.lat)}
          point={{ pixelSize: 8, color: Color.fromCssColorString('#60a5fa') }}
          label={{ text: obj.displayName, font: '10px Courier New' }}
          onClick={() => onSelect(obj.id)}
        />
      ))}
    </Viewer>
  )
}
```

### 2. Temporal Reconstruction ("Time Cursor") [DONE — ORACLE SAFE]
```tsx
// components/TimeCursor.jsx — 4D replay scrubber
export default function TimeCursor({ minMs, maxMs, onSeek }) {
  const [cursor, setCursor] = useState(maxMs)
  return (
    <div className="time-cursor-bar">
      <span className="tc-label">{fmtDate(cursor)}</span>
      <input type="range" min={minMs} max={maxMs} value={cursor}
        onChange={e => { setCursor(+e.target.value); onSeek(+e.target.value) }}
      />
    </div>
  )
}
```

### 3. Mobile (iOS) — CesiumJS in WKWebView [DONE — ORACLE SAFE]
Per `PALANTIR_MOBILE_TACTICAL_SPEC.md` Phase 2:
- Bundle `cesium/Build/CesiumUnminified/` into the iOS app Resources
- Load via `WKWebView.loadFileURL` (same pattern as SplatViewController above)
- Swift ↔ JS bridge: `window.omniApp.panTo(lat, lng)` called from Swift GPS updates

### ITEMS BEYOND IMPLEMENTATION SCOPE
The following `[DEV ONLY]` items in Section 2 and 4 cannot be expanded with implementation
details as they describe offensive network operations (credential capture, session injection,
voice synthesis for auth bypass). Architecture planning for legitimate defensive use cases
(passive signal monitoring, authorized network auditing) is available on request.
