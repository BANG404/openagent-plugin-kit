import { readStdin } from '../lib/stdin.mjs';
import { newWorkflow, updateState, packageDigest } from '../lib/development-state.mjs';

const request = JSON.parse(await readStdin());
const id = request.conversation_id;
const command = request.command.split(':').at(-1);
if (command === 'create') {
  const argument = (request.argument ?? '').trim();
  const spec = argument.startsWith('{') ? JSON.parse(argument) : { goal: argument };
  if (typeof spec.goal !== 'string' || !spec.goal.trim()) throw new Error('A development goal is required');
  const workflow = await updateState(id, state => {
    if (state?.branch_id && request.branch_id !== state.branch_id) throw new Error('Workflow belongs to another branch');
    return newWorkflow(request, spec);
  });
  console.log(`Use the openagent-plugin-development Skill and the kit MCP tools to implement this specification: ${JSON.stringify(spec)}. Workflow ${workflow.id}. Establish explicit acceptance criteria, scaffold from the requested template/repository, implement, validate, test, and qualify exact package bytes in an isolated production Runtime server. Repair every failed gate. Call development_ready only after all gates pass; then present the candidate for developer acceptance. Do not publish automatically. Never mark completion from intentions or a successful HTTP response alone.`);
} else if (command === 'stop') {
  await updateState(id, state => {
    if (state?.branch_id && request.branch_id !== state.branch_id) throw new Error('Workflow belongs to another branch');
    return state ? { ...state, status: 'cancelled', pending_wake: null } : null;
  });
  console.log('Plugin development is cancelled. Report saved candidate and evidence; stop automated continuation.');
} else if (command === 'resume') {
  await updateState(id, state => {
    if (!state) throw new Error('No development workflow');
    if (state.branch_id && request.branch_id !== state.branch_id) throw new Error('Workflow belongs to another branch');
    if (state.status === 'accepted') throw new Error('Accepted workflow is terminal; create a new workflow');
    return { ...state, status: 'developing', iteration: 0, pending_wake: null, control_only: false };
  });
  console.log('Resume the saved plugin development workflow. Re-read development_status and the development Skill; revalidate changed bytes and complete all remaining gates.');
} else if (command === 'accept') {
  await updateState(id, async state => {
    if (!state || state.status !== 'awaiting_acceptance') throw new Error('No qualified candidate awaits acceptance');
    if (state.branch_id && request.branch_id !== state.branch_id) throw new Error('Workflow belongs to another branch');
    if (await packageDigest(state.package) !== state.digest) throw new Error('Candidate changed; qualify again');
    return { ...state, status: 'accepted', accepted_at: new Date().toISOString() };
  });
  console.log('The developer accepted the qualified plugin candidate. Report its package path and evidence. Publication requires a separate instruction.');
} else {
  const state = await updateState(id, state => {
    if (!state) return null;
    if (state.branch_id && request.branch_id !== state.branch_id) throw new Error('Workflow belongs to another branch');
    return { ...state, control_only: true };
  });
  console.log(`Report this saved plugin development state without starting implementation: ${JSON.stringify(state)}`);
}
