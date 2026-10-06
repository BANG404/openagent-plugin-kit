---
name: openagent-plugin-development
description: Use after /openagent-plugin-kit:create or when implementing an OpenAgent plugin from requirements, Skills and a template repository through testing and developer acceptance. Drives the saved workflow and isolated production Runtime acceptance, repairs failures, and stops for approval, cancellation or developer acceptance.
metadata:
  category: integrations
---

# Develop and qualify a plugin

Read `docs/development-workflow.md` for tools, templates, Runtime configuration,
continuation and acceptance boundaries. Read the authoring and templates Skills
before writing a package and the release Skill only when publication is requested.

1. Read `development_status`. Turn the specification into concrete acceptance
   criteria covering every requested component and referenced Skill. Read each
   selected Skill; a template URL never substitutes for requirements.
2. Scaffold with `development_scaffold` (bundled template or HTTPS repository,
   optional immutable commit and contained subdirectory), or select an existing
   workspace package. Record source revision and destination. Implement behavior,
   focused tests, translations and durable author instructions together.
3. Run `development_validate` for the required locales. Fix every diagnostic.
   Run `development_test` with an executable and argv; assert behavior and failure
   recovery. A no-op command is not evidence for the specification.
4. Run `development_runtime_acceptance` with the selected Runtime executable and
   an explicit tool assertion plan. Inspect its real installation, command catalog,
   tool results and retained stdout/stderr report. It uses the shipped product API
   and an isolated home. A passing HTTP call alone does not prove acceptance.
5. Exercise components the generic runner cannot qualify (command execution with
   the configured model, hooks, sidebar/MCP Apps, theme/locale changes) through
   applicable native black-box scenarios. Keep their evidence with the candidate.
   Fix failures and re-run affected gates; changed package bytes invalidate earlier
   evidence. Do not weaken tests or silently drop requested components.
6. Call `development_ready` only after every specification criterion and all three
   current-byte gates pass. Report package path, source/binary revisions, coverage,
   reports/logs and remaining limitations. The workflow waits for the developer's
   `/openagent-plugin-kit:accept`; test success is not developer acceptance.

The Stop hook continues unfinished successful turns, with a bounded iteration
budget. Approvals/input/interrupted turns wait; failures require explicit resume;
cancellation and qualified candidates stop. Use `/openagent-plugin-kit:status`,
`:stop`, or `:resume` for recovery. Never publish, create repositories, grant
host access, access installed release state, or auto-answer approvals merely to
finish a loop. A separate user instruction authorizes publication.
