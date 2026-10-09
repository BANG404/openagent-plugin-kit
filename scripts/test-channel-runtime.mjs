#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runtimeAcceptance } from '../lib/runtime-acceptance.mjs';

const [executableInput, workspaceInput, packageInput, outputInput] = process.argv.slice(2);
const executable = path.resolve(executableInput), workspace = path.resolve(workspaceInput), packageDirectory = path.resolve(packageInput), outputDirectory = path.resolve(outputInput);
let calls = 0, failure;
const fixture = createServer(async (request, response) => {
  try {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    const message = { role: 'assistant', content: '' };
    if (calls++ === 0) {
      assert(JSON.stringify(body.messages).includes('channel-runtime-fixture'));
      const reply = body.tools.find(tool => /reply$/.test(tool.function.name));
      assert(reply, 'The inbound Agent must have the installed reply tool: ' + JSON.stringify(body.tools.map(tool => tool.function.name)));
      message.tool_calls = [{ function: { name: reply.function.name, arguments: { text: 'verified-runtime-reply' } } }];
    } else {
      assert(body.messages.some(entry => entry.role === 'tool' && String(entry.content).includes('sent')));
      message.content = 'Message delivered through the installed channel.';
    }
    response.writeHead(200, { 'content-type': 'application/x-ndjson' });
    response.end(JSON.stringify({ model: 'channel-fixture', created_at: new Date().toISOString(), message, done: true, done_reason: 'stop' }) + '\n');
  } catch (error) { failure = error; response.writeHead(500); response.end(JSON.stringify({ error: error.message })); }
});
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
try {
  const report = await runtimeAcceptance({ executable, workspace, packageDirectory, outputDirectory, timeoutMs: 120000,
    permissionProfile: { enforcement: 'managed', network: 'enabled', file_system: { entries: [{ path: { kind: 'host_root' }, access: 'read' }, { path: { kind: 'workspace' }, access: 'write' }] } },
    verify: async ({ request, operation, home, deadline }) => {
      const original = await operation('get_settings');
      const config = structuredClone(original);
      config.providers = [{ id: 'channel-fixture', name: 'Channel fixture', provider: 'ollama', api_key: '', base_url: `http://127.0.0.1:${fixture.address().port}`, enabled: true, models: ['channel-fixture'] }];
      config.defaults.chat_model = { provider_id: 'channel-fixture', model: 'channel-fixture' }; config.defaults.flash_model = config.defaults.chat_model;
      config.approval_mode = 'off'; config.memory_retrieval_enabled = false;
      for (const agent of Object.values(config.flash_agents)) if (agent && typeof agent === 'object' && 'enabled' in agent) agent.enabled = false;
      await operation('save_settings', { config, baseConfig: original });
      const workspaces = await request('/api/workspaces');
      const owner = await request('/api/conversations', { workspace_id: workspaces[0].id });
      const context = { conversation_id: owner.conv_id, branch_id: owner.branch_id, workspace };
      const tool = (name, ctx = context) => operation('call_agent_plugin_tool', { plugin_id: 'fakechat', tool_name: name, arguments: { _openagent: ctx } });
      for (;;) {
        try { const result = await tool('channel_bind'); assert.equal(result.isError, false, JSON.stringify(result)); break; }
        catch (error) { if (Date.now() >= deadline) throw error; await new Promise(resolve => setTimeout(resolve, 150)); }
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
      const socket = new WebSocket('ws://127.0.0.1:8787/ws');
      const received = [];
      socket.addEventListener('message', event => received.push(JSON.parse(event.data)));
      try {
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
        socket.send(JSON.stringify({ id: 'fixture-message', text: 'channel-runtime-fixture: respond using the channel reply tool' }));
        while (!received.some(message => message.from === 'assistant' && message.text === 'verified-runtime-reply') || calls < 2) {
          if (failure) throw failure;
          if (Date.now() >= deadline) throw new Error('Inbound channel did not produce an Agent tool reply');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const routing = JSON.parse(await readFile(path.join(home, 'plugin-data/fakechat/routing.json'), 'utf8'));
        const peer = Object.values(routing.peers)[0];
        assert(peer && peer.conv_id !== owner.conv_id);
        assert.equal(routing.binding.workspace, workspace);
        const remote = { ...context, conversation_id: peer.conv_id, branch_id: peer.branch_id };
        assert.equal((await tool('channel_unbind', remote)).isError, true);
        assert.equal((await tool('channel_unbind')).isError, false);
        assert.equal((await tool('channel_bind', remote)).isError, true);
        return [{ kind: 'inbound_host_agent_reply', passed: true, model: 'deterministic-ollama-fixture', calls }, { kind: 'remote_binding_denied_after_unbind', passed: true }];
      } finally { socket.close(); }
    } });
  console.log(JSON.stringify({ passed: report.passed, error: report.error, report_path: report.report_path }));
  assert.equal(report.passed, true, report.error);
} finally { fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve)); }
