import { Server } from './channel-server.mjs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
const id = process.env.OPENAGENT_PLUGIN_ID;
const server = new Server({ name: id, version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
server.setRequestHandler(CallToolRequestSchema, async () => ({ isError: true, content: [{ type: 'text', text: 'Configure this channel and refresh the plugin before using service tools' }] }));
await server.connect(new StdioServerTransport());
