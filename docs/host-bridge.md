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
