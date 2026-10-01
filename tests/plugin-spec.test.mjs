import { describe, expect, test } from "bun:test";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";

import {
  hasFailures,
  inspectPackage,
  isComponentPath,
  isMessageTag,
  isPluginName,
  isSkillName,
  parseSkillFrontmatter,
} from "../scripts/lib/plugin-spec.mjs";
import { kitRoot, makeTempDirectory, templatesRoot, validManifest, writePackage } from "./helpers.mjs";

const templates = readdirSync(templatesRoot).sort();

describe("naming rules", () => {
  test("accepts portable plugin names", () => {
    for (const name of ["a", "my-plugin", "my.plugin", "plugin-2"]) {
      expect(isPluginName(name)).toBe(true);
    }
  });

  test("rejects malformed plugin names", () => {
    for (const name of ["", "-a", "a-", "a--b", "a..b", "Upper", "with space", "a".repeat(65)]) {
      expect(isPluginName(name)).toBe(false);
    }
  });

  test("skill names are stricter than plugin names", () => {
    expect(isSkillName("my-skill")).toBe(true);
    expect(isSkillName("my.skill")).toBe(false);
    expect(isSkillName("my_skill")).toBe(false);
  });

  test("message tags allow single underscores", () => {
    expect(isMessageTag("notice")).toBe(true);
    expect(isMessageTag("tool_notice")).toBe(true);
    expect(isMessageTag("tool__notice")).toBe(false);
    expect(isMessageTag("-notice")).toBe(false);
  });

  test("component paths must stay package-relative", () => {
    expect(isComponentPath("ui/panel.html")).toBe(true);
    expect(isComponentPath("./hooks/after-tool.cmd")).toBe(true);
    expect(isComponentPath("../escape.sh")).toBe(false);
    expect(isComponentPath("/etc/passwd")).toBe(false);
    expect(isComponentPath("C:temp")).toBe(false);
    expect(isComponentPath("")).toBe(false);
  });
});

describe("skill frontmatter", () => {
  test("parses plain scalars, quotes, nested maps, and block scalars", () => {
    const parsed = parseSkillFrontmatter(
      [
        "---",
        "name: my-skill",
        'description: "Use when the user asks for a summary."',
        "metadata:",
        "  category: writing",
        "compatibility: >",
        "  requires node 18",
        "---",
        "",
        "# Body",
      ].join("\n"),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.data.name).toBe("my-skill");
    expect(parsed.data.description).toBe("Use when the user asks for a summary.");
    expect(parsed.data.metadata).toEqual({ category: "writing" });
    expect(parsed.data.compatibility).toBe("requires node 18");
  });

  test("reports missing and unclosed frontmatter", () => {
    expect(parseSkillFrontmatter("# no frontmatter").ok).toBe(false);
    expect(parseSkillFrontmatter("---\nname: x\n").ok).toBe(false);
  });
});

describe("bundled packages", () => {
  test("the kit repository is a valid package", () => {
    const report = inspectPackage(kitRoot);
    expect(report.diagnostics).toEqual([]);
    expect(hasFailures(report)).toBe(false);
    expect(report.skills.length).toBeGreaterThan(0);
  });

  for (const template of templates) {
    test(`template '${template}' validates without diagnostics`, () => {
      const report = inspectPackage(path.join(templatesRoot, template));
      expect(report.diagnostics).toEqual([]);
      expect(hasFailures(report)).toBe(false);
      expect(report.name).toBe(`openagent-plugin-template-${template}`);
    });
  }
});

