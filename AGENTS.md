# OpenAgent Plugin Kit contributor map

This repository builds Agent Plugins for OpenAgent. It is intentionally small:
authoring Skills, starter templates, validation scripts and an installable
development workflow.

The root package is Plugin Developer / 插件开发助手 (`openagent-plugin-kit`).
Message Board / 留言板 (`message-board`, `BANG404/message-board`) is an independent
collaboration plugin. Identify packages using their manifest ID and repository,
never a legacy checkout folder name. In OpenAgent, source checkouts belong at
`plugins/<package-id>/`; generated candidates use the active project's established
plugin directory, falling back to `plugin/<package-id>/` when none exists.

## Route the task before editing

| Intent | Read first |
| --- | --- |
| Author or change a plugin package | `skills/openagent-plugin-authoring/SKILL.md` |
| Add or change a starter template | `skills/openagent-plugin-templates/SKILL.md` |
| Publish a package or a release asset | `skills/openagent-plugin-releasing/SKILL.md` |
| Change scaffold or validation rules | `scripts/lib/plugin-spec.mjs` and `docs/plugin-format.md` |
| Change development loop, commands, test gates or Runtime acceptance | `skills/openagent-plugin-development/SKILL.md` and `docs/development-workflow.md` |

## Boundaries

- Validation rules in `scripts/lib/plugin-spec.mjs` mirror the OpenAgent runtime
  loader; keep them in sync with `docs/plugin-format.md` and the templates.
- The validator rejects what the loader rejects, plus the declarations the loader
  would silently ignore or substitute, because those describe a package that does
  not behave the way it reads. The one exception is an unknown top-level manifest
  field, which the portable format carries for other hosts by design; that is a
  notice. Keep that direction, and state it in `docs/plugin-format.md` rather
  than only in the code.
- A rule lives in `fixtures/conformance/` as well as in the code: one package per
  case, driven by `tests/conformance.test.mjs`. Changing a rule without changing
  its fixture is the failure this corpus exists to catch, and a fixture that
  stops describing a real loader rule is worse than no fixture.
- Every directory under `templates/` must be a complete, valid package that
  `bun run validate --all` accepts without warnings.
- The repository root is itself the development plugin. Its manifest, Skills,
  MCP server and continuation hook must stay valid. Every `skills/` child must
  be a valid Skill. Qualification is byte-bound and waits for developer acceptance;
  it never authorizes publication or access to installed release state.
- Never write to a developer's `~/.openagent` state from a template, script, or
  test. Use a temporary directory.
- Source package versions and verified protocol ranges follow
  `docs/publishing.md#version-ownership`; Runtime publishing validates rather
  than calculates them. Optional local embedding uses the shared Host Bridge,
  following `docs/host-bridge.md#local-embedding`.
- The kit's parity with the loader is a review-and-table guarantee, not a
  mechanism guarantee: this repository is public and the runtime's tests cannot
  depend on it, so nothing here can fail the SDK build. The runtime loader is
  the source of truth, and a disagreement is this repository's bug to fix.

## Verification

```bash
bun test                    # script unit tests and the conformance corpus
bun run validate --all      # every bundled template plus this repository
```

Run both before committing. A template that fails validation is a broken
deliverable for every user who scaffolds from it.
