import { test, expect, afterEach } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callDevelopmentTool } from '../lib/development-tools.mjs';
import { newWorkflow, readState, updateState, packageDigest } from '../lib/development-state.mjs';
import { continueDevelopment } from '../bin/develop-hook.mjs';
import { runProcess } from '../lib/development-process.mjs';
import { matches, runtimeAcceptance } from '../lib/runtime-acceptance.mjs';

const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plugin-development-')); roots.push(root);
  const workspace = path.join(root, 'workspace'), data = path.join(root, 'data');
  await mkdir(workspace); await mkdir(data);
  const environment = { ...process.env, PLUGIN_DATA: data };
  await updateState('conversation', () => newWorkflow({ conversation_id: 'conversation', branch_id: 'branch' }, { goal: 'Build a plugin', ...options }), environment);
  const args = { _openagent: { conversation_id: 'conversation', branch_id: 'branch', workspace } };
  return { environment, args, workspace, call: (name, fields = {}, overrides = {}) => callDevelopmentTool(name, { ...fields, ...args }, { environment, permissions: async () => ({ version: 1, permission_profile: { kind: 'managed' } }), ...overrides }) };
}
test('scaffold never overwrites and evidence rejects changed bytes', async () => {
  const fixtureData = await fixture(); const { call, environment } = fixtureData;
  const state = await call('development_scaffold', { name: 'candidate', template: 'minimal' });
  await expect(call('development_scaffold', { name: 'candidate' })).rejects.toThrow();
  expect((await call('development_validate')).passed).toBe(true);
  expect((await call('development_validate', { locales: ['zh'] })).passed).toBe(false);
  await call('development_validate');
  const run = async () => ({ passed: true, code: 0, stdout: 'Behavior asserted', stderr: '' });
  await call('development_test', { executable: 'node', args: ['tests.mjs'] }, { run });
  await call('development_runtime_acceptance', { executable: 'server', plan: {} }, { accept: async () => ({ passed: true }) });
  await writeFile(path.join(state.package, 'behavior.mjs'), 'export const behavior = 1;');
  await expect(call('development_ready')).rejects.toThrow('stale');
  for (const gate of ['validation', 'tests', 'runtime']) expect((await readState('conversation', environment)).evidence[gate].digest).not.toBe(await packageDigest(state.package));
});
test('qualification stops at developer acceptance and excludes another branch', async () => {
  const { call, args, environment } = await fixture();
  await call('development_scaffold', { name: 'candidate' });
  await call('development_validate');
  await call('development_test', { executable: 'node', args: [] }, { run: async () => ({ passed: true }) });
  await call('development_runtime_acceptance', { executable: 'server', plan: {} }, { accept: async () => ({ passed: true }) });
  expect((await call('development_ready')).status).toBe('awaiting_acceptance');
  await expect(call('development_test', { executable: 'node', args: [] })).rejects.toThrow('resume');
  await expect(callDevelopmentTool('development_status', { _openagent: { ...args._openagent, branch_id: 'sibling' } }, { environment })).rejects.toThrow('another branch');
});
test('hook waits for input, deduplicates terminal events and stops at budget', async () => {
  const { environment } = await fixture({ max_iterations: 1 });
  const wakes = [], host = { agent: { wake: async request => { wakes.push(request); } } };
  const event = { conversation_id: 'conversation', branch_id: 'branch', run_id: 'same-conversation', execution_id: 'run', phase: 'interrupted' };
  await continueDevelopment({ event }, { environment, host }); expect(wakes).toHaveLength(0);
  event.phase = 'final_completed';
  await continueDevelopment({ event }, { environment, host });
  await continueDevelopment({ event }, { environment, host }); expect(wakes).toHaveLength(1);
  expect(wakes[0].branch_id).toBe('branch'); expect(wakes[0].wait).toBe(false);
  event.execution_id = 'next'; await continueDevelopment({ event }, { environment, host });
  expect((await readState('conversation', environment)).status).toBe('exhausted'); expect(wakes).toHaveLength(1);
});
test('cancelled and failed runs cannot silently restart', async () => {
  for (const phase of ['final_cancelled', 'final_failed']) {
    const { environment } = await fixture(); let wakes = 0;
    const host = { agent: { wake: async () => { wakes++; } } };
    const event = { conversation_id: 'conversation', branch_id: 'branch', execution_id: 'run', phase };
    await continueDevelopment({ event }, { environment, host });
    await continueDevelopment({ event: { ...event, phase: 'final_completed', execution_id: 'late' } }, { environment, host });
    expect(wakes).toBe(0);
    expect((await readState('conversation', environment)).status).toBe(phase === 'final_cancelled' ? 'cancelled' : 'failed');
  }
});
test('separate executions in the same conversation continue independently', async () => {
  const { environment } = await fixture({ max_iterations: 3 });
  const wakes = [], host = { agent: { wake: async request => wakes.push(request) } };
  const event = { conversation_id: 'conversation', branch_id: 'branch', run_id: 'conversation', phase: 'final_completed', execution_id: 'first' };
  await continueDevelopment({ event }, { environment, host });
  event.execution_id = 'second';
  await continueDevelopment({ event }, { environment, host });
  await continueDevelopment({ event }, { environment, host });
  expect(wakes).toHaveLength(2);
  expect((await readState('conversation', environment)).iteration).toBe(2);
});
test('wake failures retain recoverable state', async () => {
  const { environment } = await fixture();
  await expect(continueDevelopment({ event: { conversation_id: 'conversation', branch_id: 'branch', execution_id: 'run', phase: 'final_completed' } },
    { environment, host: { agent: { wake: async () => { throw new Error('Host unavailable'); } } } })).rejects.toThrow('Host unavailable');
  expect((await readState('conversation', environment)).status).toBe('failed');
});
test('a pending wake claim requires recovery instead of another automatic run', async () => {
  const { environment } = await fixture();
  await updateState('conversation', state => ({ ...state, pending_wake: 'old-run' }), environment);
  let wakes = 0;
  await continueDevelopment({ event: { conversation_id: 'conversation', branch_id: 'branch', execution_id: 'new-run', phase: 'final_completed' } },
    { environment, host: { agent: { wake: async () => { wakes++; } } } });
  expect(wakes).toBe(0); expect((await readState('conversation', environment)).pending_wake).toBe('old-run');
});
test('slash control commands cannot replace or cancel another branch workflow', async () => {
  const { environment } = await fixture();
  const script = fileURLToPath(new URL('../bin/develop-command.mjs', import.meta.url));
  for (const command of ['create', 'stop', 'status', 'resume']) {
    const result = await runProcess('node', [script], { env: environment,
      input: JSON.stringify({ conversation_id: 'conversation', branch_id: 'sibling', command: 'openagent-plugin-kit:' + command, argument: 'New goal' }) });
    expect(result.passed).toBe(false); expect(result.stderr).toContain('another branch');
    expect((await readState('conversation', environment)).status).toBe('developing');
  }
});
test('a status-only turn cannot wake or fail the saved development workflow', async () => {
  for (const phase of ['final_completed', 'final_failed']) {
    const { environment } = await fixture();
    await updateState('conversation', state => ({ ...state, control_only: true, pending_wake: 'saved-claim' }), environment);
    let wakes = 0;
    const event = { conversation_id: 'conversation', branch_id: 'branch', execution_id: 'status', phase };
    await continueDevelopment({ event }, { environment, host: { agent: { wake: async () => { wakes++; } } } });
    const saved = await readState('conversation', environment);
    expect(saved.status).toBe('developing'); expect(saved.control_only).toBe(false); expect(saved.pending_wake).toBe('saved-claim'); expect(wakes).toBe(0);
  }
});
test('selected packages remain in the active workspace', async () => {
  const { call, environment } = await fixture();
  await writeFile(path.join(environment.PLUGIN_DATA, 'plugin.json'), '{}');
  await expect(call('development_select', { directory: environment.PLUGIN_DATA })).rejects.toThrow('workspace');
});
test('a failed retry clears previous success evidence', async () => {
  const { call } = await fixture();
  await call('development_scaffold', { name: 'candidate' });
  await call('development_test', { executable: 'node', args: [] }, { run: async () => ({ passed: true }) });
  const failed = await call('development_test', { executable: 'missing', args: [] }, { run: async () => { throw new Error('Executable unavailable'); } });
  expect(failed.passed).toBe(false); expect(failed.error).toBe('Executable unavailable');
  expect((await call('development_status')).evidence.tests.passed).toBe(false);
});
test('process failures and timeouts are real gate failures', async () => {
  const failed = await runProcess(process.execPath, ['-e', 'process.stderr.write("failure"); process.exit(7)']);
  expect(failed.passed).toBe(false); expect(failed.code).toBe(7); expect(failed.stderr).toBe('failure');
  const timed = await runProcess(process.execPath, ['-e', 'setInterval(() => {}, 100)'], { timeoutMs: 100 });
  expect(timed.passed).toBe(false); expect(timed.timed_out).toBe(true);
});
test('runtime assertions require matching JSON including exact array cardinality', () => {
  expect(matches({ isError: false, content: [{ type: 'text', text: 'ok' }] }, { content: [{ text: 'ok' }] })).toBe(true);
  expect(matches({ isError: true }, { isError: false })).toBe(false);
  expect(matches([1, 2], [1])).toBe(false);
});
test('Runtime startup failure still retains a failed report and logs', async () => {
  const { call, workspace } = await fixture();
  const state = await call('development_scaffold', { name: 'candidate' });
  const report = await runtimeAcceptance({ executable: process.execPath, packageDirectory: state.package, workspace,
    outputDirectory: path.join(workspace, 'evidence'), timeoutMs: 2000 });
  expect(report.passed).toBe(false);
  expect(report.error).toContain('before readiness');
  expect(JSON.parse(await readFile(report.report_path, 'utf8')).passed).toBe(false);
  expect((await readFile(report.logs.stderr, 'utf8')).length).toBeGreaterThan(0);
});
test('file-backed child IO preserves stdin and Unicode and fails output overflow', async () => {
  const echo = await runProcess(process.execPath, ['-e', 'process.stdin.setEncoding("utf8");process.stdin.on("data",s=>process.stdout.write(s))'], { input: '插件测试 🧪' });
  expect(echo.passed).toBe(true); expect(echo.stdout).toBe('插件测试 🧪');
  const overflow = await runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(4096))'], { limit: 1024 });
  expect(overflow.passed).toBe(false); expect(overflow.output_overflow).toBe(true); expect(overflow.stdout.length).toBeLessThanOrEqual(1024);
});
