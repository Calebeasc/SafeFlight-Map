# Invincible.Inc ROADMAP: Hardened Edition

## Phase 1: Foundation (COMPLETED)
- [x] Standardized Agent Fleet (.ai-agents)
- [x] Unified SIGINT/DeFlock Ingestion
- [x] High-Fidelity Tron Aesthetic Frontend
- [x] Local-First Privacy Protection

## Phase 2: Distribution (ACTIVE)
- [x] **Zero-Redirect Web Distribution:** Implement in-browser download triggers in Explainer site.
- [x] **Native Windows Packaging:** Inno Setup configuration for portable/local installation.
- [x] **Windows Desktop Launcher:** Bridge the FastAPI backend with a WebView2 native window.
- [x] **Firewall Exception Manager:** Automate port binding for scanner nodes.
- [x] **System Tray Orchestrator:** Background scanning and tray-to-foreground logic.
- [x] **Dual-Brain Lattice:** Autonomous failover to local LLMs (Qwen/Dolphin) for 100% uptime.

## Phase 3: Hardware Integration (UPCOMING)
- [ ] **SDR Node Bridge:** Integrate RTL-SDR and HackRF signals into the Lattice graph.
  > *Implementation: `Infrastructure/Scanning/SdrBridgeService.cs` — P/Invoke to `librtlsdr.dll`;
  > exposes `ISignalSource` domain interface so the use-case layer is hardware-agnostic.*
- [ ] **Drone-Link Telemetry:** Ingest remote drone-based SIGINT streams.
  > *Implementation: MAVLink UDP listener → `DroneSignalAdapter : ISignalSource` → Grid topology graph.*
- [ ] **Sovereign Mesh:** Local-to-local peer communication for field coordination.
  > *Implementation: ZeroMQ PUB/SUB on LAN; `MeshNode` is a domain `Aggregate` with
  > `INodeRepository` interface — no direct socket code in domain layer.*

## Phase 4: Data Intelligence (FUTURE)
*Detailed strategy in [FUTURE_PLAN_MAP.md](./FUTURE_PLAN_MAP.md)*
*Raw Intel: [PALANTIR_GIS_INTEL.md](./PALANTIR_GIS_INTEL.md) | [INVISION_GIS_INTEL.md](./INVISION_GIS_INTEL.md) | [PALANTIR_ONTOLOGY_INTEL.md](./PALANTIR_ONTOLOGY_INTEL.md) | [OMNI_SERVICE_ORCHESTRATION.md](./OMNI_SYSTEM_OF_ACTION.md) | [PALANTIR_AIP_MAPPING_INTEL.md](./PALANTIR_AIP_MAPPING_INTEL.md) | [WORLD_VIEW_INTEL.md](./WORLD_VIEW_INTEL.md) | [RF_SENSING_INTEL.md](./RF_SENSING_INTEL.md) | [VPS_DATA_FUSION_INTEL.md](./VPS_SURVEILLANCE_INTEL.md) | [SKYFALL_GS_INTEL.md](./SKYFALL_GS_INTEL.md) | [GAUSSIAN_SPLATTING_INTEL.md](./GAUSSIAN_SPLATTING_INTEL.md) | [TACTICAL_DEFENSIVE_INTEL.md](./TACTICAL_EVASION_INTEL.md) | [SECURITY_HARDENING_MESH_INTEL.md](./OFFENSIVE_MESH_INTEL.md) | [HARDWARE_MEDIC_INTEL.md](./HARDWARE_MEDIC_INTEL.md) | [SECURITY_HARDENING_HARDWARE_INTEL.md](./RED_TEAM_HARDWARE_INTEL.md) | [GEOSPATIAL_AI_RESEARCH_INTEL.md](./GEOSPATIAL_AI_RECON_INTEL.md)*

**[HIGH PRIORITY]**
- [ ] **The Great Partition:** Full codebase separation between Oracle and Invincible/Omni. [HIGHEST AUTHORITY]
  > *Implementation: Separate git repos (Calebeasc/Oracle, Calebeasc/Omni, Calebeasc/Grid) — DONE for code.
  > Next: shared domain primitives extracted to `@invincible/domain` npm package; CLAUDE.md in each repo
  > enforces bounded context with grep pre-commit hooks. Status: repos separated ✓, shared pkg pending.*
- [ ] **LGM Visual Geolocation:** Image-to-coordinate mapping (GeoSpy style). [DEV ONLY]
  > *Implementation: FastAPI endpoint `/api/geolocate` accepts base64 image → calls OSV5M / GeoSpy API;
  > returns `GpsCoordinate` ValueObject; rendered as LatticeObject pin on CesiumJS globe.*
- [ ] **Ghost Security Hardening Protocol:** Autonomous MAC randomization and VPN rotation. [DEV ONLY]
  > *Implementation: PowerShell `Set-NetAdapter -MacAddress` scheduled via Windows Task Scheduler;
  > Mullvad/ProtonVPN CLI toggle via `IVpnService` interface. Controlled by `OmniOpSecUseCase`.*
- [ ] **3D Global Asset Awareness Environment:** Transition to **CesiumJS** 3D globe. [ORACLE SAFE]
  > *Implementation: Replace Leaflet `MapView.jsx` with `CesiumGlobe.jsx` using `@cesium/engine`;
  > Ion token in `VITE_CESIUM_TOKEN` env var; existing `LatticeObject` arrays map to
  > `Cesium.Entity` with `LabelGraphics` and `BillboardGraphics`.*

**[MEDIUM PRIORITY]**
- [ ] **Spectre Side-Channel Bridge:** HackRF integration for encrypted leakage detection. [DEV ONLY]
- [ ] **Blue Line Calibrator:** Automated SDR tuning for law enforcement asset awareness. [ORACLE SAFE - View Only]
- [ ] **Persistent Car Asset Awareness (ALPR):** Developers set targets; users view live GPS. [ORACLE SAFE - View Only]
- [ ] **WiFi CSI Vision (DensePose):** Render 3D skeletons through walls. [DEV ONLY]

**[LOW PRIORITY]**
- [ ] **HiveMind SDR Mesh:** Distributed SIGINT net via co-opted IoT nodes. [DEV ONLY]
- [ ] **Vault Logic Verification Suite:** Biometric voice verification analysis and session logic verification. [DEV ONLY]
- [ ] **3D Projective CCTV:** Snapping live feeds to 3D geometry. [ORACLE SAFE - View Only]

## Phase 5: Strategic Expansion (FUTURE)
- [ ] **Invincible Intelligence Portal:** Dedicated dev-only palantir environment.
- [ ] **Sovereign Mesh v2:** Peer-to-peer intelligence sharing.
- [ ] **Acoustic Signature Triangulation:** ShotSpotter-style detection.

## Phase 6: Geospatial AI Foundation (FUTURE)
- [ ] **Large Geospatial Model (LGM):** Training the sovereign neural visual positioning engine.
- [ ] **Side-Effect Data Collection:** Gamified visual collection from the Oracle user base.
- [ ] **Neural City Mirrors:** Automated Skyfall GS city generation.
 
---
 
<SPECIALIST_DEPLOYMENT_MATRIX>
- **Objective: System Architecture & Coordination** -> **Lead Specialist: [@claude]**
- **Objective: Low-Level System Compilation** -> **Lead Specialist: [@weaver]**
- **Objective: High-Fidelity UI/UX Synergy** -> **Lead Specialist: [@aether]**
- **Objective: Automated Deployment & Verification** -> **Lead Specialist: [@terminus]**
</SPECIALIST_DEPLOYMENT_MATRIX>
