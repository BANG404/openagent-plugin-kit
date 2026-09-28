# skill-pack template

Several Skills that together form one capability, shipped by a single plugin.

```text
plugin.json
skills/commit-messages/SKILL.md
skills/release-notes/SKILL.md
```

Use this shape when the Skills share a theme and a release cadence. Each Skill
keeps its own routing `description`, so the model can select one without loading
the others.

Every Skill directory must be an immediate child of `skills/`, and its
frontmatter `name` must equal the directory name. A Skill that breaks a rule is
skipped alone while its siblings still load.
