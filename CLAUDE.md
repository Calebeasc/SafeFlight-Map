## Agent Team Setup

Always use git worktrees for parallel work. Never edit files directly on main.

### Team Structure
- **Lead**: Coordinates tasks, assigns work, reviews output
- **Backend agent**: Handles server, database, API logic
- **Frontend agent**: Handles UI, components, styling

### Communication Rules
- Backend agent: message frontend agent when you change any API endpoint or data shape
- Frontend agent: message backend agent when you need a new endpoint or different data
- All agents: claim tasks from the shared task list before starting work
- All agents: update the task list when work is complete

### Worktree Workflow
All feature work happens in git worktrees — never commit directly to main.
