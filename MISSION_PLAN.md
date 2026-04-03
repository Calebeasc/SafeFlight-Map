# MISSION PLAN: Invincible.Inc Technical Roadmap

This document is managed by **Pathfinder (@pathfinder)**. It provides the implementation plan and audit state for fulfilling the standalone Windows app request with technical fidelity.

---

## Active Directive: Professional Native Application Development
**Goal:** Ship a fully functional, production-ready, standalone Windows desktop application (`.exe`) that runs in its own window and does not redirect the user into a browser.

---

### Phase 1: Architecture Locked
The current delivery path is a browser-free hybrid desktop shell around the existing frontend/backend stack:
- [x] **Native Shell:** packaged desktop launcher
- [x] **Embedded Engine:** `pywebview`-hosted application window
- [x] **Local Backend:** bundled FastAPI server inside the desktop app
- [x] **Zero Browser Redirection:** packaged launchers no longer fall back to opening the app in an external browser

---

### Phase 2: Implementation Roadmap
1. [x] **Frontend Integration:** bundle the React `dist/` payload into the packaged application resources.
2. [x] **Desktop Packaging:** package the local backend plus embedded window into a standalone EXE via PyInstaller.
3. [x] **Launcher Hardening:** keep the app self-contained when logging paths are locked or the embedded window fails.
4. [x] **Build Hardening:** move PyInstaller scratch output out of OneDrive-backed directories and fail the build on real external-tool errors.
5. [x] **EXE Verification:** rebuild `scanner-map\dist\InvincibleInc\InvincibleInc.exe` from current sources.
6. [x] **Installer Verification:** rebuild the Inno Setup installer from the current EXE bundle and verify the generated artifact.
7. [ ] **Optional R&D Track:** revisit a Rust/WebView2 shell only if the current packaged desktop path stops satisfying the standalone requirement.

---

### Phase 4: Advanced Intelligence Integration [COMPLETED]
1.  [x] **Visual Geolocation Module:** Implemented **Argus-Eye (@argus-eye)** VPR mock endpoint in `geolocation.py`.
2.  [x] **Limitation Neutralization:** Backend routes registered in `main.py` to bypass API isolation.
3.  [x] **UI Integration:** Integrated `TabArgusEye` into the Dev Panel for visual reconnaissance.

---

### Phase 6: Identity Resolution (Person Lookup) [COMPLETED]
1.  [x] **Ontology Design:** Defined `ResolvedEntity` schema with Palantir-style data fusion (Financial, Social, Travel).
2.  [x] **Fusion Harvesters:** Implemented `identity.py` backend with probabilistic matching logic mock.
3.  [x] **ER Engine:** Integrated fuzzy-matching and pattern-of-life intelligence into the resolution engine.
4.  [x] **Lookup UI:** Built the high-fidelity **Person Lookup** tool in the Dev Panel.
5.  [x] **Map Correlation:** Linked resolved identities to the Intelligence & SIGINT lane for multi-domain tracking.

---

### Phase 7: Audit & Verification
- **Audit:** the packaged launcher must stay inside an embedded desktop window and not escape into an external browser on startup.
- **Verification:** the app must appear in Task Manager as a desktop application entry with its own icon and no browser address bar.
- **Release Gate:** both `InvincibleInc.exe` and the installer must be rebuilt from current sources before a distribution update is called fully complete.
