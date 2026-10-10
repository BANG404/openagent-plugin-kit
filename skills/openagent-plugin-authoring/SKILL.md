---
name: openagent-plugin-authoring
description: Use when creating or changing an OpenAgent Agent Plugin package, including plugin.json fields, package containment, bundled Agent Skills, mcp.json stdio or streamable-http servers, slash commands, sidebar views, automation hooks, message policies, and PLUGIN_DATA state. Covers the Agent Plugins 1.0.0 rules the OpenAgent loader enforces and the diagnostics it reports when a component is skipped.
metadata:
  category: integrations
---

# Authoring an OpenAgent plugin

An OpenAgent plugin is an Agent Plugins 1.0.0 package: a directory whose root
contains `plugin.json`. The loader reads exactly three components - the manifest,
immediate children of `skills/`, and a root `mcp.json`. Everything else in the
package is data those components reference by package-relative path.

Read `docs/plugin-format.md` for the field-by-field reference before changing a
manifest. Prefer `templates/` over writing a manifest from scratch.

For inline checkpoint-backed components, read `docs/conversation-ui.md` and
declare contained `ui_components`; use `host.conversation.ui.set` from processes
and the scoped state message from frames. Never inject executable HTML as chat text.

Apply [version ownership](../../docs/publishing.md#version-ownership) during every
package change, including Skills and templates. Update the source version and
verified protocol declaration before collecting acceptance evidence. Use
[Host Bridge embedding](../../docs/host-bridge.md#local-embedding) for optional
local vector inference; detect support and readiness before using it.

OpenAgent's product-owned standard packages are published at:

- https://github.com/BANG404/openagent-chat-groups
- https://github.com/BANG404/openagent-goal
- https://github.com/BANG404/openagent-graph
- https://github.com/BANG404/openagent-cua-driver

Use this repository's templates and validator as the source of truth for
portable package structure. Contract changes must be mirrored in the OpenAgent
Runtime and its owner Skills before a package release is published.

For package orchestration, use the dependency-free client in
`lib/openagent-host.mjs` (see `docs/host-bridge.md`). It is the common
conversation, branch, Agent submit/wake, roles, and event interface; keep all
domain state and scheduling in the package.

## Manifest skeleton

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "One line shown in the installed plugin card.",
  "license": "MIT",
  "repository": "https://github.com/you/my-plugin",
  "extensions": {
    "openagent": {
      "capabilities": ["skills", "mcp"],
      "i18n": {
        "supported_locales": ["en"], "default_locale": "en",
        "translations": {"en": {"display_name": "My Plugin", "description": "One line shown in the installed plugin card."}}
      }
    }
  }
}
```

`$schema` and `name` are the only required fields. Keep host-specific behavior
under `extensions.openagent` so the package stays portable; unknown top-level
fields are ignored with a warning.

## Rules that reject or downgrade a package

- A manifest escape, a missing `$schema`, an unsupported `$schema`, an invalid
  `name`, or a non-object `author` rejects the whole package.
- A bad `skills/`, `mcp.json`, command, sidebar, or automation entry disables
  only that component and records a diagnostic. Fix diagnostics instead of
  assuming the component loaded.
- `name` is 1-64 lowercase ASCII letters, digits, `-`, or `.`, starting and
  ending with a letter or digit, with no `--` and no `..`.
- Every referenced path is package-relative, contains no `:`, no absolute path,
  and no `..` segment. Symlinks and junctions are resolved, so a link that
  leaves the package root is rejected while loading.

## Skills

Skills live at `skills/<name>/SKILL.md` and are discovered only one level deep.
The frontmatter `name` must equal the directory name and use 1-64 lowercase
letters, digits, or single hyphens; `description` is 1-1024 characters; an
optional `compatibility` is 1-500 characters. A Skill that breaks a rule is
skipped alone while its siblings load.

Write the description as routing metadata: say when the skill applies, not what
it contains. Keep the body procedural and free of duplicated reference tables.

## MCP servers

Declare stdio servers with a bare executable from `PATH`, or a `./`-prefixed
path inside the package. Use `${PLUGIN_ROOT}` in `args` and `cwd` to locate
package files, and `${PLUGIN_DATA}` for anything writable:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "tools": {
      "type": "stdio",
      "command": "node",
      "args": ["${PLUGIN_ROOT}/server/index.mjs"],
      "env": { "CACHE_DIR": "${PLUGIN_DATA}/cache" }
    }
  }
}
```

Never override `PLUGIN_ROOT` or `PLUGIN_DATA` in `env`. `streamable-http`
requires HTTPS except for literal loopback endpoints; `sse` is reported and
skipped.

Set manifest `extensions.openagent.mcp_tool_mode` to `direct` for immediate
mounting or `relay` for `load_tool` discovery and mounting. It defaults to
`direct`; `mcp_tool_modes` overrides individual names from `mcp.json`.
Keep the portable MCP transport file unchanged. Translate the readable plugin
name with i18n `display_name`, keeping the root `name` as its stable ID.
Read `docs/mcp-lifecycle.md` for periodic Direct/Relay leases, renewal and
revocation from commands, scripts, hooks or daemons through the Host Bridge.

## Commands, sidebar, and automation

- Commands are exposed as `/<plugin-name>:<command-id>`. The executable receives
  a JSON request on stdin with `conversation_id`, `branch_id`, `plugin_id`,
  `command`, `argument`, and `input`, and must print a non-empty prompt on
  stdout.
- Sidebar views run as sandboxed HTML and receive only the context fields listed
  in their `capabilities`. Never expect transcript text, model output, file
  contents, or another plugin's state.
- Automation hooks receive the event payload on stdin. To display a message, set
  a `message_policies` entry and print `{"message": "...", "tag": "<tag>"}`;
  an undeclared tag is dropped. Plain text output is model context only.
- A long-lived capability process can be declared with
  `extensions.openagent.daemon`. Use a package-relative `command`, string
  `args`, a `capabilities` array, and `stdio` or `socket` transport. `args` and
  `capabilities` are required even when empty: the loader rejects a declaration
  that omits either one. The host validates containment and owns supervision;
  pair the daemon with a normal MCP client when the capability is model-facing.
- A package never declares a Runtime implementation binding. Every package uses
  the same generic host bridge and process boundary, and owns its domain state,
  reducers, and orchestration.
- Declare `timeout_secs` between 1 and 300. A hook or command failure is isolated
  and reported; it never stops runtime finalization.

## State and portability

Write state only under `PLUGIN_DATA`, which survives uninstall and reinstall.
Every process you declare runs under the policy the Runtime resolves from the
user's session profile, inherited and never widened, with the plugin's own
`PLUGIN_DATA` as the one added write grant. Declaring `desktop-control`,
`host-access`, or `computer-use` requests access to the real computer
environment but never grants it; the user must explicitly authorize the plugin
in OpenAgent settings. Keep credentials in user configuration rather than in the package,
and expect the host's own credential variables to be stripped from your child
environment. Prefer a `.mjs` or `.js` entry point: OpenAgent runs a declared
path ending in either extension under the session's `node`, so one file works on
every platform, while any other path is executed as the program itself and needs
a shim per platform.

## Verify before installing

```bash
bun scripts/validate-plugin.mjs <package-dir> --require-i18n
```

The validator mirrors the loader rules and fails on warnings, because a warning
means a component silently did not load. It is deliberately stricter in one
direction: a declaration the loader would silently substitute — a wrong-typed
`timeout_secs` or `matcher`, a key OpenAgent does not read inside its own
extension, a stray automation field — is reported instead of accepted, because
such a package does not do what it reads as. `fixtures/conformance/` in the kit
pins each of those rules with one package per case. After the validator passes,
install the directory through Settings -> Plugins -> Install and exercise every
component.

Declare only fully translated UI languages. Complete metadata, commands, sidebar
titles, and notices using the flat keys in `docs/plugin-format.md`. Follow the
application locale on first mount and live changes using versioned sidebar/MCP
App context or `await host.locale.get()` before producing a process notice.
Preserve input, IDs, user content, and state. Official qualification passes all
keys from the tested platform's `src/lib/platformLocales.json` as `--locales`;
third-party subsets must display the host's fallback explanation.

For configuration parameters, secret fields and package-owned OAuth setup, read [configuration](../../docs/configuration.md) before authoring or qualifying a package.
