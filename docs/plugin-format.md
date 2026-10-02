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
| `version` | string | no | Free-form; used for update comparison, see below |
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

### Version comparison

`version` is free-form, and a value the runtime cannot parse is never grounds
for rejecting a package. It is compared in two ways:

- When both the installed and the published version parse as SemVer (after an
  optional leading `v`), precedence follows the specification: a release
  outranks its own prerelease, prerelease identifiers compare numerically and
  then by ASCII, and build metadata is ignored. `1.0.0-beta.1` is therefore
  older than `1.0.0`, and `1.0.0+build.5` equals `1.0.0`.
- Otherwise the comparison falls back to comparing numeric components
  left-to-right, padded with zeros. `2.1` is newer than `1.9.3`, and `10` is
  newer than `9`.

Publish increments that SemVer understands. A scheme like `2026.09` still
compares, but it is compared as a number, so a release you intend to supersede
must not depend on punctuation to sort above a lower one.

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
- `streamable-http` accepts `type`, `url`, `headers`, and the optional OAuth
  discovery hints `oauth_resource`, `oauth_authorization_server`,
  `oauth_client_id`, and `oauth_scope` (all strings). The URL must be HTTPS,
  except for a loopback endpoint, which includes `localhost` and any `127.x`
  address; it must not carry user info or a fragment. A header name must be a
  valid HTTP field name, a value must not contain a control character, and two
  names that differ only by case are the same header. Headers are not forwarded
  across an origin change.
- `http` is accepted as an alias for `streamable-http`.
- `sse` is the legacy HTTP+SSE transport and is reported and skipped.
- `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` are expanded in `args`, `env` values, and
  `cwd`. `PLUGIN_ROOT` is the installed package root; `PLUGIN_DATA` is a
  writable persistent directory that survives uninstall and reinstall.

An invalid server entry is skipped without disabling its siblings.

## OpenAgent extensions

OpenAgent extensions live under `extensions.openagent` so the package stays
portable. All seven keys below are optional. A key OpenAgent does not define in
this namespace is a typo rather than another host's field, and the loader
ignores it without a word, so check the spelling of anything you declare here.

### `capabilities`

A free-form string array used for display and admission. List the components you
actually ship, for example
`["skills", "mcp", "commands", "sidebar", "automation"]`. `network` is the one
token the Runtime reads: declaring it while the session profile restricts
network access adds a diagnostic naming your plugin instead of failing at the
first socket.

Packages do not declare a Runtime implementation binding. Every package's
components are loaded through the same ordinary plugin path and use the generic
Host Bridge for Runtime services.

### `commands`

Portable slash commands, addressed as `/<plugin-name>:<command-id>`.

| Field | Required | Rules |
| --- | --- | --- |
| `id` | yes | Same naming rules as the plugin name |
| `label` | yes | Non-empty display label |
| `description` | yes | Non-empty display description |
| `argument` | no | `none` (default) or `required_text` |
| `command` | yes | Package-relative executable path |
| `timeout_secs` | no | 1-300, default 30 |

On invocation OpenAgent writes a JSON request to stdin containing
`conversation_id`, the selected `branch_id` (or `null` for a root turn),
`plugin_id`, `command`, `argument`, and the original `input`.
Stdout must be a non-empty prompt.

The executable runs through the normal process boundary, and its working
directory is the **active workspace**, not the package root: a command that
writes relative paths writes them into the user's project. Because of that, a
command with no active workspace reports the missing workspace instead of
running. Reference anything inside your package by an absolute path derived
from `PLUGIN_ROOT` rather than by a relative one.

A declared path carries no interpreter field, so OpenAgent applies one
extension rule to every entry point it runs — a command, an automation hook,
and a daemon command alike. A path ending in `.mjs` or `.js`
runs under the session's `node`; anything else is run as the program itself.
One JavaScript entry point therefore works on every platform, while a native or
shell entry points at one and needs a shim per platform.

The manifest names one executable and no arguments, and OpenAgent invokes it by
its absolute installed path. `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` are expanded
in `mcp.json` entries, not in a command's environment or command line, so a
script that needs files beside itself derives that directory from its own
location.

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

Declare a policy for the tags your own automation prints, and nothing else. The
Runtime applies only the package's own manifest policy to messages that package
emits.

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
normalized descriptor to the host together with the process policy it resolved
for the current session. A daemon can expose an MCP client through the normal
`mcp.json` entry.

Declaring a daemon is not starting one. The desktop host supervises the
daemons it owns by product policy and does not launch an arbitrary
third-party daemon today: your declaration is validated and reported, so treat
a daemon as a capability you are announcing rather than one already running.

Confinement applies the way it does to your MCP servers and commands. An
ordinary daemon runs under the session's resolved policy, and a host that
starts one consumes that decision instead of deciding for itself whether to
confine the process. A package may declare `desktop-control`, `host-access`, or
`computer-use` when it needs the real computer environment. Those capabilities
are requests only: the user must explicitly grant real computer access to that
plugin in OpenAgent settings. Without the grant, the daemon remains confined or
fails closed. There is no plugin identity or daemon field that bypasses this
authorization.

The host owns the daemon's lifetime, not the package. It selects the endpoint,
decides whether to start a daemon or adopt one already listening there, and
stops the daemon it started. Take the endpoint from the host, do not assume you
are the machine's only instance, and expect to be terminated rather than shut
down politely.

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

