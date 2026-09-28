# full-kit template

Every component type in one package, intended as the reference for how the
pieces fit together.

```text
plugin.json
skills/reference/SKILL.md
mcp.json
server/index.mjs
bin/describe.{cmd,sh,mjs}
ui/panel.html
hooks/after-tool.{cmd,sh}
```

Install this package to prove the whole contract in one step: the Skill should
appear in the catalog, the `clock` MCP server should advertise `current_time`,
`/<plugin-id>:describe` should become a slash command, the reference panel
should mount in the right sidebar, and the hook should emit a notice after a
tool call.

Each component here is a trimmed copy of the dedicated template. When you only
need one capability, scaffold from that template instead and delete nothing.
