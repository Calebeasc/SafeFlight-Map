# ARCHITECTURAL SPECIFICATION: NATIVE WINDOWS HOST INTEGRATION
 
**Strategic Goal:** This document defines the transition from a web-based React/FastAPI prototype to a **Production-Grade Native Windows Application** using the **Windows App SDK (WinUI 3) and C#**. This architecture ensures absolute local resilience, low-latency rendering, and total process-level isolation.
 
---
 
## 1. NATIVE SHELL ARCHITECTURE (WinUI 3)
 
### A. The "Real App" Mandate
To meet the high-fidelity standards of applications like the **Xbox App** and **Docker Desktop**, the project must eliminate all browser engines, web-views, and interpreted scripts. The UI is built using **Native XAML (Extensible Application Markup Language)** and the business logic is executed in **C# (Managed Native)**. This ensures that the application runs directly on the Windows Kernel with 0% browser overhead.
 
### B. App Entry Point (App.xaml.cs)
The application initializes as a standard WinUI 3 executable. It is responsible for:
- Initializing the Fluent Design System.
- Spawning the primary `MainWindow.xaml`.
- Establishing the secure `P/Invoke` bridge to low-level hardware modules.
 
---
 
## 2. HIGH-DENSITY DASHBOARD (XAML)
 
### A. Fluent Design & Data Visualization
The UI layer utilizes XAML to define a high-density, "Sovereign" dashboard. We use **Direct2D** and **Win2D** for real-time hardware-accelerated rendering of signal waterfalls, telemetry graphs, and the 3D Global Panopticon (via the CesiumJS bridge or a native C++ DirectX viewer).
 
### B. Component Modularity
Every tactical module (Signal Awareness, Route Avoidance, Drone Telemetry) is implemented as a **Custom UserControl** in XAML. This ensures strict modularity and allows for build-time "Flavor Gating" (e.g., hiding advanced research controls from the basic Oracle build).
 
---
 
## 3. HARDWARE & LOGIC BRIDGE (P/INVOKE)
 
### A. C++ Hardware Interop
For high-performance signal processing (SDR, SIGINT, RF Sensing), the C# app interfaces with low-level **C++ DLLs** using **P/Invoke (Platform Invoke)**. This allows the app to perform raw I/O operations on physical hardware (HackRF, Alfa Antennas) at the speed of the CPU, bypassing the latency of the Python/FastAPI layer.
 
### B. Service Isolation (The Great Partition)
The backend logic is physically isolated into separate **Sovereign Microservices**. 
- **Oracle Tier:** Handles safe, tactical driving data.
- **Omni Tier:** Handles advanced research and interdiction logic.
These are managed as separate processes or isolated DLLs to enforce the **Principle of Least Privilege**.
 
---
 
## 4. WEB TERMINATION MANDATE (OMNI-CORE)
 
### A. Removal of Public Web Access
As of April 2026, all public web-based access to the Omni Command Core is strictly terminated. This prevents AI agents from introducing browser-dependent vulnerabilities or "web-only" components. Omni is now a **Pure Sovereign Native Environment**.
 
### B. Zero-Browser Dependency
The use of `WebView2`, `Electron`, or any embedded browser engine for core interdiction functionality is prohibited. All UI must be implemented using **Native XAML/C#**, and all data processing must occur via **Native C++ or C# modules**.
 
### C. Advertisement Site Exception
The only authorized web-facing asset is the **Invincible.Inc Advertisement/Explainer** site, which serves exclusively for project visibility and distribution triggers. It must not contain any functional links to the command core.
 
---
 
## 🎯 INSTRUCTIONS FOR THE PRINCIPAL ARCHITECT (CLAUDE)
 
**`<task>`**
1. **Initialize the WinUI 3 Project:** Draft the `App.xaml.cs` and `MainWindow.xaml` boilerplate for the pure native host.
2. **XAML Dashboard Layout:** Provide a professional, dark-themed XAML layout for the central "Command Tower" view.
3. **P/Invoke Bridge Logic:** Write the C# wrapper for a sample C++ DLL that handles raw SDR signal ingestion.
4. **Build-Time Partitioning:** Propose a strategy for using **Conditional Compilation Symbols** (e.g., `#if OMNI_UNLOCKED`) to gate advanced features in the native binary.
**`</task>`**
