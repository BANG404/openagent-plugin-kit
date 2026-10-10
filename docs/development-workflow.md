# Plugin development workflow

Install Plugin Developer (`openagent-plugin-kit`) as an ordinary plugin from
the active project's `plugins/openagent-plugin-kit/` checkout in OpenAgent.
It is independent of Message Board (`message-board`); that package's channel
and message tools do not implement this development workflow.
The kit contributes its authoring,
template, release and development Skills, a direct MCP development server, slash
commands, and a Stop hook. It contains no Runtime-specific plugin implementation.

Start with `/openagent-plugin-kit:create Describe the plugin and acceptance criteria`.
For structured requirements use JSON, for example:

```text
/openagent-plugin-kit:create {"goal":"Create a notes plugin with durable storage and English/Chinese notices","name":"my-notes","template":"mcp-tools","template_repository":"https://github.com/BANG404/openagent-plugin-kit","template_subdirectory":"templates/mcp-tools","skills":["openagent-plugin-authoring"],"max_iterations":12}
```

The specification is persisted under `PLUGIN_DATA/development`; the command
returns a prompt through the normal slash-command pipeline. The agent reads the
requested Skills, calls the MCP tools, implements, inspects failures and repeats.
Repository templates are cloned without submodules or lifecycle execution; an
optional `template_ref` is a 40-character immutable Git SHA. The actual revision
is retained. Only contained packages inside the active workspace can be selected;
scaffolding never overwrites an existing directory or copies links. Pass
`directory: "plugins/<name>"` to scaffold at the project's final plugin location;
its parent must already exist inside the workspace, and the last segment must
match the plugin name. Escapes and links outside the workspace are rejected.

For the reviewed `anthropics/claude-plugins-official/external_plugins` packages,
clone the repository into the workspace without running its code, then use
`development_import_claude` with `source`, `directory`, immutable `revision` and
the independently maintained release `repository`. Both paths must stay inside
the workspace. The importer verifies the checkout revision, rejects links,
normalizes MCP configuration, bundles dependencies with lifecycle scripts
disabled, retains license/provenance and generates package tests. Git's
ownership exception applies only to that explicitly selected contained checkout
for the revision read; global Git configuration is unchanged. Failed conversion
removes its private staging package and never leaves a partial final candidate.
Dependency temporary files and cache stay in permitted paths. Installed npx/uvx
caches and managed Python installations use PLUGIN_DATA, because user-home npm/uv
caches are not writable under managed confinement. Bun compilation
uses its API with an explicit root; the CLI resolver can fail on unreadable
Windows parent directories. All installed adapters run as prebuilt Node bundles;
Fakechat's local HTTP/WebSocket surface is adapted from Bun to Node. Bun remains
the development/build/test prerequisite, not a production channel dependency.
Runtime acceptance must execute setup and the
requested service assertions; prerequisites alone do not prove authenticated
external behavior. Never claim real provider operations from setup tool success.
The current Windows production fixture rejects secondary native child launches
(Chrome/Python) with EPERM/Access denied even when setup MCP connects. Record that
Runtime limitation separately from package acceptance; keep confinement enabled
and do not report browser/Python service operations as qualified.

Channel conversions preserve upstream pairing/allowlist gates and route admitted
messages through the generic Host Bridge, with desktop owner binding, independent
durable peer conversations and bounded delivery deduplication. They do not
register Claude notification handlers with the Runtime or resolve OpenAgent
approvals remotely. State and credentials remain under `PLUGIN_DATA`; iMessage
still needs macOS and explicitly granted computer access. Read the generated
instructions and test the actual receive/reply path before publishing.

`development_validate`, `development_test`, and `development_runtime_acceptance`
retain their exit status, diagnostics, exact package digest and logs. A changed
package invalidates prior evidence. `development_ready` requires all three gates
on current bytes and changes the workflow to `awaiting_acceptance`. The agent
must also cover every explicit requirement beyond these generic gates. The
developer uses `:accept` to record acceptance; `:resume` returns a rejected or
stopped candidate to development. Neither command publishes source or releases.

