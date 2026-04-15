# OMNI SYSTEM OF ACTION: The Sovereign COA Engine
 
**Strategic Goal:** This volume documents the transition from passive signal awareness to active tactical interdiction. By implementing a "Course of Action" (COA) menu for every target—modeled after Palantir Gotham—we provide the **Omni Insider** with the ability to remotely and locally influence the electromagnetic and digital environment.
 
---
 
## 🎯 THE COA WORKFLOW
 
### 1. Multi-Frequency "Pulse" Scan
The **Grid** module initiates a wide-spectrum scan across all scannable frequencies:
- **WiFi (2.4/5/6 GHz):** SSID, BSSID, Client MACs, and CSI Skeletons.
- **Cellular (LTE/5G):** Cell ID, LAC, and signal strength (IMSI simulation).
- **Bluetooth (BLE):** Device names, GATT services, and proximity beacons.
- **RF (VHF/UHF):** P25 voice traffic, SDR waterfalls, and raw burst emissions.
- **RFID/NFC:** Physical access badges and payment tokens.
 
### 2. Target Resolution (Ontology)
Every detected signal is resolved into a **Target Object** in the Omni 3D globe. The system performs a "Pattern of Life" audit and assigns a **Detectability Tier** from the `OPERATIONAL_RISK_LEDGER`.
 
### 3. Course of Action (COA) Options
When a target is selected, Omni presents a context-aware menu of actions:
 
#### **A. WiFi Targets (Phones, Laptops, IoT)**
- **[ORACLE SAFE] Verify:** Passive audit of signal health and configuration.
- **[DEV ONLY] De-Auth:** Forcibly disconnect the device from the network.
- **[DEV ONLY] PMKID Capture:** Silently harvest handshakes for offline cracking (Hashcat).
- **[DEV ONLY] Evil Twin:** Spawning a rogue AP to intercept traffic (SET/Wireshark).
 
#### **B. BLE/RFID Targets (Smart Locks, Watches, Badges)**
- **[ORACLE SAFE] Proximity Alert:** Audible warning when a specific beacon enters the perimeter.
- **[DEV ONLY] GATT Hijack:** Reading/Writing internal device characteristics.
- **[DEV ONLY] Badge Clone:** Replaying RFID/NFC signatures for physical bypass.
 
#### **C. Persona Targets (Identified Individuals)**
- **[ORACLE SAFE] Track:** Persistent spatiotemporal breadcrumbs on the 3D globe.
- **[DEV ONLY] Echo Replicate:** Synthesizing a deep-fake voice clone (Red Team Echo).
- **[DEV ONLY] Vault Hijack:** Injecting harvested session tokens to bypass MFA (Puppeteer).
 
#### **D. Infrastructure Targets (Speed Cameras, CCTVs, Mainframes)**
- **[ORACLE SAFE] Map:** Geolocation and vulnerability metadata.
- **[DEV ONLY] Blind:** Poisoning ALPR/LPR metadata to mask movements.
- **[DEV ONLY] Penetrate:** Gaining a reverse shell via Metasploit (Eternal Blue).
 
---
 
## 🔐 INSIDER ACCESS GATING (RBAC)
The COA Engine is strictly gated to **Sovereign Insiders**. 
- **User Validation:** Access requires a valid **Master Key** and **Device Signature** registered in the `vault.js`.
- **Audit Logging:** Every "Action" taken is locally encrypted and logged by **@Scribe** to prevent unauthorized "Insider Threat" misuse of the Omni tools.
 
**Status:** Architecture established. The COA UI will be implemented as a right-click "Tactical Overlay" in the Omni 3D View.
