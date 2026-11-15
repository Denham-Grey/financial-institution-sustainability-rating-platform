import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DIRECT_DATABASE_URL is not set");
  process.exit(1);
}

const sql = await readFile(resolve(root, "db/schema.sql"), "utf8");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(
    "SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'public'",
  );
  console.log(`Schema applied. ${rows[0].tables} public tables present.`);
} finally {
  await client.end();
}
