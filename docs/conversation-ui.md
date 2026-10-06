# Persistent conversation components

Probe `await host.conversation.ui.capabilities()` before using this optional
protocol-1 capability. A host without support returns an operation error; keep
the package's ordinary text output usable there.

Declare `extensions.openagent.ui_components` entries with required `id`,
`version: 1`, nonempty `title` and package-relative HTML `entry`, with no other
keys. IDs must be unique and files contained inside the package, including
symlinks. The validator and `schemas/openagent-conversation-ui.schema.json`
describe this declaration. Invalid entries are disabled individually.

```js
await host.conversation.ui.set({
  conv_id: event.conversation_id,
  branch_id: event.branch_id,
  id: "progress",
  ui: {version: 1, component: `plugin:${host.pluginId}:status`,
       props: {progress: 50}, fallback: "Progress: 50%"},
});
```

Use the authenticated package ID from your process environment/context when
constructing the component ID. Runtime assigns owner and entry; callers cannot
supply an executable document. Repeating a local ID updates its original slot.
New IDs append UI records. Props are a JSON object, the envelope is at most
64 KiB and fallback must be nonempty and at most 4096 UTF-8 bytes.
`builtin.divider` accepts title/detail/tone and `builtin.notice` accepts
title/text/tone, all strings, with tone `neutral` or `danger`.

Checkpoint format 2 stores UI independently from user/model messages. Components
and their props survive reload, rollback and branch switching. Missing or
disabled packages and unsupported versions render the saved fallback. Keep IDs
and prop schemas compatible across package updates. The executable document is
loaded from the installed package, so make it self-contained with inline scripts
and styles. It runs in an opaque-origin sandbox without network or host tokens.

Listen for `openagent:conversation-ui-context` from `parent`, validating source,
type and version 1. Context includes message_id, conversation_id, branch_id,
component, props, locale and theme. Live changes preserve the frame. Send replies
with version 1 and message_id. `openagent:conversation-ui-ready` requests context;
`openagent:conversation-ui-resize` supplies height (host clamps 80–720px).
`openagent:conversation-ui-state` supplies request_id and replacement object props.
Wait for matching `openagent:conversation-ui-state-result` with `ok: true` before
claiming the draft was saved. Errors retain the draft. Only that record's props
are writable through the frame; process calls can separately update fallback.

Translate through context.locale, keep authored input unchanged during switching,
and test every advertised language. Test state save and reload, unavailable
fallback, provider exclusion, branch scope and active/terminal delivery.
