import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { hasFailures, inspectPackage } from "../scripts/lib/plugin-spec.mjs";
import { kitRoot, makeTempDirectory } from "./helpers.mjs";

const script = path.join(kitRoot, "scripts", "new-plugin.mjs");

function run(args) {
  const result = Bun.spawnSync([process.execPath, script, ...args]);
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe("new-plugin", () => {
  test("scaffolds a valid package from a template", () => {
    const parent = makeTempDirectory();
    const result = run(["my-plugin", "--template", "skill-pack", "--dir", parent]);
    expect(result.exitCode).toBe(0);

    const target = path.join(parent, "my-plugin");
    const report = inspectPackage(target);
    expect(hasFailures(report)).toBe(false);
    expect(report.name).toBe("my-plugin");
    expect(report.version).toBe("0.1.0");
    expect(report.skills.length).toBe(2);

    const manifest = JSON.parse(readFileSync(path.join(target, "plugin.json"), "utf8"));
    expect(manifest.repository).toBeUndefined();
    expect(manifest.name).toBe("my-plugin");
    rmSync(parent, { recursive: true, force: true });
  });

  test("defaults to the minimal template", () => {
    const parent = makeTempDirectory();
    const result = run(["tiny", "--dir", parent]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(parent, "tiny", "skills", "hello", "SKILL.md"))).toBe(true);
    rmSync(parent, { recursive: true, force: true });
  });

  test("rejects an invalid plugin name", () => {
    const parent = makeTempDirectory();
    const result = run(["My Plugin", "--dir", parent]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Invalid plugin name");
    rmSync(parent, { recursive: true, force: true });
  });

  test("rejects an unknown template", () => {
    const parent = makeTempDirectory();
    const result = run(["my-plugin", "--template", "nope", "--dir", parent]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Unknown template");
    rmSync(parent, { recursive: true, force: true });
  });

  test("refuses to overwrite an existing package", () => {
    const parent = makeTempDirectory();
    expect(run(["my-plugin", "--dir", parent]).exitCode).toBe(0);
    const second = run(["my-plugin", "--dir", parent]);
    expect(second.exitCode).toBe(1);
    expect(second.stderr).toContain("Refusing to overwrite");
    rmSync(parent, { recursive: true, force: true });
  });

  test("lists the available templates", () => {
    const result = run(["--list"]);
    expect(result.exitCode).toBe(0);
    for (const template of ["minimal", "skill-pack", "mcp-tools", "slash-commands", "sidebar-panel", "automation-hooks", "full-kit"]) {
      expect(result.stdout).toContain(template);
    }
  });
});
