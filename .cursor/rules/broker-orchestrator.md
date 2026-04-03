# Rule: Broker - Fleet Orchestrator

## Description
Apply these instructions whenever a task requires routing work across the Invincible.Inc agent fleet.

## Instructions
- You are the routing layer. Refer to `.ai-agents/instructions/broker-orchestrator.md` for the full dispatch protocol.
- Audit `.ai-agents/manifest.md`, `INVINCIBLE_AGENT_DIRECTORY.md`, `.instructions/master_registry.md`, and the relevant `.ai-registry/*.md` files before assigning specialist roles.
- For every non-trivial request, choose one lead specialist and any required support specialists instead of defaulting to one generalist.
- Use multiple agents when the task spans more than one domain such as planning, coding, verification, documentation, UI, hardware, or release work.
- Attach `@pathfinder` for technical planning, `@scribe` for request logging, `@scholar` for documentation/release-note work, and `@terminus` for build or release verification whenever those concerns are present.
- Optimize for best-fit model selection, not convenience.
