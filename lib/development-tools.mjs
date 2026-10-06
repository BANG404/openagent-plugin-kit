import { cp, mkdir, readFile, writeFile, mkdtemp, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPackage, hasFailures, isPluginName, isComponentPath } from '../scripts/lib/plugin-spec.mjs';
import { context, createHostClient } from './openagent-host.mjs';
import { assertBranch, inside, packageDigest, readState, updateState, terminalStatuses } from './development-state.mjs';
import { runProcess } from './development-process.mjs';
import { runtimeAcceptance } from './runtime-acceptance.mjs';

export const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const objectSchema = properties => ({ type: 'object', properties });
const string = { type: 'string' };
export const developmentTools = [
  { name: 'development_status', description: 'Read the saved development workflow, candidate and exact-byte gate evidence.', inputSchema: objectSchema({}) },
  { name: 'development_scaffold', description: 'Create a package inside the active workspace from a bundled template or an explicitly selected HTTPS template repository. Never overwrites a package or runs template code.', inputSchema: { ...objectSchema({ name: string, template: string, template_repository: string, template_ref: string, template_subdirectory: string, description: string }), required: ['name'] } },
  { name: 'development_select', description: 'Select an existing package inside the active workspace, invalidating earlier gate evidence.', inputSchema: { ...objectSchema({ directory: string }), required: ['directory'] } },
  { name: 'development_validate', description: 'Validate the selected plugin against the package standard and required locale coverage. Saves byte-bound diagnostics.', inputSchema: objectSchema({ locales: { type: 'array', items: string } }) },
  { name: 'development_test', description: 'Run a shell-free executable and argv in the package under the inherited process policy. Captures logs, exit code and exact-byte evidence.', inputSchema: { ...objectSchema({ executable: string, args: { type: 'array', items: string } }), required: ['executable', 'args'] } },
  { name: 'development_runtime_acceptance', description: 'Start a selected production Runtime server with an isolated home; install this candidate and assert real MCP tool results. Saves binary identity, package digest, reports and logs.', inputSchema: { ...objectSchema({ executable: string, plan: { type: 'object', properties: { tools: { type: 'array', items: { type: 'object' } } } } }), required: ['executable', 'plan'] } },
  { name: 'development_ready', description: 'Verify all current-byte gates passed and stop the loop at awaiting developer acceptance. Never publishes or grants host access.', inputSchema: objectSchema({}) },
];

