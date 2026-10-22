import { pool, secret } from "./store.js";
import { readFileSync } from "node:fs";
// Bootstrap roles safely using a separately mounted operator secret, then migrate with owner privilege.
const p = pool("postgres");
try {
  for (let n = 0; n < 60; n++) {
    try {
      await p.query("SELECT 1");
      break;
    } catch {
      if (n === 59) throw new Error("PostgreSQL startup deadline exceeded");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  const c = await p.connect();
  try {
    await c.query("SELECT pg_advisory_lock(73303)");
    for (const role of ["migrator", "auth", "app", "provisioner"]) {
      const name = `relay_${role}`;
      if (
        !(await c.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [name]))
          .rowCount
      )
        await c.query(
          `CREATE ROLE ${name} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
        );
      // Passwords are generated hex, never from caller input; SQL text and credentials are not logged.
      const pass = secret(`pg-${role}`);
      if (!/^[a-f0-9]{64}$/.test(pass))
        throw new Error("Invalid migration credential");
      await c.query(`ALTER ROLE ${name} PASSWORD '${pass}'`);
    }
    await c.query("BEGIN");
    await c.query(readFileSync("packages/db/migrations/0001_m3.sql", "utf8"));
    await c.query(readFileSync("packages/db/migrations/0002_m4.sql", "utf8"));
    await c.query(readFileSync("packages/db/migrations/0003_m5.sql", "utf8"));
    await c.query(
      readFileSync("packages/db/migrations/0004_m6_permissions.sql", "utf8"),
    );
    await c.query(
      readFileSync("packages/db/migrations/0005_m6_credentials.sql", "utf8"),
    );
    await c.query(
      readFileSync("packages/db/migrations/0006_m6_oauth.sql", "utf8"),
    );
    await c.query(
      readFileSync(
        "packages/db/migrations/0007_m6_oauth_attribution.sql",
        "utf8",
      ),
    );
    await c.query(
      readFileSync("packages/db/migrations/0008_m6_oauth_disable.sql", "utf8"),
    );
    await c.query(
      readFileSync("packages/db/migrations/0009_store_transport.sql", "utf8"),
    );
    await c.query("COMMIT");
    console.log(
      JSON.stringify({
        migrations: [
          "0001_m3",
          "0002_m4",
          "0003_m5",
          "0004_m6_permissions",
          "0005_m6_credentials",
          "0006_m6_oauth",
          "0007_m6_oauth_attribution",
          "0008_m6_oauth_disable",
          "0009_store_transport",
        ],
        roles: ["relay_migrator", "relay_auth", "relay_app"],
        runtimeRlsBypass: false,
        status: "applied",
      }),
    );
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.query("SELECT pg_advisory_unlock(73303)").catch(() => {});
    c.release();
  }
} finally {
  await p.end();
}
