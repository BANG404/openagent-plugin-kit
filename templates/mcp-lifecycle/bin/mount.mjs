import { setLease } from '../lib/lease.mjs';
process.stdin.setEncoding('utf8');
let input=''; for await (const chunk of process.stdin) input+=chunk;
const request=JSON.parse(input);
const [mode='relay',ttl='120']=(request.argument ?? '').trim().split(/\s+/).filter(Boolean);
const unmount=request.command.endsWith(':unmount');
await setLease({active:!unmount,mode,ttl_secs:Number(ttl)});
console.log(unmount ? 'Tool lease revoked. Renewal is stopped.' : `Tool lease renewed in ${mode} mode for ${ttl} seconds. Read the bridge status and assemble the next turn to use the changed catalog.`);
