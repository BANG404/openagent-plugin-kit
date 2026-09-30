# daemon template

This package declares a long-lived capability daemon through
`extensions.openagent.daemon`. The example process reads newline-delimited
JSON from stdin and writes a small readiness response to stdout.

The OpenAgent host owns process supervision, permissions, endpoint selection,
and shutdown. Pair the daemon with an MCP client in `mcp.json` when the
capability should be available to the model.

If a daemon needs the real computer environment, declare `desktop-control`,
`host-access`, or `computer-use` in `extensions.openagent.capabilities`. These
are user-visible requests only; OpenAgent requires an explicit per-plugin grant
before allowing an authorized host launch.
