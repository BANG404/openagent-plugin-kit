# sidebar-panel template

```text
plugin.json
ui/panel.html
```

The panel is loaded as UTF-8 HTML into a sandboxed iframe and receives a
versioned `openagent:sidebar-context` message:

```js
{ type: "openagent:sidebar-context", version: 1, plugin_id, scope, /* declared fields */ }
```

`scope` is `global`, `workspace`, or `conversation`, as declared in the
manifest. Only the capabilities you list are sent: `workspace`,
`conversation`, `branch`, `files`, `locale`, and `theme`.

## Limits to design around

- The panel never receives transcript text, model output, or Inspector data.
- `files` is metadata only: paths and change kinds, never file contents or
  diffs.
- The panel cannot read another plugin's state, and it does not persist across
  reloads unless you store data yourself.
- Style with `Canvas`/`CanvasText` and `color-scheme` so the panel follows the
  host light and dark themes.
