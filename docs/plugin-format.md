# Agent Plugin package format

This is the OpenAgent-side reference for the portable Agent Plugins 1.0.0
package format. It matches the rules the runtime loader enforces; when the two
disagree, the runtime wins and this document is the bug.

## Package layout

```text
my-plugin/
  plugin.json          required, the package manifest
  skills/              optional, immediate child directories with SKILL.md
  mcp.json             optional, root-level MCP server definitions
  ui/                  optional, HTML entries referenced by sidebar views
  hooks/               optional, executables referenced by automation hooks
  bin/                 optional, executables referenced by slash commands
```

Only `plugin.json`, `skills/`, and `mcp.json` are components. Everything else is
data those components reference by package-relative path. An installed package
is copied to `<OPENAGENT_HOME>/plugins/<plugin-name>/`; the original directory is
never used at runtime.

## Identity and containment

- `name` is required and must be 1-64 characters of lowercase ASCII letters,
  digits, `-`, or `.`, starting and ending with a letter or digit, with no `--`
  and no `..`. The name is also the manifest id in the plugin descriptor.
- Every referenced path must be package-relative, must not be absolute, must not
  contain `:`, and must not contain a `..` segment.
- Symlinks, junctions, and equivalent indirections are resolved before reading
  or executing. A reference that resolves outside the package root is rejected
  while the package loads, so containment is enforced at load time.

A manifest escape or a fatal manifest violation rejects the whole package. A bad
optional component disables only that component and records a diagnostic, so a
broken `mcp.json` does not cost you your Skills.

## Manifest fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `$schema` | string | yes | Must be exactly `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` |
| `name` | string | yes | See naming rules above |
| `version` | string | no | Free-form; used for update comparison |
| `description` | string | no | Shown in the installed plugin card |
| `author` | object | no | Only `name`, `email`, and `url`, all strings |
| `homepage` | string | no | |
| `repository` | string | no | HTTPS GitHub URL; enables release update checks |
| `license` | string | no | |
| `keywords` | string[] | no | Strings only |
| `extensions` | object | no | Host-specific extensions; `extensions.openagent` is OpenAgent's |

Unknown top-level fields are ignored with a warning rather than rejected, so a
package can carry fields meant for another host. The loader never downloads a
schema while loading a package; it selects its bundled 1.0.0 rules from the
`$schema` value.

## Skills

Skills are discovered only from immediate child directories of `skills/` that
contain a `SKILL.md`. Nested directories are not searched. A Skill that violates
a rule is skipped with a diagnostic naming the rule while its siblings still
load.

| Rule | Value |
| --- | --- |
| `name` format | 1-64 characters, lowercase letters, digits, or single hyphens |
| `name` value | Must match its directory name |
| `description` | 1-1024 characters |
| `compatibility` | Optional, 1-500 characters |

`SKILL.md` must begin with YAML frontmatter delimited by `---`. `name` and
`description` are required; `license`, `compatibility`, `metadata` (a flat map of
strings), and `allowed-tools` are also recognized. Valid plugin Skills join the
same catalog as global and workspace Skills, so the model can select them
whenever the plugin is enabled.

```markdown
---
name: release-notes
description: Draft release notes from a set of merged changes.
metadata:
  category: writing
---

# Release notes

Group merged changes by user-visible impact, not by file.
```

## MCP servers

