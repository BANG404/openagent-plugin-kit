import { createInterface } from 'node:readline';
import { bridge, setLease } from '../lib/lease.mjs';
const control=process.argv[2]==='control';
const tools=control ? [
  {name:'lease_set',description:'Start/renew or revoke the declared tools server lease. The control server stays available.',inputSchema:{type:'object',properties:{active:{type:'boolean'},mode:{enum:['direct','relay']},ttl_secs:{type:'integer',minimum:1,maximum:86400}}}},
  {name:'lease_status',description:'Read the tools server lease and effective mode.',inputSchema:{type:'object',properties:{}}}
] : [{name:'leased_echo',description:'Echo while the tools lease is mounted.',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']}}];
for await (const line of createInterface({input:process.stdin})) {
  const request=JSON.parse(line); if (request.id===undefined) continue;
  let result;
  if (request.method==='initialize') result={protocolVersion:request.params?.protocolVersion ?? '2024-11-05',capabilities:{tools:{}},serverInfo:{name:control?'lease-control':'leased-tools',version:'1.0.0'}};
  else if (request.method==='ping') result={};
  else if (request.method==='tools/list') result={tools};
  else if (request.method==='tools/call') {
    try {
      const {name,arguments:args={}}=request.params;
      let value;
      if (control && name==='lease_set') value=await setLease(args);
      else if (control && name==='lease_status') value=await bridge('mcp.status',{server:'tools'});
      else if (!control && name==='leased_echo' && typeof args.text==='string') value={text:args.text};
      else throw new Error('Unknown tool or invalid arguments');
      result={content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,isError:false};
    } catch (error) { result={content:[{type:'text',text:error.message}],isError:true}; }
  } else { process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Unknown method'}})+'\n'); continue; }
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
}