## Plugin process confinement

Package containment keeps a package inside its own directory. It is not the
subprocess sandbox, which is a separate boundary your package does not
configure and cannot widen.

Every process your plugin starts — its stdio MCP servers, its portable
commands, and its daemon — carries a policy the Runtime resolves at load time
from the user's current session permission profile. The profile is inherited,
never widened: host-root read, the active workspace's write access, and the
session's network tier are exactly what the user already granted to ordinary
agent commands, and the only addition is a write grant on that plugin's own
`PLUGIN_DATA`. There is no per-plugin permission setting and no permission
field that grants access, so a package cannot grant itself anything by declaring
a capability. The host may persist a per-plugin real-computer-access
authorization separately from the portable manifest.

Four consequences shape how you write a plugin:

- Your package directory is read-only to your own processes; write to
  `PLUGIN_DATA`. With no active workspace the anchor is the immutable package
  root and the workspace write is downgraded to read.
- `PLUGIN_DATA` is writable and the child's `TMPDIR`, `TEMP`, and `TMP` point
  inside it, so your scratch space is part of your confinement rather than an
  extra grant.
- The host's credentials are removed from the child environment: names ending
  in `_API_KEY`, `_ACCESS_KEY`, `_API_TOKEN`, `_ACCESS_TOKEN`, or
  `_SECRET_KEY`, the `AWS_*` credential names, `GITHUB_TOKEN` and `GH_TOKEN`,
  and the `ANTHROPIC_`, `OPENAI_`, and `OPENAGENT_` namespaces. Values you
  declare yourself in `mcp.json` still apply. This bounds inherited secrets
  only — an inherited host-root read keeps a credential file on disk readable.
- Your environment is the resolved policy, not the host's. Do not rely on
  inheriting a credential or a proxy setting; read what the user configured, or
  declare the value you need.

`capabilities` is a signal, not an authorization. It never widens the resolved
policy, so a server that declares `network` still runs under the session's
network tier. The `network` token is the one the Runtime reads: declaring it
while the profile restricts network access adds one diagnostic naming your
plugin when the process starts, instead of failing at the first socket.
Declaring it changes nothing about the policy. Because the session profile owns
the network tier, that profile is the only way a process of yours gets network
access — install any runtime dependency a server would otherwise download at
spawn time instead of expecting the spawn to be allowed to fetch it.

A profile the backend cannot enforce fails closed with a diagnostic naming the
reason rather than starting an unconfined process, so your MCP tools are simply
absent until the profile is enforceable again. On Linux that includes WSL1,
which cannot create the user namespaces the sandbox needs.

On Windows, a session whose network tier restricts network access needs a
one-time sandbox setup, and **a plugin process never raises an elevation
prompt**. When that setup has not run, the start fails closed with a diagnostic
naming your plugin and telling the user to provision from an ordinary agent
command, which is the path allowed to ask for elevation. A package that needs
desktop control must request a host-access capability and wait for the user's
per-plugin authorization; Cua Driver and third-party packages use the same path.

That Windows gate is honest about its own limit: it asks the sandbox crate's
own readiness predicate, which compares a setup version and the stored accounts
rather than the proxy settings the offline account's filters depend on. A host
whose proxy configuration changed while a marker from the previous
configuration survived still reads as provisioned, and can then reach setup
from a plugin process. It narrows the window rather than closing it, which is
why an unexpected prompt there is a bug worth reporting.

## Lifecycle and data

- Disabling a plugin keeps it installed for rollback and update checks, but its
  Skills, MCP servers, automation hooks, and sidebar surfaces are not mounted
  into a new runtime assembly. Re-enabling restores them without touching data.
- Installed packages live at `<OPENAGENT_HOME>/plugins/<plugin-name>/`.
- Writable state lives at `<OPENAGENT_HOME>/plugin-data/<plugin-name>/` and is
  preserved across uninstall and reinstall.
- Automation hook commands are lifecycle configuration rather than plugin
  capabilities, so they keep inheriting the session profile directly.

## Validating a package

```bash
bun scripts/validate-plugin.mjs ../my-plugin
bun scripts/validate-plugin.mjs --all
```

The validator fails on any diagnostic that means a component silently did not
load. That is every rule above the loader enforces, plus three cases where the
loader is quieter than this document implies:

- A component field whose JSON type the loader cannot read. `"timeout_secs":
  "60"` and `"matcher": 5` load with the default the loader substitutes — 30
  seconds, and a hook that matches every tool — so a declaration like that is
  reported rather than accepted as the value it looks like.
- A key inside `extensions.openagent` that OpenAgent does not read. The loader
  drops it silently, which costs the whole component it was meant to declare.
- An unknown field on an automation hook. The loader checks unknown fields on
  every other component entry; here it would ignore the field and load the hook
  without it.

An *omitted* optional field is not one of those cases: where the format
documents a default, leaving the field out is how an author asks for it. Neither
is an unknown top-level manifest field, which the format carries for other hosts
by design — that one is a notice rather than a failure.

Each of these rules is pinned by a fixture under `fixtures/conformance/`, one
package per case. `bun test` runs them, so a rule change has to change a
reviewed fixture rather than only a line of code.
