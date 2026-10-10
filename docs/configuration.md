# Plugin settings and OAuth

Declare `extensions.openagent.configuration: {version: 1, fields: [...]}`
and require `configuration-v1` in `compatibility.features`. Fields have `key`,
`label`, `type` (`string`, `boolean`, `integer`, `enum`), and optional `description`,
`required`, `secret`, `default`, `options`, `minimum`, `maximum`, `env`, `mcp`.
At most 64 fields; unique keys and bindings. Strings are limited to 16 KiB UTF-8
without NUL; integers and bounds must be JavaScript-safe. Enums have 1–64 options.
Secrets are strings without defaults. Never publish user values or real tokens.

Ordinary fields become `PLUGIN_CONFIG_<UPPERCASE_KEY>` in that plugin's process,
or use a permitted explicit `env`. Process identity/lookup/loader variables are
reserved. HTTP bindings use `mcp: {server, property}` where the property is
`oauth_client_id`, `oauth_scope` or secret `bearer_token`, without `env`.
The server must exist and be HTTP. The Runtime owns its endpoint and tokens.
Declared translations require `configuration.<key>.label` and, when present,
`configuration.<key>.description` for every supported locale.

Plugin settings renders the form and preserves an unchanged secret when its
password box is blank. Explicit Clear plus Save removes it. Opaque revisions
reject stale writes. Invalid old values remain repairable after a package update.
Values survive update/uninstall under `plugin-settings/<id>.json`, outside
package bytes and `PLUGIN_DATA`; Runtime applies Windows DPAPI or Unix private
directory/file permissions. This store is not an exportable credential backup.
Saved values reconnect stdio/HTTP MCP and affect later command/hook/daemon
launches. Running daemons must be restarted explicitly.

HTTP server controls test the connection, precheck OAuth capability, open the
browser and reconnect after authorization. Editing OAuth client/scope bindings
disconnects the previous local token. Disabled packages cannot authorize, and
local disconnection does not revoke the provider grant. Public client PKCE and
dynamic registration are supported; confidential client secrets and CIMD are not.

The reviewed Claude importer generates these bindings for service credentials,
OAuth public client/scope and Fakechat port. Existing credential files remain a
fallback for maintained adaptations; never erase them during an update.
Qualify saved parameters, redaction, clearing/reopening, invalid/conflicting
saves, browser success/denial/cancel, refreshed authentication and a primary tool
with an isolated mock provider. Real provider operations require a separate
account-specific acceptance result; a setup status tool is insufficient.
