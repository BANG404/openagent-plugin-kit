/**
 * Shared rules for Agent Plugins 1.0.0 packages.
 *
 * These helpers mirror the OpenAgent runtime loader. They are intentionally
 * dependency-free so the kit can validate a package with nothing but Bun.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";

export const PLUGIN_SCHEMA_1_0 =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
export const MCP_SCHEMA_1_0 =
  "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

export const MANIFEST_FIELDS = [
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
];

export const SIDEBAR_CAPABILITIES = [
  "workspace",
  "conversation",
  "branch",
  "files",
  "locale",
  "theme",
];

export const SIDEBAR_SCOPES = ["global", "workspace", "conversation"];

export const COMMAND_ARGUMENTS = ["none", "required_text"];

export const LIFECYCLE_EVENTS = [
  "session_start",
  "session_end",
  "user_prompt_submit",
  "subagent_start",
  "subagent_stop",
  "permission_request",
  "pre_compact",
  "post_compact",
  "stop",
  "interrupt",
  "before_model",
  "after_model",
  "before_tool",
  "after_tool",
];

export const MANIFEST_FILE = "plugin.json";
export const MCP_FILE = "mcp.json";
export const SKILLS_DIR = "skills";
export const SKILL_FILE = "SKILL.md";

const PLUGIN_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MESSAGE_TAG_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

/** A portable plugin id: lowercase letters, digits, dot, single hyphens. */
export function isPluginName(value) {
  if (typeof value !== "string") return false;
  const length = Buffer.byteLength(value, "utf8");
  if (length < 1 || length > 64) return false;
  if (!PLUGIN_NAME_PATTERN.test(value)) return false;
  return !value.includes("--") && !value.includes("..");
}

/** A bundled Skill name: lowercase letters, digits, single hyphens. */
export function isSkillName(value) {
  if (typeof value !== "string") return false;
  const length = Buffer.byteLength(value, "utf8");
  if (length < 1 || length > 64) return false;
  if (!SKILL_NAME_PATTERN.test(value)) return false;
  return !value.includes("--");
}

/** A message policy tag: like a plugin name, but underscores are allowed. */
export function isMessageTag(value) {
  if (typeof value !== "string") return false;
  const length = Buffer.byteLength(value, "utf8");
  if (length < 1 || length > 64) return false;
  if (!MESSAGE_TAG_PATTERN.test(value)) return false;
  return !value.includes("--") && !value.includes("__") && !value.includes("..");
}

/** A package-relative component path with no escape from the package root. */
export function isComponentPath(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.includes(":")) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  if (path.isAbsolute(value)) return false;
  return !value.split(/[\\/]/).some((part) => part === "..");
}

export function readJsonFile(filePath) {
  const text = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

/**
 * Resolve a path inside a package root, refusing reads that leave the root
 * through `..`, an absolute path, or a symlink/junction.
 *
 * Returns `{ ok: true, path }` or `{ ok: false, reason }`.
 */
export function resolveWithinRoot(root, relativePath) {
  if (!isComponentPath(relativePath)) {
    return { ok: false, reason: `'${relativePath}' is not a package-relative path` };
  }
  const candidate = path.join(root, relativePath);
  if (!existsSync(candidate)) {
    return { ok: false, reason: `'${relativePath}' does not exist` };
  }
  let resolved;
  try {
    resolved = realpathSync(candidate);
  } catch (error) {
    return { ok: false, reason: `'${relativePath}' could not be resolved (${error.message})` };
  }
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { ok: false, reason: `'${relativePath}' resolves outside the plugin root` };
  }
  return { ok: true, path: resolved };
}

/** Resolve a component path that must name a regular file inside the root. */
export function resolveContainedFile(root, relativePath) {
  const resolved = resolveWithinRoot(root, relativePath);
  if (!resolved.ok) return resolved;
  if (!statSync(resolved.path).isFile()) {
    return { ok: false, reason: `'${relativePath}' is not a regular file` };
  }
  return resolved;
}

