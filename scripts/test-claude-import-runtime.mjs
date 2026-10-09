#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runtimeAcceptance } from '../lib/runtime-acceptance.mjs';
import { kitRoot } from '../lib/development-tools.mjs';

const [executable, workspaceInput, sourceInput, output, selection] = process.argv.slice(2);
const selectExisting = process.argv.includes('--select');
if (!output) throw new Error('Usage: bun scripts/test-claude-import-runtime.mjs <runtime> <workspace> <upstream-checkout> <evidence> [comma-separated-ids]');
const workspace = path.resolve(workspaceInput), source = path.resolve(sourceInput);
const revision = (await import('node:child_process')).execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const ids = selection ? selection.split(',') : (await readdir(path.join(source, 'external_plugins'))).sort();
await mkdir(path.join(workspace, 'plugins'), { recursive: true });
await mkdir(output, { recursive: true });
let steps = [], cursor = 0, pending, failure, requests = 0;
const model = createServer(async (request, response) => {
  try {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    if (pending) {
      const toolResult = [...body.messages].reverse().find(entry => entry.role === 'tool');
      assert(toolResult, 'Missing model tool result; roles=' + body.messages.map(entry => entry.role).join(','));
      const content = typeof toolResult.content === 'string' ? toolResult.content : JSON.stringify(toolResult.content);
      let result;
      try { result = JSON.parse(content.split('\n')[0]); }
      catch { throw new Error(pending.tool + ': ' + content.slice(0, 4000)); }
      assert(!result.isError, pending.tool + ': ' + content.slice(0, 4000));
      if (pending.tool === 'development_import_claude' || pending.tool === 'development_select') assert(result.package);
      else if (pending.tool === 'development_ready') assert.equal(result.status, 'awaiting_acceptance');
      else assert.equal(result.passed, true, pending.tool + ': ' + content.slice(0, 4000));
      pending = null;
    }
    const entry = steps[cursor++] ?? { text: 'Accepted under the operator instruction to test and publish.' };
    const message = { role: 'assistant', content: entry.text ?? '' };
    if (entry.tool) {
      const tool = body.tools.find(tool => tool.function.name.endsWith(entry.tool));
      assert(tool, 'Missing development tool ' + entry.tool + '; available=' + JSON.stringify(body.tools.map(tool => tool.function?.name)));
      message.tool_calls = [{ function: { name: tool.function.name, arguments: entry.args } }];
      pending = entry;
    }
    requests++;
    response.writeHead(200, { 'content-type': 'application/x-ndjson' });
    response.end(JSON.stringify({ model: 'import-fixture', created_at: new Date().toISOString(), message, done: true, done_reason: 'stop', prompt_eval_count: 30, eval_count: 10 }) + '\n');
  } catch (error) { failure = error; response.writeHead(500); response.end(JSON.stringify({ error: error.message })); }
});
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
const profile = { enforcement: 'managed', network: 'enabled', file_system: { entries: [{ path: { kind: 'host_root' }, access: 'read' }, { path: { kind: 'workspace' }, access: 'write' }] } };
const candidates = [];
try {
  const report = await runtimeAcceptance({ executable: path.resolve(executable), packageDirectory: kitRoot, workspace, outputDirectory: output, timeoutMs: 1800000, permissionProfile: profile,
    verify: async ({ request, operation, subscribe, home, deadline }) => {
      const original = await operation('get_settings');
      const config = structuredClone(original);
      config.providers = [{ id: 'import-fixture', name: 'Import fixture', provider: 'ollama', api_key: '', base_url: `http://127.0.0.1:${model.address().port}`, enabled: true, models: ['import-fixture'] }];
      config.defaults.chat_model = { provider_id: 'import-fixture', model: 'import-fixture' };
      config.defaults.flash_model = config.defaults.chat_model;
      config.approval_mode = 'off'; config.memory_retrieval_enabled = false;
      for (const agent of Object.values(config.flash_agents)) if (agent && typeof agent === 'object' && 'enabled' in agent) agent.enabled = false;
      await operation('save_settings', { config, baseConfig: original });
      const workspaces = await request('/api/workspaces');
      for (const id of ids) {
        cursor = 0; pending = null;
        const conversation = await request('/api/conversations', { workspace_id: workspaces[0].id });
        const context = { conversation_id: conversation.conv_id, branch_id: conversation.branch_id, workspace };
        steps = [
          selectExisting ? { tool: 'development_select', args: { directory: 'plugins/' + id } } : { tool: 'development_import_claude', args: { source: path.relative(workspace, path.join(source, 'external_plugins', id)), directory: 'plugins/' + id, revision, repository: 'https://github.com/BANG404/openagent-' + id } },
          { tool: 'development_validate', args: { locales: ['en', 'zh'] } },
          { tool: 'development_test', args: { executable: 'bun', args: ['test', 'tests'] } },
          { tool: 'development_test', args: { executable: 'bun', args: ['-e', `const fs=require('node:fs');let denied=false;try{fs.writeFileSync(${JSON.stringify(path.join(path.resolve(output), 'policy-denied-' + id))},'must not write')}catch(e){if(!['EACCES','EPERM'].includes(e.code))throw e;denied=true}if(!denied)throw new Error('Inherited policy allowed an outside-workspace write');fs.writeFileSync(require('node:path').join(process.env.PLUGIN_DATA,'policy-writable'),'allowed');console.log('restricted child: outside write denied, plugin data writable')`] } },
          { tool: 'development_runtime_acceptance', args: { executable: path.resolve(executable), plan: { tools: [{ name: 'integration_status', expected: { isError: false, structuredContent: { plugin: id, upstream_revision: revision } } }] } } },
          { tool: 'development_ready', args: {} },
          { text: `${id} passed its package and production Runtime gates. External account prerequisites remain explicit.` },
        ];
        const abort = new AbortController();
        const terminals = [];
        const stream = await subscribe('/api/events', abort.signal);
        const observe = (async () => {
          let buffer = ''; const decoder = new TextDecoder();
          for await (const chunk of stream) {
            buffer += decoder.decode(chunk, { stream: true });
            let boundary;
            while ((boundary = buffer.indexOf('\n\n')) >= 0) {
              const packet = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
              const data = packet.split('\n').find(line => line.startsWith('data:'));
              if (data) { const event = JSON.parse(data.slice(5)); if (event.name === 'chat-done' && event.payload?.conv_id === conversation.conv_id) terminals.push(event); }
            }
          }
        })().catch(error => { if (!abort.signal.aborted) failure = error; });
        const status = async () => {
          const result = await operation('call_agent_plugin_tool', { plugin_id: 'openagent-plugin-kit', tool_name: 'development_status', arguments: { _openagent: context } });
          if (result.isError) throw new Error(result.content[0].text);
          return result.structuredContent;
        };
        try {
          // Settle the replacement MCP connection before the first model turn.
          let discovered = false;
          for (;;) {
            try {
              const inventory = await operation('call_agent_plugin_tool', { plugin_id: 'openagent-plugin-kit', tool_name: 'development_status', arguments: { _openagent: context } });
              assert(inventory, 'MCP inventory returned no result');
              if (discovered) break;
              discovered = true;
              await new Promise(resolve => setTimeout(resolve, 700));
            } catch (error) {
              discovered = false;
              if (Date.now() >= deadline) throw error;
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
          await request(`/api/conversations/${conversation.conv_id}/runs`, { text: '/openagent-plugin-kit:create ' + JSON.stringify({ goal: `Convert external_plugins/${id} at ${revision} into an OpenAgent package. Validate, test, qualify exact bytes; publication is authorized by the operator after passing gates.`, max_iterations: 3 }), user_message_id: randomUUID(), assistant_message_id: randomUUID() });
          let state;
          for (;;) {
            if (failure) throw failure;
            if (Date.now() >= deadline) throw new Error('Import deadline exceeded: ' + id);
            try { state = await status(); } catch {}
            if (state?.status === 'awaiting_acceptance' && terminals.length) break;
            if (['failed', 'exhausted', 'cancelled'].includes(state?.status)) throw new Error(JSON.stringify(state));
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          for (const gate of ['validation', 'tests', 'runtime']) assert.equal(state.evidence[gate].passed, true);
          await request(`/api/conversations/${conversation.conv_id}/runs`, { text: '/openagent-plugin-kit:accept', user_message_id: randomUUID(), assistant_message_id: randomUUID() });
          for (;;) {
            state = await status();
            if (state.status === 'accepted' && terminals.length >= 2) break;
            if (failure) throw failure;
            if (Date.now() >= deadline) throw new Error('Acceptance deadline exceeded: ' + id);
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          candidates.push({ id, conversation, state });
          await writeFile(path.join(output, 'candidates.json'), JSON.stringify({ revision, candidates }, null, 2));
          console.log(JSON.stringify({ id, passed: true, package: state.package, runtime_report: state.evidence.runtime.report_path }));
        } finally { abort.abort(); await observe; }
      }
      return [{ kind: 'claude_import_workflows', passed: true, candidates: candidates.map(entry => entry.id), requests, home }];
    } });
  console.log(JSON.stringify({ passed: report.passed, error: report.error, report_path: report.report_path }));
  assert.equal(report.passed, true, report.error);
} finally { model.closeAllConnections(); await new Promise(resolve => model.close(resolve)); }
