import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const connectionString =
  process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DIRECT_DATABASE_URL is not set");

const seed = JSON.parse(await readFile(resolve(root, "data/seed.json"), "utf8"));
const directory = JSON.parse(
  await readFile(resolve(root, "data/cbn-licensed-institutions-july-2026.json"), "utf8"),
);

const CATEGORY_CODES = {
  "Bureaux-de-Change (BDCs)": "bdc",
  "Commercial Banks": "commercial-banks",
  "Development Finance Institutions (DFIs)": "dfi",
  "Discount Houses": "discount-houses",
  "Finance Companies (FCs)": "finance-companies",
  "Holding Company (HCs)": "holding-company",
  "Merchant Banks": "merchant-banks",
  "Micro-finance Banks (MFBs)": "microfinance-banks",
  "Mobile Money Operators (MMOs)": "mmo",
  "Non-Interest Banks": "non-interest-banks",
  "Payment Service Banks (PSBs)": "psb",
  "Primary Mortgage Banks (PMBs)": "pmb",
};

function categoryCode(name) {
  if (CATEGORY_CODES[name]) return CATEGORY_CODES[name];
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function chunk(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

async function insertRows(client, { table, columns, rows, conflict, chunkSize = 200 }) {
  let inserted = 0;
  for (const batch of chunk(rows, chunkSize)) {
    const values = [];
    const tuples = batch.map((row, rowIndex) => {
      const placeholders = columns.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`);
      values.push(...row);
      return `(${placeholders.join(",")})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")} ${conflict ?? ""}`,
      values,
    );
    inserted += batch.length;
  }
  return inserted;
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("BEGIN");

  await client.query(
    `INSERT INTO users (id, username, email, role, profile_role, first_name, last_name, job_title, department)
     VALUES (1, 'admin', $1, 'admin', 'admin', 'System', 'Administrator', 'Platform Administrator', 'Administration')
     ON CONFLICT (id) DO NOTHING`,
    [process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@denhamandgrey.com"],
  );
  await client.query(
    "SELECT setval(pg_get_serial_sequence('users','id'), GREATEST((SELECT max(id) FROM users), 1))",
  );

  await insertRows(client, {
    table: "cbn_categories",
    columns: ["code", "official_name", "description", "source_url", "as_of_date", "sort_order"],
    rows: directory.categories.map((category, index) => [
      categoryCode(category.name),
      category.name,
      category.scope ?? "",
      category.sourceUrl ?? "",
      directory.analyticalCutoff ?? "2026-07-31",
      index,
    ]),
    conflict: `ON CONFLICT (code) DO UPDATE SET official_name = excluded.official_name,
      source_url = excluded.source_url, sort_order = excluded.sort_order, updated_at = now()`,
  });

  const knownCategories = new Set(directory.categories.map((category) => categoryCode(category.name)));
  const directoryByName = new Map();
  for (const record of directory.institutions) {
    const code = categoryCode(record.category);
    if (!knownCategories.has(code)) continue;
    const street = record.sourceRecord?.streetAddress ?? "";
    const area = record.sourceRecord?.area ?? "";
    directoryByName.set(`${record.name.toLowerCase()}|${code}`, [
      record.name,
      code,
      record.licenceClass || record.authorisation || "",
      record.licenceStatus || "Licensed",
      record.state ?? "",
      [street, area].filter(Boolean).join(", "),
      record.sourceRecord?.website ?? "",
      record.sourceUrl ?? "",
      String(record.sourceRecordId || record.recordKey || record.id || ""),
      record.verifiedAsOf || record.sourceDocumentDate || directory.analyticalCutoff || "2026-07-31",
      JSON.stringify(record),
    ]);
  }
  const directoryRows = [...directoryByName.values()];
  await insertRows(client, {
    table: "cbn_institutions",
    columns: [
      "official_name",
      "category_code",
      "licence_number",
      "licence_status",
      "state",
      "address",
      "website",
      "source_url",
      "source_record_id",
      "as_of_date",
      "data_json",
    ],
    rows: directoryRows,
    conflict: `ON CONFLICT ((lower(official_name)), category_code) DO UPDATE SET
      licence_number = excluded.licence_number, licence_status = excluded.licence_status,
      state = excluded.state, address = excluded.address, website = excluded.website,
      source_url = excluded.source_url, source_record_id = excluded.source_record_id,
      as_of_date = excluded.as_of_date, data_json = excluded.data_json, updated_at = now()`,
  });

  await insertRows(client, {
    table: "institutions",
    columns: ["name", "type", "reporting_period"],
    rows: seed.institutions.map((institution) => [
      institution.name,
      institution.type,
      institution.reportingPeriod,
    ]),
    conflict: `ON CONFLICT ((lower(name))) DO UPDATE SET type = excluded.type, updated_at = now()`,
  });

  await insertRows(client, {
    table: "signals",
    columns: [
      "signal_id",
      "pillar",
      "name",
      "weight",
      "definition",
      "measurement",
      "evidence_required",
      "score_guide",
      "primary_framework",
      "source_url",
      "notes",
      "justification",
      "references_json",
      "methodology_version",
    ],
    rows: seed.signals.map((signal) => [
      signal.signal_id,
      signal.pillar,
      signal.signal,
      signal.weight,
      signal.definition ?? "",
      signal.measurement ?? "",
      signal.evidence_required ?? "",
      signal.score_guide ?? "",
      signal.primary_framework ?? "",
      signal.source_url ?? "",
      signal.notes ?? "",
      signal.justification ?? "",
      JSON.stringify(signal.references ?? []),
      signal.methodology_version ?? seed.methodologyVersion,
    ]),
    conflict: `ON CONFLICT (signal_id) DO UPDATE SET pillar = excluded.pillar, name = excluded.name,
      weight = excluded.weight, definition = excluded.definition, measurement = excluded.measurement,
      evidence_required = excluded.evidence_required, score_guide = excluded.score_guide,
      primary_framework = excluded.primary_framework, source_url = excluded.source_url,
      notes = excluded.notes, justification = excluded.justification,
      references_json = excluded.references_json, methodology_version = excluded.methodology_version`,
  });

  const institutionIds = new Map(
    (await client.query("SELECT id, name FROM institutions")).rows.map((row) => [row.name, row.id]),
  );

  await insertRows(client, {
    table: "assessments",
    columns: ["institution_id", "signal_id", "score", "assessed", "evidence_grade", "applicable", "na_reason"],
    rows: seed.assessments.flatMap((assessment) => {
      const institutionId = institutionIds.get(assessment.institution);
      if (!institutionId) return [];
      return [
        [
          institutionId,
          assessment.signalId,
          assessment.score,
          true,
          assessment.evidenceGrade,
          assessment.applicable,
          assessment.naReason ?? "",
        ],
      ];
    }),
    conflict: `ON CONFLICT (institution_id, signal_id) DO UPDATE SET score = excluded.score,
      assessed = excluded.assessed, evidence_grade = excluded.evidence_grade,
      applicable = excluded.applicable, na_reason = excluded.na_reason`,
  });

  const existingEvidence = await client.query("SELECT count(*)::int AS count FROM evidence");
  if (existingEvidence.rows[0].count === 0) await insertRows(client, {
    table: "evidence",
    columns: [
      "institution_id",
      "signal_id",
      "reporting_period",
      "evidence_grade",
      "summary",
      "primary_source_url",
      "secondary_source_url",
      "assessment_note",
      "cycle_number",
    ],
    rows: seed.evidence.flatMap((row) => {
      const institutionId = institutionIds.get(row.institution);
      if (!institutionId) return [];
      return [
        [
          institutionId,
          row.signalId,
          row.reportingPeriod ?? "Baseline",
          row.evidenceGrade,
          row.summary ?? "",
          row.primarySourceUrl ?? "",
          row.secondarySourceUrl ?? "",
          row.assessmentNote ?? "",
          1,
        ],
      ];
    }),
    conflict: `ON CONFLICT DO NOTHING`,
  });

  await insertRows(client, {
    table: "institution_reviews",
    columns: [
      "institution_id",
      "status",
      "cycle_number",
      "revision",
      "methodology_version",
      "submitted_by",
      "reviewed_by",
      "approved_snapshot_id",
      "submitted_at",
      "reviewed_at",
    ],
    rows: [...institutionIds.values()].map((institutionId) => [
      institutionId,
      "draft",
      1,
      0,
      seed.methodologyVersion,
      null,
      null,
      null,
      null,
      null,
    ]),
    conflict: "ON CONFLICT (institution_id) DO NOTHING",
  });

  await client.query(
    `INSERT INTO app_metadata (key, value) VALUES ('methodology_version', $1)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [seed.methodologyVersion],
  );
  await client.query(
    `INSERT INTO app_metadata (key, value) VALUES ('seed_source', $1)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [seed.source ?? "handoff-v10"],
  );

  await client.query("COMMIT");

  const counts = await client.query(`
    SELECT
      (SELECT count(*) FROM institutions)::int AS institutions,
      (SELECT count(*) FROM signals)::int AS signals,
      (SELECT count(*) FROM assessments)::int AS assessments,
      (SELECT count(*) FROM evidence)::int AS evidence,
      (SELECT count(*) FROM cbn_institutions)::int AS cbn_records,
      (SELECT count(*) FROM cbn_categories)::int AS cbn_categories
  `);
  console.log("Seed complete:", counts.rows[0]);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
