#!/usr/bin/env node
/**
 * Command executable: JSON request on stdin, prompt on stdout.
 */

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let request = {};
  try {
    request = JSON.parse(raw);
  } catch {
    request = {};
  }
  const pluginId = request.plugin_id ?? "this plugin";
  process.stdout.write(
    [
      `Describe what the plugin "${pluginId}" provides.`,
      "Name its Skills, MCP tools, slash commands, sidebar views, and automation hooks.",
      "If a component cannot be observed, say so instead of guessing.",
    ].join("\n"),
  );
});
