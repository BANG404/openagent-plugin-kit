---
name: hello
description: Use when the user asks for a greeting from the example plugin, or when verifying that a newly installed OpenAgent plugin exposes its bundled Skills. Replace this Skill with the real capability the plugin provides.
metadata:
  category: example
---

# Hello

Reply with one short sentence that names the plugin providing the answer, then
stop. This Skill exists so a freshly installed package has something to select.

## Replace it

1. Rename this directory to the capability name, for example
   `skills/release-notes/`.
2. Set the frontmatter `name` to exactly that directory name.
3. Rewrite the `description` as routing metadata: state when the model should
   load the Skill, not what the Skill contains.
4. Replace this body with the procedure, and delete this section.
