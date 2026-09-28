# Publishing and updating a plugin

## Repository metadata

Set `repository` in `plugin.json` to the HTTPS GitHub URL of the published
source. OpenAgent reads that repository's latest stable GitHub release to offer
an update, so the URL is what makes updates discoverable.

```json
{
  "name": "my-plugin",
  "version": "1.2.0",
  "repository": "https://github.com/you/my-plugin"
}
```

## Versioning

- `version` is a free-form string, but the update check compares numeric
  components in order, so use `MAJOR.MINOR.PATCH`.
- An update is offered when the latest stable release is newer than the
  installed `version`.
- Keep the update release stable and non-prerelease; a prerelease is not treated
  as a stable candidate.

## Release assets

Attach the packaged plugin to the GitHub release as a single archive. OpenAgent
accepts an asset only when every condition holds:

| Condition | Requirement |
| --- | --- |
| URL | HTTPS GitHub URL |
| Format | `.zip`, `.tar.gz`, or `.tgz` |
| Digest | A GitHub `sha256:` digest is present and matches the downloaded bytes |
| Size | At most 50 MiB compressed and 100 MiB extracted |
| Contents | The archive root contains `plugin.json` plus the rest of the package |
| Identity | The manifest `name` matches the installed plugin name |

Extraction rejects archive traversal and links, validates the complete package in
staging, then activates it atomically. The previous package is retained until
activation succeeds and is restored if replacement fails. `plugin-data` is never
replaced, so upgrade code can rely on its own state directory surviving.

A check never downloads or executes a release. Download, validation, staging,
and activation happen only after an explicit update action, and validation never
executes package code.

## Release checklist

1. Bump `version` in `plugin.json`.
2. Run `bun scripts/validate-plugin.mjs .` and fix every warning.
3. Install the package locally in OpenAgent and exercise each component.
4. Tag the commit, for example `v1.2.0`, and publish a GitHub release.
5. Attach the archive built from the package root, not from a parent directory.
6. Confirm the release shows a `sha256:` digest for the asset.

## Local development

Install a working copy through **Settings -> Plugins -> Install** and select the
package directory. OpenAgent copies it into staging, validates it again, and
atomically activates it under `<OPENAGENT_HOME>/plugins/<name>/`. When iterating,
reinstall after each change; the installed copy is what runs.

Use a temporary `OPENAGENT_HOME` when you need a clean fixture so development
never touches your normal `~/.openagent` state.
