# [SUPERSEDED BY: FUTURE_PLAN_MAP.md & INVINCIBLE_AGENT_DIRECTORY.md]
 
# Repository Guidelines (LEGACY)
 
This document is preserved for historical data retention. For current project structure, strategic indexes, and agent mandates, refer to the **FUTURE_PLAN_MAP.md** and **INVINCIBLE_AGENT_DIRECTORY.md**.
 
---

Primary application code lives in `Invincible/`.
- `Invincible/frontend/`: React + Vite UI, with components under `src/components/`, shared state in `src/context/`, and browser assets in `public/`.
- `Invincible/backend/`: FastAPI backend, with API routes in `src/app/api/`, ingestion logic in `src/app/ingest/`, core services in `src/app/core/`, and processing/database helpers nearby.
- `Invincible/desktop/`: Windows launcher code (`launcher.py`) for the packaged desktop app.
- `Invincible/installer/` and `Invincible/build_windows.bat`: Windows packaging and Inno Setup assets.

Top-level docs such as `README.md`, `CONTRIBUTING.md`, and onboarding guides describe workflow expectations. Treat root-level prototype files like `App.jsx` as legacy unless your task explicitly targets them.

## Build, Test, and Development Commands
- `cd Invincible/frontend && npm install && npm run dev`: start the Vite UI locally on port `5173`.
- `cd Invincible/frontend && npm run build`: produce the production frontend bundle; this is the main frontend sanity check.
- `cd Invincible/backend && pip install -r requirements.txt && python src/app/main.py`: run the FastAPI backend locally.
- `.\Invincible\build_windows.bat`: build the Windows desktop package and installer flow.
- `.\Invincible\scripts\dev.ps1`: launch the local development loop described in the project README.

## Coding Style & Naming Conventions
Use 2 spaces in React/JSX files and 4 spaces in Python. Keep React components in `PascalCase` (`GhostGuardian.jsx`), utility modules in `camelCase` or descriptive names (`gpsAccuracy.js`), and Python modules/functions in `snake_case`. Follow existing FastAPI router patterns when adding endpoints. No formatter or linter is enforced in-repo, so match surrounding style and keep diffs tight.

## Testing Guidelines
There is no committed automated test suite yet. Until one exists, validate changes by:
- running `npm run build` for frontend changes;
- starting `python src/app/main.py` for backend/API changes;
- exercising the affected workflow manually in the UI or packaged app.

Name any future tests after the feature being verified, and keep them adjacent to the code they cover when practical.

## Commit & Pull Request Guidelines
Recent history uses concise Conventional Commit-style subjects, for example `feat: ...`, `fix: ...`, and occasional `feat(scope): ...`. Keep commits focused and imperative. PRs should include a short description, risk notes, manual verification steps, and screenshots for visible UI changes. Branch from `dev` for feature work and avoid mixing unrelated fixes in one PR.

## Security & Configuration Tips
Do not commit secrets, device identifiers, or local runtime files such as `targets.json`. Keep machine-specific configuration out of git, and update ignore rules when introducing new sensitive artifacts.
