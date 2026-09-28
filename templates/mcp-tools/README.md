# mcp-tools template

A stdio MCP server shipped inside the package:

```text
plugin.json
mcp.json
server/index.mjs
skills/notes/SKILL.md
```

`mcp.json` starts the server with the bare `node` command and points it at
`${PLUGIN_ROOT}/server/index.mjs`. The server keeps its state in
`${PLUGIN_DATA}/notes.json`, which OpenAgent creates and preserves across
uninstall and reinstall.

## Pointers

- `command` is either a bare executable resolved from `PATH` or a `./`-prefixed
  path inside the package. Never use an absolute path or `..`.
- `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` are expanded in `args`, `env` values,
  and `cwd`. `env` may not redefine either variable.
- `streamable-http` is available for remote servers and requires HTTPS except on
  loopback endpoints. The legacy `sse` transport is skipped.
- Skill text is what makes a tool discoverable and usable; describe each tool
  and when to call it.
