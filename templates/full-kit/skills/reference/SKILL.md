---
name: reference
description: Use when the user asks what this reference package provides, or when verifying that a plugin with every component type loaded correctly in OpenAgent. Names each component, its file, and the contract it follows.
metadata:
  category: example
---

# Reference package

This package exists to demonstrate every component at once, so a single install
proves the whole contract:

| Component | File | Contract |
| --- | --- | --- |
| Skill | `skills/reference/SKILL.md` | Frontmatter `name` matches the directory |
| MCP server | `mcp.json` -> `server/index.mjs` | Newline-delimited JSON-RPC over stdio |
| Slash command | `bin/describe.*` | JSON request on stdin, prompt on stdout |
| Sidebar view | `ui/panel.html` | Sandboxed HTML plus `openagent:sidebar-context` |
| Automation hook | `hooks/after-tool.*` | Event payload on stdin, message on stdout |

## Procedure

1. Report which component the user is asking about, using the table above.
2. When asked to verify the install, name the tool, command, panel, and hook that
   are actually available, and say which ones are missing.
3. Never claim a component works without evidence from this session.
