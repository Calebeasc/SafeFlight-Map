# Invincible.Inc Agent Registry
 
This repository contains a shared fleet of AI agents configured for SIGINT, OSINT, and Privacy operations.
 
## 🤖 Active Workforce
 
| Agent | Role | Model | Instructions |
| :--- | :--- | :--- | :--- |
| **Claude (Lead Orchestrator)** | Project Governor & Strategy | Claude 3.5 Sonnet | [CLAUDE.md](../CLAUDE.md) |
| **Gemini (SIGINT)** | Spatial Intelligence & Geo-Orchestration | Gemini 1.5 Pro | [GEMINI.md](../GEMINI.md) |
| **Codex: OSINT Hunter** | Biological Identity Linker | GPT-4o-mini | [.ai-agents/instructions/gpt-osint-hunter.md](instructions/gpt-osint-hunter.md) |
| **Codex: Historian** | Mission Timeline Synthesizer | GPT-4o-mini | [.ai-agents/instructions/gpt-historian.md](instructions/gpt-historian.md) |
| **OpenCode: Privacy Guardian** | Local PII Protection (Ollama) | Llama 3.2 | [.ai-agents/instructions/llama-privacy-guardian.md](instructions/llama-privacy-guardian.md) |
| **OpenCode: Protocol Decoder** | SDR Digital Rosetta Stone (Ollama) | Qwen 2.5 Coder | [.ai-agents/instructions/qwen-protocol-decoder.md](instructions/qwen-protocol-decoder.md) |
| **Scribe: Mission Chronicler** | Request Logging & Implementation Tracking | GPT-4o-mini | [.ai-agents/instructions/scribe-chronicler.md](instructions/scribe-chronicler.md) |
| **Pathfinder: Technical Strategist** | Research-Backed Planning & Process Auditing | GPT-4o-mini | [.ai-agents/instructions/pathfinder-strategist.md](instructions/pathfinder-strategist.md) |
| **Argus-Eye: Visual Geolocation** | Image-Based OSINT & VPR Triangulation | GPT-4o-mini | [.ai-agents/instructions/argus-eye-geolocation.md](instructions/argus-eye-geolocation.md) |
| **Broker: Fleet Orchestrator** | Best-Fit Routing & Multi-Agent Dispatch | GPT-4o-mini | [.ai-agents/instructions/broker-orchestrator.md](instructions/broker-orchestrator.md) |
| **Unfiltered: SAM** | Unrestricted Q&A & Raw Logic | GPT-4o-mini | [.ai-agents/instructions/unfiltered-sam.md](instructions/unfiltered-sam.md) |
| **Scholar: Documentarian** | Technical Documentation & Research Lead | GPT-4o-mini | [.ai-agents/instructions/scholar-documentarian.md](instructions/scholar-documentarian.md) |
| **Leviathan: Sovereign Oversight** | Mass Surveillance & Link Analysis Lead | GPT-4o-mini | [.ai-agents/instructions/leviathan-surveillance.md](instructions/leviathan-surveillance.md) |
| **Ouroboros: Blockchain Forensics** | Crypto-Asset Attribution & Link Analysis | GPT-4o-mini | [.ai-agents/instructions/ouroboros-blockchain.md](instructions/ouroboros-blockchain.md) |
| **Spectral: Signal Intelligence** | RF Classification & Emitter Fingerprinting | GPT-4o-mini | [.ai-agents/instructions/spectral-sigint.md](instructions/spectral-sigint.md) |
| **Censys: Attack Surface** | EASM & Asset Discovery Lead | GPT-4o-mini | [.ai-agents/instructions/censys-easm.md](instructions/censys-easm.md) |
| **Mandiant: Malware Analysis** | Malware Sandboxing & Reverse Engineering | GPT-4o-mini | [.ai-agents/instructions/mandiant-malware.md](instructions/mandiant-malware.md) |
| **TLO: Background Triage** | Public Record Aggregation & Triage Lead | GPT-4o-mini | [.ai-agents/instructions/tlo-background.md](instructions/tlo-background.md) |
 
## 🛠 Developer Setup
 
To use these agents, ensure your AI tool points to the appropriate configuration file:
 
- **Claude:** Automatically uses `CLAUDE.md`.
- **Gemini CLI:** Automatically uses `GEMINI.md`.
- **Cursor:** Automatically uses files in `.cursor/rules/`.
- **GitHub Copilot:** Automatically uses `.github/copilot-instructions.md`.
- **Local LLMs (Ollama):** Use the OpenCode profiles in `.opencode/agents/`.