/** Resolve a component directory that must be inside the root. */
export function resolveContainedDirectory(root, relativePath) {
  const resolved = resolveWithinRoot(root, relativePath);
  if (!resolved.ok) return resolved;
  if (!statSync(resolved.path).isDirectory()) {
    return { ok: false, reason: `'${relativePath}' is not a directory` };
  }
  return resolved;
}

function stripQuotes(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function plainScalar(value) {
  const comment = value.search(/\s#/);
  const trimmed = (comment === -1 ? value : value.slice(0, comment)).trim();
  return stripQuotes(trimmed);
}

function isBlockScalar(value) {
  return /^[|>][+-]?\d*$/.test(value.trim());
}

function indentation(line) {
  return line.length - line.trimStart().length;
}

function parseBlockScalar(lines, startIndex, indicator) {
  const body = [];
  let index = startIndex;
  let blockIndent = null;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") {
      body.push("");
      continue;
    }
    const indent = indentation(line);
    if (indent === 0) break;
    if (blockIndent === null) blockIndent = indent;
    if (indent < blockIndent) break;
    body.push(line.slice(blockIndent));
  }
  while (body.length > 0 && body[body.length - 1] === "") body.pop();
  const folded = indicator.startsWith(">");
  const text = folded ? body.join(" ").replace(/\s+/g, " ").trim() : body.join("\n");
  const chomped = text.replace(/\n+$/, "");
  const keepTrailing = indicator.endsWith("+");
  return { value: keepTrailing ? `${chomped}\n` : chomped, nextIndex: index };
}

function parseNestedBlock(lines, startIndex) {
  const entries = [];
  let index = startIndex;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (indentation(line) === 0) break;
    const match = /^\s+([A-Za-z0-9_.-]+):(.*)$/.exec(line);
    if (match) {
      entries.push([match[1], plainScalar(match[2])]);
    }
  }
  return { entries, nextIndex: index };
}

/**
 * Parse the small YAML subset a SKILL.md frontmatter realistically uses:
 * top-level `key: value` pairs, nested string maps, and block scalars.
 *
 * Returns `{ ok: true, data }` or `{ ok: false, error }`.
 */
export function parseSkillFrontmatter(content) {
  const normalized = content.replace(/^\uFEFF/, "").trimStart();
  const lines = normalized.split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "---") {
    return { ok: false, error: "SKILL.md must begin with YAML frontmatter" };
  }
  let closed = false;
  const yamlLines = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "---" || line.trim() === "...") {
      closed = true;
      break;
    }
    yamlLines.push(line);
  }
  if (!closed) return { ok: false, error: "SKILL.md frontmatter is not closed" };

  const data = {};
  for (let index = 0; index < yamlLines.length; index += 1) {
    const line = yamlLines[index];
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (indentation(line) !== 0) continue;
    const match = /^([A-Za-z0-9_.-]+):(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2].trim();
    if (rawValue === "") {
      const nested = parseNestedBlock(yamlLines, index + 1);
      if (nested.entries.length > 0) {
        data[key] = Object.fromEntries(nested.entries);
      } else {
        data[key] = "";
      }
      index = nested.nextIndex - 1;
      continue;
    }
    if (isBlockScalar(rawValue)) {
      const block = parseBlockScalar(yamlLines, index + 1, rawValue);
      data[key] = block.value;
      index = block.nextIndex - 1;
      continue;
    }
    let value = plainScalar(rawValue);
    if (value !== "") {
      const continuation = [];
      let lookahead = index + 1;
      while (lookahead < yamlLines.length) {
        const next = yamlLines[lookahead];
        if (next.trim() === "" || indentation(next) === 0) break;
        if (/^\s+[A-Za-z0-9_.-]+:/.test(next)) break;
        continuation.push(next.trim());
        lookahead += 1;
      }
      if (continuation.length > 0) {
        value = `${value} ${continuation.join(" ")}`;
        index = lookahead - 1;
      }
    }
    data[key] = value;
  }
  return { ok: true, data };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value) {
  if (value === undefined) return { ok: true, values: [] };
  if (!Array.isArray(value)) return { ok: false, error: "must be an array" };
  if (value.some((entry) => typeof entry !== "string")) {
    return { ok: false, error: "must contain only strings" };
  }
  return { ok: true, values: value };
}

