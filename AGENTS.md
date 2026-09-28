# OpenAgent Plugin Kit contributor map

This repository builds Agent Plugins for OpenAgent. It is intentionally small:
three skills, a set of starter templates, and two scripts.

## Route the task before editing

| Intent | Read first |
| --- | --- |
| Author or change a plugin package | `skills/openagent-plugin-authoring/SKILL.md` |
| Add or change a starter template | `skills/openagent-plugin-templates/SKILL.md` |
| Publish a package or a release asset | `skills/openagent-plugin-releasing/SKILL.md` |
| Change scaffold or validation rules | `scripts/lib/plugin-spec.mjs` and `docs/plugin-format.md` |

## Boundaries

- Validation rules in `scripts/lib/plugin-spec.mjs` mirror the OpenAgent runtime
  loader; keep them in sync with `docs/plugin-format.md` and the templates.
- Every directory under `templates/` must be a complete, valid package that
  `bun run validate --all` accepts without warnings.
- The repository root is itself a valid package. Do not add root files that the
  loader would read as components: only `plugin.json`, `skills/`, and `mcp.json`
  are components, and every `skills/` child must be a valid Skill.
- Never write to a developer's `~/.openagent` state from a template, script, or
  test. Use a temporary directory.

## Verification

```bash
bun test                    # script unit tests
bun run validate --all      # every bundled template plus this repository
```

Run both before committing. A template that fails validation is a broken
deliverable for every user who scaffolds from it.
