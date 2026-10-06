import { createInterface } from 'node:readline';
import { developmentTools, callDevelopmentTool } from '../lib/development-tools.mjs';

const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
// Serialize requests so concurrent writes cannot overwrite gate evidence.
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  let request;
  try {
    request = JSON.parse(line);
    if (request.id === undefined) continue;
    if (request.method === 'initialize') send(request.id, { protocolVersion: request.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'openagent-plugin-development', version: '1.2.0' } });
    else if (request.method === 'ping') send(request.id, {});
    else if (request.method === 'tools/list') send(request.id, { tools: developmentTools });
    else if (request.method === 'tools/call') {
      try {
        const result = await callDevelopmentTool(request.params.name, request.params.arguments ?? {});
        send(request.id, { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: false });
      } catch (error) { send(request.id, { content: [{ type: 'text', text: error.message }], isError: true }); }
    } else process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Unknown method' } }) + '\n');
  } catch (error) { process.stderr.write(error.message + '\n'); }
}
