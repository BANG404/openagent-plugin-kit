---
name: openagent-plugin-releasing
description: Use when publishing or updating an OpenAgent Agent Plugin, including repository metadata, semantic versioning, GitHub release archives, sha256 digests, size limits, prerelease handling, and how the runtime validates, stages, and atomically activates an update while preserving PLUGIN_DATA.
metadata:
  category: release
---

# Releasing an OpenAgent plugin

Update delivery is explicit and verified. `repository` in `plugin.json` points at
an HTTPS GitHub repository; the product checks its latest stable release and
offers an update only after the user acts.

## Prepare the package

1. Set `repository` to the published HTTPS GitHub URL.
2. Bump `version` using `MAJOR.MINOR.PATCH`; the update check compares numeric
   components in order.
3. Run `bun scripts/validate-plugin.mjs .` and fix every warning. A warning means
   a component will not load in a fresh install.
4. Reinstall the package locally and exercise each component before tagging.

## Build the release asset

Archive the package root so `plugin.json` sits at the archive root, then attach
it to a GitHub release:

```bash
git archive --format=zip -o my-plugin-1.2.0.zip HEAD
```

OpenAgent downloads an asset only when all of these hold:

| Condition | Requirement |
| --- | --- |
| URL | HTTPS GitHub URL |
| Format | `.zip`, `.tar.gz`, or `.tgz` |
| Digest | A GitHub `sha256:` digest is present and matches the downloaded bytes |
| Size | At most 50 MiB compressed and 100 MiB extracted |
| Contents | The archive root contains `plugin.json` and the complete package |
| Identity | The manifest `name` matches the installed plugin name |

Check the release page shows a `sha256:` digest for the asset; without it the
candidate is not offered.

## What the runtime does with an update

- The check reads release metadata and compares versions. It never downloads or
  executes anything.
- On an explicit update, the archive is size-limited, extracted with traversal
  and link rejection, and validated as a complete package in staging.
- Validation never executes package code. The manifest name must match.
- Activation is atomic. The previous package is retained until activation
  succeeds and is restored if replacement fails.
- `<OPENAGENT_HOME>/plugin-data/<plugin-name>/` is never replaced, so upgrade
  code can migrate its own state in place.
- An interrupted replacement is repaired on the next runtime startup before
  installed packages load.

## Versioning rules

- Publish stable releases for the update channel; a prerelease is not treated as
  a stable candidate.
- A downgrade is never offered. Always move `version` forward.
- Keep at least one older release available so users can reinstall a known-good
  package if a new component misbehaves.

## Failure modes to check before publishing

- The archive excludes `plugin.json` or nests it one directory deep.
- The manifest `name` differs from the installed plugin name.
- A component path uses an absolute path, `:` , or `..`, or follows a symlink
  out of the package root.
- A Skill directory name and its frontmatter `name` disagree.
- The asset exceeds the size limits or the release has no digest.
