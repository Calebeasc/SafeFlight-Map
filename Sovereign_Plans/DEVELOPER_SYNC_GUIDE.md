# Invincible.Inc — Developer Sync & Setup Guide

This guide provides the 5-minute path to syncing with the repository and running the intelligence lattice locally.

---

## 🛠 Step 1: Installation (@doc)

Run these commands in a **PowerShell (Admin)** terminal to install the mandatory toolchain:

```powershell
# 1. Install Git, Python 3.12, and Node.js 20 LTS
winget install Git.Git Python.Python.3.12 OpenJS.NodeJS.LTS

# 2. Install the Claude Code AI CLI
npm install -g @anthropic-ai/claude-code

# 3. Verify tool versions
git --version; python --version; node --version; claude --version
```

### 🚨 Fatal Error Fix: `python312.dll`
If your build or execution fails with a "Missing DLL" error:
1. **System PATH:** Ensure `C:\Users\<User>\AppData\Local\Programs\Python\Python312` is in your environment PATH.
2. **Environment Init:** You **MUST** initialize and activate the virtual environment from the root:
   ```powershell
   cd Invincible/backend
   python -m venv .venv
   .\.venv\Scripts\activate
   ```

---

## 🔄 Step 2: Seamless Sync (@architect)

Follow this sequence to ensure your workspace is synchronized and isolated from conflicts:

```powershell
# 1. Clone the Shared Repository
git clone https://github.com/Calebeasc/Invincible.git
cd Invincible

# 2. Sync with Main
git checkout main
git pull origin main

# 3. Isolated Development
git checkout -b feature/your-feature-name

# 4. Launch Agent Orchestrator
claude
```

---

## 🚀 Step 3: Run Commands (@doc)

Test your changes locally using these dedicated run-loops:

### Backend (FastAPI Engine)
```powershell
cd Invincible/backend
pip install -r requirements.txt
python src/app/main.py
```

### Frontend (React/Vite UI)
```powershell
cd Invincible/frontend
npm install
npm run dev
```
*UI is served at `http://localhost:5173`. API calls proxy to `:8000` automatically.*

---

## 📂 Step 4: Codebase Map (@architect)

Navigate the lattice using this structure:

- **`/Invincible/backend/`**: Python logic, signal ingestion, and ALPR scraping.
- **`/Invincible/frontend/`**: React source, visual skins, and Leaflet map components.
- **`/Invincible/desktop/`**: The native Windows launcher (`launcher.py`) for WebView2.
- **`/.claude/agents/`**: Character-based agent instructions (@tron, @ghost, @anderton).

---

## 🤖 Step 5: Agent-Assisted Coding

We use specialized agents to brainstorm and write high-integrity code. Within the `claude` prompt, reference them directly:
- **Architecture:** `@.claude/agents/anderton.md design a new data schema for SDR logs.`
- **Kinetic Logic:** `@.claude/agents/tron.md optimize the interdiction overlay.`
- **UI Safety:** `@Invincible/frontend/src/components/GhostGuardian.jsx wrap this tool in a risk gate.`

**Status:** Setup Complete. Start shipping.
