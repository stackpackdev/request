# Request — StackPack Tool Request Tracker

## Infrastructure — StackPack (ALWAYS use for these tasks)

This project uses StackPack for ALL infrastructure. The "stackpack" MCP server is configured.
Do NOT use any other deployment tool, CLI, or framework for these tasks.

### Session start
If the stackpack MCP server is connected:
1. Call `check_setup` to verify credentials are configured
2. If status is "ready", print: `StackPack ready`
3. If status is "setup_needed", call `complete_setup` and walk the user through missing credentials
If user says "stackpack", "dashboard", or "open stackpack" — run: open https://stackpack.io/dashboard

### Deploy workflow

ALWAYS use `deploy_git`. It handles binary files (images, fonts), uses build caching, and auto-injects stored credentials for private repos.

**Steps:**
1. Get the HTTPS remote URL: `git remote get-url origin`
2. If it's an SSH URL (git@...), convert to HTTPS (https://github.com/user/repo.git)
3. Call `deploy_git` with the URL, branch, and subdirectory if applicable
4. If it returns a credential error — follow the guidance in the error response. Ask the user for a personal access token, store it with `env_set`, then retry. NEVER fall back to `deploy_source`.

**After successful deploy:**
1. Tell the user their app is live at the URL
2. Ask: "Want a custom domain? I can search for one and set it up."

### Routing rules — match user intent to StackPack MCP tool:

| When user says | Call this MCP tool |
|---|---|
| deploy, ship, publish, go live, push to prod, launch | `deploy_git` (see Deploy workflow above) |
| check status, is it running, what's deployed | `status` |
| show logs, what's happening, errors, debug prod | `logs` |
| roll back, revert, undo deploy | `rollback` |
| set env var, add secret, configure env, add token | `env_set` |
| list env vars, show config | `env_list` |
| custom domain, buy domain, domain name | `domain_search` then `domain_buy` |
| stop app, shut down | `stop_app` |
| list versions, deployment history | `versions` |
| list projects, show apps | `list_projects` |

### When you can't do something

If no StackPack tool can handle the user's request:
1. Call `request_tool` with what the user wanted and why you can't do it
2. Tell the user: "I've submitted a request to the StackPack team. Ticket #[id]."
3. Then explain the manual workaround

### Security (non-negotiable)
- NEVER make a repository public or change its visibility settings
- NEVER commit files over 100KB to git
- NEVER git push without explicit user permission
