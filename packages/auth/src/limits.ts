import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { Rejection, type Identity } from './identity.js';
import { secret } from '../../db/src/store.js';
const rateLua = `local a=redis.call('INCR',KEYS[1]); if a==1 then redis.call('EXPIRE',KEYS[1],60) end; local b=redis.call('INCR',KEYS[2]); if b==1 then redis.call('EXPIRE',KEYS[2],60) end; return (a<=tonumber(ARGV[1]) and b<=tonumber(ARGV[2])) and 1 or 0`;
const leaseLua = `for n,k in ipairs(KEYS) do redis.call('ZREMRANGEBYSCORE',k,'-inf',ARGV[1]); if redis.call('ZCARD',k)>=tonumber(ARGV[n+3]) then return 0 end end; for _,k in ipairs(KEYS) do redis.call('ZADD',k,ARGV[2],ARGV[3]);redis.call('PEXPIRE',k,15000) end; return 1`;
export class Limits {
    readonly redis = new Redis({ host: process.env['REDIS_HOST'] ?? 'relay-redis', port: 6379, password: secret('redis-password'), enableOfflineQueue: false, maxRetriesPerRequest: 1, connectTimeout: 2000, commandTimeout: 2000 });
    constructor() { this.redis.on('error', () => { }); }
    async rate(i: Identity) { const ok = await this.redis.eval(rateLua, 2, `rate:identity:${i.key ?? i.session ?? i.user}`, `rate:user:${i.user}`, Number(process.env['KEY_RATE_PER_MINUTE'] ?? 120), Number(process.env['USER_RATE_PER_MINUTE'] ?? 240)); if (ok !== 1)
        throw new Rejection('RATE_LIMITED', 429); }
    async lease(i: Identity, upstream: string) { const id = randomUUID(), now = Date.now(); const keys = [`concurrency:team:${i.team}`, `concurrency:upstream:${upstream}`, 'concurrency:global']; const ok = await this.redis.eval(leaseLua, keys.length, ...keys, now, now + 12000, id, 8, 4, 16); if (ok !== 1)
        throw new Rejection('CONCURRENCY_LIMIT', 429); return async () => { for (const k of keys)
        await this.redis.zrem(k, id); }; }
    async ready() { await this.redis.ping(); }
    close() { this.redis.disconnect(); }
}
