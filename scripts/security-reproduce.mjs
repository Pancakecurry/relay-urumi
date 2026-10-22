import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
const root=process.cwd();
const evidence=join(root,'docs/evidence/m6');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const destination=mkdtempSync(join(homedir(),'Library/Caches/relay-m6-reproduction-'));
const log=[];
function run(file,args,cwd=destination){log.push(`$ ${file} ${args.join(' ')}`);try{const output=execFileSync(file,args,{cwd,encoding:'utf8',maxBuffer:33554432,stdio:['ignore','pipe','pipe']});log.push(output);return output;}catch(error){log.push('Command failed; no private environment or provider calls were loaded.');writeFileSync(join(evidence,'reproducibility.txt'),log.join('\n'));throw new Error(`Committed source reproduction failed during ${file}`);}}
const diskBefore=run('df',['-h',root],root).trim();
const archive=join(destination,'source.tar');
execFileSync('git',['archive','--format=tar','--output='+archive,sourceCommit],{cwd:root,stdio:['ignore','pipe','pipe']});
execFileSync('tar',['-xf',archive,'-C',destination],{stdio:['ignore','pipe','pipe']});
unlinkSync(archive); // Only the archive just created in this fresh reproduction directory.
for(const name of ['.local','.tools','node_modules','.env'])if(existsSync(join(destination,name)))throw new Error('Git export unexpectedly contains a private/runtime directory');
run(process.execPath,['scripts/local-cache.mjs']);
run('pnpm',['install','--frozen-lockfile','--offline']);
const check=run('pnpm',['check']);
if(!/Tests\s+42 passed/.test(check))throw new Error('Expected final test count absent from reproduction output');
const fingerprint=run(process.execPath,['scripts/mcp-image-tag.mjs']).trim().replace(/^m2-/,'m6-');
const deployedImage=readFileSync(join(evidence,'images.txt'),'utf8').trim().split('\n')[0];
if(`relay/platform:${fingerprint}`!==deployedImage)throw new Error('Committed runtime source differs from the tested deployed fingerprint');
const result={at:new Date().toISOString(),sourceCommit,source:'fresh Git archive of the exact committed tree in a new nonsynced same-machine directory',destination,frozenOfflineInstall:true,lintTypecheckTestsBuild:true,tests:42,runtimeFingerprint:fingerprint,deployedImage,privateResourcesCopied:false,paidProviderTraffic:false,clusterRecreated:false,nodeVersion:run(process.execPath,['--version']).trim(),pnpmVersion:run('pnpm',['--version']).trim(),diskBefore,diskAfter:run('df',['-h',root],root).trim(),passed:true};
writeFileSync(join(evidence,'reproducibility.txt'),log.join('\n'));
writeFileSync(join(evidence,'reproducibility.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
