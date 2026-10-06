import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, readdir, lstat, realpath } from 'node:fs/promises';
import { writeAtomic } from './atomic-file.mjs';
import path from 'node:path';

export const terminalStatuses = new Set(['cancelled', 'awaiting_acceptance', 'accepted', 'exhausted']);
export function statePath(conversationId, environment = process.env) {
  if (!conversationId || !environment.PLUGIN_DATA) throw new Error('Conversation and PLUGIN_DATA are required');
  return path.join(environment.PLUGIN_DATA, 'development', createHash('sha256').update(conversationId).digest('hex') + '.json');
}
export async function readState(conversationId, environment) {
  try { return JSON.parse(await readFile(statePath(conversationId, environment), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function updateState(conversationId, update, environment) {
  const file = statePath(conversationId, environment);
  await mkdir(path.dirname(file), { recursive: true });
  const lock = file + '.lock';
  for (let retry = 0; ; retry++) {
    try { await mkdir(lock); break; }
    catch (error) {
      if (error.code !== 'EEXIST' || retry >= 100) throw error;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  try {
    const state = await update(await readState(conversationId, environment));
    if (state) {
      await writeAtomic(file, JSON.stringify(state, null, 2) + '\n');
    }
    return state;
  } finally { await rm(lock, { recursive: true }); }
}
export async function inside(root, candidate) {
  const base = await realpath(root);
  const target = await realpath(candidate);
  const relative = path.relative(base, target);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Path leaves the workspace');
  return target;
}
// Include dependencies and build output: both can change executable behavior.
const ignored = new Set(['.git']);
export async function packageDigest(root) {
  const hash = createHash('sha256');
  let bytes = 0;
  async function visit(directory, prefix = '') {
    for (const entry of (await readdir(directory)).sort()) {
      if (ignored.has(entry)) continue;
      const file = path.join(directory, entry), name = prefix + entry;
      const stat = await lstat(file);
      if (stat.isSymbolicLink()) throw new Error('Acceptance packages cannot contain symlinks');
      if (stat.isDirectory()) await visit(file, name + '/');
      else if (stat.isFile()) {
        bytes += stat.size;
        if (bytes > 64 * 1024 * 1024) throw new Error('Acceptance package exceeds 64 MiB');
        hash.update(name + '\0').update(await readFile(file)).update('\0');
      }
    }
  }
  await visit(root);
  return hash.digest('hex');
}
export function assertBranch(state, context) {
  if (!state) throw new Error('Start with /openagent-plugin-kit:create');
  if (state.branch_id && context.branchId !== state.branch_id) throw new Error('Workflow belongs to another branch');
}
export function newWorkflow(request, specification) {
  const maxIterations = specification.max_iterations ?? 12;
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 100) throw new Error('max_iterations must be 1..100');
  return { version: 1, id: randomUUID(), conversation_id: request.conversation_id,
    branch_id: request.branch_id ?? null, specification, status: 'developing', iteration: 0,
    max_iterations: maxIterations, evidence: {}, created_at: new Date().toISOString() };
}