export async function callDevelopmentTool(name, args, { environment = process.env, run = runProcess, accept = runtimeAcceptance, permissions = async () => createHostClient({ environment }).call('runtime.permissions') } = {}) {
  const ctx = context(args);
  if (!ctx.conversationId) throw new Error('OpenAgent conversation context is required');
  let state = await readState(ctx.conversationId, environment);
  assertBranch(state, ctx);
  if (name === 'development_status') return state;
  if (terminalStatuses.has(state.status) || state.status === 'failed') throw new Error('Use /openagent-plugin-kit:resume before changing this workflow');
  const workspace = await realpath(ctx.workspace);
  const workflowId = state.id;
  async function save(patch) {
    state = await updateState(ctx.conversationId, current => {
      assertBranch(current, ctx);
      if (current.id !== workflowId || terminalStatuses.has(current.status)) throw new Error('Workflow changed or stopped during the operation');
      return { ...current, branch_id: current.branch_id ?? ctx.branchId, ...patch };
    }, environment);
    return state;
  }
  if (name === 'development_select') {
    const selected = await inside(workspace, path.resolve(workspace, args.directory));
    await readFile(path.join(selected, 'plugin.json'));
    return save({ package: selected, template_source: null, evidence: {}, digest: null });
  }
  if (name === 'development_scaffold') {
    if (!isPluginName(args.name)) throw new Error('Invalid plugin name');
    const target = path.join(workspace, args.name);
    let source = path.join(kitRoot, 'templates', args.template ?? 'minimal'), staging;
    try {
      if (args.template_repository) {
        const url = new URL(args.template_repository);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Template repository must be credential-free HTTPS');
        staging = await mkdtemp(path.join(environment.PLUGIN_DATA, 'template-'));
        const checkout = path.join(staging, 'checkout');
        // Restricted Windows tokens cannot acquire Schannel credentials. Git's
        // OpenSSL backend retains HTTPS certificate verification without SSPI.
        const tls = process.platform === 'win32' ? ['-c', 'http.sslBackend=openssl', '-c', 'core.longpaths=true'] : [];
        const cloned = await run('git', [...tls, '-c', 'core.hooksPath=' + path.join(staging, 'no-hooks'), 'clone', '--depth=1', '--no-recurse-submodules', '--', url.href, checkout], { env: environment });
        if (!cloned.passed) throw new Error('Template checkout failed: ' + cloned.stderr);
        if (args.template_ref) {
          if (!/^[a-f0-9]{40}$/i.test(args.template_ref)) throw new Error('template_ref must be an immutable Git commit');
          const fetched = await run('git', [...tls, '-C', checkout, 'fetch', '--depth=1', 'origin', args.template_ref], { env: environment });
          if (!fetched.passed) throw new Error('Template commit fetch failed: ' + fetched.stderr);
          const checked = await run('git', ['-C', checkout, '-c', 'core.hooksPath=' + path.join(staging, 'no-hooks'), 'checkout', '--detach', args.template_ref], { env: environment });
          if (!checked.passed) throw new Error('Template commit checkout failed: ' + checked.stderr);
        }
        if (!isComponentPath(args.template_subdirectory ?? '.')) throw new Error('Invalid template subdirectory');
        source = await inside(checkout, path.join(checkout, args.template_subdirectory ?? '.'));
        const revision = await run('git', ['-C', checkout, 'rev-parse', 'HEAD'], { env: environment });
        if (!revision.passed) throw new Error('Cannot identify template revision');
        state.template_source = { repository: url.href, revision: revision.stdout.trim(), subdirectory: args.template_subdirectory ?? '.' };
      } else {
        if (!isComponentPath(args.template ?? 'minimal')) throw new Error('Invalid bundled template');
        source = await inside(path.join(kitRoot, 'templates'), source);
        state.template_source = { bundled: args.template ?? 'minimal' };
      }
      const templateReport = inspectPackage(source);
      if (hasFailures(templateReport)) throw new Error('Template has invalid components');
      // Scan every byte before copying; rejects links and excessive packages.
      await packageDigest(source);
      await mkdir(target); // EEXIST always fails, including empty directories.
      await cp(source, target, { recursive: true, filter: file => path.basename(file) !== '.git' });
      const file = path.join(target, 'plugin.json');
      const manifest = JSON.parse(await readFile(file, 'utf8'));
      manifest.name = args.name; manifest.version = '0.1.0'; delete manifest.repository;
      manifest.description = args.description ?? `${args.name} plugin.`;
      for (const messages of Object.values(manifest.extensions?.openagent?.i18n?.translations ?? {})) {
        messages.display_name = args.name; messages.description = manifest.description;
      }
      await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
      return await save({ package: target, template_source: state.template_source, evidence: {}, digest: null });
    } finally { if (staging) await rm(staging, { recursive: true }); }
  }
  if (!state.package) throw new Error('Scaffold or select a package first');
  const selected = await inside(workspace, state.package);
  const before = await packageDigest(selected);
  let gate, result;
  const gateNames = { development_validate: 'validation', development_test: 'tests', development_runtime_acceptance: 'runtime' };
  if (gateNames[name]) await save({ evidence: { ...state.evidence, [gateNames[name]]: { passed: false, digest: before, status: 'running' } } });
  try {
    if (name === 'development_validate') {
      gate = 'validation';
      const report = inspectPackage(selected);
      if (!report.i18n) report.diagnostics.push({ level: 'error', message: 'Plugin must declare i18n' });
      if ((args.locales ?? []).some(locale => !report.i18n?.supported_locales.includes(locale))) report.diagnostics.push({ level: 'error', message: 'Missing required locale' });
      result = { passed: !hasFailures(report), report };
    } else if (name === 'development_test') {
      gate = 'tests'; result = await run(args.executable, args.args, { cwd: selected, env: environment });
      const directory = path.join(environment.PLUGIN_DATA, 'development', 'test-logs'); await mkdir(directory, { recursive: true });
      const log = path.join(directory, workflowId + '-' + Date.now() + '.json');
      await writeFile(log, JSON.stringify(result, null, 2)); result.log_path = log;
    } else if (name === 'development_runtime_acceptance') {
      gate = 'runtime';
      const policy = await permissions();
      if (policy?.version !== 1 || !policy.permission_profile) throw new Error('Runtime does not expose its permission profile');
      result = await accept({ executable: args.executable, packageDirectory: selected, workspace,
        outputDirectory: path.join(environment.PLUGIN_DATA, 'development', 'runtime'), plan: args.plan, environment, permissionProfile: policy.permission_profile });
    } else if (name === 'development_ready') {
      for (const key of ['validation', 'tests', 'runtime']) {
        if (!state.evidence[key]?.passed || state.evidence[key].digest !== before) throw new Error('Missing or stale acceptance gate: ' + key);
      }
      return save({ status: 'awaiting_acceptance', digest: before, pending_wake: null });
    } else throw new Error('Unknown development tool: ' + name);
  } catch (error) {
    if (!gateNames[name]) throw error;
    gate = gateNames[name]; result = { passed: false, error: error.message };
  }
  const after = await packageDigest(selected);
  const evidence = { ...result, digest: before, passed: result.passed === true && before === after,
    checked_at: new Date().toISOString(), ...(before === after ? {} : { error: 'Package changed during this gate' }) };
  await save({ evidence: { ...state.evidence, [gate]: evidence } });
  return evidence;
}
