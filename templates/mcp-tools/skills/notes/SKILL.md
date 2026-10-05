---
name: notes
description: Use when the user asks to record, list, or review notes that should persist across conversations for the project using this plugin. Covers the notes_add and notes_list tools provided by the bundled MCP server.
metadata:
  category: example
---

# Notes

The plugin exposes two tools from a local stdio MCP server:

- `notes_add` stores one note. It requires a non-empty `text` argument.
- `notes_list` returns every stored note in insertion order.

## Procedure

If the tools are absent, call `load_tool` to discover and mount the plugin's
notes server. The package defaults to relay; users can override it to direct.

1. To record something, call `notes_add` with the user's text unchanged.
2. To review, call `notes_list` and present the notes in the returned order.
3. Report the stored count after an add, so the user can tell it succeeded.

Notes live in `PLUGIN_DATA`, which survives uninstall and reinstall. Never
assume the store is empty at the start of a conversation.