function unknownKeys(object, allowed) {
  return Object.keys(object).filter((key) => !allowed.includes(key));
}

function push(report, level, message) {
  report.diagnostics.push({ level, message });
}

function inspectExtensions(root, report, openagent) {
  if (openagent.runtime !== undefined) {
    if (!["chat-groups", "goal", "graph", "cua-driver"].includes(openagent.runtime)) {
      push(
        report,
        "warning",
        "Ignored plugin runtime binding: expected chat-groups, goal, graph, or cua-driver",
      );
    } else {
      report.runtime = openagent.runtime;
    }
  }
  const capabilities = stringArray(openagent.capabilities);
  if (capabilities.ok) {
    report.capabilities = capabilities.values;
  } else {
    push(report, "warning", `Ignored plugin capabilities: ${capabilities.error}`);
  }

  if (openagent.commands !== undefined) {
    if (!Array.isArray(openagent.commands)) {
      push(report, "warning", "Disabled plugin commands: 'commands' must be an array");
    } else {
      openagent.commands.forEach((entry, index) => {
        const reason = validateCommand(entry);
        if (reason) {
          push(report, "warning", `Skipped plugin command ${index}: ${reason}`);
          return;
        }
        const id = entry.id;
        report.commands.push({
          id: `plugin:${report.name}:${id}`,
          name: `${report.name}:${id}`,
          label: entry.label,
          description: entry.description,
          argument: entry.argument,
          command: entry.command,
          timeoutSecs: entry.timeout_secs ?? 30,
        });
      });
    }
  }

  if (openagent.message_policies !== undefined) {
    if (!Array.isArray(openagent.message_policies)) {
      push(report, "warning", "Disabled message policies: 'message_policies' must be an array");
    } else {
      openagent.message_policies.forEach((entry, index) => {
        const reason = validateMessagePolicy(entry);
        if (reason) {
          push(report, "warning", `Skipped message policy ${index}: ${reason}`);
          return;
        }
        report.messagePolicies.push({
          tag: `plugin:${report.name}:${entry.tag}`,
          userVisible: entry.user_visible,
          modelVisible: entry.model_visible,
        });
      });
    }
  }

  if (openagent.daemon !== undefined) {
    const daemon = openagent.daemon;
    const unknown = isPlainObject(daemon)
      ? unknownKeys(daemon, ["command", "args", "transport", "capabilities"])
      : ["daemon"];
    const args = isPlainObject(daemon) ? daemon.args ?? [] : [];
    const capabilities = isPlainObject(daemon) ? daemon.capabilities ?? [] : [];
    const valid =
      isPlainObject(daemon) &&
      unknown.length === 0 &&
      isComponentPath(daemon.command) &&
      Array.isArray(args) &&
      args.every((value) => typeof value === "string") &&
      ["stdio", "socket"].includes(daemon.transport ?? "stdio") &&
      Array.isArray(capabilities) &&
      capabilities.every((value) => typeof value === "string");
    if (!valid) {
      push(
        report,
        "warning",
        "Disabled plugin daemon: expected command, string args/capabilities, and stdio or socket transport",
      );
    } else {
      report.daemon = {
        command: daemon.command,
        args,
        transport: daemon.transport ?? "stdio",
        capabilities,
      };
    }
  }

  if (openagent.sidebar !== undefined) {
    if (!Array.isArray(openagent.sidebar)) {
      push(report, "warning", "Disabled sidebar: 'sidebar' must be an array");
    } else {
      openagent.sidebar.forEach((entry, index) => {
        const reason = validateSidebar(entry);
        if (reason) {
          push(report, "warning", `Skipped sidebar view ${index}: ${reason}`);
          return;
        }
        report.sidebar.push({
          id: `plugin:${report.name}:${entry.id}`,
          title: entry.title,
          entry: entry.entry,
          scope: entry.scope ?? "global",
          icon: entry.icon ?? null,
          capabilities: entry.capabilities ?? [],
        });
      });
    }
  }

  if (openagent.automation !== undefined) {
    if (!Array.isArray(openagent.automation)) {
      push(report, "warning", "Disabled automation: 'automation' must be an array");
    } else {
      openagent.automation.forEach((entry, index) => {
        const reason = validateAutomation(entry);
        if (reason) {
          push(report, "warning", `Skipped automation hook ${index}: ${reason}`);
          return;
        }
        report.automation.push({
          id: `plugin:${report.name}:${entry.id}`,
          event: entry.event,
          matcher: entry.matcher ?? "",
          command: entry.command,
          timeoutSecs: entry.timeout_secs ?? 30,
        });
      });
    }
  }

  report.commands = report.commands.filter((command) => {
    if (resolveContainedFile(root, command.command).ok) return true;
    push(
      report,
      "warning",
      `Skipped plugin command '${command.name}': executable is missing or outside the plugin root`,
    );
    return false;
  });
  report.sidebar = report.sidebar.filter((view) => {
    if (resolveContainedFile(root, view.entry).ok) return true;
    push(
      report,
      "warning",
      `Skipped plugin sidebar '${view.id}': entry is missing or outside the plugin root`,
    );
    return false;
  });
  report.automation = report.automation.filter((hook) => {
    if (resolveContainedFile(root, hook.command).ok) return true;
    push(
      report,
      "warning",
      `Skipped automation hook '${hook.id}': command is missing or outside the plugin root`,
    );
    return false;
  });
  if (report.daemon && !resolveContainedFile(root, report.daemon.command).ok) {
    push(
      report,
      "warning",
      `Disabled plugin daemon: command '${report.daemon.command}' is missing or outside the plugin root`,
    );
    report.daemon = null;
  }
}

