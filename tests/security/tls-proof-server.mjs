import {setInterval} from 'node:timers';
import console from 'node:console';
// Isolated real MCP/TLS compatibility proof, not a simulated upstream result.
import Fastify from 'fastify';
import {hostHeaderValidation,originValidation} from '@modelcontextprotocol/fastify';
import {McpServer,createMcpHandler} from '@modelcontextprotocol/server';
import {toNodeHandler} from '@modelcontextprotocol/node';
import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hostname} from 'node:os';
import * as z from 'zod/v4';
const tls=()=>{const d=realpathSync('/run/tls/..data');return{cert:readFileSync(d+'/tls.crt'),key:readFileSync(d+'/tls.key'),ca:readFileSync(d+'/ca.crt'),minVersion:'TLSv1.3'};};
const app=Fastify({https:tls(),logger:false});app.addHook('onRequest',hostHeaderValidation(['localhost','tls-proof.relay.localhost','tls-proof']));app.addHook('onRequest',originValidation(['localhost','tls-proof.relay.localhost']));
const timer=setInterval(()=>{try{app.server.setSecureContext(tls());}catch{console.error('TLS refresh unavailable');}},2000);timer.unref();
const handler=toNodeHandler(createMcpHandler(()=>{const s=new McpServer({name:'relay-real-tls-proof',version:'0.6.0'});s.registerTool('ping',{inputSchema:z.strictObject({message:z.string().min(1).max(100)})},async({message})=>({content:[{type:'text',text:JSON.stringify({pong:message,pod:hostname()})}]}));return s;}));
app.get('/health/ready',async()=>({ready:true,certificateSha256:createHash('sha256').update(tls().cert).digest('hex')}));app.all('/mcp',async(req,reply)=>{reply.hijack();await handler(Object.assign(req.raw,{method:req.method,url:req.url}),reply.raw,req.body);});await app.listen({host:'0.0.0.0',port:3000});
