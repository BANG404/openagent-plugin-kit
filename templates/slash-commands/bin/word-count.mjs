#!/usr/bin/env node
/**
 * A portable plugin command.
 *
 * OpenAgent writes one JSON request to stdin containing `conversation_id`,
 * `branch_id`, `plugin_id`, `command`, `argument`, and the original `input`. Whatever this
 * process prints on stdout becomes the prompt for the model, so it must not be
 * empty. A non-zero exit discards the output.
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
    request = { input: raw };
  }

  const argument =
    typeof request.argument === "string" && request.argument.trim() !== ""
      ? request.argument.trim()
      : typeof request.input === "string"
        ? request.input.trim()
        : "";

  const words = argument.split(/\s+/).filter((word) => word !== "");
  const longest = words.reduce((best, word) => (word.length > best.length ? word : best), "");

  const prompt = [
    "Summarize the text below for the user.",
    "",
    `Reported totals: ${words.length} word(s). Longest word: ${longest || "(none)"}.`,
    "State the word count, then quote the longest word.",
    "",
    "Text:",
    argument || "(empty)",
  ].join("\n");

  process.stdout.write(prompt);
});
