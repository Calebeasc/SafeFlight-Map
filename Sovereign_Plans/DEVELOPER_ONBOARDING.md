# Invincible.Inc — Developer Onboarding & Setup Guide

Welcome to the lattice. This guide provides the exact steps required to set up your environment, authenticate with our AI workforce, and start contributing code.

---

## 🛠 1. Environment Bootstrap (@doc)

Run these commands in a **PowerShell** (Admin) terminal to install the mandatory toolchain:

```powershell
# 1. Install Git, Python 3.12, Node.js LTS, and Docker Desktop
winget install Git.Git Python.Python.3.12 OpenJS.NodeJS.LTS Docker.DockerDesktop

# 2. Install the Claude Code AI CLI
npm install -g @anthropic-ai/claude-code

# 3. Verify Installations
git --version; python --version; node --version; claude --version; docker --version
```

---

## 🔐 2. Secure Access (Twingate & Portal) (@medic)

We use **Twingate** for secure, zero-trust access to our internal development portal and resources.

### Connecting to the Network
1.  **Install Twingate Client:** Download and install the client for your OS from [twingate.com/download](https://www.twingate.com/download/).
2.  **Join Network:** Enter the network slug: **`invincible`**.
3.  **Authenticate:** Sign in with your provided developer credentials (e.g., your Google/Identity account linked to the `invincible.twingate.com` tenant).
4.  **Access Resources:** Once connected, you can reach internal services via their secure aliases:
    - **Developer Portal:** `http://backend.invincible.lan:8742`
    - **Sovereign API:** `http://sentinel.invincible.lan:9999`

---

## 🤖 3. AI Workforce Sync (DEVDRAFT.md) (@link)

Our AI workforce (Gemini, Claude, Codex) monitors the project for new instructions. To collaborate with the agents, we use a high-fidelity sync file.

### The Instruction Loop
- **Authoritative File:** `DEVDRAFT.md` in the project root.
- **Syncing:** The `@link` agent polls this file every 5 minutes.
- **Usage:** Append your mission orders, architectural requests, or task lists to this file. The fleet will automatically detect changes, parse the new instructions, and dispatch them to the appropriate specialists via the **Alfred (@alfred)** bridge.

---

## 📂 4. Codebase Navigation (@anderton)

The project is bifurcated into high-speed ingestion and high-fidelity visualization.

- **`/Invincible/backend/`**: FastAPI engine. Logic for signal ingestion, SQLite management, and ALPR scraping.
- **`/Invincible/frontend/`**: React/Vite/Leaflet UI. The "Tron" and "Merovingian" skins live here.
- **`/Invincible/desktop/`**: The native Windows launcher (`launcher.py`) that wraps the app in WebView2.
- **`/.claude/agents/`**: The brain of the project. These files govern how the AI workforce behaves.

---

## 🌿 4. Collaborative Git Protocol (@architect)

To prevent overwriting ideas, we follow a strict **Feature Branch** strategy.

1. **Stay Synced:** Always pull before you start.
   ```powershell
   git checkout main
   git pull origin main
   ```
2. **Isolate Work:** Create a descriptive branch.
   ```powershell
   git checkout -b feature/your-feature-name
   ```
3. **Commit Cleanly:** Use Claude to summarize your changes.
   ```powershell
   git add .
   git commit -m "feat: integrated atlas blindspot routing engine"
   git push origin feature/your-feature-name
   ```

---

## 🤫 5. Dev-Safe OpSec (@ghost)

We protect the developer as much as the operator.

### 🛡️ Secret Management
**NEVER** push API keys, SSIDs, or MAC addresses to GitHub. 
- Use **`targets.json`** or **`runtime_settings.json`** for local testing (these are in `.gitignore`).
- If you add a new sensitive file, add it to **`.geminiignore`** to prevent the AI from indexing it into its context window.

### 🛡️ Digital Stealth
When testing invasive tools (Deauth/Spoofing), always use the **Sovereign Dev App** build. It routes all telemetry to `%TEMP%` and keeps your dev environment clean of forensic logs.

---

**Next Step:** Run `./Invincible/build_windows.bat` to verify your environment is 100% functional.
