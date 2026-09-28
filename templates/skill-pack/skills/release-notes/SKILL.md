---
name: release-notes
description: Use when the user asks to draft, update, or review release notes or a changelog entry for a set of merged changes, including grouping by user-visible impact, calling out breaking changes and migrations, and writing upgrade steps.
metadata:
  category: writing
---

# Release notes

Group changes by what a user experiences, not by which files changed.

## Procedure

1. Collect the merged changes for the release range.
2. Bucket them into Breaking, Added, Changed, Fixed, and Security. Drop any
   bucket that stays empty.
3. Write one sentence per entry that states the user-visible effect.
4. Put breaking changes first and include the migration step in the same entry.
5. Link the pull request or commit only when the reader can act on it.

## Guardrails

- Never list internal refactors that a user cannot observe.
- Never restate the commit subject verbatim; rewrite it for a reader who does
  not know the internal names.
- Mark an entry as breaking only when an existing workflow stops working.
