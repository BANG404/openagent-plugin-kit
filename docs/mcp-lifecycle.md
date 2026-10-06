# Dynamic MCP mounting

Plugin commands, hooks, MCP handlers and capability processes may call the
authenticated Host Bridge through `host.mcp.mount`, `unmount` and `status`.
The token binds package identity. `server` is the raw key in that package's
portable `mcp.json`; it never supplies a new command, URL, another package's
server or additional grants.

```js
import { createHostClient } from './lib/openagent-host.mjs';
const host = createHostClient();
await host.mcp.mount({ server: 'search', mode: 'relay', ttlSecs: 120 });
console.log(await host.mcp.status('search'));
await host.mcp.mount({ server: 'search', mode: 'direct', ttlSecs: 120 });
await host.mcp.unmount('search');
```

| Operation | Arguments | Effect |
| --- | --- | --- |
| `mcp.mount` | `server`, `mode` (`direct`/`relay`), `ttl_secs` (integer 1..86400) | Start or renew a session lease |
| `mcp.unmount` | `server` | Revoke tool availability |
| `mcp.status` | Optional `server` | Read declared-server leases and effective mode |

Manifest default/per-server modes remain the baseline. A live lease's requested
mode overrides them; the saved per-plugin user override takes precedence over
both. Mounting never enables a disabled package or grants host access. Version 1
responses include `applies_at: "next_tool_assembly"`, each normalized server ID,
effective mode and lease state (`mounted`, `requested_mode`, `remaining_ms`).
Catalog changes appear when the Runtime next assembles a turn's tool registry.
Revocation/expiry also reject calls through existing proxies and app/native tool
calls. Restoring a relay checkpoint cannot resurrect an expired lease.

Leases survive connection refresh in the same process and disappear on restart.
Expiry leaves tools unmounted until renewed. Disable/uninstall revoke leases;
re-enablement starts from manifest defaults. Tool leases do not start or stop
transport processes, change permissions, locale or MCP Apps visibility metadata. A transport
can stay connected so a controlling script or hook can renew a lease. The
package owns periodic scheduling and bounded recovery through declared hooks
or a supervised daemon; stop renewal on cancel and retain an available control
path when leasing the package's own tools.
