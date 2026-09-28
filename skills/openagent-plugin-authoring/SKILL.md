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
      "capabilities": ["skills", "mcp"]
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

## Commands, sidebar, and automation

- Commands are exposed as `/<plugin-name>:<command-id>`. The executable receives
  a JSON request on stdin with `conversation_id`, `plugin_id`, `command`,
  `argument`, and `input`, and must print a non-empty prompt on stdout.
- Sidebar views run as sandboxed HTML and receive only the context fields listed
  in their `capabilities`. Never expect transcript text, model output, file
  contents, or another plugin's state.
- Automation hooks receive the event payload on stdin. To display a message, set
  a `message_policies` entry and print `{"message": "...", "tag": "<tag>"}`;
  an undeclared tag is dropped. Plain text output is model context only.
- Declare `timeout_secs` between 1 and 300. A hook or command failure is isolated
  and reported; it never stops runtime finalization.

## State and portability

Write state only under `PLUGIN_DATA`, which survives uninstall and reinstall.
Package containment stops path escapes from the package root but is not a
subprocess sandbox, so keep credentials in user configuration rather than in the
package. Use `./hooks/*.cmd` for Windows and `./hooks/*.sh` for POSIX hosts, and
point the manifest at the one that matches your target; a plugin executes a
single declared path.

## Verify before installing

```bash
bun scripts/validate-plugin.mjs <package-dir>
```

The validator mirrors the loader rules and fails on warnings, because a warning
means a component silently did not load. After it passes, install the directory
through Settings -> Plugins -> Install and exercise every component.
