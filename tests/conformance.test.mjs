import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { hasFailures, inspectPackage } from "../scripts/lib/plugin-spec.mjs";
import { kitRoot, makeTempDirectory, validManifest, writePackage } from "./helpers.mjs";

/**
 * The conformance corpus pins what the validator does with a manifest that is
 * subtly wrong, one case per file, so a change to the rules has to change a
 * reviewed fixture rather than only a line of code.
 *
 * Each fixture is a package that is built here and inspected the way
 * `validate-plugin.mjs` inspects one: `manifest` overrides the valid base
 * manifest, `omit` removes fields from it, `openagent` becomes
 * `extensions.openagent`, `mcp` becomes `mcp.json`, and `files` are written
 * verbatim so a component's executable exists.
 *
 * `expect.valid` is the load outcome, and it is the assertion that matters.
 * The validator rejects whatever the loader rejects, plus the declarations the
 * loader would have silently ignored or replaced, because those are the
 * packages that behave differently from how they read. An unknown top-level
 * manifest field is the one exception: the format carries fields for other
 * hosts by design, so it is a notice rather than a failure.
 */
const CONFORMANCE_ROOT = path.join(kitRoot, "fixtures", "conformance");

const fixtures = readdirSync(CONFORMANCE_ROOT)
  .filter((entry) => entry.endsWith(".json"))
  .sort()
  .map((entry) => ({
    name: entry.replace(/\.json$/, ""),
    fixture: JSON.parse(readFileSync(path.join(CONFORMANCE_ROOT, entry), "utf8")),
  }));

function build(fixture) {
  const extensions = { ...(fixture.manifest?.extensions ?? {}) };
  if (fixture.openagent !== undefined) extensions.openagent = fixture.openagent;
  const manifest = validManifest({
    ...fixture.manifest,
    ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
  });
  for (const field of fixture.omit ?? []) delete manifest[field];
  const files = { ...(fixture.files ?? {}) };
  if (fixture.mcp !== undefined) {
    files["mcp.json"] = `${JSON.stringify(fixture.mcp, null, 2)}\n`;
  }
  return inspectPackage(writePackage(makeTempDirectory("plugin-conformance-"), manifest, files));
}

/** Compare the fields a fixture names against the component the report carries. */
function expectComponents(actual, expected, label) {
  for (const [field, value] of Object.entries(expected)) {
    expect({ [label]: field, value: actual?.[field] }).toEqual({ [label]: field, value });
  }
}

describe("conformance fixtures", () => {
  expect(fixtures.length).toBeGreaterThan(10);

  for (const { name, fixture } of fixtures) {
    test(`${name}: ${fixture.description}`, () => {
      const report = build(fixture);
      const expect_ = fixture.expect;

      expect({ name, failed: hasFailures(report) }).toEqual({ name, failed: !expect_.valid });

      // `clean` is the stronger claim a valid fixture usually wants: not just
      // "nothing failed" but "nothing was reported at all", notices included.
      if (expect_.clean === true) {
        expect({ name, diagnostics: report.diagnostics }).toEqual({ name, diagnostics: [] });
      }

      for (const [level, count] of Object.entries(expect_.diagnosticCounts ?? {})) {
        expect({
          name,
          level,
          count: report.diagnostics.filter((entry) => entry.level === level).length,
        }).toEqual({ name, level, count });
      }

      for (const expected of expect_.diagnostics ?? []) {
        const found = report.diagnostics.some(
          (entry) => entry.level === expected.level && entry.message.includes(expected.contains),
        );
        expect({ name, diagnostic: expected, found }).toEqual({
          name,
          diagnostic: expected,
          found: true,
        });
      }

      if (expect_.components !== undefined) {
        expectComponents(
          {
            skills: report.skills.length,
            mcpServers: report.mcpServers.length,
            commands: report.commands.length,
            sidebar: report.sidebar.length,
            automation: report.automation.length,
            messagePolicies: report.messagePolicies.length,
            daemon: report.daemon === null ? 0 : 1,
          },
          expect_.components,
          name,
        );
      }
      if (expect_.commands !== undefined) {
        expect_.commands.forEach((expected, index) => {
          expectComponents(report.commands[index], expected, name);
        });
      }
      if (expect_.sidebar !== undefined) {
        expect_.sidebar.forEach((expected, index) => {
          expectComponents(report.sidebar[index], expected, name);
        });
      }
      if (expect_.automation !== undefined) {
        expect_.automation.forEach((expected, index) => {
          expectComponents(report.automation[index], expected, name);
        });
      }
      if (expect_.daemon !== undefined) {
        expectComponents(report.daemon, expect_.daemon, name);
      }
    });
  }
});
