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
# Host bridge example

The full kit includes `lib/openagent-host.mjs` and `bin/host.mjs`. Use the
client's capability modules from package code when you need to create a child,
wake an Agent, inspect a branch, list roles, or emit progress. The Runtime has
no Graph/Goal/Groups implementation to register; those workflows belong in the
package.
# Persistent conversation UI

The `counter` component demonstrates scoped context and saving its own props.
From a plugin process with conversation and branch context, probe
`host.conversation.ui.capabilities()` and then call `host.conversation.ui.set`
with `id: "counter"`, `component: "plugin:openagent-plugin-template-full-kit:counter"`,
`version: 1`, `props: {count: 0}` and a text fallback. See
`../../docs/conversation-ui.md` for the complete contract.
