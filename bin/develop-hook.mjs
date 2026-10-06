import { readStdin } from '../lib/stdin.mjs';
import { pathToFileURL } from 'node:url';
import { createHostClient, hookContext, hookEvent } from '../lib/openagent-host.mjs';
import { updateState, terminalStatuses } from '../lib/development-state.mjs';

export async function continueDevelopment(payload, { environment = process.env, host } = {}) {
  const event = hookEvent(payload), context = hookContext(payload, { requiredConversation: false });
  const executionId = event.execution_id;
  if (!context.conversationId) return;
  let claimed = false;
  const wake = await updateState(context.conversationId, state => {
    if (!state || terminalStatuses.has(state.status) || (state.branch_id && state.branch_id !== context.branchId)) return null;
    if (state.control_only) return event.phase.startsWith('final_') ? { ...state, control_only: false, last_execution_id: executionId } : null;
    if (['final_cancelled', 'final_failed'].includes(event.phase)) return { ...state, status: event.phase === 'final_cancelled' ? 'cancelled' : 'failed', pending_wake: null };
    // Approval, input, interruption and failed turns never start a competing run.
    if (event.phase !== 'final_completed' || state.status === 'failed') return null;
    if (!executionId) throw new Error('Development continuation requires Runtime hook execution_id');
    if (state.last_execution_id === executionId) return null;
    if (state.pending_wake) return null;
    if (state.iteration >= state.max_iterations) return { ...state, status: 'exhausted', pending_wake: null };
    claimed = true;
    return { ...state, branch_id: state.branch_id ?? context.branchId, iteration: state.iteration + 1,
      last_execution_id: executionId, pending_wake: executionId };
  }, environment);
  if (!claimed) return;
  try {
    await (host ?? createHostClient({ environment })).agent.wake({ conv_id: context.conversationId,
      branch_id: context.branchId, hidden: true, wait: false,
      text: 'Continue the saved plugin development workflow. Read development_status and the development Skill. Complete the next unmet acceptance gate, fix concrete failures, and rerun changed evidence. If all gates pass, call development_ready and present the candidate. Wait for developer acceptance; never publish or grant permissions automatically.' });
    await updateState(context.conversationId, state => state?.id === wake.id && state.pending_wake === wake.pending_wake ? { ...state, pending_wake: null } : null, environment);
  } catch (error) {
    await updateState(context.conversationId, state => state?.id === wake.id ? { ...state, status: 'failed', pending_wake: null, error: error.message } : null, environment);
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await continueDevelopment(JSON.parse(await readStdin()));
}
