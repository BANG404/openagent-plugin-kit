import { readFile, writeFile, mkdir, rm, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const stateFile = () => path.join(process.env.PLUGIN_DATA, 'lease.json');
async function withLeaseLock(action) {
  const lock = stateFile() + '.lock';
  for (let attempt = 0; ; attempt++) {
    try { await mkdir(lock); break; }
    catch (error) {
      if (error.code !== 'EEXIST' || attempt >= 100) throw error;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  try { return await action(); } finally { await rm(lock, { recursive: true }); }
}
async function writeLease(lease) {
  const temporary = stateFile() + '.' + randomUUID();
  try {
    await writeFile(temporary, JSON.stringify(lease) + '\n');
    await rename(temporary, stateFile());
  } finally { await rm(temporary, { force: true }); }
}
export async function bridge(operation, args = {}) {
  const response = await fetch(process.env.OPENAGENT_PLUGIN_HOST_URL, {
    method:'POST', headers:{authorization:`Bearer ${process.env.OPENAGENT_PLUGIN_HOST_TOKEN}`,'content-type':'application/json'},
    body:JSON.stringify({operation,args}), signal:AbortSignal.timeout(10000)
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(body.error ?? 'Host bridge failed');
  return body.result;
}
export async function readLease() {
  try { return JSON.parse(await readFile(stateFile(),'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { active:false }; throw error; }
}
export async function setLease({ active = true, mode = 'relay', ttl_secs = 120 } = {}) {
  if (typeof active !== 'boolean' || !['direct','relay'].includes(mode) || !Number.isInteger(ttl_secs) || ttl_secs < 1 || ttl_secs > 86400) throw new Error('Use active:boolean, direct/relay mode, and ttl_secs:1..86400');
  return withLeaseLock(async () => {
    // Persist cancellation first so a failed unmount cannot restart renewal.
    if (!active) await writeLease({active,mode,ttl_secs});
    const result = await bridge(active ? 'mcp.mount':'mcp.unmount', active ? {server:'tools',mode,ttl_secs}:{server:'tools'});
    if (active) await writeLease({active,mode,ttl_secs});
    return result;
  });
}
export async function renew() {
  return withLeaseLock(async () => {
    const lease = await readLease();
    if (lease.active) await bridge('mcp.mount',{server:'tools',mode:lease.mode,ttl_secs:lease.ttl_secs});
  });
}
