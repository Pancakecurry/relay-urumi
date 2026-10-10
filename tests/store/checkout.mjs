import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { api, secret, site, namespace } from './client.mjs';
const existing=process.argv.includes('--verify-existing');
const evidenceDir=process.env.STORE_EVIDENCE_DIR || 'docs/evidence/m1';
const products=await api('products?sku=RELAY-DEMO-MUG&per_page=1');
if(products.status!==200)throw new Error(`Authenticated products status ${products.status}; code ${products.body.code}`);
const product=products.body.find(x=>x.sku==='RELAY-DEMO-MUG');
if(!product)throw new Error('Synthetic product missing');
const unauthorized=await api('orders',false);
if(unauthorized.status!==401)throw new Error('Unauthenticated order access not rejected');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const page=await context.newPage();
 let orderId;
 if(existing){orderId=JSON.parse(readFileSync('docs/evidence/m1/checkout.json','utf8')).orderId;}
 else{
  await page.goto(product.permalink,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Add to cart',exact:true}).click();
  await expect(page.getByRole('link',{name:'View cart',exact:true}).first()).toBeVisible();
  await page.goto(`${site}/cart/`);
  await page.getByRole('link',{name:'Proceed to checkout'}).click();
  await page.locator('#billing_first_name').fill('Synthetic');
  await page.locator('#billing_last_name').fill('M1 Demo');
  await page.locator('#billing_country').selectOption('IN');
  await page.locator('#billing_address_1').fill('1 Synthetic Test Street');
  await page.locator('#billing_city').fill('New Delhi');
  await page.locator('#billing_state').selectOption('DL');
  await page.locator('#billing_postcode').fill('110001');
  await page.locator('#billing_phone').fill('9999999999');
  await page.locator('#billing_email').fill('synthetic-m1@example.test');
  await expect(page.locator('#payment_method_cod')).toBeChecked({timeout:30000});
  await page.screenshot({path:`${evidenceDir}/cod-checkout.png`,fullPage:true});
  await page.getByRole('button',{name:'Place order',exact:true}).click();
  await expect(page.getByText('Thank you. Your order has been received.')).toBeVisible({timeout:60000});
  const match=new URL(page.url()).pathname.match(/\/order-received\/(\d+)\//);
  if(!match)throw new Error('Missing real order ID in received-order route');
  orderId=Number(match[1]);
  await page.screenshot({path:`${evidenceDir}/order-received.png`,fullPage:true});
 }
 const order=await api(`orders/${orderId}`);
 if(order.status!==200||order.body.payment_method!=='cod'||order.body.billing.email!=='synthetic-m1@example.test'||!order.body.line_items.some(x=>x.product_id===product.id))throw new Error('Actual order API does not match checkout');
 const admin=secret('store-admin');
 await page.goto(`${site}/wp-login.php`);
 await page.locator('#user_login').fill(admin.username);await page.locator('#user_pass').fill(admin.password);
 await page.locator('#wp-submit').click();await expect(page.locator('#wpadminbar')).toBeVisible({timeout:30000});
 await page.goto(`${site}/wp-admin/admin.php?page=wc-orders&action=edit&id=${orderId}`);
 await expect(page.getByText('Synthetic M1 Demo',{exact:false}).first()).toBeVisible({timeout:30000});
 await expect(page.getByText('Cash on delivery',{exact:false}).first()).toBeVisible();
 await page.screenshot({path:`${evidenceDir}/admin-order${existing?'-after-replacement':''}.png`,fullPage:true});
 const marker=await context.request.get(`${site}/wp-content/uploads/relay-persistence.txt`);
 if(await marker.text()!=='relay-m1-synthetic-persistent-content\n')throw new Error('Content persistence marker mismatch');
 const result={at:new Date().toISOString(),namespace,site,browser:await browser.version(),productId:product.id,orderId,paymentMethod:order.body.payment_method,status:order.body.status,total:order.body.total,authenticatedRestStatus:order.status,unauthenticatedOrdersStatus:unauthorized.status,orderVerifiedInAdmin:true,contentMarkerVerified:true,afterPodReplacement:existing,realBrowserCheckout:!existing};
 writeFileSync(`${evidenceDir}/${existing?'after-replacement':'checkout'}.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
