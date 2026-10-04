---
name: openagent-plugin-templates
description: Use when scaffolding a new OpenAgent Agent Plugin from this kit, choosing among the bundled starter templates, running the scaffold script, renaming the generated package, or adding a new reusable template. Covers template contents, the scaffold rewrite step, and the validation gate every template must pass.
metadata:
  category: integrations
---

# Scaffolding from the bundled templates

`templates/` holds complete Agent Plugins 1.0.0 packages. Each one is a working
package, not a fragment: copy it, rename the identity, and install it.

## Choose a template

| Template | Use when the plugin needs |
| --- | --- |
| `minimal` | A single Skill and nothing else |
| `skill-pack` | Several Skills that belong to one capability |
| `mcp-tools` | To expose tools through a local stdio MCP server |
| `slash-commands` | A `/<plugin>:<command>` entry that returns a prompt |
| `sidebar-panel` | A sandboxed sidebar surface |
| `automation-hooks` | To react to lifecycle events and emit a message |
| `full-kit` | A reference containing every component together |

Start from the smallest template that covers the goal. For a daemon that needs
the interactive desktop, add `desktop-control` to the manifest capabilities;
that requests user authorization and never grants ambient access by itself.
Adding a component later
is one manifest key plus one file.

## Scaffold

```bash
bun scripts/new-plugin.mjs my-plugin --template skill-pack
bun scripts/new-plugin.mjs my-plugin --template mcp-tools --dir ../plugins
```

The script copies the template and rewrites `plugin.json`: `name` becomes the
requested name, `version` starts at `0.1.0`, `description` comes from
`--description` or a generated line, and any template `repository` is removed so
no scaffold inherits the kit's own update source. It refuses to overwrite a
non-empty destination, never runs the package, and never writes outside the
destination directory.

Templates declare English only. The scaffold rewrites translated metadata as
well as root metadata; complete and extend translations before advertising
another locale. Sidebar examples validate parent, type, version 1 and locale,
consume host changes, and preserve their scoped state. They retain English as
their declared fallback until the author supplies more languages.

After scaffolding, complete every `TODO` the script reports and rename anything
that still carries the template identity:

- `plugin.json` `name` and `description`.
- Skill directory names and their frontmatter `name`, which must match exactly.
- Sidebar `title`, command `label`, and hook `id` display strings.
- Component paths, when you rename `ui/`, `hooks/`, or `bin/` files.

## Add a template

A new template is a new package directory under `templates/`, and it must be
complete and self-consistent:

1. Create `templates/<name>/plugin.json` with a `openagent-plugin-template-<name>`
   identity so the template itself is installable for testing.
2. Add only the components the template demonstrates, each with real working
   content - no placeholders that fail validation.
3. Add a short `README.md` that states what the template demonstrates and which
   files to edit first.
4. Run `bun scripts/new-plugin.mjs --list` and `bun scripts/validate-plugin.mjs --all`.

## Gate

```bash
bun scripts/validate-plugin.mjs --all --require-i18n
bun test
```

Both must pass. A template that fails validation is a broken deliverable for
every user who scaffolds from it, and the kit's own tests treat a template
warning as a failure.
