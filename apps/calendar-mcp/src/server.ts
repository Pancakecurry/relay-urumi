import * as z from 'zod/v4';
import { Temporal } from '@js-temporal/polyfill';
import { pathToFileURL } from 'node:url';
import { createApp, guarded, result, runtimeConfig, listen } from '../../../packages/mcp-runtime/src/server.js';
import { dayRange, date, timezone, utc } from '../../../packages/contracts/src/domain.js';

export function calendarApp(secret: string, hosts = ['localhost', '127.0.0.1']) {
  return createApp('relay-calendar', secret, hosts, server => {
    const nowOutput = z.strictObject({ instant: utc, local: z.string(), timezone });
    server.registerTool('now', { description: 'Actual current UTC instant and local time in an explicit IANA timezone.',
      inputSchema: z.strictObject({ timezone }), outputSchema: nowOutput, annotations: { readOnlyHint: true, openWorldHint: false } },
    async ({ timezone: zone }) => guarded(async () => {
      const now = Temporal.Now.instant().round({ smallestUnit: 'second', roundingMode: 'floor' });
      return result(nowOutput, { instant: now.toString(), local: now.toZonedDateTimeISO(zone).toString(), timezone: zone });
    }));
    const rangeOutput = z.strictObject({ date, timezone, start_inclusive: utc, end_exclusive: utc, seconds: z.number().int().nonnegative() });
    server.registerTool('day_range', { description: 'Half-open UTC bounds [start,end) for a local calendar date (or today). Handles DST; pass bounds to list_orders.',
      inputSchema: z.strictObject({ timezone, date: date.optional() }), outputSchema: rangeOutput, annotations: { readOnlyHint: true, openWorldHint: false } },
    async ({ timezone: zone, date: day }) => guarded(async () => result(rangeOutput, dayRange(day ?? Temporal.Now.plainDateISO(zone).toString(), zone))));
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const c = runtimeConfig(); await listen(calendarApp(c.secret, c.hosts));
}