function validateCommand(entry) {
  if (!isPlainObject(entry)) return "entry must be an object";
  const unknown = unknownKeys(entry, [
    "id",
    "label",
    "description",
    "argument",
    "command",
    "timeout_secs",
  ]);
  if (unknown.length > 0) return `unknown field '${unknown[0]}'`;
  if (!isPluginName(entry.id)) return "id must be 1-64 lowercase letters, digits, or single hyphens";
  if (typeof entry.label !== "string" || entry.label.trim() === "") return "label is required";
  if (typeof entry.description !== "string" || entry.description.trim() === "") {
    return "description is required";
  }
  if (!COMMAND_ARGUMENTS.includes(entry.argument)) {
    return "argument must be 'none' or 'required_text'";
  }
  if (!isComponentPath(entry.command)) return "command must be a package-relative path";
  const timeout = entry.timeout_secs ?? 30;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 300) {
    return "timeout_secs must be an integer from 1 to 300";
  }
  return null;
}

function validateMessagePolicy(entry) {
  if (!isPlainObject(entry)) return "entry must be an object";
  const unknown = unknownKeys(entry, ["tag", "user_visible", "model_visible"]);
  if (unknown.length > 0) return `unknown field '${unknown[0]}'`;
  if (!isMessageTag(entry.tag)) {
    return "tag must be 1-64 lowercase letters, digits, '_', '-', or '.'";
  }
  if (typeof entry.user_visible !== "boolean" || typeof entry.model_visible !== "boolean") {
    return "user_visible and model_visible must be booleans";
  }
  if (!entry.user_visible && !entry.model_visible) {
    return "at least one audience must be true";
  }
  return null;
}

