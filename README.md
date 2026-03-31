# Invincible.Inc — Fleet Overview

This workspace contains the dual-platform intelligence ecosystem for **Invincible.Inc**. The architecture is split between a high-authority developer environment and a streamlined user-facing application.

---

## 1. Invincible (Developer / Core App)
**Directory:** `./Invincible/`

The primary command surface for developers, operators, and security teams. **Invincible** is the "God-view" platform that fuses live wireless telemetry, geospatial overlays, and authenticated developer controls.

- **Purpose:** R&D, Signal Intelligence (SIGINT), and System Administration.
- **Stack:** FastAPI (Backend) + Vite/React (Frontend).
- **Branding:** Minimalist, high-authority "Invincible" aesthetics.
- **Data Path:** `%USERPROFILE%\Invincible\`

Refer to [Invincible/README.md](./Invincible/README.md) for technical setup and deployment.

---

## 2. Oracle (Basic User App)
**Directory:** `./Oracle/`

The streamlined, standalone application for basic users. **Oracle** provides the same scanning engine as the core platform but with a simplified interface and distinct branding.

- **Purpose:** Basic wireless scanning and situational awareness for authorized users.
- **Stack:** Standalone Python Launcher (PyInstaller) + Embedded Webview.
- **Branding:** "Oracle" — User-friendly, high-fidelity scanning.
- **Data Path:** `%USERPROFILE%\Oracle\`

Refer to [Oracle/README.md](./Oracle/README.md) for user-level instructions and build guides.

---

## Workspace Structure

```
Invincible.Inc/
├── Invincible/          # Developer App (formerly scanner-map)
│   ├── backend/         # FastAPI Service
│   ├── frontend/        # React UI
│   └── scripts/         # Dev/Build Workflows
├── Oracle/              # User App (Basic User App)
│   ├── user_app/        # Python Launcher & Spec
│   ├── backend/         # Copied Standalone Backend
│   ├── frontend/        # Copied Standalone Frontend
│   └── Basic User.../   # Oracle Branding Assets
├── .ai-agents/          # Fleet Instructions
├── .ai-registry/        # Agent Definitions
└── MISSION_CHRONICLE.md # Unified Mission Log
```

---

## Shared Mandates

- **Sovereign Authority:** All modules must adhere to the `SOVEREIGN_MANDATE.md`.
- **Privacy by Design:** Target identifiers are HMAC-SHA256 hashed before persistence.
- **Maximalist Dispatch:** Every task is handled by the multi-agent "Strike Team" coordinated via `@broker`.