The Runtime runner takes an explicit executable (the installed production server
or a source-built server) and starts it using `--desktop-api`, `--workspace`,
an ephemeral loopback listener and a fresh home under plugin data. It never
discovers a running production user's token or modifies their configuration.
It uses `/api/desktop/operations`, checks health, installs a staged package,
checks component diagnostics and command registration, and makes real MCP tool
calls with expected JSON subsets. MCP packages require a nonempty assertion plan:

```json
{"tools":[{"name":"notes_list","arguments":{},"expected":{"isError":false,"content":[{"type":"text","text":"No notes stored."}]}}]}
```

Each report records the candidate digest, exact Runtime binary SHA-256, version,
protocol, isolated home and bounded stdout/stderr logs. Readiness is not success;
tool errors, mismatches, startup failure, timeouts and byte changes fail the gate.
The child receives an allowlisted operating-system environment and a fresh
token, with no provider or parent bridge credentials. It inherits the caller's
process sandbox; it reads `runtime.permissions`. On Windows a managed caller
must first prove its inherited restricted kernel token. The nested Runtime then
uses that parent token and job instead of trying to create a second restricted
token (Windows rejects that operation). Its internal enforcement is disabled;
the report records both profiles and the inherited enforcement strategy. This
retains the parent's workspace/data access boundary; it does not establish a
new narrower candidate-only filesystem boundary. Other callers copy the same
profile through the ordinary settings API. No host elevation is used. A restricted-network Windows fixture may
require sandbox provisioning through an ordinary agent command; that prerequisite
fails explicitly with retained diagnostics rather than triggering elevation from
a plugin or weakening its policy. Put required test
inputs and the chosen Runtime executable within paths the caller may read. Model,
UI, host-access and integration-specific qualification remain explicit gates
owned by the relevant package/native scenario; this runner does not fake them.

The hook wakes only a `final_completed` run with remaining work. It requires the
Runtime's per-execution `event.execution_id`, records that identity before
scheduling to suppress duplicate events, and always addresses the
same branch using its current head. `interrupted` waits for the existing approval
or input. `final_cancelled` stops; `final_failed` and wake errors require explicit
resume. The iteration budget is 1..100 (default 12); exhaustion stops with durable
evidence. A crash after a wake claim leaves recovery visible rather than starting
duplicate work; `:resume` clears the pending claim. One active workflow per
conversation is bound to its originating branch; another branch cannot mutate it.

Use `:status` to inspect saved state and log/report paths; its confirmation turn
never schedules development or marks the workflow failed. Inspect package and
Runtime failures before retrying. Keep developer acceptance distinct from the
agent's evidence-backed qualification and from publication authorization.

The kit requires a Runtime providing hook `execution_id`, version-one MCP lease
operations and the server's `--control-file` option. Child tests and Git use
ordinary executable/argv launches with file-backed stdin and logs under plugin
data; this avoids Windows restricted-token child-pipe creation failures while
retaining the same process token and job. Each isolated server gets a private
control file containing `running`; the runner writes `shutdown` at completion.
The server also stops if that file disappears. The default desktop stdin control
is unchanged. Output overflow fails the gate and terminates the child.
Shutdown signaling and cleanup failures also fail acceptance; termination is
still attempted and the failed report and bounded logs are retained.
The Agent workflow fixture observes authenticated Runtime `chat-done` events
before submitting acceptance; saved qualification can precede Stop hook
completion and release of the conversation run guard.

Windows repository checkout selects Git's OpenSSL HTTPS backend for that
invocation because restricted tokens cannot acquire Schannel credentials.
It also enables Git's long-path support for nested plugin-data directories.
Certificate verification remains enabled and global Git settings are unchanged.
Template clones use a relative destination from their private staging directory.
Temporary checkout and acceptance directories use short random names: Windows
Git helpers and SQLite still have path limits even with Git long-path support.
Keep fixture roots short enough for a nested Runtime home; an excessively long
caller-owned home fails with retained logs instead of widening write grants.
Atomic state replacement retries bounded Windows sharing failures while keeping
the previous complete value; a persistent failure stops with its error.

For configuration parameters, secret fields and package-owned OAuth setup, read [configuration](configuration.md) before authoring or qualifying a package.

When polling a running terminal command, retain its original session ID or read
`metadata.session_id` from subsequent poll results. A running poll may omit the
top-level `session_id`; it still belongs to the same session.
