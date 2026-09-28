# slash-commands template

```text
plugin.json
bin/word-count.cmd
bin/word-count.sh
bin/word-count.mjs
```

The manifest declares one command, exposed to the user as
`/openagent-plugin-template-commands:word-count`. `argument` is
`required_text`, so OpenAgent rejects a bare `/...:word-count` and passes the
typed text to the executable instead.

## Platform

The manifest can name exactly one executable per command. This template points
at `bin/word-count.cmd` for Windows and ships `bin/word-count.sh` for POSIX
hosts; change `command` to the `.sh` path (and make the file executable with
`chmod +x`) when you target macOS or Linux.

## Contract

- stdin receives one JSON object with `conversation_id`, `plugin_id`, `command`,
  `argument`, and `input`.
- stdout must be a non-empty prompt. An empty stdout or a non-zero exit means
  the command produced nothing.
- `timeout_secs` is 1-300. The process runs through the normal OpenAgent process
  boundary with the package root as its working directory.
