#!/usr/bin/env bun
/**
 * Scaffold a new Agent Plugins 1.0.0 package from a bundled template.
 *
 * Usage:
 *   bun scripts/new-plugin.mjs <name> [--template <template>] [--dir <parent>]
 *                                    [--description <text>]
 *   bun scripts/new-plugin.mjs --list
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatReport, hasFailures, inspectPackage, isPluginName } from "./lib/plugin-spec.mjs";

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatesRoot = path.join(kitRoot, "templates");
const DEFAULT_TEMPLATE = "minimal";

function usage() {
  return [
    "Usage: bun scripts/new-plugin.mjs <name> [options]",
    "       bun scripts/new-plugin.mjs --list",
    "",
    "Options:",
    `  --template <name>   template to copy (default: ${DEFAULT_TEMPLATE})`,
    "  --dir <parent>      parent directory for the new package (default: cwd)",
    "  --description <t>   manifest description for the new package",
    "",
    "The name must be 1-64 lowercase letters, digits, dots, or single hyphens.",
  ].join("\n");
}

function availableTemplates() {
  if (!existsSync(templatesRoot)) return [];
  return readdirSync(templatesRoot)
    .filter((entry) => statSync(path.join(templatesRoot, entry)).isDirectory())
    .sort();
}

function describeTemplate(name) {
  const manifestPath = path.join(templatesRoot, name, "plugin.json");
  if (!existsSync(manifestPath)) return "";
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    return manifest.description ?? "";
  } catch {
    return "";
  }
}

function parseArguments(argv) {
  const options = { name: null, template: DEFAULT_TEMPLATE, dir: process.cwd(), description: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--list") {
      options.list = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--template" || argument === "--dir" || argument === "--description") {
      const value = argv[index + 1];
      if (value === undefined) return { error: `Missing value for ${argument}` };
      index += 1;
      if (argument === "--template") options.template = value;
      if (argument === "--dir") options.dir = value;
      if (argument === "--description") options.description = value;
      continue;
    }
    if (argument.startsWith("-")) return { error: `Unknown option: ${argument}` };
    if (options.name !== null) return { error: `Unexpected argument: ${argument}` };
    options.name = argument;
  }
  return options;
}

function directoryIsEmpty(directory) {
  return readdirSync(directory).length === 0;
}

function writeManifest(targetDirectory, name, description) {
  const manifestPath = path.join(targetDirectory, "plugin.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
  manifest.name = name;
  manifest.version = "0.1.0";
  manifest.description = description;
  const i18n = manifest.extensions?.openagent?.i18n;
  if (i18n) {
    // The scaffold starts in its declared default language. Authors translate
    // descriptions before advertising more languages.
    for (const messages of Object.values(i18n.translations)) {
      messages.display_name = name;
      messages.description = description;
    }
  }
  delete manifest.repository;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function main(argv) {
  const options = parseArguments(argv);
  if (options.error) {
    console.error(options.error);
    console.error(usage());
    return 2;
  }
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (options.list) {
    console.log("Available templates:");
    for (const template of availableTemplates()) {
      console.log(`  ${template.padEnd(16)} ${describeTemplate(template)}`);
    }
    return 0;
  }
  if (options.name === null) {
    console.error(usage());
    return 2;
  }
  if (!isPluginName(options.name)) {
    console.error(
      `Invalid plugin name '${options.name}'. Use 1-64 lowercase letters, digits, dots, or single hyphens, starting and ending with a letter or digit.`,
    );
    return 2;
  }
  const templateDirectory = path.join(templatesRoot, options.template);
  if (!existsSync(templateDirectory) || !statSync(templateDirectory).isDirectory()) {
    console.error(
      `Unknown template '${options.template}'. Available: ${availableTemplates().join(", ")}`,
    );
    return 2;
  }

  const parentDirectory = path.resolve(options.dir);
  if (!existsSync(parentDirectory)) {
    mkdirSync(parentDirectory, { recursive: true });
  }
  const targetDirectory = path.join(parentDirectory, options.name);
  if (existsSync(targetDirectory)) {
    if (!statSync(targetDirectory).isDirectory() || !directoryIsEmpty(targetDirectory)) {
      console.error(`Refusing to overwrite existing path: ${targetDirectory}`);
      return 1;
    }
  }

  cpSync(templateDirectory, targetDirectory, { recursive: true });
  writeManifest(
    targetDirectory,
    options.name,
    options.description ?? `${options.name} plugin.`,
  );

  const report = inspectPackage(targetDirectory);
  console.log(`Created ${targetDirectory} from template '${options.template}'.`);
  console.log(formatReport(report, "Generated package"));
  if (hasFailures(report)) {
    console.error("The generated package failed validation. Fix the diagnostics above.");
    return 1;
  }
  console.log("");
  console.log("Next steps:");
  console.log("  1. Replace the generated description in plugin.json.");
  console.log("  2. Rename the bundled Skill directories and their frontmatter name.");
  console.log("  3. Add your repository URL when you are ready to publish.");
  console.log("  4. Install the directory in OpenAgent through Settings -> Plugins -> Install.");
  return 0;
}

process.exitCode = main(process.argv.slice(2));
