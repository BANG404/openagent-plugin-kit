import os from 'node:os';
import { startLoggedProcess } from './logged-process.mjs';

// Shell-free invocation, bounded output and timeout. All children inherit the
// plugin's process sandbox; no command grants host access or modifies grants.
export async function runProcess(command, args, { cwd, env = process.env, timeoutMs = 120000, input = '', limit = 1024 * 1024 } = {}) {
  if (typeof command !== 'string' || !command || !Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new Error('Use an executable and a string argv array');
  const process = await startLoggedProcess(command, args, { cwd, env, input, limit, directory: env.PLUGIN_DATA ?? os.tmpdir() });
  let timedOut = false, output;
  const deadline = Date.now() + timeoutMs;
  try {
    while (!process.exited) {
      output = await process.read();
      if (Date.now() >= deadline) { timedOut = true; process.child.kill('SIGKILL'); break; }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    if (!process.exited) await Promise.race([new Promise(resolve => process.child.once('close', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
    if (process.error) throw process.error;
    output = await process.read();
    return { code: process.code, ...output, timed_out: timedOut, output_overflow: process.overflow, passed: process.code === 0 && !timedOut && !process.overflow };
  } finally { await process.close(); }
}
