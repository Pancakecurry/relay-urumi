// Never emit a raw Playwright error: its diagnostic snapshot may contain a filled login form.
import {writeFileSync,mkdirSync} from 'node:fs';import {inspect} from 'node:util';
const path=process.argv[2];if(!/^(scripts|tests\/store)\/[a-z0-9-]+\.mjs$/.test(path??''))throw new Error('Choose a repository acceptance script');
try{await import(new URL('../'+path,import.meta.url));}catch(error){mkdirSync('.local',{recursive:true});const report=`.local/${path.replaceAll('/','-').slice(0,-4)}-private-error.txt`;writeFileSync(report,inspect(error,{depth:8}),{mode:0o600});console.log(JSON.stringify({passed:false,test:path,errorType:error?.name??'Error',privateDiagnostic:report}));process.exitCode=1;}