describe("diagnostics", () => {
  test("keeps an optional Runtime provenance marker as metadata", () => {
    const root = makeTempDirectory();
    writePackage(root, validManifest({ extensions: { openagent: { runtime: "goal" } } }));
    const report = inspectPackage(root);
    expect(report.runtime).toBe("goal");
    expect(report.diagnostics).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  test("rejects a malformed Runtime provenance marker", () => {
    const root = makeTempDirectory();
    writePackage(root, validManifest({ extensions: { openagent: { runtime: true } } }));
    const report = inspectPackage(root);
    expect(report.runtime).toBe(null);
    expect(report.diagnostics[0].message).toContain("runtime provenance");
    rmSync(root, { recursive: true, force: true });
  });

  test("a missing schema rejects the package", () => {
    const root = makeTempDirectory();
    writePackage(root, validManifest({ $schema: undefined }));
    const report = inspectPackage(root);
    expect(report.diagnostics[0].level).toBe("error");
    rmSync(root, { recursive: true, force: true });
  });

  test("an unknown manifest field is carried for another host, not failed", () => {
    // The format lets a package ship fields only another host reads, so the
    // loader ignores them by design and the validator must not reject one.
    const root = makeTempDirectory();
    writePackage(root, validManifest({ future: true }));
    const report = inspectPackage(root);
    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0].level).toBe("notice");
    expect(report.diagnostics[0].message).toContain("future");
    expect(hasFailures(report)).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  test("an unread field inside OpenAgent's own extension fails the package", () => {
    const root = makeTempDirectory();
    writePackage(root, validManifest({ extensions: { openagent: { capabilites: ["mcp"] } } }));
    const report = inspectPackage(root);
    expect(report.diagnostics[0].level).toBe("warning");
    expect(report.diagnostics[0].message).toContain("capabilites");
    expect(hasFailures(report)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  test("a skill whose name disagrees with its directory is skipped", () => {
    const root = makeTempDirectory();
    writePackage(root, validManifest(), {
      "skills/actual/SKILL.md": "---\nname: different\ndescription: A skill.\n---\n",
    });
    const report = inspectPackage(root);
    expect(report.skills).toHaveLength(0);
    expect(report.diagnostics[0].message).toContain("must match its directory name");
    rmSync(root, { recursive: true, force: true });
  });

  test("a command that escapes the package root is skipped", () => {
    const root = makeTempDirectory();
    writePackage(root, validManifest({ extensions: { openagent: { commands: [
      {
        id: "escape",
        label: "Escape",
        description: "Escapes the package",
        argument: "none",
        command: "../outside.sh",
      },
    ] } } }));
    const report = inspectPackage(root);
    expect(report.commands).toHaveLength(0);
    expect(report.diagnostics[0].message).toContain("package-relative path");
    rmSync(root, { recursive: true, force: true });
  });

  test("a declared component with a missing file is skipped", () => {
    const root = makeTempDirectory();
    writePackage(root, validManifest({ extensions: { openagent: { automation: [
      { id: "after-tool", event: "after_tool", command: "hooks/missing.cmd" },
    ] } } }));
    const report = inspectPackage(root);
    expect(report.automation).toHaveLength(0);
    expect(report.diagnostics[0].message).toContain("missing or outside the plugin root");
    rmSync(root, { recursive: true, force: true });
  });

  test("a message policy without an audience is skipped", () => {
    const root = makeTempDirectory();
    writePackage(root, validManifest({ extensions: { openagent: { message_policies: [
      { tag: "notice", user_visible: false, model_visible: false },
    ] } } }));
    const report = inspectPackage(root);
    expect(report.messagePolicies).toHaveLength(0);
    expect(report.diagnostics[0].message).toContain("at least one audience");
    rmSync(root, { recursive: true, force: true });
  });

  test("the legacy SSE transport disables only that MCP server", () => {
    const root = makeTempDirectory();
    writePackage(
      root,
      validManifest(),
      {
        "mcp.json": `${JSON.stringify(
          {
            $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
            mcpServers: {
              legacy: { type: "sse", url: "https://example.test/sse" },
              modern: { type: "stdio", command: "node" },
            },
          },
          null,
          2,
        )}\n`,
      },
    );
    const report = inspectPackage(root);
    expect(report.mcpServers.map((server) => server.name)).toEqual(["modern"]);
    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0].message).toContain("legacy SSE transport");
    rmSync(root, { recursive: true, force: true });
  });

  test("an unknown top-level mcp.json field disables MCP", () => {
    const root = makeTempDirectory();
    writePackage(root, validManifest(), {
      "mcp.json": `${JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        mcpServers: { modern: { type: "stdio", command: "node" } },
        extra: true,
      })}\n`,
    });
    const report = inspectPackage(root);
    expect(report.mcpServers).toHaveLength(0);
    expect(report.diagnostics[0].message).toContain("unsupported top-level mcp.json");
    rmSync(root, { recursive: true, force: true });
  });
});
