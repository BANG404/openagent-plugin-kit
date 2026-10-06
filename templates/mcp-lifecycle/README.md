# MCP lease template

Two declared servers separate the always-available Direct control tools from
leased tools whose manifest baseline is Relay. `lease_set` and `lease_status`
exercise the generic bridge. `/plugin-id:mount relay 120` starts renewal;
`:unmount` revokes tools and stops renewal. A bounded `before_model` hook renews
active leases at each model cycle. No timer, hidden transport or new executable
is registered dynamically. Expiry while idle leaves tools unavailable until
renewed; Direct/Relay changes apply at the next tool assembly.
Renewal and command control share a lock; cancellation is saved before its
unmount request so a failed request cannot restart renewal.

Change the echo tool, translate metadata, and add cancellation-specific hooks
when your workflow owns longer-lived activity. Keep the control server available
and verify expiry, disablement, user overrides and stale-call rejection. Read
the kit's `docs/mcp-lifecycle.md` before extending this contract.
