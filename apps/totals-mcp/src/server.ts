import * as z from 'zod/v4';
import { pathToFileURL } from 'node:url';
import { createApp, guarded, result, runtimeConfig, listen } from '../../../packages/mcp-runtime/src/server.js';
import { amount, currency, minor, decimal, DomainError, id } from '../../../packages/contracts/src/domain.js';

const output = z.strictObject({ currency, total: z.string().regex(/^-?\d{1,21}(?:\.\d{1,3})?$/), minor_units: z.string().regex(/^-?\d+$/), count: z.number().int().nonnegative() });
export function totalsApp(secret: string, hosts = ['localhost', '127.0.0.1']) {
  return createApp('relay-totals', secret, hosts, server => {
    server.registerTool('sum_amounts', { description: 'Exact sum of up to 1000 decimal strings. Never uses floating point; precision must match the declared currency.',
      inputSchema: z.strictObject({ currency, amounts: z.array(amount).max(1000) }), outputSchema: output, annotations: { readOnlyHint: true, openWorldHint: false } },
    async ({ currency: c, amounts }) => guarded(async () => {
      const total = amounts.reduce((sum, value) => sum + minor(value, c), 0n);
      return result(output, { currency: c, total: decimal(total, c), minor_units: total.toString(), count: amounts.length });
    }));
    server.registerTool('sum_orders', { description: 'Exact sum of unique order IDs from explicitly collected pages. Rejects mixed currencies and duplicates. This is a submitted-data total, not a claim that all orders were fetched.',
      inputSchema: z.strictObject({ currency, orders: z.array(z.strictObject({ id, currency, total: amount })).max(1000) }), outputSchema: output,
      annotations: { readOnlyHint: true, openWorldHint: false } }, async ({ currency: c, orders }) => guarded(async () => {
      if (orders.some(order => order.currency !== c)) throw new DomainError('MIXED_CURRENCIES', false, 'not_executed');
      if (new Set(orders.map(order => order.id)).size !== orders.length) throw new DomainError('DUPLICATE_ORDER', false, 'not_executed');
      const total = orders.reduce((sum, order) => sum + minor(order.total, c), 0n);
      return result(output, { currency: c, total: decimal(total, c), minor_units: total.toString(), count: orders.length });
    }));
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const c = runtimeConfig(); await listen(totalsApp(c.secret, c.hosts));
}
