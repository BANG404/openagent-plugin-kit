import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

// Small Node implementation of the Bun HTTP surface used by the upstream local
// test channel. All real service adapters otherwise use ordinary Node APIs.
export const Bun = {
  serve(options) {
    const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
    const http = createServer(async (incoming, outgoing) => {
      try {
        const chunks = []; let bytes = 0;
        for await (const chunk of incoming) { bytes += chunk.length; if (bytes > 50 * 1024 * 1024) { outgoing.writeHead(413); outgoing.end(); return; } chunks.push(chunk); }
        const request = new Request(`http://127.0.0.1:${options.port}${incoming.url}`, { method: incoming.method, headers: incoming.headers, ...(bytes ? { body: Buffer.concat(chunks) } : {}) });
        const response = await options.fetch(request, { upgrade: () => false });
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch { outgoing.writeHead(500); outgoing.end('Request failed'); }
    });
    http.on('upgrade', (request, socket, head) => {
      if (request.url !== '/ws') { socket.destroy(); return; }
      const origin = request.headers.origin;
      if (origin && ![`http://127.0.0.1:${options.port}`, `http://localhost:${options.port}`].includes(origin)) { socket.destroy(); return; }
      sockets.handleUpgrade(request, socket, head, ws => {
        options.websocket.open(ws);
        ws.on('message', (data, binary) => options.websocket.message(ws, binary ? data : data.toString()));
        ws.on('close', () => options.websocket.close(ws));
      });
    });
    http.listen(options.port, options.hostname);
    process.stdin.on('end', () => { for (const ws of sockets.clients) ws.terminate(); sockets.close(); http.close(); });
    return http;
  },
};
