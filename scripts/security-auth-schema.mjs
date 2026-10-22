// Generate a reviewable static schema from the exact installed official plugin.
// Run explicitly on a reviewed version change, never during application boot.
import {oauthProvider} from '@better-auth/oauth-provider';
import {writeFileSync} from 'node:fs';
const plugin=oauthProvider({loginPage:'/oauth/login',consentPage:'/oauth/consent',disableJwtPlugin:true});
const schema=plugin.schema;
const sqlType={string:'text',date:'timestamptz',boolean:'boolean',number:'integer',json:'jsonb','string[]':'text[]','number[]':'integer[]'};
const drizzleType={string:n=>`text('${n}')`,date:n=>`timestamp('${n}', {withTimezone:true})`,boolean:n=>`boolean('${n}')`,number:n=>`integer('${n}')`,json:n=>`jsonb('${n}')`,'string[]':n=>`text('${n}').array()`,'number[]':n=>`integer('${n}').array()`};
let ts=`// Generated from @better-auth/oauth-provider1.7.7; reviewed with its actual schema.\nimport {pgSchema,text,timestamp,boolean,integer,jsonb} from 'drizzle-orm/pg-core';\nconst auth=pgSchema('auth');\n`,sql='-- Provider-owned schema from pinned1.7.7; no runtime app role can read token hashes.\nSET ROLE relay_migrator;\n';
for(const [model,m]of Object.entries(schema)){
 ts+=`export const ${model}=auth.table('${m.modelName??model}',{id:text('id').primaryKey(),\n`;
 const cols=['id text PRIMARY KEY'];
 for(const [name,f]of Object.entries(m.fields)){
  if(!drizzleType[f.type])throw new Error('Unreviewed schema type '+f.type);
  ts+=`${name}:${drizzleType[f.type](name)}${f.required===true?'.notNull()':''}${f.unique?'.unique()':''},\n`;
  cols.push(`"${name}" ${sqlType[f.type]}${f.required===true?' NOT NULL':''}${f.unique?' UNIQUE':''}${f.references?` REFERENCES auth."${schema[f.references.model]?.modelName??f.references.model}"("${f.references.field}")${f.references.onDelete?` ON DELETE ${f.references.onDelete.toUpperCase()}`:''}`:''}`);
 }
 ts+='});\n';sql+=`CREATE TABLE IF NOT EXISTS auth."${m.modelName??model}" (\n ${cols.join(',\n ')}\n);\n`;
 for(const[n,f]of Object.entries(m.fields))if(f.index)sql+=`CREATE INDEX IF NOT EXISTS "${model}_${n}_idx" ON auth."${m.modelName??model}"("${n}");\n`;
}
sql+=`CREATE UNIQUE INDEX IF NOT EXISTS oauth_client_resource_pair ON auth."oauthClientResource"("clientId","resourceId");\nGRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA auth TO relay_auth;\nINSERT INTO app.schema_migrations(version) VALUES('0006_m6_oauth') ON CONFLICT DO NOTHING;\nRESET ROLE;\n`;
writeFileSync('packages/db/src/oauth-schema.ts',ts);writeFileSync('packages/db/migrations/0006_m6_oauth.sql',sql);writeFileSync('docs/evidence/m6/oauth-provider-schema.json',JSON.stringify({version:'1.7.7',models:schema},null,2)+'\n');
console.log(JSON.stringify({models:Object.keys(schema),version:'1.7.7',generated:true,reviewRequired:true}));
