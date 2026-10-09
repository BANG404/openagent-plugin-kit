import { test, expect } from 'bun:test';
import { convertMcp } from '../lib/claude-import.mjs';

test('Claude MCP conversion normalizes both layouts and package roots', () => {
  expect(convertMcp({ mcpServers: { docs: { type: 'http', url: 'https://example.com/mcp?client=claude-code-plugin' } } })).toEqual({ docs: { type: 'streamable-http', url: 'https://example.com/mcp?client=openagent-plugin' } });
  expect(convertMcp({ local: { command: 'bun', args: ['${CLAUDE_PLUGIN_ROOT}/server.ts'] } })).toEqual({ local: { type: 'stdio', command: 'bun', args: ['${PLUGIN_ROOT}/server.ts'] } });
  expect(() => convertMcp({ server: { type: 'sse' } })).toThrow('Unsupported');
  expect(() => convertMcp({ server: null })).toThrow('Invalid');
});