function validateSidebar(entry) {
  if (!isPlainObject(entry)) return "entry must be an object";
  const unknown = unknownKeys(entry, [
    "id",
    "title",
    "entry",
    "scope",
    "icon",
    "capabilities",
  ]);
  if (unknown.length > 0) return `unknown field '${unknown[0]}'`;
  if (!isPluginName(entry.id)) return "id must be 1-64 lowercase letters, digits, or single hyphens";
  if (typeof entry.title !== "string" || entry.title.trim() === "") return "title is required";
  if (!isComponentPath(entry.entry)) return "entry must be a package-relative path";
  const scope = entry.scope ?? "global";
  if (!SIDEBAR_SCOPES.includes(scope)) return `unsupported scope '${scope}'`;
  if (entry.icon !== undefined && (typeof entry.icon !== "string" || entry.icon.trim() === "")) {
    return "icon must be a non-empty string";
  }
  if (entry.capabilities !== undefined) {
    if (!Array.isArray(entry.capabilities)) return "capabilities must be an array";
    const invalid = entry.capabilities.find((value) => !SIDEBAR_CAPABILITIES.includes(value));
    if (invalid !== undefined) return `unsupported capability '${invalid}'`;
  }
  return null;
}

function validateAutomation(entry) {
  if (!isPlainObject(entry)) return "entry must be an object";
  const unknown = unknownKeys(entry, [
    "id",
    "event",
    "matcher",
    "command",
    "timeout_secs",
  ]);
  if (unknown.length > 0) return `unknown field '${unknown[0]}'`;
  if (!isPluginName(entry.id)) return "id must be 1-64 lowercase letters, digits, or single hyphens";
  if (!LIFECYCLE_EVENTS.includes(entry.event)) {
    return `unsupported event '${entry.event ?? ""}'`;
  }
  if (entry.matcher !== undefined && typeof entry.matcher !== "string") {
    return "matcher must be a string";
  }
  if (!isComponentPath(entry.command)) return "command must be a package-relative path";
  const timeout = entry.timeout_secs ?? 30;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 300) {
    return "timeout_secs must be an integer from 1 to 300";
  }
  return null;
}

function skillViolation(dirName, data) {
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!isSkillName(name)) {
    return `name '${name}' must be 1-64 lowercase letters, digits, or single hyphens`;
  }
  if (name !== dirName) {
    return `name '${name}' must match its directory name '${dirName}'`;
  }
  if (typeof data.description !== "string") {
    return "invalid SKILL.md frontmatter (description must be a string)";
  }
  const descriptionLength = [...data.description.trim()].length;
  if (descriptionLength < 1 || descriptionLength > 1024) {
    return `description must be 1-1024 characters but is ${descriptionLength}`;
  }
  if (data.compatibility !== undefined && data.compatibility !== null) {
    if (typeof data.compatibility !== "string") {
      return "invalid SKILL.md frontmatter (compatibility must be a string)";
    }
    const compatibilityLength = [...data.compatibility.trim()].length;
    if (compatibilityLength < 1 || compatibilityLength > 500) {
      return `compatibility must be 1-500 characters but is ${compatibilityLength}`;
    }
  }
  return null;
}

