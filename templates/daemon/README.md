# daemon template

This package declares a long-lived capability daemon through
`extensions.openagent.daemon`. The example process reads newline-delimited
JSON from stdin and writes a small readiness response to stdout.

The OpenAgent host owns process supervision, permissions, endpoint selection,
and shutdown. Pair the daemon with an MCP client in `mcp.json` when the
capability should be available to the model.
