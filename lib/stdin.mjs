export async function readStdin() {
  process.stdin.setEncoding('utf8');
  let text = '';
  for await (const chunk of process.stdin) {
    text += chunk.toString();
    if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('Plugin input exceeds 1 MiB');
  }
  return text;
}
