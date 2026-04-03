# CLAUDE.md — Hardened_Plans Architecture Index
## Lead Architect: @anderton | Scope: Invincible.Inc Cross-Platform Architecture

---

## DIRECTORY PURPOSE

This directory contains the **hardened architectural specifications** for all three Invincible.Inc products.
These documents drive implementation across Web (React/Vite), Windows (WinUI 3/C#), and Mobile (iOS/CesiumJS).

Each file follows the **DDD + Clean Architecture** doctrine from the `Design and Aesthetics/` reference folder.

---

## FILE INDEX

### Core Architecture
| File | Scope | Status |
|------|-------|--------|
| `OMNI_PRODUCT_BLUEPRINT.md` | Omni — full capability spec | Active |
| `ORACLE_PRODUCT_BLUEPRINT.md` | Oracle — user app spec | Active |
| `GRID_PRODUCT_BLUEPRINT.md` | Grid — network scanner spec | Active |
| `NATIVE_APP_ARCHITECTURE.md` | Windows WinUI 3 native host | Implementation ready |
| `OMNI_SERVICE_ORCHESTRATION.md` | Omni orchestration engine | Active |

### Geospatial & Visualization
| File | Scope | Status |
|------|-------|--------|
| `GAUSSIAN_SPLATTING_INTEL.md` | 3DGS rendering pipeline | Implementation ready |
| `INVISION_GIS_INTEL.md` | GIS standards and record integration | Active |
| `PALANTIR_ONTOLOGY_INTEL.md` | DDD ontology — LatticeObjects | Implementation ready |
| `WORLD_VIEW_INTEL.md` | CesiumJS 3D globe integration | Active |
| `SKYFALL_GS_INTEL.md` | Neural scene completion | Active |
| `GEOSPATIAL_AI_RECON_INTEL.md` | Visual record resolution (LGM) | Active |
| `TEMPORAL_GIS_STANDARDS.md` | Time-cursor + 4D replay | Active |

### Infrastructure & Services
| File | Scope | Status |
|------|-------|--------|
| `ROADMAP.md` | Phase roadmap (Phases 1–6) | Phase 1+2 done |
| `FUTURE_PLAN_MAP.md` | Diagnostic resource index | Active |
| `MISSION_PLAN.md` | Session mission log | Active |
| `OMNI_SERVICE_ORCHESTRATION.md` | Service orchestration spec | Active |
| `ORACLE_INTEGRATION_INTEL.md` | Oracle cloud + system of record | Active |
| `SYSTEM_SELF_HEALING_INTEL.md` | Auto-remediation | Active |
| `SYSTEMATIC_ASSET_AWARENESS_INTEL.md` | Asset lifecycle mgmt | Active |

### Security & Hardening
| File | Scope | Status |
|------|-------|--------|
| `SECURITY_POSTURE_MATRIX.md` | Risk tiers + prominence scoring | Active |
| `ENVIRONMENTAL_ANONYMIZATION_INTEL.md` | VPN rotation + OpSec | Active |
| `RF_SENSING_INTEL.md` | SDR + WiFi diagnostic sensing | Active |
| `VPS_SURVEILLANCE_INTEL.md` | Visual Positioning System | Active |
| `RED_TEAM_HARDWARE_INTEL.md` | SDR hardware + RF diagnostics | Active |
| `OFFENSIVE_MESH_INTEL.md` | Infrastructure logic verification | Active |

### Agent & Process
| File | Scope | Status |
|------|-------|--------|
| `INVINCIBLE_AGENT_DIRECTORY.md` | Agent roster + mandates | Active |
| `Invincible Agents Overview.md` | High-level agent roles | Active |
| `CLAUDE_OPTIMIZATION_INTEL.md` | Claude session optimization | Active |
| `PALANTIR_AIP_MAPPING_INTEL.md` | AIP-style orchestration mapping | Active |

---

## DDD BOUNDED CONTEXTS (Robert C. Martin — Clean Architecture)

```
Hardened_Plans/
├── Oracle Context      → Consumer GPS, route tracking, authorized target scanning
├── Grid Context        → Network topology, heat maps, encounter logging
└── Omni Context        → SIGINT fusion, 3D globe, Lattice ontology, T-3 admin
```

**The Dependency Rule applies to ALL plans:**
- Outer rings (UI, Infra) can depend on inner rings
- Inner rings (Domain Entities) NEVER depend on outer rings
- Cross-context communication via Lattice API only (no direct imports)

---

## IMPLEMENTATION PRIORITY ORDER

### TIER 1 — NOW (Web/Windows foundations)
1. **The Great Partition** — Complete Oracle/Grid/Omni code separation
2. **WinUI 3 Shell** — `App.xaml.cs` + `MainWindow.xaml` boilerplate
3. **Omni Web: CesiumJS 3D Globe** — Replace Leaflet with CesiumJS in Omni
4. **LatticeObject Ontology** — TypeScript interfaces for domain entities

### TIER 2 — NEXT (Features)
5. **3DGS Renderer** — WebGL Gaussian Splatting viewer component
6. **Temporal Replay** — Time-cursor 4D event reconstruction UI
7. **Mobile Oversight Bridge** — CesiumJS on iOS via WKWebView

### TIER 3 — FUTURE (Hardware + AI)
8. **SDR Node Bridge** — RTL-SDR/HackRF ingestion into Grid topology
9. **Sovereign Mesh** — Local-to-local peer coordination
10. **LGM Visual Geolocation** — Image-to-coordinate mapping engine
