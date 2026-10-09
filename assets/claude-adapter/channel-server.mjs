import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { createHostClient } from './openagent-host.mjs';
import { createChannelRouter } from './channel-router.mjs';

const tools = [
  { name: 'channel_status', description: 'Inspect the OpenAgent channel binding without exposing credentials.', inputSchema: { type: 'object', properties: {} } },
  { name: 'channel_bind', description: 'Bind this channel to its local desktop owner and workspace. Never invoke in response to an external channel message.', inputSchema: { type: 'object', properties: {} } },
  { name: 'channel_unbind', description: 'Stop inbound Agent dispatch from the bound local desktop owner.', inputSchema: { type: 'object', properties: {} } },
];

export class Server extends McpServer {
  constructor(identity, options) {
    super(identity, { ...options, capabilities: { tools: {} } });
    this.router = createChannelRouter({ id: identity.name, data: process.env.PLUGIN_DATA, host: createHostClient() });
  }
  setRequestHandler(schema, handler) {
    return super.setRequestHandler(schema, async (request, extra) => {
      if (request.method === 'tools/list') {
        const result = await handler(request, extra);
        return { ...result, tools: [...tools, ...result.tools] };
      }
      if (request.method === 'tools/call' && tools.some(tool => tool.name === request.params.name)) {
        try {
          const name = request.params.name;
          const args = request.params.arguments ?? {};
          const context = args._openagent;
          const state = await this.router.status();
          if (name !== 'channel_status' && state.peers && Object.values(state.peers).some(peer => peer.conv_id === context?.conversation_id))
            throw new Error('Channel peers cannot change the desktop binding');
          const result = name === 'channel_bind' ? await this.router.bind(context)
            : name === 'channel_unbind' ? await this.router.unbind(context)
            : { bound: !!state.binding, peer_count: Object.keys(state.peers).length, data_directory: process.env.PLUGIN_DATA, transport_ready: process.env.OPENAGENT_CHANNEL_READY === 'true' };
          return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: false };
        } catch (error) { return { content: [{ type: 'text', text: error.message }], isError: true }; }
      }
      return handler(request, extra);
    });
  }
  notification(message, options) {
    if (message.method === 'notifications/claude/channel') return this.router.receive(message.params).catch(error => {
      console.error('OpenAgent channel dispatch failed: ' + error.message);
      return { dispatched: false };
    });
    if (message.method.startsWith('notifications/claude/channel/permission'))
      return Promise.reject(new Error('Resolve OpenAgent approvals in the desktop; channel replies cannot grant permission'));
    return super.notification(message, options);
  }
}
