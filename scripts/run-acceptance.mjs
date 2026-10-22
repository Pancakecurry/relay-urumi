// Never emit a raw Playwright error: its diagnostic snapshot may contain a filled login form.
import {writeFileSync,mkdirSync} from 'node:fs';import {inspect} from 'node:util';
const path=process.argv[2];if(!/^(scripts|tests\/store)\/[a-z0-9-]+\.mjs$/.test(path??''))throw new Error('Choose a repository acceptance script');
let unhandled=0;
function capture(error,kind='module'){
 mkdirSync('.local',{recursive:true});
 const suffix=kind==='unhandled'?`-unhandled-${++unhandled}`:'';
 const report=`.local/${path.replaceAll('/','-').slice(0,-4)}${suffix}-private-error.txt`;
 writeFileSync(report,inspect(error,{depth:8}),{mode:0o600});
 console.log(JSON.stringify({passed:false,test:path,errorType:error?.name??'Error',kind,privateDiagnostic:report}));
 process.exitCode=1;
}
// Keep cleanup/finally reachable and never let a delayed browser promise dump a form.
process.on('unhandledRejection',error=>capture(error,'unhandled'));
try{await import(new URL('../'+path,import.meta.url));}catch(error){capture(error);}
