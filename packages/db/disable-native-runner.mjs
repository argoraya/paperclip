// One-off local-dev helper: persist experimental.enableNativeRunner = false in
// the singleton instance_settings row so heartbeat runs use the in-process
// (legacy) executor that spawns the `claude` CLI directly, instead of the Rust
// `runnerd` native runner (which needs a cargo toolchain not available here).
// Starts the embedded Postgres via the repo's own migration-runtime helper.
import postgres from "postgres";
import { resolveMigrationConnection } from "./src/migration-runtime.ts";

const conn = await resolveMigrationConnection();
const sql = postgres(conn.connectionString, { max: 1 });
try {
  await sql`
    INSERT INTO instance_settings (singleton_key, general, experimental)
    VALUES ('default', '{}'::jsonb, jsonb_build_object('enableNativeRunner', false))
    ON CONFLICT (singleton_key)
    DO UPDATE SET
      experimental = instance_settings.experimental || jsonb_build_object('enableNativeRunner', false),
      updated_at = now()
  `;
  const [row] = await sql`
    SELECT experimental FROM instance_settings WHERE singleton_key = 'default'
  `;
  console.log("instance_settings.experimental =", JSON.stringify(row.experimental));
} finally {
  await sql.end({ timeout: 5 });
  await conn.stop();
}
