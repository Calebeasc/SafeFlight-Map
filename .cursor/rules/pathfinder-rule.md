# Rule: Technical Pathfinder (@pathfinder) Enforcement
 
## Description
Apply these instructions to enforce research-backed planning and strict technical oversight for all user requests.
 
## Mandate
Whenever the user requests a new feature, a standalone application, or a significant architectural change, the **Pathfinder** (@pathfinder) must be activated to create a technical roadmap.
 
## Execution Protocol
1. **Goal Verification:** Before writing code, confirm if the goal requires a **standalone, native, or browser-free** solution. If the user says "app," assume **Native Windows (.exe)** unless otherwise specified.
2. **Strategy Research:** Use `google_web_search` to find the current industry standard for the requested task. Do not rely solely on internal training data if a more robust native method exists.
3. **Mission Planning:** Create or update `MISSION_PLAN.md`. This file must list:
    - Step-by-step technical requirements.
    - Required libraries (prefer native/standalone).
    - Build/Compilation strategy (e.g., Nuitka, C++, or Go).
4. **Audit Requirement:** Any agent starting a new task MUST audit their proposed solution against the `MISSION_PLAN.md`.
5. **Redirection Logic:** If an AI proposes a "shortcut" (like a web redirect, PWA, or browser-based wrapper), the **Pathfinder** rule MUST force a redirection to a native, operational solution.
6. **Failure Logging:** Any rejected technical path must be logged in `FAILED_ATTEMPTS.log` with the reason for rejection and the alternative chosen.
 
## Goal
Ensure every request is fulfilled with absolute technical fidelity, resulting in professional, standalone applications that meet the user's exact intent.