`mcp.json` is read only from the package root and must contain exactly `$schema`
and `mcpServers`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "tools": {
      "type": "stdio",
      "command": "node",
      "args": ["${PLUGIN_ROOT}/server/index.mjs"],
      "env": { "CACHE_DIR": "${PLUGIN_DATA}/cache" },
      "cwd": "${PLUGIN_DATA}"
    }
  }
}
```

- `stdio` accepts `type`, `command`, `args`, `env`, and `cwd`. `command` is
  either a bare executable token resolved from `PATH` or a `./`-prefixed path
  inside the package. `env` may not override `PLUGIN_ROOT` or `PLUGIN_DATA`.
- `streamable-http` accepts `type`, `url`, and `headers`. The URL must be HTTPS,
  except for literal loopback endpoints. Headers are not forwarded across an
  origin change.
- `sse` is the legacy HTTP+SSE transport and is reported and skipped.
- `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` are expanded in `args`, `env` values, and
  `cwd`. `PLUGIN_ROOT` is the installed package root; `PLUGIN_DATA` is a
  writable persistent directory that survives uninstall and reinstall.

An invalid server entry is skipped without disabling its siblings.

## OpenAgent extensions

OpenAgent extensions live under `extensions.openagent` so the package stays
portable. All five keys below are optional.

### `capabilities`

A free-form string array used for display and admission. List the components you
actually ship, for example
`["skills", "mcp", "commands", "sidebar", "automation"]`.

### `commands`

Portable slash commands, addressed as `/<plugin-name>:<command-id>`.

| Field | Required | Rules |
| --- | --- | --- |
| `id` | yes | Same naming rules as the plugin name |
| `label` | yes | Non-empty display label |
| `description` | yes | Non-empty display description |
| `argument` | yes | `none` or `required_text` |
| `command` | yes | Package-relative executable path |
| `timeout_secs` | no | 1-300, default 30 |

On invocation OpenAgent writes a JSON request to stdin containing
`conversation_id`, `plugin_id`, `command`, `argument`, and the original `input`.
Stdout must be a non-empty prompt. The executable runs through the normal
process boundary with the package root as its working directory.

### `message_policies`

Declares which lifecycle messages the plugin may emit and who may see them.

```json
{ "tag": "notice", "user_visible": true, "model_visible": false }
```

The tag follows the plugin name rules but also allows `_`. At least one audience
must be true. OpenAgent namespaces the tag to `plugin:<plugin-id>:<tag>`. An
automation command that prints `{"message": "...", "tag": "notice"}` gets that
policy applied; an undeclared tag is rejected and the message is dropped. Plain
text output keeps the default model-context behavior and is not persisted as a
plugin message.

### `daemon`

Plugins that own a long-lived capability process may declare one daemon entry:

```json
{
  "daemon": {
    "command": "bin/daemon.mjs",
    "args": ["--stdio"],
    "transport": "stdio",
    "capabilities": ["desktop-control"]
  }
}
```

`command` is a package-relative executable, `args` and `capabilities` are
string arrays, and `transport` is `stdio` or `socket` (default `stdio`). The
Runtime validates the declaration and package containment, then exposes the
normalized descriptor to the host. The host owns supervision, permissions,
endpoint selection, and shutdown. A daemon can expose an MCP client through
the normal `mcp.json` entry.

### `sidebar`

| Field | Required | Rules |
| --- | --- | --- |
| `id` | yes | Same naming rules as the plugin name |
| `title` | yes | Non-empty |
| `entry` | yes | Package-relative HTML path |
| `scope` | no | `global` (default), `workspace`, or `conversation` |
| `icon` | no | Non-empty when present |
| `capabilities` | no | Subset of `workspace`, `conversation`, `branch`, `files`, `locale`, `theme` |

Entries run as UTF-8 HTML in a sandboxed iframe. The host posts a versioned
`openagent:sidebar-context` message containing only the fields you declared in
`capabilities`. File access is metadata-only: names and change kinds, never file
contents or diffs, and never transcript text or another plugin's state.

### `automation`

| Field | Required | Rules |
| --- | --- | --- |
| `id` | yes | Same naming rules as the plugin name |
| `event` | yes | One of the lifecycle events below |
| `matcher` | no | Regular expression matched against the tool name |
| `command` | yes | Package-relative executable path |
| `timeout_secs` | no | 1-300, default 30 |

Lifecycle events: `session_start`, `session_end`, `user_prompt_submit`,
`subagent_start`, `subagent_stop`, `permission_request`, `pre_compact`,
`post_compact`, `stop`, `interrupt`, `before_model`, `after_model`,
`before_tool`, `after_tool`.

The hook receives the event payload on stdin. A non-zero exit, timeout, or
process error is isolated to that hook and reported in plugin diagnostics; it
cannot stop ordinary runtime finalization. Hooks never receive model context or
Inspector and trace data.

## Lifecycle and data

- Disabling a plugin keeps it installed for rollback and update checks, but its
  Skills, MCP servers, automation hooks, and sidebar surfaces are not mounted
  into a new runtime assembly. Re-enabling restores them without touching data.
- Installed packages live at `<OPENAGENT_HOME>/plugins/<plugin-name>/`.
- Writable state lives at `<OPENAGENT_HOME>/plugin-data/<plugin-name>/` and is
  preserved across uninstall and reinstall.
- Package containment prevents path escapes from the package. It is not a
  subprocess sandbox: plugin processes remain subject to the normal OpenAgent
  process and permission environment.
