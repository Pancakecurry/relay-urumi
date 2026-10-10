import {URL} from 'node:url';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve('/app/public');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'};
createServer(async(req,res)=>{try{
res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','same-origin');res.setHeader('permissions-policy','camera=(), microphone=(), geolocation=()');
res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
if(req.url==='/health/ready'||req.url==='/health/live'){res.end('ready');return;}
if(req.url.startsWith('/internal/')||req.url.startsWith('/mcp')||req.url.startsWith('/.')){res.writeHead(404);res.end();return;}
if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(p!==root&&!p.startsWith(root+'/')){res.writeHead(403);res.end();return;}
let file=p;try{if(!(await stat(file)).isFile())file=root+'/index.html';}catch{if(extname(p)){res.writeHead(404);res.end();return;}file=root+'/index.html';}
const content=await readFile(file);res.setHeader('content-type',mime[extname(file)]??'application/octet-stream');res.setHeader('cache-control',file.includes('/assets/')?'public,max-age=31536000,immutable':'no-store');res.end(req.method==='HEAD'?undefined:content);
}catch{res.writeHead(500);res.end('Resource unavailable');}}).listen(3002,'0.0.0.0');
