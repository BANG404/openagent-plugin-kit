import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.env.PLUGIN_ROOT;
const manifest = JSON.parse(await readFile(path.join(root, 'plugin.json'), 'utf8'));
const setup = JSON.parse(await readFile(path.join(root, 'setup.json'), 'utf8'));
const server = new Server({ name: manifest.name + '-setup', version: manifest.version }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'integration_status', description: 'Read integration prerequisites and provenance. This does not assert that the external service is authenticated.', inputSchema: { type: 'object', properties: {} } }] }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  if (request.params.name !== 'integration_status') return { isError: true, content: [{ type: 'text', text: 'Unknown tool' }] };
  const result = { plugin: manifest.name, prerequisites: setup.prerequisites, upstream_revision: setup.revision, data_directory: process.env.PLUGIN_DATA, qualification: 'package-and-runtime-installation' };
  return { isError: false, structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
});
await server.connect(new StdioServerTransport());
