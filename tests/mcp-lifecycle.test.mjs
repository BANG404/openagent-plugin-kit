import { test, expect } from 'bun:test';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../lib/development-process.mjs';

test('renewal and unmount share a lock, and failed cancellation never resumes renewal', async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), 'plugin-lease-'));
  const calls = [];
  let rejectUnmount = false;
  const server = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const call = JSON.parse(raw); calls.push(call.operation);
    await new Promise(resolve => setTimeout(resolve, 30));
    const failed = rejectUnmount && call.operation === 'mcp.unmount';
    if (call.operation === 'mcp.unmount') rejectUnmount = true;
    response.writeHead(failed ? 500 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(failed ? { ok: false, error: 'Unmount transport failed' } : { ok: true, result: {} }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const moduleUrl = new URL('../templates/mcp-lifecycle/lib/lease.mjs', import.meta.url).href;
    const script = `import assert from 'node:assert/strict';
      const {setLease,renew,readLease} = await import(${JSON.stringify(moduleUrl)});
      await setLease(); await Promise.all([renew(),setLease({active:false})]);
      assert.equal((await readLease()).active,false); await renew();
      await setLease(); await assert.rejects(setLease({active:false}),/Unmount transport failed/);
      assert.equal((await readLease()).active,false); await renew();`;
    const result = await runProcess('node', ['--input-type=module', '-e', script], { env: {
      ...process.env, PLUGIN_DATA: data, OPENAGENT_PLUGIN_HOST_URL: `http://127.0.0.1:${server.address().port}`,
      OPENAGENT_PLUGIN_HOST_TOKEN: 'fixture',
    } });
    expect(result.passed).toBe(true);
    expect(calls.slice(-2)).toEqual(['mcp.mount', 'mcp.unmount']);
    expect(calls.filter(operation => operation === 'mcp.unmount')).toHaveLength(2);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(data, { recursive: true });
  }
});
