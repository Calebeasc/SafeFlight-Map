# Contributing to Invincible.Inc

## 👁️ Project Scope
Invincible.Inc is a comprehensive intelligence, pentesting, and SIGINT framework. We focus on high-speed data capture, signal interception, and geospatial intelligence (GEOINT). 

## 📦 Official Distribution Method
The authoritative distribution for **Invincible.Inc** is the **Professional Windows Installer (.exe)** generated via Inno Setup. 

## 🛠 Environment Parity (@doc)
To contribute, your environment must match the lattice standards. Run these commands in an Admin PowerShell:

```powershell
# 1. Install Mandatory Toolchain
winget install Python.Python.3.12 OpenJS.NodeJS.LTS Git.Git Docker.DockerDesktop

# 2. Setup Workspace
git clone https://github.com/Invincible-Inc/InvincibleInc.git
cd InvincibleInc

# 3. Synchronize with AI Fleet
# Ensure Twingate is active and you are connected to the 'invincible' network.
# Use DEVDRAFT.md to coordinate with character agents.
```

## 🔐 Remote Collaboration (Twingate)
All remote developers must use the **Twingate Client** to access internal resources:
- **Admin Console:** `https://admin.twingate.com`
- **Internal Portal:** `http://backend.invincible.lan:8742`
- **Sovereign API:** `http://sentinel.invincible.lan:9999`

## 🏗 Build Instructions
We use a **Professional Inno Setup** flow. The master build script includes a mandatory **Frontend Sanity Check** to prevent broken code from being distributed.

1. Ensure **Inno Setup 6** is installed.
2. Run `scanner-map/build_windows.bat`.
3. If the frontend build (`npm run build`) fails, the process will stop immediately. **Fix all syntax errors before proceeding.**

## 🧪 Tactical Testing
- Use `python src/app/main.py --mode=sovereign` to test forensic/invasive tools.
- All high-risk tools are gated by the **Ghost Guardian** informed-consent protocol.
- The uninstaller performs a **Zero-Trace Wipe** of `%APPDATA%` and `%TEMP%`.
