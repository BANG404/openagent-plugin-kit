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
scaffolding never overwrites an existing directory or copies links.

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
process sandbox; it reads `runtime.permissions` and copies the same permission
profile into the isolated Runtime through the ordinary settings API. It cannot
grant itself broader permissions. A restricted-network Windows fixture may
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
Atomic state replacement retries bounded Windows sharing failures while keeping
the previous complete value; a persistent failure stops with its error.
