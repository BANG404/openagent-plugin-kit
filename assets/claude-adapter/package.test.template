import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));

test('release artifacts retain their recorded bytes and source identity', async () => {
  const provenance = await json('provenance.json');
  expect(provenance.revision).toMatch(/^[a-f0-9]{40}$/);
  expect(provenance.path).toBe('external_plugins/' + (await json('plugin.json')).name);
  for (const [file, digest] of Object.entries(provenance.artifacts))
    expect(createHash('sha256').update(await readFile(path.join(root, 'bin', file))).digest('hex')).toBe(digest);
});

test('MCP declarations use portable transports, contained assets and no literal credentials', async () => {
  const mcp = await json('mcp.json');
  const manifest = await json('plugin.json');
  if (manifest.name === 'firebase') expect(mcp.mcpServers.firebase.env.XDG_CONFIG_HOME).toBe('${PLUGIN_DATA}/config');
  if (manifest.name === 'serena') {
    expect(mcp.mcpServers.serena.env.HOME).toBe('${PLUGIN_DATA}');
    expect(mcp.mcpServers.serena.env.USERPROFILE).toBe('${PLUGIN_DATA}');
  }
  expect(mcp.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
  expect(mcp.mcpServers.setup.command).toBe('node');
  expect(manifest.extensions.openagent.compatibility.plugin_protocol).toEqual({ min: 1, max: 1 });
  const text = JSON.stringify(mcp);
  expect(text).not.toContain('CLAUDE_PLUGIN_ROOT');
  expect(text).not.toContain('GITHUB_PERSONAL_ACCESS_TOKEN');
  expect(text).not.toContain('${TFE_TOKEN}');
  for (const server of Object.values(mcp.mcpServers)) {
    if (server.command === 'npx') expect(server.env?.npm_config_cache).toBe('${PLUGIN_DATA}/npm-cache');
    if (server.command === 'npx') expect(server.env?.npm_config_ignore_scripts).toBe('true');
    if (server.command === 'uvx') {
      expect(server.env?.UV_CACHE_DIR).toBe('${PLUGIN_DATA}/uv-cache');
      expect(server.env?.UV_PYTHON_INSTALL_DIR).toBe('${PLUGIN_DATA}/uv-python');
    }
    expect(['stdio', 'streamable-http']).toContain(server.type);
    if (server.url) expect(new URL(server.url).protocol).toBe('https:');
    for (const arg of server.args ?? []) if (arg.startsWith('${PLUGIN_ROOT}/'))
      expect((await readFile(path.join(root, arg.slice('${PLUGIN_ROOT}/'.length)))).length).toBeGreaterThan(0);
  }
});

test('both platform locales cover command presentation and prerequisites remain explicit', async () => {
  const extension = (await json('plugin.json')).extensions.openagent;
  expect(extension.i18n.supported_locales).toEqual(['en', 'zh']);
  for (const locale of extension.i18n.supported_locales) {
    const messages = extension.i18n.translations[locale];
    expect(messages.description.length).toBeGreaterThan(0);
    for (const command of extension.commands) {
      expect(messages[`commands.${command.id}.label`]?.length).toBeGreaterThan(0);
      expect(messages[`commands.${command.id}.description`]?.length).toBeGreaterThan(0);
    }
  }
  expect((await json('setup.json')).prerequisites.length).toBeGreaterThan(0);
});
