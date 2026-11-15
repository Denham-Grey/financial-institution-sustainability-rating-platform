import { randomBytes } from "node:crypto";
import pg from "pg";

const baseUrl = process.env.NEON_AUTH_BASE_URL;
const email = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@denhamandgrey.com";
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || randomBytes(12).toString("base64url");
const name =
  [process.env.BOOTSTRAP_ADMIN_FIRST_NAME, process.env.BOOTSTRAP_ADMIN_LAST_NAME].filter(Boolean).join(" ") ||
  "Platform Administrator";

if (!baseUrl) throw new Error("NEON_AUTH_BASE_URL is not set");

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/sign-up/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: process.env.APP_URL ?? "http://localhost:3000" },
  body: JSON.stringify({ email, password, name }),
});

const body = await response.text();
if (!response.ok) {
  console.error(`Neon Auth rejected sign-up (${response.status}):`, body);
  console.error("If the account already exists, sign in instead or reset its password in Neon Console > Auth.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString:
    process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
await client.query(
  `INSERT INTO users (username, email, role, profile_role, first_name, last_name, job_title, department)
   VALUES ($1,$2,'admin','admin','Platform','Administrator','Platform Administrator','Administration')
   ON CONFLICT ((lower(email))) DO UPDATE SET profile_role = 'admin', role = 'admin', active = true, retired = false`,
  [email.split("@")[0], email],
);
await client.end();

console.log(`Neon Auth account ready: ${email}`);
console.log(`Initial password: ${password}`);
console.log("Store it now; it is printed once.");
