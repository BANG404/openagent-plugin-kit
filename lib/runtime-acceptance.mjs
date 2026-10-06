import { startLoggedProcess } from './logged-process.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { writeAtomic } from './atomic-file.mjs';
import path from 'node:path';
import { packageDigest } from './development-state.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export function matches(actual, expected) {
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every((value, index) => matches(actual[index], value));
  if (expected && typeof expected === 'object') return actual && typeof actual === 'object' && Object.entries(expected).every(([key, value]) => matches(actual[key], value));
  return actual === expected;
}

/** Start the ordinary desktop Runtime server, exercising its shipped API.
 * Never connects to, installs into, or edits an existing developer/release home.
 * The caller selects the executable; both dev and release artifacts use the
 * production operations route, and the report records the exact binary hash.
 */
export async function runtimeAcceptance({ executable, packageDirectory, workspace, outputDirectory, plan = {}, timeoutMs = 90000, environment = process.env, permissionProfile, verify }) {
  const manifest = JSON.parse(await readFile(path.join(packageDirectory, 'plugin.json'), 'utf8'));
  const digest = await packageDigest(packageDirectory);
  const binaryDigest = createHash('sha256').update(await readFile(executable)).digest('hex');
  const runDirectory = path.join(outputDirectory, randomUUID());
  const home = path.join(runDirectory, 'home');
  await mkdir(home, { recursive: true });
  const token = randomUUID() + randomUUID();
  // Credentials, prior runtime state and bridge credentials are not inherited.
  const env = Object.fromEntries(Object.entries(environment).filter(([key]) => /^(PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|LANG|LC_ALL)$/i.test(key)));
  Object.assign(env, { OPENAGENT_HOME: home, OPENAGENT_PLUGIN_ACCEPTANCE_TOKEN: token });
  const controlFile = path.join(runDirectory, 'runtime.control');
  await writeFile(controlFile, 'running');
  const process = await startLoggedProcess(executable, ['--desktop-api', '--control-file', controlFile, '--workspace', workspace, '--listen', '127.0.0.1:0', '--token-env', 'OPENAGENT_PLUGIN_ACCEPTANCE_TOKEN', '--output', 'json'], { env, cwd: workspace, directory: runDirectory });
  let stdout = '', stderr = '', ready;
  async function collectOutput() {
    ({ stdout, stderr } = await process.read());
    if (process.overflow) throw new Error('Runtime output exceeded the log limit');
    for (const line of stdout.split('\n')) {
      try { const message = JSON.parse(line); if (message.type === 'ready') ready = message; } catch {}
    }
  }
  const deadline = Date.now() + timeoutMs;
  const report = { schema_version: 1, digest, plugin_id: manifest.name, package: packageDirectory,
    executable, binary_sha256: binaryDigest,
    home, api: 'production-desktop', passed: false, checks: [], started_at: new Date().toISOString() };
  async function request(route, body) {
    await collectOutput();
    if (Date.now() >= deadline) throw new Error('Runtime acceptance timed out');
    const response = await fetch(new URL(route, ready.endpoint), { method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(Math.min(15000, deadline - Date.now())) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? JSON.stringify(result));
    return result;
  }
  const operation = (name, args = {}) => request('/api/desktop/operations', { operation: name, args });
  const subscribe = async (route, signal) => {
    const response = await fetch(new URL(route, ready.endpoint), { headers: { authorization: `Bearer ${token}` }, signal });
    if (!response.ok) throw new Error('Runtime event subscription failed: ' + response.status);
    return response.body;
  };
  try {
    while (!ready) {
      await collectOutput();
      if (process.error) throw process.error;
      if (process.exited) throw new Error('Runtime exited before readiness');
      if (Date.now() >= deadline) throw new Error('Runtime readiness timed out');
      await delay(100);
    }
    const endpoint = new URL(ready.endpoint);
    if (endpoint.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('Runtime readiness must advertise loopback HTTP');
    report.runtime = { version: ready.version, protocol: ready.protocol };
    await request('/api/desktop/health');
    if (permissionProfile) {
      const configuration = await operation('get_settings');
      await operation('save_settings', { config: { ...configuration, permission_profile: permissionProfile }, baseConfig: configuration });
      report.permission_profile = permissionProfile;
    }
    const installed = await operation('install_agent_plugin', { source: packageDirectory });
    if (installed.id !== manifest.name || installed.error || installed.warnings?.length) throw new Error('Installed package has identity errors or component diagnostics: ' + JSON.stringify(installed.warnings ?? installed.error));
    report.checks.push({ kind: 'installation', passed: true, version: installed.version });
    const commands = await request('/api/commands');
    const serializedCommands = JSON.stringify(commands);
    for (const command of manifest.extensions?.openagent?.commands ?? []) {
      if (!serializedCommands.includes(`${manifest.name}:${command.id}`)) throw new Error('Missing installed slash command: ' + command.id);
      report.checks.push({ kind: 'command_catalog', id: command.id, passed: true });
    }
    const calls = plan.tools ?? [];
    if (verify) {
      const checks = await verify({ request, operation, subscribe, ready, home, installed, deadline });
      if (!Array.isArray(checks) || !checks.length || checks.some(check => check.passed !== true)) throw new Error('Specialized Runtime verification did not produce passing assertions');
      report.checks.push(...checks);
    }
    if (installed.mcp_servers?.length && !calls.length && !verify) throw new Error('MCP packages require explicit tool assertions in the acceptance plan');
    for (const test of calls) {
      if (typeof test.name !== 'string' || (!Object.hasOwn(test, 'expected') && typeof test.expected_error !== 'string')) throw new Error('Each tool case needs a name and expected result or expected_error');
      if (test.delay_ms !== undefined) {
        if (!Number.isInteger(test.delay_ms) || test.delay_ms < 0 || test.delay_ms > 5000) throw new Error('Tool delay_ms must be 0..5000');
        await delay(test.delay_ms);
      }
      let result;
      let expectedError;
      for (;;) {
        try { result = await operation('call_agent_plugin_tool', { plugin_id: manifest.name, tool_name: test.name, arguments: test.arguments ?? {} }); break; }
        catch (error) {
          if (test.expected_error && error.message.includes(test.expected_error)) { expectedError = error.message; break; }
          // Only a pre-dispatch connection-not-ready error can be retried.
          if (!/MCP server is not connected|unknown MCP server|plugin tool is not connected or not declared/i.test(error.message) || Date.now() >= deadline) throw error;
          await delay(150);
        }
      }
      if (!expectedError && (test.expected_error || !matches(result, test.expected))) throw new Error('Tool assertion failed: ' + test.name + ': ' + JSON.stringify(result));
      report.checks.push({ kind: 'tool', name: test.name, passed: true, result, expected_error: expectedError });
    }
    if (await packageDigest(packageDirectory) !== digest) throw new Error('Package changed during Runtime acceptance');
    report.passed = true;
  } catch (error) { report.error = error.message; }
  finally {
    const fail = error => { report.passed = false; report.error = [report.error, error.message].filter(Boolean).join('; '); };
    try { await writeAtomic(controlFile, 'shutdown'); } catch (error) { fail(error); }
    const stopDeadline = Date.now() + 5000;
    while (!process.exited && Date.now() < stopDeadline) await delay(100);
    if (!process.exited) {
      try { process.child.kill(); await Promise.race([new Promise(resolve => process.child.once('close', resolve)), delay(3000)]); } catch (error) { fail(error); }
      if (!process.exited) fail(new Error('Runtime did not exit after termination'));
    }
    try { await collectOutput(); } catch (error) { fail(error); }
    try { await process.close(); } catch (error) { fail(error); }
    const redact = value => value.split(token).join('[redacted]');
    await writeFile(path.join(runDirectory, 'runtime.stdout.log'), redact(stdout));
    await writeFile(path.join(runDirectory, 'runtime.stderr.log'), redact(stderr));
    report.logs = { stdout: path.join(runDirectory, 'runtime.stdout.log'), stderr: path.join(runDirectory, 'runtime.stderr.log') };
    report.report_path = path.join(runDirectory, 'report.json');
    await writeFile(report.report_path, JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}
