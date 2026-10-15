import pg from 'pg';
import { readFileSync } from 'node:fs';
export function secret(name: string) { const root = process.env['PLATFORM_SECRET_DIR'] ?? '/run/platform'; return readFileSync(`${root}/${name}`, 'utf8').trim(); }
export function pool(role: 'app' | 'auth' | 'migrator' | 'provisioner' | 'postgres') {
    const p = new pg.Pool({ host: process.env['PG_HOST'] ?? 'relay-postgres', port: 5432, database: 'relay', user: role === 'postgres' ? 'postgres' : `relay_${role}`, password: secret(`pg-${role}`), max: role === 'app' ? 8 : 4, connectionTimeoutMillis: 2000, query_timeout: 3000, options: '-c statement_timeout=3000 -c idle_in_transaction_session_timeout=5000' });
    p.on('error', () => { console.error('Database connection unavailable'); });
    return p;
}
export type Tx = pg.PoolClient;
export class Store {
    constructor(readonly pool: pg.Pool) { }
    async tenant<T>(team: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
        const c = await this.pool.connect();
        try {
            await c.query('BEGIN');
            await c.query("SELECT set_config('relay.team_id',$1,true)", [team]);
            const r = await fn(c);
            await c.query('COMMIT');
            return r;
        }
        catch (e) {
            await c.query('ROLLBACK');
            throw e;
        }
        finally {
            c.release();
        }
    }
    async ready() { if ((await this.pool.query("SELECT 1 FROM app.schema_migrations WHERE version IN ('0001_m3','0002_m4','0003_m5')")).rowCount !== 3)
        throw new Error('Migrations unavailable'); }
}
