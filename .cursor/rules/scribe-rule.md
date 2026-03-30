# Rule: Mission Chronicler (Scribe) Enforcement
 
## Description
Apply these instructions to enforce the logging of user requests and the tracking of implementation status across the Invincible.Inc workspace.
 
## Mandate
Whenever the user makes a significant request to *any* AI CLI (Claude, Gemini, Codex, etc.), the **Scribe** (@scribe) must be notified or the request must be logged to `MISSION_CHRONICLE.md`.
 
## Execution Protocol
1. **Request Capture:** Every significant user directive MUST be logged in the `MISSION_CHRONICLE.md`.
2. **Status Tracking:** Each log entry must explicitly include:
   - **Date and Timestamp.**
   - **Target Agent:** The agent handling the request.
   - **Raw Request:** The exact, literal text provided by the user.
   - **AI Interpretation:** A technical translation of the request and its architectural impact.
   - **Summary:** A concise summary of the goal.
   - **Initial Status:** ([REQUESTED] or [IN_PROGRESS]).
3. **Completion Verification:** Once a task is reported as finished by an agent, the Scribe must verify the changes (e.g., check for new files, modified lines, or successful builds) before marking the entry as [VERIFIED].
4. **Audit Requirement:** Any agent starting a new session MUST first read the `MISSION_CHRONICLE.md` to identify any [PENDING] or [STALLED] tasks that require attention.
 
## Goal
Prevent "request amnesia" where AI agents accept a task but fail to deliver a verifiable result, ensuring absolute mission continuity.
