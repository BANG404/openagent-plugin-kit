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

- `version` is a free-form string and is never grounds for rejecting a package.
  An update is offered when the latest release's version is newer than the
  installed one.
- When both versions parse as SemVer, precedence follows the specification: a
  release outranks its own prerelease, prerelease identifiers compare
  numerically and then by ASCII, and build metadata is ignored. `1.0.0` is
  newer than `1.0.0-beta.1`, and `1.0.0+build.5` equals `1.0.0`.
- Otherwise the comparison falls back to numeric components, so `2026.09`
  compares as the number 2026.09 and `2.1` is newer than `1.9.3`. Use
  `MAJOR.MINOR.PATCH` and let SemVer order releases rather than relying on
  punctuation to sort above a lower number.
- Keep the update release a stable GitHub release. OpenAgent reads the latest
  stable release, so a release marked prerelease is never a candidate — which
  is a separate decision from how its `version` string compares.

### Version ownership

Determine and update the source `plugin.json` version while implementing a
package change. Compatible fixes advance patch, compatible capabilities advance
minor, and incompatible package APIs advance major. Bundled Skills and other
archived files also change the package. Update `package.json` when applicable.
Advance above existing manual `v*` and automation `plugin-v*` stable versions;
published tags and archives are immutable. Runtime publication packages the
declared version verbatim and rejects changed source that reuses a version.

Evaluate plugin protocol compatibility separately. Contract-preserving changes
keep the protocol; incompatible contract changes update Runtime's protocol and
affected package ranges with behavior coverage in the same delivery. Detect
optional capabilities before using them, and handle older Runtimes explicitly.
Do not widen `compatibility.plugin_protocol` without verification. Package data
migrations remain package-owned and need recovery coverage.

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