function inspectSkills(root, report) {
  const skillsPath = path.join(root, SKILLS_DIR);
  if (!existsSync(skillsPath)) return;
  const resolved = resolveContainedDirectory(root, SKILLS_DIR);
  if (!resolved.ok) {
    push(report, "warning", `Disabled skills: ${resolved.reason}`);
    return;
  }
  let entries;
  try {
    entries = readdirSync(resolved.path);
  } catch (error) {
    push(report, "warning", `Disabled skills: failed to read skills/ (${error.message})`);
    return;
  }
  for (const directoryName of entries) {
    const skillDirectory = path.join(resolved.path, directoryName);
    let stats;
    try {
      stats = statSync(skillDirectory);
    } catch {
      continue;
    }
    if (!stats.isDirectory()) continue;
    const skillFile = path.join(skillDirectory, SKILL_FILE);
    if (!existsSync(skillFile)) {
      push(report, "notice", `Ignored '${directoryName}': no ${SKILL_FILE} in skills/${directoryName}/`);
      continue;
    }
    const contained = resolveContainedFile(root, path.relative(root, skillFile));
    if (!contained.ok) {
      push(report, "warning", `Skipped skill '${directoryName}': ${contained.reason}`);
      continue;
    }
    let content;
    try {
      content = readFileSync(contained.path, "utf8");
    } catch (error) {
      push(report, "warning", `Skipped skill '${directoryName}': ${error.message}`);
      continue;
    }
    const frontmatter = parseSkillFrontmatter(content);
    if (!frontmatter.ok) {
      push(report, "warning", `Skipped skill '${directoryName}': ${frontmatter.error}`);
      continue;
    }
    const violation = skillViolation(directoryName, frontmatter.data);
    if (violation) {
      push(report, "warning", `Skipped skill '${directoryName}': ${violation}`);
      continue;
    }
    report.skills.push({
      name: frontmatter.data.name,
      description: frontmatter.data.description,
      directory: directoryName,
      path: skillDirectory,
      compatibility: frontmatter.data.compatibility ?? null,
    });
  }
  report.skills.sort((left, right) => left.name.localeCompare(right.name));
}

function validateMcpServer(root, value) {
  if (!isPlainObject(value)) return "server entry must be an object";
  const type = value.type;
  if (typeof type !== "string") return "server entry is missing string field 'type'";

  if (type === "stdio") {
    const unknown = unknownKeys(value, ["type", "command", "args", "env", "cwd"]);
    if (unknown.length > 0) return `stdio entry contains unknown field '${unknown[0]}'`;
    if (typeof value.command !== "string") {
      return "stdio entry is missing string field 'command'";
    }
    if (value.command.length === 0 || /\s/.test(value.command)) {
      return "stdio command must be one executable token";
    }
    if (value.command.startsWith("./")) {
      const resolved = resolveContainedFile(root, value.command.slice(2));
      if (!resolved.ok) return `plugin-relative command ${resolved.reason}`;
    } else if (value.command.split(/[\\/]/).length !== 1) {
      return "command must be bare or begin with './'";
    }
    if (value.args !== undefined) {
      if (!Array.isArray(value.args) || value.args.some((item) => typeof item !== "string")) {
        return "args must be an array of strings";
      }
    }
    if (value.env !== undefined) {
      if (!isPlainObject(value.env) || Object.values(value.env).some((item) => typeof item !== "string")) {
        return "env must be an object of strings";
      }
      const reserved = Object.keys(value.env).find(
        (key) => key.toUpperCase() === "PLUGIN_ROOT" || key.toUpperCase() === "PLUGIN_DATA",
      );
      if (reserved) return `env must not override ${reserved}`;
    }
    if (value.cwd !== undefined) {
      if (typeof value.cwd !== "string") return "cwd must be a string";
      const cwd = value.cwd;
      if (cwd.startsWith("./")) {
        const target = resolveContainedDirectory(root, cwd.slice(2));
        if (!target.ok) return `cwd ${target.reason}`;
      } else if (cwd === "${PLUGIN_ROOT}" || cwd.startsWith("${PLUGIN_ROOT}/")) {
        const relative = cwd.slice("${PLUGIN_ROOT}".length).replace(/^[\\/]/, "");
        if (relative !== "") {
          const target = resolveContainedDirectory(root, relative);
          if (!target.ok) return `cwd ${target.reason}`;
        }
      } else if (cwd !== "${PLUGIN_DATA}" && !cwd.startsWith("${PLUGIN_DATA}/")) {
        return "cwd must start with './', '${PLUGIN_ROOT}', or '${PLUGIN_DATA}'";
      }
    }
    return null;
  }

  if (type === "streamable-http") {
    const unknown = unknownKeys(value, ["type", "url", "headers"]);
    if (unknown.length > 0) return `streamable-http entry contains unknown field '${unknown[0]}'`;
    if (typeof value.url !== "string") {
      return "streamable-http entry is missing string field 'url'";
    }
    let parsed;
    try {
      parsed = new URL(value.url);
    } catch {
      return "url must be an absolute URL";
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
      return "url must use HTTPS except for literal loopback endpoints";
    }
    if (value.headers !== undefined) {
      if (!isPlainObject(value.headers) || Object.values(value.headers).some((item) => typeof item !== "string")) {
        return "headers must be an object of strings";
      }
    }
    return null;
  }

  if (type === "sse") return "legacy SSE transport is not supported";
  return `unsupported transport '${type}'`;
}

