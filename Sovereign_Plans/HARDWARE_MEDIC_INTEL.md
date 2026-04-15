# HARDWARE MEDIC INTELLIGENCE: Self-Healing Systems Volume
 
**Strategic Goal:** This volume documents the "Medic" Hardware Self-Healing Tool, designed to automatically detect and repair hardware blockages (SDR, GPS, Scanners) using high-authority administrative overrides. By documenting the logic for automated driver remediation and sys.path injection, we ensure Invincible.Inc remains 100% operational in the field with zero manual troubleshooting required by the operator.
 
---
 
## 1. THE "MEDIC" HARDWARE SELF-HEALING TOOL (SYSTEMS TIER)
 
### A. Automated Blockage Detection & Driver Remediation
The Medic tool is a diagnostic backend that monitors the health of the physical hardware attached to the system. If a "Blocked COM Port" or "Device Not Responding" error is detected in the `DiagnosticCard.jsx`, the primary agent (@Medic) triggers an automated UAC prompt to gain administrative authority. It then opens the Windows Device Manager (via PowerShell/WMI), locates the malfunctioning driver, and executes a "Force Reset"—disabling and re-enabling the device to clear the hardware hang. This ensures that transient hardware glitches do not stop the mission.
*   **Primary Agent:** @.ai-registry\medic.md
*   **Supporting Agents:** @.ai-registry\sentinel.md, @.ai-registry\weaver.md
 
### B. [ORACLE SAFE] Self-Healing for Basic Users
This feature is "Oracle Safe" and will be a core part of the basic user app. Drivers rely on their GPS and WiFi scanners to stay ahead of the "Blue Line." If their hardware fails, the Medic tool will automatically attempt to fix it in the background without requiring the user to know how to use Device Manager. A simple "Hardware Healing..." status will appear on the dashboard, providing the driver with confidence that their situational awareness will be restored instantly.
*   **Source:** Invincible.Inc Developer Onboarding: "Automated System Recovery Lead."
 
### C. Environment Injection & Standalone Compilation
For more complex failures, @Medic can run custom `sys.path` injection scripts to fix frozen Python environments that are preventing the SDR/Sentinel server from starting. Once a fix is verified, the agent @Weaver is instructed to re-compile the repair script into a standalone binary. This ensures that the specific error can never occur again on that hardware, creating a system that literally "Learns to Heal Itself" over time.
*   **Source:** Invincible.Inc Build System: "Nuitka Binary Obfuscation and Standalone Execution."
 
---
 
## 🎯 INSTRUCTIONS FOR THE NEXT AI (EXECUTIONER)
 
**Instruction:** You must build the `Hardware_Watchdog` module in the backend to monitor COM port availability. You must implement the `PowerShell_Driver_Reset` script to execute the disabling/enabling logic from Section 1A. You must ensure that the Oracle UI displays a "Healing" animation when this module is active to reassure the user. Refer to the @Medic technical instructions for the specific WMI query strings.
