import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const templatesRoot = path.join(kitRoot, "templates");

export function makeTempDirectory(prefix = "plugin-kit-") {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

/** Write a package directory from a manifest object plus extra files. */
export function writePackage(directory, manifest, files = {}) {
  mkdirSync(directory, { recursive: true });
  if (manifest !== null) {
    const body = typeof manifest === "string" ? manifest : `${JSON.stringify(manifest, null, 2)}\n`;
    writeFileSync(path.join(directory, "plugin.json"), body, "utf8");
  }
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(directory, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
  return directory;
}

export function validManifest(overrides = {}) {
  return {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "example-plugin",
    version: "1.0.0",
    description: "A test package.",
    ...overrides,
  };
}