function inspectMcp(root, report) {
  const mcpPath = path.join(root, MCP_FILE);
  if (!existsSync(mcpPath)) return;
  const contained = resolveContainedFile(root, MCP_FILE);
  if (!contained.ok) {
    push(report, "warning", `Disabled MCP: ${contained.reason}`);
    return;
  }
  let document;
  try {
    document = readJsonFile(contained.path);
  } catch (error) {
    push(report, "warning", `Disabled MCP: invalid mcp.json (${error.message})`);
    return;
  }
  if (!isPlainObject(document)) {
    push(report, "warning", "Disabled MCP: mcp.json must contain an object");
    return;
  }
  if (unknownKeys(document, ["$schema", "mcpServers"]).length > 0 || document.$schema !== MCP_SCHEMA_1_0) {
    push(report, "warning", "Disabled MCP: invalid or unsupported top-level mcp.json");
    return;
  }
  if (!isPlainObject(document.mcpServers)) {
    push(report, "warning", "Disabled MCP: missing object field 'mcpServers'");
    return;
  }
  for (const [serverName, value] of Object.entries(document.mcpServers)) {
    const reason = validateMcpServer(root, value);
    if (reason) {
      push(report, "warning", `Skipped MCP server '${serverName}': ${reason}`);
      continue;
    }
    report.mcpServers.push({ name: serverName, transport: value.type });
  }
}

function inspectManifest(root, report) {
  const manifestPath = path.join(root, MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    push(report, "error", "plugin.json is missing");
    return false;
  }
  const contained = resolveContainedFile(root, MANIFEST_FILE);
  if (!contained.ok) {
    push(report, "error", `${MANIFEST_FILE} ${contained.reason}`);
    return false;
  }
  let value;
  try {
    value = readJsonFile(contained.path);
  } catch (error) {
    push(report, "error", `plugin.json is not valid JSON (${error.message})`);
    return false;
  }
  if (!isPlainObject(value)) {
    push(report, "error", "plugin.json must contain a JSON object");
    return false;
  }
  if (typeof value.$schema !== "string") {
    push(report, "error", "plugin.json is missing required '$schema'");
    return false;
  }
  if (value.$schema !== PLUGIN_SCHEMA_1_0) {
    push(report, "error", `unsupported Agent Plugins schema: ${value.$schema}`);
    return false;
  }
  if (typeof value.name !== "string") {
    push(report, "error", "plugin.json is missing required 'name'");
    return false;
  }
  if (!isPluginName(value.name)) {
    push(report, "error", "plugin name must follow the Agent Plugins 1.0 naming rules");
    return false;
  }
  report.name = value.name;

  for (const key of ["version", "description", "homepage", "repository", "license"]) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== "string") {
      push(report, "error", `plugin.json field '${key}' must be a string`);
      return false;
    }
  }
  report.version = value.version ?? null;
  report.description = value.description ?? null;

  if (value.author !== undefined) {
    const authorInvalid =
      !isPlainObject(value.author) ||
      unknownKeys(value.author, ["name", "email", "url"]).length > 0 ||
      Object.values(value.author).some((entry) => typeof entry !== "string");
    if (authorInvalid) {
      push(report, "error", "plugin.json field 'author' contains an invalid member");
      return false;
    }
  }
  if (value.keywords !== undefined) {
    if (!Array.isArray(value.keywords)) {
      push(report, "error", "plugin.json field 'keywords' must be an array");
      return false;
    }
    if (value.keywords.some((entry) => typeof entry !== "string")) {
      push(report, "error", "plugin.json field 'keywords' must contain only strings");
      return false;
    }
  }

  for (const key of unknownKeys(value, MANIFEST_FIELDS)) {
    push(report, "warning", `Ignored unknown plugin.json field '${key}'`);
  }
  if (value.extensions === undefined) return true;
  if (!isPlainObject(value.extensions)) {
    push(report, "warning", "Ignored non-object plugin.json field 'extensions'");
    return true;
  }
  if (value.extensions.openagent === undefined) return true;
  if (!isPlainObject(value.extensions.openagent)) {
    push(report, "warning", "Ignored non-object extensions.openagent");
    return true;
  }
  inspectExtensions(root, report, value.extensions.openagent);
  return true;
}

