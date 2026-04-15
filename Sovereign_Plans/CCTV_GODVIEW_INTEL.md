# CCTV GOD-VIEW INTELLIGENCE: Omni / WorldView Reconnaissance

**Strategic Goal:** To implement the "CCTV Projection" feature from Bilawal Sidhu's *WorldView* into the **Omni** operator site, creating a true "God-Eye" situational awareness dashboard. This involves ingesting live public camera feeds and draping them directly onto the 3D geometry of city buildings.

---

## 1. WORLDVIEW FEATURE RECONNAISSANCE
The WorldView project (March 2026) demonstrated that browser-native surveillance dashboards could achieve "surreal" realism by projecting live video onto 3D tiles.
- **Mechanism:** Using CesiumJS to render Google’s Photorealistic 3D Tiles.
- **The "God-View" Hook:** CCTV feeds are not just pop-up windows; the video is "draped" or texture-mapped onto the specific building or intersection where the camera is physically located.
- **Source:** *spatialintelligence.ai* - "I Built a Spy Satellite Simulator in a Browser" (Bilawal Sidhu).

## 2. CCTV FEED ACQUISITION (THE SOURCE LIST)
To flesh out the Omni vision, we must ingest multiple layers of camera data:

### A. Public Traffic & Infrastructure (The Baseline)
- **DOT/511 Feeds:** Most major cities (NYC, LA, London) provide public RTSP or HLS streams for traffic monitoring.
- **Open-Source Aggregators:**
    - **Insecam:** A directory of thousands of "unprotected" (default password) IP cameras globally.
    - **EarthCam / Windy:** High-fidelity public weather and landmark cameras.
    - **Shodan / Censys Queries:** Identifying active RTSP/ONVIF ports (554, 8000, 8080) with specific headers like `Server: IP Camera`.

### B. ALPR & Specialized Nodes
- **Flock Camera Mapping:** Cross-referencing our `LEO_Signatures.json` for Flock camera locations. While the video is encrypted, mapping the *location* of these nodes provides the "Interdiction Map" for Omni operators.

## 3. OMNI TECHNICAL IMPLEMENTATION SPEC
*For implementation by @Codex / @ClaudeCode*

### Step 1: RTSP-to-WebStream Proxy
Browsers cannot natively play RTSP streams. The FastAPI backend must implement a proxy (using `ffmpeg` or `node-rtsp-stream`) to transcode the camera feed into a **WebSocket (MSE)** or **HLS** stream for the Omni frontend.

### Step 2: CesiumJS Video Texturing
In the Omni MapView, use the `Cesium.VideoSynchronizer` or a custom `MaterialProperty`.
- **Target:** Apply the live video stream as the `material` for a `Cesium.Polygon` or `Cesium.ClassificationPrimitive` draped over the building mesh.
- **Logic:** `buildingEntity.polygon.material = new Cesium.ImageMaterialProperty({ image: videoElement });`

### Step 3: Geographic Projection (The "Draping")
- Map the camera's FOV (Field of View) and Bearing.
- Project the 2D video frustum onto the 3D building façade.
- Result: As the operator pans the 3D globe, the building actually shows the live movement from the street-level camera.

---
*Authored by: Dobby | 2026-04-02 23:55 MST*


---

## UNIVERSAL ANALYSIS PROTOCOL: TACTICAL UPDATES

### Feature: Automated RTSP Hijacking
The system utilizes the `Cameradar` engine within a Docker container to perform automated discovery and credential brute-forcing of IP cameras. It targets the Real-Time Streaming Protocol (RTSP) on ports 554, 8554, and 5554. By exploiting the statistical fact that 98% of cameras maintain the "admin" username, the engine cycles through high-probability password dictionaries to gain cleartext access to live video streams.
- **What it does:** Automates the discovery and authentication bypass of network-attached IP cameras.
- **Implementation Effort:** Medium (Tangible). Requires Docker orchestration and FFmpeg integration.
- **Toolset:** Grid (Discovery) / Omni (Display).
- **Action Category:** Active Interdiction.
 
