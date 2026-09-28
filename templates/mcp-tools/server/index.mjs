#!/usr/bin/env node
/**
 * A dependency-free MCP stdio server.
 *
 * The package's `mcp.json` starts this file with `node`, so nothing needs to be
 * installed. Requests arrive as newline-delimited JSON-RPC on stdin and
 * responses are written back the same way.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "notes";
const SERVER_VERSION = "1.0.0";

// PLUGIN_DATA is created and owned by OpenAgent; it survives uninstall.
const notesFile = process.env.NOTES_FILE ?? path.join(process.cwd(), "notes.json");

const TOOLS = [
  {
    name: "notes_add",
    description: "Append a note to the plugin's persistent note store.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Note text to store" },
      },
      required: ["text"],
    },
  },
  {
    name: "notes_list",
    description: "List every stored note in insertion order.",
    inputSchema: { type: "object", properties: {} },
  },
];

function readNotes() {
  if (!existsSync(notesFile)) return [];
  try {
    const parsed = JSON.parse(readFileSync(notesFile, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeNotes(notes) {
  mkdirSync(path.dirname(notesFile), { recursive: true });
  writeFileSync(notesFile, `${JSON.stringify(notes, null, 2)}\n`, "utf8");
}

function callTool(name, args) {
  if (name === "notes_add") {
    const text = typeof args?.text === "string" ? args.text.trim() : "";
    if (text === "") throw new Error("notes_add requires a non-empty 'text' string");
    const notes = readNotes();
    notes.push({ text, createdAt: new Date().toISOString() });
    writeNotes(notes);
    return `Stored note ${notes.length}.`;
  }
  if (name === "notes_list") {
    const notes = readNotes();
    if (notes.length === 0) return "No notes stored.";
    return notes.map((note, index) => `${index + 1}. ${note.text}`).join("\n");
  }
  throw new Error(`Unknown tool: ${name}`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function handle(message) {
  const { id, method, params } = message;
  switch (method) {
    case "initialize":
      respond(id, {
        protocolVersion: params?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
      return;
    case "notifications/initialized":
      return;
    case "ping":
      respond(id, {});
      return;
    case "tools/list":
      respond(id, { tools: TOOLS });
      return;
    case "tools/call": {
      try {
        const text = callTool(params?.name, params?.arguments ?? {});
        respond(id, { content: [{ type: "text", text }], isError: false });
      } catch (error) {
        respond(id, { content: [{ type: "text", text: error.message }], isError: true });
      }
      return;
    }
    default:
      if (id === undefined) return;
      respondError(id, -32601, `Method not found: ${method}`);
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
        process.stderr.write(`${SERVER_NAME} server: ${error.message}\n`);
      }
    }
    index = buffer.indexOf("\n");
  }
});
process.stdin.on("end", () => process.exit(0));
