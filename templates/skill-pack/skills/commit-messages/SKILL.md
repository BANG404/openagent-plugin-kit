---
name: commit-messages
description: Use when the user asks to write, rewrite, or review a commit message in a repository that adopts this plugin, including Conventional Commits subjects, imperative bodies, and grouping a working diff into focused commits.
metadata:
  category: writing
---

# Commit messages

Write the subject in the imperative mood, under 72 characters, scoped to the
subsystem the diff actually touches.

## Procedure

1. Read the staged diff and name the single behavior that changes.
2. Choose the narrowest accurate type: `feat`, `fix`, `refactor`, `docs`,
   `test`, `build`, or `chore`.
3. Write `type(scope): summary` using the scope only when it adds information.
4. Add a body only when the change needs a reason the subject cannot carry.
   Explain why, not which lines moved.

## Guardrails

- Never describe an edit as "various fixes" or "improvements".
- Split a diff that changes two unrelated behaviors into two commits instead of
  writing a message that covers both.
- Do not claim tests pass unless the diff or the session shows they ran.