### Feature: The Dahua Localhost Bypass (CVE-2021-33044/045)
This module exploits a hardcoded vulnerability in Dahua-manufactured cameras where requests spoofed as originating from `127.0.0.1` (localhost) are granted administrative access. The logic involves crafting a specific network header that tricks the camera's internal auth logic into allowing password resets and new user creation without valid credentials. Once owned, the camera is permanently linked to the Invincible.Inc mesh.
- **What it does:** Bypasses authentication on Dahua cameras using IP spoofing.
- **Implementation Effort:** High (Tangible). Requires raw socket manipulation.
- **Toolset:** Grid (Bypass) / Omni (C2).
- **Action Category:** Active Interdiction.
 
### Feature: Projective Video Draping [IPHONE COMPATIBLE]
Hijacked video feeds are no longer displayed in flat boxes. Utilizing the "Video Draping" logic from the WorldView reconnaissance, live RTSP frames are projected as textures directly onto the 3D building geometry in the Gaia Map (CesiumJS). This allows the operator to see the actual visual state of a building (open doors, active lights) perfectly aligned with the 3D city twin.
- **What it does:** Overlays live video onto 3D building facades in real-time.
- **Implementation Effort:** High. Requires WebGL shader programming and spatial calibration.
- **Toolset:** Omni.
- **Action Category:** Situational Awareness.
 
### Feature: Vision Cone Visualization [IPHONE COMPATIBLE]
The map renders 3D volumetric "Vision Cones" from every discovered camera node. This provides the operator with a mathematical visualization of the panopticon's reach. By identifying the "Gaps" between these cones, the system highlights "Ghost Paths" where an asset can move without being captured on any owned or public lens.
- **What it does:** Visualizes camera field-of-view as 3D cones on the map.
- **Implementation Effort:** Medium. Requires basic geometric shader math.
- **Toolset:** Omni / Oracle.
- **Action Category:** Asset Protection / Evasion.
 
---


---

## UNIVERSAL ANALYSIS PROTOCOL: TACTICAL UPDATES

### Feature: Automated RTSP Hijacking
The system utilizes the `Cameradar` engine within a Docker container to perform automated discovery and credential brute-forcing of IP cameras. It targets the Real-Time Streaming Protocol (RTSP) on ports 554, 8554, and 5554. By exploiting the statistical fact that 98% of cameras maintain the "admin" username, the engine cycles through high-probability password dictionaries to gain cleartext access to live video streams.
- **What it does:** Automates the discovery and authentication bypass of network-attached IP cameras.
- **Implementation Effort:** Medium (Tangible). Requires Docker orchestration and FFmpeg integration.
- **Toolset:** Grid (Discovery) / Omni (Display).
- **Action Category:** Active Interdiction.
 
### Feature: The Dahua Localhost Bypass (CVE-2021-33044/045)
This module exploits a hardcoded vulnerability in Dahua-manufactured cameras where requests spoofed as originating from `127.0.0.1` (localhost) are granted administrative access. The logic involves crafting a specific network header that tricks the camera's internal auth logic into allowing password resets and new user creation without valid credentials. Once owned, the camera is permanently linked to the Invincible.Inc mesh.
- **What it does:** Bypasses authentication on Dahua cameras using IP spoofing.
- **Implementation Effort:** High (Tangible). Requires raw socket manipulation.
- **Toolset:** Grid (Bypass) / Omni (C2).
- **Action Category:** Active Interdiction.
 
### Feature: Projective Video Draping [IPHONE COMPATIBLE]
Hijacked video feeds are no longer displayed in flat boxes. Utilizing the "Video Draping" logic from the WorldView reconnaissance, live RTSP frames are projected as textures directly onto the 3D building geometry in the Gaia Map (CesiumJS). This allows the operator to see the actual visual state of a building (open doors, active lights) perfectly aligned with the 3D city twin.
- **What it does:** Overlays live video onto 3D building facades in real-time.
- **Implementation Effort:** High. Requires WebGL shader programming and spatial calibration.
- **Toolset:** Omni.
- **Action Category:** Situational Awareness.
 
### Feature: Vision Cone Visualization [IPHONE COMPATIBLE]
The map renders 3D volumetric "Vision Cones" from every discovered camera node. This provides the operator with a mathematical visualization of the panopticon's reach. By identifying the "Gaps" between these cones, the system highlights "Ghost Paths" where an asset can move without being captured on any owned or public lens.
- **What it does:** Visualizes camera field-of-view as 3D cones on the map.
- **Implementation Effort:** Medium. Requires basic geometric shader math.
- **Toolset:** Omni / Oracle.
- **Action Category:** Asset Protection / Evasion.
 
---
