# OpenAgent Plugin Kit

A standalone repository for building [Agent Plugins](https://agent-plugins.org/)
1.0.0 packages that OpenAgent installs. It ships the three things a plugin
author needs, and nothing else:

- `skills/` - agent skills that teach a coding agent how to author, scaffold,
  validate, and release a plugin.
- `templates/` - complete starter packages, one per plugin capability, that you
  copy or scaffold from.
- `scripts/` - `new-plugin.mjs` (scaffold) and `validate-plugin.mjs` (validate),
  whose rules mirror the OpenAgent runtime loader.

The repository root is itself a valid Agent Plugin package: installing this
repository adds the bundled skills to the global skill catalog. `templates/`,
`scripts/`, and `docs/` are inert data - the loader only reads `plugin.json`,
`skills/`, and `mcp.json` at the package root.

## Requirements

- [Bun](https://bun.sh/) 1.2 or newer for the scaffold and validation scripts.
- OpenAgent to install and run a generated package.

## Quick start

```bash
# Scaffold a package into the current directory
bun scripts/new-plugin.mjs my-plugin --template skill-pack

# Validate one package, or this repository and every bundled template
bun scripts/validate-plugin.mjs ../my-plugin
bun scripts/validate-plugin.mjs --all

# Script tests
bun test
```

Then install the generated directory in OpenAgent through
**Settings -> Plugins -> Install**, or publish it as a GitHub release (see
`docs/publishing.md`).

## Templates

| Template | What it contains | Capabilities |
| --- | --- | --- |
| `minimal` | One `plugin.json` and one Skill | skills |
| `skill-pack` | Two Skills with workflow-style bodies | skills |
| `mcp-tools` | A dependency-free stdio MCP server plus `mcp.json` | skills, mcp |
| `slash-commands` | A `/<plugin>:<command>` entry backed by a script | commands |
| `sidebar-panel` | A sandboxed `ui/panel.html` sidebar view | sidebar |
| `automation-hooks` | An `after_tool` hook with a declared message policy | automation |
| `daemon` | A supervised long-lived capability daemon declaration | daemon |
| `full-kit` | Every component in one package, as the complete reference | all |

Every template is a complete package. `bun scripts/validate-plugin.mjs --all`
fails if any of them drifts from the contract.

OpenAgent's product-owned standard packages are published separately so they
can be subscribed to directly from GitHub:

- [Chat Groups](https://github.com/BANG404/openagent-chat-groups)
- [Goal](https://github.com/BANG404/openagent-goal)
- [Graph](https://github.com/BANG404/openagent-graph)
- [Cua Driver](https://github.com/BANG404/openagent-cua-driver)

Each package declares its matching `extensions.openagent.runtime` binding and
publishes verified release archives for the host updater.

## Layout

```text
plugin.json                     kit manifest (makes this repo installable)
skills/                         agent skills shipped by the kit
templates/<name>/               starter packages, each with its own plugin.json
scripts/new-plugin.mjs          copy a template and rewrite its identity
scripts/validate-plugin.mjs     validate packages against the 1.0.0 contract
scripts/lib/plugin-spec.mjs     shared rules and package inspection
fixtures/conformance/           one package per validator rule, run by the tests
tests/                          Bun tests for the scripts and the corpus
docs/plugin-format.md           field-by-field package reference
docs/publishing.md              versioning, releases, and updates
```

## Documentation

- `docs/plugin-format.md` - every `plugin.json` field, the manifest rules the
  loader enforces, Skill rules, MCP transports, and each OpenAgent extension.
- `docs/publishing.md` - repository metadata, semantic versioning, release
  assets, and how OpenAgent validates and activates an update.
- `skills/` - the same guidance in agent-facing form, loaded by OpenAgent when
  the kit is installed.

## License

MIT. See `LICENSE`.
