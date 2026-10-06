import { spawn } from 'node:child_process';
import { mkdir, open, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

// File descriptors avoid Windows restricted-token child pipe creation failures.
// The child retains the same token/job; this does not relaunch through a host.
export async function startLoggedProcess(command, args, { cwd, env = process.env, directory, input = '', limit = 1024 * 1024 } = {}) {
  const root = path.join(directory, 'process-' + randomUUID());
  await mkdir(root, { recursive: true });
  const names = ['stdin', 'stdout', 'stderr'].map(name => path.join(root, name));
  await writeFile(names[0], input);
  const handles = [];
  let child;
  try {
    for (let i = 0; i < names.length; i++) handles.push(await open(names[i], i === 0 ? 'r' : 'w+'));
    child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, stdio: handles.map(handle => handle.fd) });
  } catch (error) {
    for (const handle of handles) await handle.close();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  let code, error, exited = false, overflow = false;
  child.once('error', value => { error = value; exited = true; });
  child.once('close', value => { code = value; exited = true; });
  const read = async handle => {
    const size = (await handle.stat()).size;
    const buffer = Buffer.alloc(Math.min(size, limit));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return { text: buffer.subarray(0, bytesRead).toString('utf8'), size };
  };
  return {
    child,
    get exited() { return exited; }, get error() { return error; }, get code() { return code; },
    get overflow() { return overflow; },
    async read() {
      const [stdout, stderr] = await Promise.all([read(handles[1]), read(handles[2])]);
      if (stdout.size + stderr.size > limit) { overflow = true; child.kill('SIGKILL'); }
      return { stdout: stdout.text, stderr: stderr.text };
    },
    async close() {
      for (const handle of handles) await handle.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
