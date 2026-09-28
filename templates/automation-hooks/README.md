# automation-hooks template

```text
plugin.json
hooks/after-tool.cmd
hooks/after-tool.sh
```

The package registers one `after_tool` hook whose `matcher` is a regular
expression checked against the tool name. The hook receives the event payload
on stdin and returns one line on stdout.

## Output contract

| stdout | Effect |
| --- | --- |
| `{"message": "...", "tag": "notice"}` | A plugin message; the declared policy decides who sees it |
| Any other non-empty text | Model context for the next turn, not shown to the user |
| Empty output, timeout, or non-zero exit | Nothing; the failure is reported in plugin diagnostics |

A tag must be declared in `message_policies`, otherwise the message is dropped.
OpenAgent namespaces it to `plugin:<plugin-id>:<tag>`, so two plugins cannot
collide. Setting `"model_visible": false` keeps a message out of the model
context.

## Rules

- Events are limited to the documented lifecycle list; an unsupported event
  disables that hook only.
- `timeout_secs` is 1-300, default 30.
- Hooks never receive model context, transcript text, or Inspector data.
- The manifest names one executable, so point `command` at the `.sh` file on
  POSIX hosts after making it executable.
