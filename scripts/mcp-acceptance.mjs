import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { kube, apply, replaceTestPod, finishPod, security, containerSecurity } from './mcp-kube.mjs';
mkdirSync('docs/evidence/m2',{recursive:true});
execFileSync(process.execPath,['scripts/mcp-secrets.mjs'],{stdio:['ignore','pipe','pipe']});
const image=readFileSync('docs/evidence/m2/image.txt','utf8').trim();
// Real fixtures are seeded with Woo CRUD by the operator in WordPress. The acceptance
// client has no store credential, admin credential, Kubernetes token or DB access.
const seedCode=`add_filter('pre_wp_mail','__return_false');$ids=[];
foreach(['2026-10-09T18:30:00Z','2026-10-10T18:29:59Z','2026-10-10T18:30:00Z'] as $date){
 $o=new WC_Order();$o->set_status('processing');$o->set_payment_method('cod');$o->set_payment_method_title('Cash on delivery');
 $o->set_customer_note('Synthetic Demo M2 boundary fixture');$o->set_date_created(strtotime($date));
 $o->add_product(wc_get_product(wc_get_product_id_by_sku('RELAY-DEMO-MUG')),1);$o->calculate_totals();$o->save();$ids[]=$o->get_id();
}echo wp_json_encode(['ids'=>$ids]);`;
const seed=JSON.parse(kube(['exec','-n','relay-store-m1','deployment/demo-store-wp','--','wp','--allow-root','eval',seedCode]));
writeFileSync('docs/evidence/m2/fixtures.json',JSON.stringify({at:new Date().toISOString(),...seed,via:'operator WooCommerce CRUD in WordPress; adapter cannot create orders'},null,2)+'\n');
replaceTestPod('relay-platform','m2-acceptance');
apply({apiVersion:'v1',kind:'Pod',metadata:{name:'m2-acceptance',namespace:'relay-platform',labels:{'relay.test':'m2','relay.role':'gateway'}},
 spec:{restartPolicy:'Never',activeDeadlineSeconds:180,automountServiceAccountToken:false,securityContext:security,
 containers:[{name:'client',image,imagePullPolicy:'IfNotPresent',securityContext:containerSecurity,
 command:['node','dist/packages/mcp-client/src/m2-acceptance.js'],env:[{name:'M2_ORDER_IDS',value:JSON.stringify(seed.ids)}],
 resources:{requests:{cpu:'50m',memory:'64Mi'},limits:{cpu:'500m',memory:'192Mi'}},volumeMounts:[{name:'tokens',mountPath:'/secrets',readOnly:true}]}],
 volumes:[{name:'tokens',secret:{secretName:'m2-acceptance-tokens',defaultMode:0o440}}]}});
try {
 const raw=await finishPod('relay-platform','m2-acceptance',190000);
 const tokens=Object.values(JSON.parse(readFileSync('.local/m2-upstream-tokens.json','utf8')));
 if(tokens.some(token=>raw.includes(token)))throw new Error('Acceptance output contained a credential; refusing to persist');
 const report=JSON.parse(raw);if(!report.passed)throw new Error('Acceptance did not pass');
 writeFileSync('docs/evidence/m2/acceptance.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:report.passed,productId:report.productId,fixtureIds:report.fixtureIds,checks:report.evidence.length,evidence:'docs/evidence/m2/acceptance.json'}));
} catch(e) {
 const raw=kube(['logs','m2-acceptance','-n','relay-platform']);
 const tokens=Object.values(JSON.parse(readFileSync('.local/m2-upstream-tokens.json','utf8')));
 if(!tokens.some(token=>raw.includes(token)))writeFileSync('docs/evidence/m2/acceptance-failure.txt',raw);
 throw e;
} finally { kube(['delete','secret','m2-acceptance-tokens','-n','relay-platform','--ignore-not-found']); }
