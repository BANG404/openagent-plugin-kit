import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const server = new Server({ name: 'github', version: '0.1.0' }, { capabilities: { tools: { listChanged: true } } });
let connection;
async function connect() {
  if (connection) return connection;
  const config = JSON.parse(await readFile(path.join(process.env.PLUGIN_DATA, 'credentials.json'), 'utf8'));
  if (typeof config.token !== 'string' || !config.token.trim()) throw new Error('Set a GitHub token in PLUGIN_DATA/credentials.json and refresh the plugin');
  const client = new Client({ name: 'openagent-github', version: '0.1.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL('https://api.githubcopilot.com/mcp/'), { requestInit: { headers: { Authorization: 'Bearer ' + config.token } } }));
    connection = client;
    return client;
  } catch { await client.close(); throw new Error('GitHub MCP connection failed; verify the token permissions and network'); }
}
server.setRequestHandler(ListToolsRequestSchema, async () => {
  try { return await (await connect()).listTools(); }
  catch { return { tools: [] }; }
});
server.setRequestHandler(CallToolRequestSchema, async request => {
  try { return await (await connect()).callTool({ name: request.params.name, arguments: request.params.arguments }); }
  catch { return { isError: true, content: [{ type: 'text', text: 'GitHub MCP unavailable; configure credentials.json and refresh the plugin' }] }; }
});
server.onclose = () => { void connection?.close(); };
await server.connect(new StdioServerTransport());
