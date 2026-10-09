import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

const id = JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8')).name;
let ready = id === 'fakechat';
if (id === 'telegram' || id === 'discord') {
  try {
    const lines = readFileSync(path.join(process.env.PLUGIN_DATA, 'channel', '.env'), 'utf8').split(/\r?\n/);
    ready = lines.some(line => {
      const match = line.match(/^([A-Z_]+)\s*=\s*(.*?)\s*$/);
      return match?.[1] === id.toUpperCase() + '_BOT_TOKEN' && match[2].replace(/^(['"])(.*)\1$/, '$2').trim().length > 0;
    });
  } catch {}
}
if (id === 'imessage') ready = process.platform === 'darwin' && existsSync(path.join(homedir(), 'Library', 'Messages', 'chat.db'));
process.env.OPENAGENT_CHANNEL_READY = String(ready);
await import(ready ? './integration.mjs' : './unavailable.mjs');
