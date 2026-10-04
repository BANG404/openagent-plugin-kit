#!/usr/bin/env bun
/**
 * Validate Agent Plugins 1.0.0 packages against the rules the OpenAgent
 * runtime loader enforces.
 *
 * Usage:
 *   bun scripts/validate-plugin.mjs <package-dir> [...]
 *   bun scripts/validate-plugin.mjs --all
 *   bun scripts/validate-plugin.mjs --all --json
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatReport, hasFailures, inspectPackage } from "./lib/plugin-spec.mjs";
import { normalizePluginLocale } from "../lib/plugin-i18n.mjs";

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatesRoot = path.join(kitRoot, "templates");

function usage() {
  return [
    "Usage: bun scripts/validate-plugin.mjs <package-dir> [...]",
    "       bun scripts/validate-plugin.mjs --all [--json]",
    "",
    "  --all    validate this kit and every directory under templates/",
    "  --json   print machine-readable output",
    "  --require-i18n   require a validated language declaration",
    "  --locales=<tags> require every comma-separated platform locale",
    "",
    "Exit status is 1 when any package has an error or warning.",
  ].join("\n");
}

function templateDirectories() {
  if (!existsSync(templatesRoot)) return [];
  return readdirSync(templatesRoot)
    .map((entry) => path.join(templatesRoot, entry))
    .filter((entry) => statSync(entry).isDirectory())
    .sort();
}

function main(argv) {
  const targets = [];
  let json = false;
  let requireI18n = false;
  let requiredLocales = [];
  for (const argument of argv) {
    if (argument === "--all") {
      targets.push({ label: "kit", directory: kitRoot });
      for (const directory of templateDirectories()) {
        targets.push({ label: `templates/${path.basename(directory)}`, directory });
      }
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--require-i18n") { requireI18n = true; continue; }
    if (argument.startsWith("--locales=")) {
      requiredLocales = argument.slice("--locales=".length).split(",");
      if (!requiredLocales.length || requiredLocales.some(value => !value)) throw new Error("--locales requires a non-empty comma-separated platform locale list");
      requiredLocales = requiredLocales.map(normalizePluginLocale);
      requireI18n = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      console.log(usage());
      return 0;
    }
    if (argument.startsWith("-")) {
      console.error(`Unknown option: ${argument}`);
      console.error(usage());
      return 2;
    }
    targets.push({ label: argument, directory: argument });
  }

  if (targets.length === 0) {
    console.error(usage());
    return 2;
  }

  const reports = [];
  let failed = false;
  for (const target of targets) {
    const report = inspectPackage(target.directory);
    if (requireI18n && !report.i18n) report.diagnostics.push({level:"error", message:"plugin must declare extensions.openagent.i18n"});
    else if (requiredLocales.some(locale => !report.i18n?.supported_locales.includes(locale.toLowerCase()))) report.diagnostics.push({level:"error", message:"official plugin is missing a platform locale"});
    reports.push({ label: target.label, report });
    if (hasFailures(report)) failed = true;
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: !failed,
          reports: reports.map(({ label, report }) => ({
            label,
            root: report.root ?? report.requestedRoot,
            name: report.name,
            version: report.version,
            i18n: report.i18n,
            ok: !hasFailures(report),
            components: {
              skills: report.skills.map((skill) => skill.name),
              mcpServers: report.mcpServers.map((server) => server.name),
              commands: report.commands.map((command) => command.name),
              sidebar: report.sidebar.map((view) => view.id),
              automation: report.automation.map((hook) => hook.id),
              messagePolicies: report.messagePolicies.map((policy) => policy.tag),
            },
            diagnostics: report.diagnostics,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    for (const { label, report } of reports) {
      console.log(formatReport(report, label));
    }
    console.log(failed ? "Validation failed." : "Validation passed.");
  }
  return failed ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
