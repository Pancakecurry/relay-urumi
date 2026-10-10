import { pool, secret } from './store.js';
import { readFileSync } from 'node:fs';
// Bootstrap roles safely using a separately mounted operator secret, then migrate with owner privilege.
const p = pool('postgres');
try {
    for (let n = 0; n < 60; n++) {
        try {
            await p.query('SELECT 1');
            break;
        }
        catch {
            if (n === 59)
                throw new Error('PostgreSQL startup deadline exceeded');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    const c=await p.connect();
    try {
    await c.query('SELECT pg_advisory_lock(73303)');
    for (const role of ['migrator', 'auth', 'app']) {
        const name = `relay_${role}`;
        if (!(await c.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name])).rowCount)
            await c.query(`CREATE ROLE ${name} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
        // Passwords are generated hex, never from caller input; SQL text and credentials are not logged.
        const pass = secret(`pg-${role}`);
        if (!/^[a-f0-9]{64}$/.test(pass))
            throw new Error('Invalid migration credential');
        await c.query(`ALTER ROLE ${name} PASSWORD '${pass}'`);
    }
    await c.query('BEGIN');
    await c.query(readFileSync('packages/db/migrations/0001_m3.sql', 'utf8'));
    await c.query(readFileSync('packages/db/migrations/0002_m4.sql', 'utf8'));
    await c.query('COMMIT');
    console.log(JSON.stringify({ migrations: ['0001_m3', '0002_m4'], roles: ['relay_migrator', 'relay_auth', 'relay_app'], runtimeRlsBypass: false, status: 'applied' }));
    }finally{await c.query('ROLLBACK').catch(()=>{});await c.query('SELECT pg_advisory_unlock(73303)').catch(()=>{});c.release();}
}
finally { await p.end(); }
