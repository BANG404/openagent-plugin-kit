# OpenAgent host bridge

Every enabled plugin process receives these environment variables:

- `OPENAGENT_PLUGIN_HOST_URL`
- `OPENAGENT_PLUGIN_HOST_TOKEN`
- `OPENAGENT_PLUGIN_ID`

Import `lib/openagent-host.mjs` or copy that dependency-free module into the
package. It authenticates each request and exposes the same capability modules
to every plugin:

```js
import { createPluginHost, requireConversationContext } from "./openagent-host.mjs";

const host = createPluginHost();
const { conversationId } = requireConversationContext(toolArguments);
const child = await host.conversation.create({
  title: "Worker",
  parent_conv_id: conversationId,
});
await host.agent.wake(
  { conv_id: child.conv_id, branch_id: child.branch_id, text: "Run this task." },
  { wait: false },
);
await host.event.emit("worker-started", { conv_id: child.conv_id });
```

The modules are:

- `conversation.create/state/children/update/cancel/delete/flow.set`
- `branch.create/list/setHead/setActive`
- `agent.submit` and `agent.wake`
- `roles.list`
- `event.emit`
- `locale.get`
- `embedding.status/embed` (optional local inference, described below)
- `mcp.mount/unmount/status` (see [dynamic MCP mounting](mcp-lifecycle.md))
- `host.call('runtime.permissions')` returns the version-one live session
  permission profile used by [isolated development acceptance](development-workflow.md).

## Local embedding

The optional embedding capability reuses the Runtime's already-loaded local
encoder. It neither installs model resources nor calls a provider. It requires
the existing package-scoped bridge token and a currently installed, enabled,
compatible package, with no additional computer-access grant.

```js
const status = await host.embedding.status();
if (!status.ready) throw new Error("Prepare the embedding model in OpenAgent setup");
const result = await host.embedding.embed(["a small cat", "a document to index"]);
// result.vectors follows input order; persist model_id/model_version/dimensions
// with your index and rebuild it when this identity changes.
```

Wire operations are `embedding.status` with `{}` and `embedding.embed` with
`{texts: string[]}`. Both return `version: 1`, `model_id`, `model_version` and
`dimensions`. Status additionally returns `supported: true`, `ready`, `max_texts`,
`max_text_bytes` and `max_total_bytes`; inference returns `vectors: number[][]`.
The current encoder is `all-MiniLM-L6-v2-q`, resource version `1`, with 384
dimensions. A batch contains 1..32 non-blank texts, at most 8192 UTF-8 bytes each
and 65536 UTF-8 bytes total. Text is passed unchanged to the existing tokenizer;
its token truncation remains in effect, so chunk long documents before embedding.

The Runtime allows one plugin inference worker at a time and immediately rejects
busy requests; retry with a bounded backoff. A missing model returns an actionable
not-ready error without downloading or mutating setup. Cancellation cannot release
the worker slot before inference finishes. Input and vectors are not persisted
by the bridge. Package-owned indexes belong in `PLUGIN_DATA`.

Older protocol-1 Runtimes can reject `embedding.status` as an unknown operation.
Catch that error and report that this optional capability needs a newer Runtime;
do not mistake a missing model for unsupported operations or silently send text
to a remote provider. Existing packages continue to load under protocol 1, and
new packages must detect this capability independently of protocol admission.

## Lifecycle context

Hook events include `execution_id`: one opaque identity per Runtime execution,
shared by every hook in that execution and distinct on continuation or resume.
Use it to deduplicate Stop work. `run_id` is the provider/runtime correlation
identifier and may remain the conversation ID across separate executions.

`await host.locale.get()` returns the current resolved application locale from
the version-one `{version: 1, locale}` response. The client rejects unknown
versions. Query it before each new independent process notice; a daemon-start
environment value cannot track live switching. Resolve exact tag, supported base,
then declared default from the manifest. Do not translate historical content or
persist transient `_openagent.locale` context. The Runtime admits this read-only
operation for every enabled authenticated package without a capability grant.

For plugin MCP tool calls the SDK injects the current `_openagent.locale` after
provider validation, immediately before dispatch. Prefer that request context
when present; it supports network-restricted tools without a bridge request.
Independent hook/daemon notices still use the authenticated locale operation.

`agent.wake` is the explicit asynchronous orchestration entry point. It uses
the same request shape as `agent.submit`; pass `{ wait: false }` to schedule a
turn and return immediately. A package may mark a request `{ hidden: true }`
for a model-visible control continuation and attach its own opaque `flow`
projection for the checkpoint/sidebar. The Runtime owns model execution,
checkpoint persistence, cancellation, permissions, and branch bookkeeping. The
package owns its reducer, state schema, prompts, completion rules, and wake
scheduling.

When a request supplies `branch_id` with a null or omitted
`parent_checkpoint_id`, the bridge resolves that branch's current head just
before submission, including after busy-run retries. Packages should use this
form for continuations so a queued wake follows the checkpoint that just
finished.

`conversation.state(convId, branchId)` accepts an optional branch ID. Pass the
package-owned branch whenever state or a continuation must follow a branch that
is not currently selected in the desktop; omitting it reads the active branch.

`conversation.flow.set` stores an opaque package projection for one conversation
branch. The package supplies the complete `flow` value, including its own
`plugin_id` and state schema; the Runtime only validates ownership and carries
the projection through checkpoints and events.

The bridge client always sends the authenticated plugin identity. Do not accept
a plugin ID from user input or forward another package's token. Events named by
the package are automatically namespaced by the Runtime as
`plugin:<plugin-id>:<event>`, except for the shared lifecycle notifications
`plugin-flow-updated`, `plugin-flow-iteration-started`, and `subagent-started`.
Those shared events must include the authenticated top-level `plugin_id`; a
`flow.state.plugin_id` is also checked when a flow projection is present.

Hook processes receive the same bridge variables plus `PLUGIN_ROOT` and
`PLUGIN_DATA`; write durable package state only below `PLUGIN_DATA`. Hook stdin
is an envelope whose routing identifiers are nested under `event`. Use the
shared parser so a package does not accidentally read the outer envelope:

```js
import { readFileSync } from "node:fs";
import { hookContext, hookEvent } from "./openagent-host.mjs";

const event = hookEvent(readFileSync(0, "utf8"));
const { conversationId, branchId } = hookContext({ event });
// The package now decides whether to call host.agent.wake(...).
```

`createHostClient` and `createPluginHost` are aliases. The capability methods
accept both positional snake_case arguments and object-shaped camelCase
aliases, and a bounded request timeout turns an unavailable Runtime into a
structured `OpenAgentHostError`.
