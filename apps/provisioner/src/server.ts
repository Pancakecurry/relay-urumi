import Fastify from "fastify";
import { observeStore } from "./observation.js";
import { equal, uuid } from "../../../packages/auth/src/identity.js";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { pool, secret } from "../../../packages/db/src/store.js";
import { Controller } from "./controller.js";
const db = pool("provisioner");
const controller = new Controller(db);
const connection = new Redis({
  host: "relay-redis",
  port: 6379,
  password: secret("redis-password"),
  db: 1,
  maxRetriesPerRequest: null,
});
connection.on("error", () => {});
const queue = new Queue("store-lifecycle", { connection, prefix: "relay-m5" });
const worker = new Worker<{ id: string }>(
  "store-lifecycle",
  async (job) => controller.run(job.data.id),
  { connection, prefix: "relay-m5", concurrency: 2, lockDuration: 30000 },
);
worker.on("error", () => {
  console.error(
    "Provisioning queue worker unavailable; SQL desired state retained",
  );
});
queue.on("error", () => {});
let active = false;
let lastDispatch = 0;
let lastHealth = 0;
async function dispatch() {
  if (active) return;
  active = true;
  try {
    if (Date.now() - lastHealth > 60000) {
      await controller.inspectReady();
      lastHealth = Date.now();
    }
    await queue.setGlobalConcurrency(2);
    const rows = (
      await db.query<{ id: string; generation: number; attempt: number }>(
        "SELECT s.id,s.generation,s.attempt FROM app.stores s LEFT JOIN app.outbox_events e ON e.store_id=s.id AND e.generation=s.generation AND e.dispatched_at IS NULL WHERE s.status IN ('Provisioning','Deleting') AND s.next_attempt_at<=now() AND (s.lease_until IS NULL OR s.lease_until<now()) GROUP BY s.id ORDER BY count(e.id) DESC,s.created_at LIMIT 20",
      )
    ).rows;
    // SQL desired state repairs queue loss, even if an outbox was already dispatched.
    for (const row of rows) {
      const jobId = `${row.id}-${row.generation}-${row.attempt}`;
      const previous = await queue.getJob(jobId);
      if (
        previous &&
        ["failed", "completed"].includes(await previous.getState())
      )
        await previous.remove();
      await queue.add(
        "reconcile",
        { id: row.id },
        {
          jobId,
          attempts: 3,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: true,
          removeOnFail: 20,
        },
      );
      await db.query(
        "UPDATE app.outbox_events SET dispatched_at=now() WHERE store_id=$1 AND generation=$2",
        [row.id, row.generation],
      );
    }
    lastDispatch = Date.now();
  } catch {
    console.error(
      "Provisioning dispatch unavailable; SQL desired state retained",
    );
  } finally {
    active = false;
  }
}
const interval = setInterval(() => void dispatch(), 3000);
void dispatch();
const app = Fastify({ logger: false });
const observationCache = new Map<
  string,
  { expires: number; value: ReturnType<typeof observeStore> }
>();
app.get("/internal/stores/:id/observed", async (req, reply) => {
  if (
    !equal(
      req.headers.authorization ?? "",
      `Bearer ${secret("internal-token")}`,
    )
  )
    return reply.code(403).send({ error: { code: "INTERNAL_ONLY" } });
  const id = uuid.parse((req.params as { id: string }).id),
    team = uuid.parse((req.query as { team?: string }).team);
  try {
    const key = team + ":" + id;
    let entry = observationCache.get(key);
    if (!entry || entry.expires < Date.now()) {
      const value = observeStore(db, id, team);
      entry = { expires: Date.now() + 5000, value };
      observationCache.set(key, entry);
      void value.catch(() => observationCache.delete(key));
      if (observationCache.size > 500)
        for (const [k, v] of observationCache)
          if (v.expires < Date.now()) observationCache.delete(k);
    }
    return await entry.value;
  } catch {
    return reply.code(503).send({ error: { code: "OBSERVATION_UNAVAILABLE" } });
  }
});
app.get("/health/live", async () => ({ status: "ok" }));
app.get("/health/ready", async (_r, reply) => {
  try {
    await db.query(
      "SELECT 1 FROM app.schema_migrations WHERE version='0003_m5'",
    );
    if (Date.now() - lastDispatch > 15000) throw new Error();
    return { status: "ok" };
  } catch {
    return reply.code(503).send({ status: "unavailable" });
  }
});
await app.listen({ host: "0.0.0.0", port: 3003 });
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    clearInterval(interval);
    void app
      .close()
      .then(() => worker.close())
      .then(() => queue.close())
      .then(() => connection.quit())
      .then(() => db.end());
  });
