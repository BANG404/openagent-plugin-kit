#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { runtimeAcceptance } from '../lib/runtime-acceptance.mjs';
import { kitRoot } from '../lib/development-tools.mjs';

const [executable, outputDirectory] = process.argv.slice(2);
if (!executable || !outputDirectory) throw new Error('Usage: node scripts/test-development-runtime.mjs <runtime-executable> <evidence-directory>');
await mkdir(path.resolve(outputDirectory), { recursive: true });
const root = await mkdtemp(path.join(path.resolve(outputDirectory), 'w-'));
const workspace = path.join(root, 'workspace'); await mkdir(workspace, { recursive: true });
const reader = path.join(workspace, 'read-skill.mjs');
await writeFile(reader, "import {readFile} from 'node:fs/promises'; process.stdout.write(await readFile(Buffer.from(process.argv[2], 'base64').toString('utf8'), 'utf8'));\n");
const steps = [
  ...['openagent-plugin-development', 'openagent-plugin-authoring', 'openagent-plugin-templates'].map(name => ({ tool: 'exec_command', skill: name, args: { shell: process.platform === 'win32' ? 'cmd' : 'bash', yield_time_ms: 30000, max_output_tokens: 8000 } })),
  { tool: 'development_scaffold', args: { name: 'candidate', template_repository: 'https://github.com/BANG404/openagent-plugin-kit', template_subdirectory: 'templates/minimal' } },
  { text: 'Scaffold verified. Continue implementation on the next workflow turn.' },
  { tool: 'write_file', args: { file_path: 'candidate/arithmetic.mjs', content: 'export function add(a,b) { if (!Number.isFinite(a) || !Number.isFinite(b)) throw new TypeError("finite numbers required"); return a+b; }\n' } },
  { tool: 'write_file', args: { file_path: 'candidate/skills/arithmetic/SKILL.md', content: '---\nname: arithmetic\ndescription: Use when adding two finite numbers with the bundled arithmetic module.\n---\n\nImport add from arithmetic.mjs at the package root. Reject non-finite inputs before adding.\n' } },
  { tool: 'write_file', args: { file_path: 'candidate/test.mjs', content: 'import assert from "node:assert/strict"; import {add} from "./arithmetic.mjs"; assert.equal(add(2,3),5); assert.equal(add(-2,1),-1); assert.throws(()=>add("2",3),TypeError); assert.throws(()=>add(Infinity,1),TypeError); console.log("Arithmetic behavior and failures passed");\n' } },
  { tool: 'development_validate', args: { locales: ['en'] } },
  { tool: 'development_test', args: { executable: 'node', args: ['-e', 'process.exit(7)'] } },
  { text: 'The failing test gate is retained. Repair it in the next workflow turn.' },
  { tool: 'development_test', args: { executable: 'node', args: ['test.mjs'] } },
  { tool: 'development_runtime_acceptance', args: { executable: path.resolve(executable), plan: {} } },
  { tool: 'development_ready', args: {} },
  { text: 'The candidate is qualified and awaits developer acceptance.' },
];
const arithmetic = steps.find(entry => entry.args?.file_path === 'candidate/arithmetic.mjs').args.content;
for (const entry of steps) if (entry.tool === 'write_file') {
  const { file_path, content } = entry.args;
  entry.tool = 'apply_patch';
  entry.args = { patch: '*** Begin Patch\n*** Add File: ' + file_path + '\n' + content.split('\n').slice(0, -1).map(line => '+' + line).join('\n') + '\n*** End Patch' };
}
let step = 0, modelRequests = 0, pendingResult, fixtureFailure;
const calls = [], skillReads = new Set();
const model = createServer(async (request, response) => {
  try {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    if (pendingResult) {
      const result = [...(body.messages ?? [])].reverse().find(message => message.role === 'tool');
      assert(result, 'Missing result for ' + pendingResult.tool);
      const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
      if (pendingResult.tool === 'exec_command') await writeFile(path.join(root, pendingResult.skill + '-read-result.json'), JSON.stringify({ arguments: pendingResult.args, content }, null, 2));
      if (pendingResult.tool === 'exec_command') {
        const terminal = JSON.parse(content.split('\n')[0]);
        if (terminal.status === 'running') {
          const poll = body.tools.find(tool => tool.function.name.endsWith('write_stdin'));
          assert(poll, 'Running skill reads require terminal polling');
          response.writeHead(200, { 'content-type': 'application/x-ndjson' });
          response.end(JSON.stringify({ model: 'development-fixture', created_at: new Date().toISOString(), message: { role: 'assistant', content: '', tool_calls: [{ function: { name: poll.function.name, arguments: { session_id: terminal.session_id, chars: '', yield_time_ms: 30000 } } }] }, done: true, done_reason: 'stop' }) + '\n');
          modelRequests++;
          return;
        }
        assert.equal(terminal.exit_code ?? Number(terminal.status?.split(':')[1]), 0, 'Skill reader must exit successfully: ' + content);
      }
      const intentionallyFailed = pendingResult.tool === 'development_test' && pendingResult.args.args.includes('process.exit(7)');
      if (pendingResult.tool.startsWith('development_')) {
        let evidence;
        // MCP text and structuredContent are both projected as result blocks.
        try { evidence = JSON.parse(content.split('\n')[0]); } catch { throw new Error(pendingResult.tool + ': ' + content.slice(0, 1000)); }
        if (pendingResult.tool === 'development_scaffold') assert(evidence.package, 'Scaffold must select a real package');
        else if (pendingResult.tool === 'development_ready') assert.equal(evidence.status, 'awaiting_acceptance');
        else assert.equal(evidence.passed, !intentionallyFailed, pendingResult.tool + ': ' + content.slice(0, 1000));
      }
      if (!intentionallyFailed) {
        assert(!/"passed"\s*:\s*false|"isError"\s*:\s*true|^Error:|EPERM|cannot find module/i.test(content), pendingResult.tool + ' failed: ' + content.slice(0, 1000));
      }
      pendingResult = undefined;
    }
    for (const message of body.messages ?? []) if (message.role === 'tool') {
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
      for (const marker of ['Develop and qualify a plugin', 'Authoring an OpenAgent plugin', 'Scaffolding from the bundled templates']) if (content.includes(marker)) skillReads.add(marker);
    }
    modelRequests++;
    const selected = steps[step] ?? { text: 'Developer acceptance recorded.' };
    let message = { role: 'assistant', content: selected.text ?? '' };
    if (selected.tool) {
      const tool = body.tools?.find(entry => entry.function.name.endsWith(selected.tool));
      assert(tool, 'Missing model tool: ' + selected.tool + '; available=' + JSON.stringify(body.tools?.map(entry => entry.function?.name ?? entry.name)) + '; keys=' + Object.keys(body).join(','));
      message.tool_calls = [{ function: { name: tool.function.name, arguments: selected.args } }];
      calls.push(selected.tool);
      pendingResult = selected;
    }
    step++;
    response.writeHead(200, { 'content-type': 'application/x-ndjson' });
    response.end(JSON.stringify({ model: 'development-fixture', created_at: new Date().toISOString(), message, done: true, done_reason: 'stop', prompt_eval_count: 40, eval_count: 10 }) + '\n');
  } catch (error) { fixtureFailure = error; response.writeHead(500); response.end(JSON.stringify({ error: error.message })); }
});
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
const profile = { enforcement: 'managed', network: 'enabled', file_system: { entries: [{ path: { kind: 'host_root' }, access: 'read' }, { path: { kind: 'workspace' }, access: 'write' }] } };
let conversation;
const eventAbort = new AbortController();
let eventsTask;
const terminalEvents = [];
try {
  const report = await runtimeAcceptance({ executable: path.resolve(executable), packageDirectory: kitRoot, workspace, outputDirectory: root,
    timeoutMs: 360000, permissionProfile: profile,
    verify: async ({ request, operation, subscribe, deadline, home }) => {
      for (const entry of steps.slice(0, 3)) {
        entry.args.cmd = 'node read-skill.mjs ' + Buffer.from(path.join(home, 'plugins', 'openagent-plugin-kit', 'skills', entry.skill, 'SKILL.md')).toString('base64');
      }
      const original = await operation('get_settings');
      const config = structuredClone(original);
      config.providers = [{ id: 'development-fixture', name: 'Development fixture', provider: 'ollama', api_key: '', base_url: `http://127.0.0.1:${model.address().port}`, enabled: true, models: ['development-fixture'] }];
      config.defaults.chat_model = { provider_id: 'development-fixture', model: 'development-fixture' };
      config.defaults.flash_model = config.defaults.chat_model;
      config.approval_mode = 'off'; config.memory_retrieval_enabled = false;
      for (const agent of Object.values(config.flash_agents)) if (agent && typeof agent === 'object' && 'enabled' in agent) agent.enabled = false;
      await operation('save_settings', { config, baseConfig: original });
      const workspaces = await request('/api/workspaces');
      conversation = await request('/api/conversations', { workspace_id: workspaces[0].id });
      const context = { conversation_id: conversation.conv_id, branch_id: conversation.branch_id, workspace };
      const stream = await subscribe('/api/events', eventAbort.signal);
      eventsTask = (async () => {
        const decoder = new TextDecoder(); let buffer = '';
        for await (const chunk of stream) {
          buffer += decoder.decode(chunk, { stream: true });
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const packet = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            const data = packet.split('\n').find(line => line.startsWith('data:'));
            if (!data) continue;
            const event = JSON.parse(data.slice(5).trim());
            if (event.name === 'chat-done' && event.payload?.conv_id === conversation.conv_id) terminalEvents.push(event);
          }
          if (buffer.length > 1024 * 1024) throw new Error('Runtime event exceeded fixture limit');
        }
      })().catch(error => { if (!eventAbort.signal.aborted) fixtureFailure = error; });
      const status = async () => {
        const result = await operation('call_agent_plugin_tool', { plugin_id: 'openagent-plugin-kit', tool_name: 'development_status', arguments: { _openagent: context } });
        if (result.isError) throw new Error(result.content[0].text);
        return result.structuredContent;
      };
      // Wait for discovery only; never retry a submitted slash command.
      // Settings refresh can expose cached native-call definitions before its
      // replacement connection is ready for the Agent's assembled catalog.
      // Require successive probes across a settling interval before submission.
      let discovered = false;
      for (;;) {
        try {
          await operation('call_agent_plugin_tool', { plugin_id: 'openagent-plugin-kit', tool_name: 'development_status', arguments: { _openagent: context } });
          if (discovered) break;
          discovered = true;
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          discovered = false;
          if (Date.now() >= deadline) throw error;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      await request(`/api/conversations/${conversation.conv_id}/runs`, { text: '/openagent-plugin-kit:create ' + JSON.stringify({ goal: 'Build and behavior-test a finite arithmetic plugin from the public minimal template repository, with real Runtime installation and developer acceptance', max_iterations: 5 }), user_message_id: randomUUID(), assistant_message_id: randomUUID() });
      let state;
      for (;;) {
        if (fixtureFailure) throw fixtureFailure;
        if (Date.now() >= deadline) throw new Error('Agent self-loop timed out at model step ' + step + ', state ' + JSON.stringify(state));
        try { state = await status(); } catch {}
        if (state?.status === 'awaiting_acceptance' && step >= steps.length) break;
        if (['failed', 'exhausted', 'cancelled'].includes(state?.status)) throw new Error('Agent workflow stopped: ' + JSON.stringify(state));
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(step, steps.length);
      assert.equal(state.iteration, 2, 'Two successful unfinished turns must continue automatically');
      assert.match(state.template_source.revision, /^[a-f0-9]{40}$/);
      for (const gate of ['validation', 'tests', 'runtime']) assert.equal(state.evidence[gate].passed, true, gate);
      const logDirectory = path.dirname(state.evidence.tests.log_path);
      const testLogs = await Promise.all((await readdir(logDirectory)).map(file => readFile(path.join(logDirectory, file), 'utf8').then(JSON.parse)));
      assert(testLogs.some(log => log.code === 7 && log.passed === false), 'The earlier failed test must remain available in retained logs');
      assert.equal(state.evidence.runtime.permission_profile.enforcement, 'managed');
      assert.equal(state.evidence.runtime.permission_profile.network, 'enabled');
      assert.equal(await readFile(path.join(workspace, 'candidate', 'arithmetic.mjs'), 'utf8'), arithmetic);
      assert.equal(skillReads.size, 3, 'The Agent must read the installed development, authoring and templates Skills');
      // Only chat-done is emitted after releasing the conversation run guard.
      // Qualification and durable final phase can precede Stop hook completion.
      while (terminalEvents.length < state.iteration + 1) {
        if (fixtureFailure) throw fixtureFailure;
        if (Date.now() >= deadline) throw new Error('Qualified turn did not release its run guard');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const qualifiedRequests = modelRequests;
      await request(`/api/conversations/${conversation.conv_id}/runs`, { text: '/openagent-plugin-kit:accept', user_message_id: randomUUID(), assistant_message_id: randomUUID() });
      for (;;) {
        state = await status(); if (state.status === 'accepted') break;
        if (Date.now() >= deadline) throw new Error('Developer acceptance was not recorded');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      while (terminalEvents.length < state.iteration + 2) {
        if (fixtureFailure) throw fixtureFailure;
        if (Date.now() >= deadline) throw new Error('Acceptance turn did not finalize');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(modelRequests, qualifiedRequests + 1, 'Acceptance must not schedule another development run');
      await writeFile(path.join(root, 'agent-workflow.json'), JSON.stringify({ conversation, home, modelRequests, calls, skillReads: [...skillReads], terminalEvents, state }, null, 2));
      eventAbort.abort(); await eventsTask;
      return [{ kind: 'agent_workflow', passed: true, conversation_id: conversation.conv_id, model_requests: modelRequests, continuation_turns: state.iteration, candidate: state.package }];
    } });
  console.log(JSON.stringify({ passed: report.passed, error: report.error, report_path: report.report_path, conversation, step, modelRequests, calls, skillReads: [...skillReads], fixtureFailure: fixtureFailure?.message }));
  assert.equal(report.passed, true, report.error);
} finally { eventAbort.abort(); await eventsTask; model.closeAllConnections(); await new Promise(resolve => model.close(resolve)); }