/**
 * Inspect a package directory and return a report with normalized components
 * and loader-parity diagnostics.
 */
export function inspectPackage(packageDir) {
  const report = {
    requestedRoot: path.resolve(packageDir),
    root: null,
    name: null,
    version: null,
    description: null,
    capabilities: [],
    skills: [],
    mcpServers: [],
    commands: [],
    sidebar: [],
    automation: [],
    messagePolicies: [],
    daemon: null,
    runtime: null,
    diagnostics: [],
  };
  if (!existsSync(report.requestedRoot)) {
    push(report, "error", `package directory does not exist: ${report.requestedRoot}`);
    return report;
  }
  let stats;
  try {
    stats = statSync(report.requestedRoot);
  } catch (error) {
    push(report, "error", `package root is unreadable (${error.message})`);
    return report;
  }
  if (!stats.isDirectory()) {
    push(report, "error", "package root must be a directory");
    return report;
  }
  report.root = realpathSync(report.requestedRoot);
  if (!inspectManifest(report.root, report)) return report;
  inspectSkills(report.root, report);
  inspectMcp(report.root, report);
  return report;
}

export function countDiagnostics(report, level) {
  return report.diagnostics.filter((entry) => entry.level === level).length;
}

/** True when the package would fail to load as declared. */
export function hasFailures(report) {
  return report.diagnostics.some((entry) => entry.level === "error" || entry.level === "warning");
}

function describeComponents(report) {
  const parts = [
    `${report.skills.length} skill(s)`,
    `${report.mcpServers.length} MCP server(s)`,
    `${report.commands.length} command(s)`,
    `${report.sidebar.length} sidebar view(s)`,
    `${report.automation.length} hook(s)`,
    `${report.messagePolicies.length} message policy(ies)`,
    `${report.daemon ? 1 : 0} daemon`,
  ];
  return parts.join(", ");
}

/** Render a human-readable validation report. */
export function formatReport(report, label) {
  const heading = label ?? report.root ?? report.requestedRoot;
  const lines = [heading];
  if (report.name) {
    const version = report.version ? ` version ${report.version}` : "";
    lines.push(`  ${report.name}${version}`);
  }
  lines.push(`  ${describeComponents(report)}`);
  if (report.diagnostics.length === 0) {
    lines.push("  OK");
    return lines.join("\n");
  }
  for (const level of ["error", "warning", "notice"]) {
    for (const diagnostic of report.diagnostics) {
      if (diagnostic.level !== level) continue;
      lines.push(`  ${level}: ${diagnostic.message}`);
    }
  }
  const errors = countDiagnostics(report, "error");
  const warnings = countDiagnostics(report, "warning");
  lines.push(
    hasFailures(report)
      ? `  FAILED (${errors} error(s), ${warnings} warning(s))`
      : `  OK with ${countDiagnostics(report, "notice")} notice(s)`,
  );
  return lines.join("\n");
}
