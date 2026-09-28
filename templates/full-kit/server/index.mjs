#!/usr/bin/env node
/**
 * The smallest useful MCP stdio server: one stateless tool, no dependencies.
 */

const DEFAULT_PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "current_time",
    description: "Return the current local time as an ISO 8601 string.",
    inputSchema: { type: "object", properties: {} },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function handle({ id, method, params }) {
  switch (method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "clock", version: "1.0.0" },
        },
      });
      return;
    case "notifications/initialized":
      return;
    case "ping":
      send({ jsonrpc: "2.0", id, result: {} });
      return;
    case "tools/list":
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      return;
    case "tools/call":
      send({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: new Date().toISOString() }],
          isError: false,
        },
      });
      return;
    default:
      if (id === undefined) return;
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf("\n");
  while (index !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line !== "") {
      try {
        handle(JSON.parse(line));
      } catch (error) {
        process.stderr.write(`clock server: ${error.message}\n`);
      }
    }
    index = buffer.indexOf("\n");
  }
});
process.stdin.on("end", () => process.exit(0));
