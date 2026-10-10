import * as z from 'zod/v4';
import { Temporal } from '@js-temporal/polyfill';
import { pathToFileURL } from 'node:url';
import { createApp, guarded, result, runtimeConfig, listen } from '../../../packages/mcp-runtime/src/server.js';
import { currency, id, minor, decimal, orderSchema, productSchema, orderStatus, pageInput, pagination, utc, DomainError, timezone } from '../../../packages/contracts/src/domain.js';
import { WooRest, storeConfig, type StoreConfig } from './rest.js';

const rawProduct = z.object({ id, name: z.string(), sku: z.string(), status: z.string(), price: z.string(),
  regular_price: z.string(), permalink: z.string(), catalog_visibility: z.string() });
const rawOrder = z.object({ id, status: z.string(), currency, total: z.string(), date_created_gmt: z.string(),
  line_items: z.array(z.object({ product_id: z.number().int().nonnegative(), name: z.string(), quantity: z.number().int().nonnegative(), total: z.string() })) });
function product(value: unknown, c: StoreConfig['currency']) {
  const p = rawProduct.parse(value);
  return productSchema.parse({ ...p, currency: c, price: p.price === '' ? '' : decimal(minor(p.price, c), c),
    regular_price: p.regular_price === '' ? '' : decimal(minor(p.regular_price, c), c) });
}
function order(value: unknown) {
  const o = rawOrder.parse(value); const c = o.currency;
  return orderSchema.parse({ ...o, total: decimal(minor(o.total, c), c), date_created_gmt: `${o.date_created_gmt.replace(/Z$/, '')}Z`,
    line_items: o.line_items.map(item => ({ ...item, total: decimal(minor(item.total, c), c) })) });
}
function metadata(response: { total?: string; totalPages?: string }, page: number, perPage: number) {
  if (!/^\d+$/.test(response.total ?? '') || !/^\d+$/.test(response.totalPages ?? '')) throw new DomainError('MISSING_PAGINATION', false, 'not_executed');
  const total = Number(response.total); const totalPages = Number(response.totalPages);
  return pagination.parse({ page, per_page: perPage, total, total_pages: totalPages, next_page: page < totalPages ? page + 1 : null });
}
export function wooApp(config: StoreConfig, secret: string, hosts = ['localhost', '127.0.0.1']) {
  timezone.parse(config.timezone); const rest = new WooRest(config);
  return createApp('relay-woocommerce', secret, hosts, server => {
    const productsOutput = z.strictObject({ products: z.array(productSchema).max(100), pagination });
    server.registerTool('list_products', { description: 'A single explicit page of WooCommerce products, ordered by ID. Follow next_page to collect more. Prices are store-currency decimal strings.',
      inputSchema: z.strictObject({ ...pageInput, status: z.enum(['publish', 'draft', 'pending', 'private', 'any']).default('publish'),
        sku: z.string().min(1).max(100).optional() }), outputSchema: productsOutput, annotations: { readOnlyHint: true, openWorldHint: true } },
    async ({ page, per_page, status, sku }, ctx) => guarded(async () => {
      const r = await rest.call('GET', 'products', { page: String(page), per_page: String(per_page), status, orderby: 'id', order: 'asc', ...(sku ? { sku } : {}) }, undefined, ctx.mcpReq.signal);
      return result(productsOutput, { products: z.array(z.unknown()).parse(r.body).map(p => product(p, config.currency)), pagination: metadata(r, page, per_page) });
    }));
    const singleProduct = z.strictObject({ product: productSchema });
    server.registerTool('create_product', { description: 'Create one simple product. Defaults to published/visible, decimal price in configured store currency. Require a unique SKU; never automatically retry a timed-out write. Reconcile unknown outcomes by listing that SKU.',
      inputSchema: z.strictObject({ name: z.string().trim().min(1).max(200), sku: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
        regular_price: z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,3})?$/), status: z.enum(['publish', 'draft', 'pending', 'private']).default('publish'),
        catalog_visibility: z.enum(['visible', 'catalog', 'search', 'hidden']).default('visible'), virtual: z.boolean().default(true) }),
      outputSchema: singleProduct, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } },
    async (args, ctx) => guarded(async () => {
      const price = decimal(minor(args.regular_price, config.currency), config.currency);
      const r = await rest.call('POST', 'products', {}, { ...args, regular_price: price, type: 'simple' }, ctx.mcpReq.signal);
      return result(singleProduct, { product: product(r.body, config.currency) });
    }, true));
    const ordersInput = z.strictObject({ ...pageInput, status: orderStatus.or(z.literal('any')).default('any'),
      after: utc.optional(), before: utc.optional() }).refine(args => (!args.after && !args.before) ||
        (!!args.after && !!args.before && args.after < args.before), 'Supply both bounds in increasing order for [after,before)');
    const ordersOutput = z.strictObject({ orders: z.array(orderSchema).max(100), pagination });
    server.registerTool('list_orders', { description: 'A single explicit page of orders (ID ascending). Optional UTC second-precision after/before form a half-open interval [after,before). Use Calendar day_range; follow next_page. Omits customer/private metadata.',
      inputSchema: ordersInput, outputSchema: ordersOutput, annotations: { readOnlyHint: true, openWorldHint: true } },
    async ({ page, per_page, status, after, before }, ctx) => guarded(async () => {
      // Woo's exclusive GMT column filters expect timezone-less REST date strings.
      // On pinned HPOS, passing Z shifts these bounds again; real boundary tests caught it.
      const bounds = after && before ? { after: Temporal.Instant.from(after).subtract({ seconds: 1 }).toString().slice(0, -1),
        before: before.slice(0, -1), dates_are_gmt: 'true' } : {};
      const r = await rest.call('GET', 'orders', { page: String(page), per_page: String(per_page), status, orderby: 'id', order: 'asc', ...bounds }, undefined, ctx.mcpReq.signal);
      return result(ordersOutput, { orders: z.array(z.unknown()).parse(r.body).map(order), pagination: metadata(r, page, per_page) });
    }));
    const singleOrder = z.strictObject({ order: orderSchema });
    server.registerTool('get_order', { description: 'Get one order by its positive ID. Money and creation time are exact; customer/private metadata is omitted.',
      inputSchema: z.strictObject({ order_id: id }), outputSchema: singleOrder, annotations: { readOnlyHint: true, openWorldHint: true } },
    async ({ order_id }, ctx) => guarded(async () => result(singleOrder, { order: order((await rest.call('GET', `orders/${order_id}`, {}, undefined, ctx.mcpReq.signal)).body) })));
    server.registerTool('update_order_status', { description: 'Set one order to a supported WooCommerce status. Status assignment is repeatable but Woo hooks may have effects. Never automatically retry an ambiguous write; reconcile with get_order.',
      inputSchema: z.strictObject({ order_id: id, status: orderStatus }), outputSchema: singleOrder,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } },
    async ({ order_id, status }, ctx) => guarded(async () => result(singleOrder, { order: order((await rest.call('PUT', `orders/${order_id}`, {}, { status }, ctx.mcpReq.signal)).body) }), true));
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const c = runtimeConfig(); await listen(wooApp(storeConfig(), c.secret, c.hosts));
}
