import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {ingressFetch} from '../dist/packages/mcp-client/src/ingress.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const f=JSON.parse(readFileSync('.local/m5-identity.json','utf8')),checks=[];
for(const mode of ['auto','legacy']){const client=new Client({name:'relay-m5-business',version:'0.5.0'},{versionNegotiation:{mode}});try{await client.connect(new StreamableHTTPClientTransport(new URL('http://relay.localhost:18080/mcp'),{fetch:ingressFetch,requestInit:{headers:{Authorization:`Bearer ${f.key}`}}}));const list=(await client.listTools()).tools;assert.equal(list.length,18);
 for(const store of f.stores){const alias=name=>`store_${store.id.replaceAll('-','')}_${name}`;const checkout=JSON.parse(readFileSync(`docs/evidence/m5/${store.id.slice(0,8)}/checkout.json`,'utf8'));
  const r=await client.callTool({name:alias('get_order'),arguments:{order_id:checkout.orderId}});assert.notEqual(r.isError,true);assert.equal(r.structuredContent.order.total,checkout.total);
  const page=await client.callTool({name:alias('list_orders'),arguments:{per_page:1}});assert.notEqual(page.isError,true);assert.equal(page.structuredContent.pagination.per_page,1);assert.equal(page.structuredContent.orders.length,1);
  const products=await client.callTool({name:alias('list_products'),arguments:{per_page:1}});assert(products.structuredContent.pagination.next_page);
  if(mode==='auto'){
   const sku=`M5-${randomUUID().slice(0,8)}`;const create=await client.callTool({name:alias('create_product'),arguments:{name:'[SYNTHETIC M5] Isolation probe',sku,regular_price:'0.30'}});assert.notEqual(create.isError,true);const id=create.structuredContent.product.id;assert.equal(create.structuredContent.product.regular_price,'0.30');
   const own=await client.callTool({name:alias('list_products'),arguments:{sku}});assert.equal(own.structuredContent.products[0].id,id);
   const other=f.stores.find(s=>s.id!==store.id);const foreign=await client.callTool({name:`store_${other.id.replaceAll('-','')}_list_products`,arguments:{sku}});assert.equal(foreign.structuredContent.products.length,0);
   const update=await client.callTool({name:alias('update_order_status'),arguments:{order_id:checkout.orderId,status:'completed'}});assert.equal(update.structuredContent.order.status,'completed');const saved=await client.callTool({name:alias('get_order'),arguments:{order_id:checkout.orderId}});assert.equal(saved.structuredContent.order.status,'completed');const restore=await client.callTool({name:alias('update_order_status'),arguments:{order_id:checkout.orderId,status:checkout.status}});assert.equal(restore.structuredContent.order.status,checkout.status);
   const failure=await client.callTool({name:alias('get_order'),arguments:{order_id:2147483000}});assert.equal(failure.isError,true);
   checks.push({store:store.id,createdProduct:id,sku,actualOrder:checkout.orderId,orderRestored:true,dataIsolated:true,errorPropagated:true});
  }
 }
 checks.push({mode,era:client.getDiscoverResult()?'modern':'legacy',actualTools:list.length});
 }finally{await client.close();}}
writeFileSync('docs/evidence/m5/business.json',JSON.stringify({at:new Date().toISOString(),passed:true,checks},null,2)+'\n');console.log(JSON.stringify({passed:true,groups:checks.length}));
