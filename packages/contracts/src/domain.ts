import * as z from 'zod/v4';
import { Temporal } from '@js-temporal/polyfill';

export const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const amount = z.string().regex(/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,3})?$/);
// Explicit, reviewed currency precision. Expand deliberately; never guess a currency's scale.
export const currency = z.enum(['INR', 'USD', 'EUR', 'GBP', 'JPY', 'KWD']);
export type Currency = z.infer<typeof currency>;
export function scale(c: Currency) { return c === 'JPY' ? 0 : c === 'KWD' ? 3 : 2; }
export function minor(value: string, c: Currency): bigint {
  amount.parse(value);
  const negative = value.startsWith('-');
  const [whole = '', fraction = ''] = value.replace(/^-/, '').split('.');
  if (fraction.length > scale(c)) throw new DomainError('INVALID_AMOUNT', false, 'not_executed');
  const n = BigInt(whole + fraction.padEnd(scale(c), '0'));
  return negative ? -n : n;
}
export function decimal(n: bigint, c: Currency): string {
  const s = scale(c); const sign = n < 0n ? '-' : ''; const digits = (n < 0n ? -n : n).toString().padStart(s + 1, '0');
  return sign + (s ? `${digits.slice(0, -s)}.${digits.slice(-s)}` : digits);
}
export class DomainError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean,
    public readonly outcome: 'not_executed' | 'unknown' | 'rejected', public readonly status?: number) { super(code); }
}
export const timezone = z.string().min(1).max(100).refine(value => {
  if (/^[+-]/.test(value)) return false;
  try { Temporal.Now.zonedDateTimeISO(value); return true; } catch { return false; }
}, 'Expected an IANA timezone');
export const utc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/).refine(value => {
  try { Temporal.Instant.from(value); return true; } catch { return false; }
}, 'Expected a valid UTC instant at second precision');
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  try { Temporal.PlainDate.from(value); return true; } catch { return false; }
}, 'Expected a valid calendar date');
export function dayRange(day: string, zone: string) {
  date.parse(day); timezone.parse(zone);
  const d = Temporal.PlainDate.from(day);
  const start = d.toZonedDateTime(zone);
  if (start.toPlainDate().toString() !== day) throw new DomainError('NONEXISTENT_LOCAL_DATE', false, 'not_executed');
  const end = d.add({ days: 1 }).toZonedDateTime(zone);
  return { date: day, timezone: zone, start_inclusive: start.toInstant().toString(),
    end_exclusive: end.toInstant().toString(), seconds: Number((end.epochNanoseconds - start.epochNanoseconds) / 1_000_000_000n) };
}
export const infoSchema = z.strictObject({ service: z.string(), version: z.literal('0.0.0'), purpose: z.string() });
export const empty = z.strictObject({});
export const orderStatus = z.enum(['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed']);
export const pageInput = { page: z.number().int().min(1).max(10000).default(1), per_page: z.number().int().min(1).max(100).default(25) };
export const pagination = z.strictObject({ page: id, per_page: id, total: z.number().int().nonnegative(),
  total_pages: z.number().int().nonnegative(), next_page: id.nullable() });
export const productSchema = z.strictObject({ id, name: z.string(), sku: z.string(), status: z.string(),
  price: amount.or(z.literal('')), regular_price: amount.or(z.literal('')), currency, permalink: z.string().url(), catalog_visibility: z.string() });
export const orderSchema = z.strictObject({ id, status: z.string(), currency, total: amount, date_created_gmt: utc,
  line_items: z.array(z.strictObject({ product_id: z.number().int().nonnegative(), name: z.string(), quantity: z.number().int().nonnegative(), total: amount })) });
