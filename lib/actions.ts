"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { one, query, withTransaction } from "@/lib/db";
import { auth } from "@/lib/auth/server";
import { getSessionUser, canEdit, canReview, isAdmin, syncAuthRole, type PlatformUser } from "@/lib/session";
import { calculateRankings, type ScoreRow } from "@/lib/scoring";
import { recordAudit } from "@/lib/data";

function requireUser(user: PlatformUser | null): PlatformUser {
  if (!user) throw new Error("Unauthorized");
  return user;
}

type AuthAdmin = {
  createUser(input: {
    email: string;
    password?: string;
    name: string;
  }): Promise<{ data?: { user?: { id: string } } | null; error?: { message?: string } | null }>;
  removeUser(input: { userId: string }): Promise<{ error?: { message?: string } | null }>;
  setUserPassword(input: { userId: string; newPassword: string }): Promise<{ error?: { message?: string } | null }>;
  revokeUserSessions(input: { userId: string }): Promise<unknown>;
  banUser(input: { userId: string; banReason?: string }): Promise<unknown>;
  unbanUser(input: { userId: string }): Promise<unknown>;
};

const authAdmin = auth.admin as unknown as AuthAdmin;

// Neon Auth enforces an 8-character minimum; the platform's four-digit
// passcodes are padded deterministically so the source credential contract
// keeps working without weakening the policy.
function authPassword(value: string): string {
  return /^\d{4}$/.test(value) ? `${value}0000` : value;
}

async function loadScores(institutionId: number): Promise<ScoreRow[]> {
  return query<ScoreRow>(
    `SELECT i.id AS "institutionId", i.name AS institution, i.type AS "institutionType",
       i.reporting_period AS "reportingPeriod", r.status AS "workflowStatus",
       r.cycle_number AS "cycleNumber", r.revision, r.methodology_version AS "methodologyVersion",
       s.signal_id AS "signalId", s.pillar, s.weight, a.score, a.assessed,
       a.evidence_grade AS "evidenceGrade", a.applicable
     FROM institutions i
     JOIN institution_reviews r ON r.institution_id = i.id
     JOIN assessments a ON a.institution_id = i.id
     JOIN signals s ON s.signal_id = a.signal_id
     WHERE i.id = $1 ORDER BY s.signal_id`,
    [institutionId],
  );
}
export async function saveAssessmentAction(formData: FormData) {
  const user = requireUser(await getSessionUser());
  if (!canEdit(user)) throw new Error("Your profile cannot edit assessments.");
  const institutionId = Number(formData.get("institutionId"));
  const expectedRevision = Number(formData.get("revision"));
  const signalIds = formData.getAll("signalId").map(String);

  await withTransaction(async (client) => {
    const review = await client.query<{ revision: number; status: string }>(
      "SELECT revision, status FROM institution_reviews WHERE institution_id = $1 FOR UPDATE",
      [institutionId],
    );
    if (!review.rowCount) throw new Error("Institution review not found.");
    if (review.rows[0].revision !== expectedRevision) {
      throw new Error("This assessment changed since you opened it. Refresh before saving.");
    }
    if (review.rows[0].status === "submitted" || review.rows[0].status === "approved") {
      throw new Error("A submitted or approved rating is locked until a reviewer returns it.");
    }

    for (const signalId of signalIds) {
      const score = Math.max(0, Math.min(5, Number(formData.get(`score-${signalId}`)) || 0));
      const grade = Math.max(0, Math.min(3, Number(formData.get(`grade-${signalId}`)) || 0));
      const applicable = formData.get(`applicable-${signalId}`) === "on";
      const assessed = formData.get(`assessed-${signalId}`) === "on";
      const naReason = String(formData.get(`na-${signalId}`) ?? "").trim();
      await client.query(
        `INSERT INTO assessments (institution_id, signal_id, score, assessed, evidence_grade, applicable, na_reason, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (institution_id, signal_id) DO UPDATE SET score = excluded.score,
           assessed = excluded.assessed, evidence_grade = excluded.evidence_grade,
           applicable = excluded.applicable, na_reason = excluded.na_reason,
           updated_by = excluded.updated_by, updated_at = now()`,
        [institutionId, signalId, score, assessed, grade, applicable, naReason, user.id],
      );
    }

    await client.query(
      `UPDATE institution_reviews SET revision = revision + 1, updated_at = now(),
         status = CASE WHEN status = 'changes_requested' THEN 'draft' ELSE status END
       WHERE institution_id = $1`,
      [institutionId],
    );
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details_json, actor_username, actor_name, actor_role)
       VALUES ($1,'save','assessment',$2,$3,$4,$5,$6)`,
      [
        user.id,
        String(institutionId),
        JSON.stringify({ signals: signalIds.length }),
        user.username,
        `${user.first_name} ${user.last_name}`,
        user.profile_role,
      ],
    );
  });

  revalidatePath("/assessment");
  revalidatePath("/");
}

async function insertSnapshot(
  institutionId: number,
  eventType: string,
  workflowStatus: string,
  actor: PlatformUser,
  note: string,
) {
  const scores = await loadScores(institutionId);
  const institution = await one<{ name: string; type: string; reporting_period: string }>(
    "SELECT name, type, reporting_period FROM institutions WHERE id = $1",
    [institutionId],
  );
  const review = await one<{ cycle_number: number; revision: number; methodology_version: string }>(
    "SELECT cycle_number, revision, methodology_version FROM institution_reviews WHERE institution_id = $1",
    [institutionId],
  );
  const signals = await query<{ signal_id: string; name: string; weight: number; pillar: string }>(
    "SELECT signal_id, name, weight, pillar FROM signals ORDER BY signal_id",
  );
  const payload = {
    institution: { id: institutionId, ...institution },
    cycle: { cycleNumber: review?.cycle_number ?? 1, reportingPeriod: institution?.reporting_period },
    workflow: { status: workflowStatus, revision: review?.revision ?? 0, note },
    methodology: { version: review?.methodology_version ?? "2026.1" },
    assessments: scores.map((row) => ({
      signalId: row.signalId,
      score: row.score,
      evidenceGrade: row.evidenceGrade,
      applicable: row.applicable,
      assessed: row.assessed,
    })),
    signals,
    actor: { username: actor.username, name: `${actor.first_name} ${actor.last_name}`, role: actor.profile_role },
    capturedAt: new Date().toISOString(),
  };
  const snapshotJson = JSON.stringify(payload);
  const snapshotHash = createHash("sha256").update(snapshotJson).digest("hex");
  const inserted = await one<{ id: number }>(
    `INSERT INTO assessment_snapshots
       (institution_id, cycle_number, event_type, workflow_status, reporting_period, methodology_version,
        revision, snapshot_json, snapshot_hash, created_by, actor_username, actor_name, actor_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      institutionId,
      review?.cycle_number ?? 1,
      eventType,
      workflowStatus,
      institution?.reporting_period ?? "Baseline",
      review?.methodology_version ?? "2026.1",
      review?.revision ?? 0,
      snapshotJson,
      snapshotHash,
      actor.id,
      actor.username,
      `${actor.first_name} ${actor.last_name}`,
      actor.profile_role,
    ],
  );
  return { snapshotId: inserted!.id, snapshotHash, scores };
}

export async function submitAssessmentAction(formData: FormData) {
  const user = requireUser(await getSessionUser());
  if (!canEdit(user)) throw new Error("Your profile cannot submit assessments.");
  const institutionId = Number(formData.get("institutionId"));
  const note = String(formData.get("note") ?? "").trim();
  if (!note) throw new Error("A submission comment is required.");

  const incomplete = await one<{ count: number }>(
    `SELECT count(*)::int AS count FROM assessments WHERE institution_id = $1 AND assessed = false`,
    [institutionId],
  );
  if ((incomplete?.count ?? 0) > 0) throw new Error(`${incomplete!.count} signals are still unassessed.`);

  const naMissing = await one<{ count: number }>(
    `SELECT count(*)::int AS count FROM assessments
     WHERE institution_id = $1 AND applicable = false AND btrim(na_reason) = ''`,
    [institutionId],
  );
  if ((naMissing?.count ?? 0) > 0) throw new Error("Every Not Applicable signal needs a reason.");

  const coverage = await one<{ total: number; applicable: number }>(
    `SELECT COALESCE(sum(s.weight),0)::float AS total, COALESCE(sum(s.weight) FILTER (WHERE a.applicable),0)::float AS applicable
     FROM assessments a JOIN signals s ON s.signal_id = a.signal_id WHERE a.institution_id = $1`,
    [institutionId],
  );
  const minimum = Number(process.env.NGFI_MIN_APPLICABLE_WEIGHT_PERCENT || 60);
  const percent = coverage && coverage.total > 0 ? (coverage.applicable / coverage.total) * 100 : 0;
  if (percent < minimum) throw new Error(`Applicable weight must cover at least ${minimum}% of the model.`);

  await withTransaction(async (client) => {
    const review = await client.query<{ revision: number; status: string }>(
      "SELECT revision, status FROM institution_reviews WHERE institution_id = $1 FOR UPDATE",
      [institutionId],
    );
    if (!review.rowCount) throw new Error("Institution review not found.");
    if (review.rows[0].status === "submitted" || review.rows[0].status === "approved") {
      throw new Error("This rating is already submitted or approved.");
    }
  });

  const snapshot = await insertSnapshot(institutionId, "submitted", "submitted", user, note);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE institution_reviews SET status = 'submitted', submitted_by = $2, submitted_at = now(),
         submission_note = $3, review_note = '', revision = revision + 1, updated_at = now()
       WHERE institution_id = $1`,
      [institutionId, user.id, note],
    );
    await client.query(
      `INSERT INTO workflow_events (institution_id, cycle_number, revision, action, from_status, to_status, note, snapshot_id,
         actor_id, actor_username, actor_name, actor_role)
       SELECT $1, cycle_number, revision, 'submit', 'draft', 'submitted', $2, $3, $4, $5, $6, $7
       FROM institution_reviews WHERE institution_id = $1`,
      [
        institutionId,
        note,
        snapshot.snapshotId,
        user.id,
        user.username,
        `${user.first_name} ${user.last_name}`,
        user.profile_role,
      ],
    );
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details_json, actor_username, actor_name, actor_role)
       VALUES ($1,'submit','institution_review',$2,$3,$4,$5,$6)`,
      [
        user.id,
        String(institutionId),
        JSON.stringify({ snapshotId: snapshot.snapshotId, note }),
        user.username,
        `${user.first_name} ${user.last_name}`,
        user.profile_role,
      ],
    );
  });

  revalidatePath("/assessment");
  revalidatePath("/");
}

export async function reviewAssessmentAction(formData: FormData) {
  const user = requireUser(await getSessionUser());
  if (!canReview(user)) throw new Error("Your profile cannot review assessments.");
  const institutionId = Number(formData.get("institutionId"));
  const decision = String(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim();
  if (!note) throw new Error("A review comment is required.");
  if (!["approved", "changes_requested"].includes(decision)) throw new Error("Unknown decision.");

  const review = await one<{ status: string; submitted_by: number | null; cycle_number: number; revision: number }>(
    "SELECT status, submitted_by, cycle_number, revision FROM institution_reviews WHERE institution_id = $1",
    [institutionId],
  );
  if (!review || review.status !== "submitted") throw new Error("Only submitted ratings can be reviewed.");
  if (review.submitted_by === user.id && !isAdmin(user)) {
    throw new Error("A reviewer cannot approve or decline their own submission.");
  }

  if (decision === "changes_requested") {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE institution_reviews SET status = 'changes_requested', reviewed_by = $2, reviewed_at = now(),
           review_note = $3, revision = revision + 1, updated_at = now() WHERE institution_id = $1`,
        [institutionId, user.id, note],
      );
      await client.query(
        `INSERT INTO workflow_events (institution_id, cycle_number, revision, action, from_status, to_status, note,
           actor_id, actor_username, actor_name, actor_role)
         SELECT $1, cycle_number, revision, 'decline', 'submitted', 'changes_requested', $2, $3, $4, $5, $6
         FROM institution_reviews WHERE institution_id = $1`,
        [institutionId, note, user.id, user.username, `${user.first_name} ${user.last_name}`, user.profile_role],
      );
      await client.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details_json, actor_username, actor_name, actor_role)
         VALUES ($1,'decline','institution_review',$2,$3,$4,$5,$6)`,
        [user.id, String(institutionId), JSON.stringify({ note }), user.username,
          `${user.first_name} ${user.last_name}`, user.profile_role],
      );
    });
    revalidatePath("/assessment");
    return;
  }

  const snapshot = await insertSnapshot(institutionId, "approved", "approved", user, note);
  const scores = await loadScores(institutionId);
  const ranking = calculateRankings(scores)[0];
  if (!ranking) throw new Error("No assessment data to approve.");

  const institution = await one<{ name: string; type: string; reporting_period: string }>(
    "SELECT name, type, reporting_period FROM institutions WHERE id = $1",
    [institutionId],
  );

  const year = new Date().getUTCFullYear();
  let certificateNumber = "";
  for (let attempt = 0; attempt < 5 && !certificateNumber; attempt += 1) {
    const candidate = `NGFI-${year}-${String(institutionId).padStart(5, "0")}-${randomBytes(3)
      .toString("hex")
      .toUpperCase()}`;
    const clash = await one("SELECT 1 FROM rating_certificates WHERE certificate_number = $1", [candidate]);
    if (!clash) certificateNumber = candidate;
  }
  if (!certificateNumber) throw new Error("Could not allocate a certificate number.");
  const verificationToken = randomBytes(24).toString("base64url");
  const validUntil = new Date();
  validUntil.setUTCFullYear(validUntil.getUTCFullYear() + 1);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE rating_certificates SET status = 'revoked', lifecycle_status = 'superseded',
         lifecycle_updated_at = now(), revocation_reason = 'Superseded by a newly approved rating.'
       WHERE institution_id = $1 AND status = 'active'`,
      [institutionId],
    );
    const certificate = await client.query<{ id: number }>(
      `INSERT INTO rating_certificates
         (certificate_number, institution_id, reporting_period, adjusted_score, raw_score, evidence_confidence,
          rating, methodology_version, issued_by, issue_note, verification_token, valid_until,
          institution_name, institution_type, issuer_name, issuer_username, issuer_role,
          approved_snapshot_id, approved_snapshot_hash, lifecycle_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'active')
       RETURNING id`,
      [
        certificateNumber,
        institutionId,
        institution?.reporting_period ?? "Baseline",
        ranking.adjustedGreenScore,
        ranking.rawGreenScore,
        ranking.evidenceConfidence,
        ranking.rating,
        ranking.methodologyVersion,
        user.id,
        "Automatically issued upon rating approval.",
        verificationToken,
        validUntil.toISOString(),
        institution?.name ?? ranking.institution,
        institution?.type ?? ranking.institutionType,
        `${user.first_name} ${user.last_name}`,
        user.username,
        user.profile_role,
        snapshot.snapshotId,
        snapshot.snapshotHash,
      ],
    );
    await client.query(
      `UPDATE rating_certificates SET superseded_by = $2 WHERE institution_id = $1 AND lifecycle_status = 'superseded' AND superseded_by IS NULL`,
      [institutionId, certificate.rows[0].id],
    );
    await client.query(
      `UPDATE institution_reviews SET status = 'approved', reviewed_by = $2, reviewed_at = now(),
         review_note = $3, approved_snapshot_id = $4, revision = revision + 1, updated_at = now()
       WHERE institution_id = $1`,
      [institutionId, user.id, note, snapshot.snapshotId],
    );
    await client.query(
      `INSERT INTO workflow_events (institution_id, cycle_number, revision, action, from_status, to_status, note, snapshot_id,
         actor_id, actor_username, actor_name, actor_role)
       SELECT $1, cycle_number, revision, 'approve', 'submitted', 'approved', $2, $3, $4, $5, $6, $7
       FROM institution_reviews WHERE institution_id = $1`,
      [institutionId, note, snapshot.snapshotId, user.id, user.username,
        `${user.first_name} ${user.last_name}`, user.profile_role],
    );
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details_json, actor_username, actor_name, actor_role)
       VALUES ($1,'approve','institution_review',$2,$3,$4,$5,$6)`,
      [user.id, String(institutionId),
        JSON.stringify({ note, certificateNumber, snapshotId: snapshot.snapshotId }),
        user.username, `${user.first_name} ${user.last_name}`, user.profile_role],
    );
  });

  revalidatePath("/assessment");
  revalidatePath("/certificates");
  revalidatePath("/");
}

export async function saveProfileAction(formData: FormData) {
  const user = requireUser(await getSessionUser());
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const jobTitle = String(formData.get("jobTitle") || "").trim();
  if (!firstName || !lastName || !jobTitle) {
    throw new Error("First name, last name and job title are required.");
  }
  const department = String(formData.get("department") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const timezones = ["Africa/Lagos", "UTC", "Europe/London", "America/New_York"];
  const genders = ["Prefer not to say", "Female", "Male", "Non-binary"];
  const timezone = timezones.includes(String(formData.get("timezone"))) ? String(formData.get("timezone")) : "Africa/Lagos";
  const gender = genders.includes(String(formData.get("gender"))) ? String(formData.get("gender")) : "Prefer not to say";
  const emailNotifications = formData.get("emailNotifications") === "on";
  const compactMode = formData.get("compactMode") === "on";
  const themeMode = formData.get("themeMode") === "light" ? "light" : "dark";
  const colourThemes = ["amber", "emerald", "cobalt", "crimson"];
  const colorTheme = colourThemes.includes(String(formData.get("colorTheme"))) ? String(formData.get("colorTheme")) : "amber";
  const photoDataUrl = String(formData.get("photoDataUrl") || "");
  if (photoDataUrl && !/^data:image\/(?:png|jpeg|webp);base64,/.test(photoDataUrl)) {
    throw new Error("Profile photos must be PNG, JPG, or WebP images.");
  }
  if (photoDataUrl.length > 500_000) throw new Error("Profile photo must be 350 KB or smaller.");

  await query(
    `UPDATE users SET first_name = $2, last_name = $3, job_title = $4, department = $5, phone = $6,
       gender = $7, timezone = $8, email_notifications = $9, compact_mode = $10, theme_mode = $11,
       color_theme = $12, photo_data_url = $13, updated_at = now()
     WHERE id = $1`,
    [user.id, firstName, lastName, jobTitle, department, phone, gender, timezone, emailNotifications,
      compactMode, themeMode, colorTheme, photoDataUrl],
  );
  await recordAudit({
    userId: user.id,
    action: "update",
    entityType: "profile",
    entityId: String(user.id),
    actorUsername: user.username,
    actorName: `${firstName} ${lastName}`,
    actorRole: user.profile_role,
    details: { firstName, lastName, jobTitle, department, phone, timezone, gender, compactMode, emailNotifications },
  });
  revalidatePath("/profile");
  revalidatePath("/");
}

export async function updateUserAction(formData: FormData) {
  const user = requireUser(await getSessionUser());
  if (!isAdmin(user)) throw new Error("Administrator access required.");
  const userId = Number(formData.get("userId"));
  const profileRole = String(formData.get("profileRole"));
  const active = formData.get("active") === "on";
  const locked = formData.get("locked") === "on";
  if (!["admin", "analyst", "reviewer", "partner"].includes(profileRole)) throw new Error("Invalid role.");
  if (userId === user.id && (!active || profileRole !== "admin")) {
    throw new Error("You cannot remove your own administrator access.");
  }
  await query(
    `UPDATE users SET profile_role = $2, role = CASE WHEN $2 IN ('admin','analyst') THEN 'analyst' ELSE 'viewer' END,
       active = $3, manually_locked = $4, updated_at = now() WHERE id = $1`,
    [userId, profileRole, active, locked],
  );
  await recordAudit({
    userId: user.id,
    action: "update",
    entityType: "user",
    entityId: String(userId),
    actorUsername: user.username,
    actorName: `${user.first_name} ${user.last_name}`,
    actorRole: user.profile_role,
    details: { profileRole, active, locked },
  });
  revalidatePath("/admin");
}

export async function reopenAssessmentAction(formData: FormData) {
  const user = requireUser(await getSessionUser());
  if (!isAdmin(user)) throw new Error("Administrator access required.");
  const institutionId = Number(formData.get("institutionId"));
  const note = String(formData.get("note") ?? "").trim();
  if (!note) throw new Error("Add a reason for reopening the assessment.");
  await withTransaction(async (client) => {
    const review = await client.query<{ status: string }>(
      "SELECT status FROM institution_reviews WHERE institution_id = $1 FOR UPDATE",
      [institutionId],
    );
    if (!review.rowCount) throw new Error("Institution review not found.");
    if (!["approved", "submitted"].includes(review.rows[0].status)) {
      throw new Error("Only a submitted or approved assessment can be reopened.");
    }
    await client.query(
      `UPDATE institution_reviews SET status = 'draft', revision = revision + 1, updated_at = now()
       WHERE institution_id = $1`,
      [institutionId],
    );
    await client.query(
      `INSERT INTO workflow_events (institution_id, cycle_number, revision, action, from_status, to_status, note,
         actor_id, actor_username, actor_name, actor_role)
       SELECT $1, cycle_number, revision, 'reopen', $2, 'draft', $3, $4, $5, $6, $7
       FROM institution_reviews WHERE institution_id = $1`,
      [
        institutionId,
        review.rows[0].status,
        note,
        user.id,
        user.username,
        `${user.first_name} ${user.last_name}`,
        user.profile_role,
      ],
    );
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details_json, actor_username, actor_name, actor_role)
       VALUES ($1,'reopen','institution_review',$2,$3,$4,$5,$6)`,
      [
        user.id,
        String(institutionId),
        JSON.stringify({ note }),
        user.username,
        `${user.first_name} ${user.last_name}`,
        user.profile_role,
      ],
    );
  });
  revalidatePath("/assessment");
  revalidatePath("/");
}

export async function revokeCertificateAction(formData: FormData) {
  const user = requireUser(await getSessionUser());
  if (!canReview(user)) throw new Error("Your profile cannot revoke certificates.");
  const certificateId = Number(formData.get("certificateId"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("A revocation reason is required.");
  const certificate = await one<{ certificate_number: string; status: string }>(
    "SELECT certificate_number, status FROM rating_certificates WHERE id = $1",
    [certificateId],
  );
  if (!certificate) throw new Error("Rating certificate not found.");
  if (certificate.status !== "active") throw new Error("This certificate is no longer active.");
  await query(
    `UPDATE rating_certificates SET status = 'revoked', lifecycle_status = 'revoked',
       lifecycle_updated_at = now(), revoked_by = $2, revoked_at = now(), revocation_reason = $3
     WHERE id = $1`,
    [certificateId, user.id, reason],
  );
  await recordAudit({
    userId: user.id,
    action: "revoke",
    entityType: "rating_certificate",
    entityId: String(certificateId),
    actorUsername: user.username,
    actorName: `${user.first_name} ${user.last_name}`,
    actorRole: user.profile_role,
    details: { certificateNumber: certificate.certificate_number, reason },
  });
  revalidatePath("/certificates");
  revalidatePath("/");
}

export async function revokeCertificateState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await revokeCertificateAction(formData);
    return { ok: true, message: "Certificate revoked. The register and audit trail were updated." };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

async function createWorkspaceInstitution(
  name: string,
  type: string,
  reportingPeriod: string,
  actor: PlatformUser,
  cbnInstitutionId: number | null,
): Promise<number> {
  return withTransaction(async (client) => {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO institutions (name, type, reporting_period, created_by, cbn_institution_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [name, type, reportingPeriod, actor.id, cbnInstitutionId],
    );
    const institutionId = inserted.rows[0].id;
    await client.query(
      `INSERT INTO institution_reviews (institution_id, status, cycle_number, revision, methodology_version)
       VALUES ($1,'draft',1,0,'2026.1')`,
      [institutionId],
    );
    await client.query(
      `INSERT INTO assessments (institution_id, signal_id, score, assessed, evidence_grade, applicable)
       SELECT $1, signal_id, 0, false, 0, true FROM signals`,
      [institutionId],
    );
    if (cbnInstitutionId) {
      await client.query("UPDATE cbn_institutions SET portfolio_institution_id = $2 WHERE id = $1", [
        cbnInstitutionId,
        institutionId,
      ]);
    }
    return institutionId;
  });
}

export async function nominateInstitutionAction(formData: FormData) {
  const user = requireUser(await getSessionUser());
  if (!canEdit(user)) throw new Error("Your profile cannot nominate institutions.");
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const reportingPeriod = String(formData.get("reportingPeriod") ?? "Baseline").trim() || "Baseline";
  const comment = String(formData.get("comment") ?? "").trim();
  const cbnInstitutionId = Number(formData.get("cbnInstitutionId")) || null;
  if (!name || name.length > 200) throw new Error("Institution name is required and must be 200 characters or fewer.");
  if (!type) throw new Error("Select an institution category.");
  if (!comment) throw new Error("A comment is required for every enrolment submission and decision.");

  if (isAdmin(user)) {
    const institutionId = await createWorkspaceInstitution(name, type, reportingPeriod, user, cbnInstitutionId);
    await query(
      `INSERT INTO institution_enrollment_requests
         (cbn_institution_id, proposed_name, proposed_type, reporting_period, status, submitted_by,
          submission_comment, reviewed_by, review_comment, reviewed_at, portfolio_institution_id)
       VALUES ($1,$2,$3,$4,'approved',$5,$6,$5,$6,now(),$7)`,
      [cbnInstitutionId, name, type, reportingPeriod, user.id, comment, institutionId],
    );
    await recordAudit({
      userId: user.id,
      action: "approve",
      entityType: "institution_enrollment",
      entityId: String(institutionId),
      actorUsername: user.username,
      actorName: `${user.first_name} ${user.last_name}`,
      actorRole: user.profile_role,
      details: { proposedName: name, comment },
    });
    revalidatePath("/directory");
    revalidatePath("/");
    return `${name} was approved and enrolled.`;
  }

  await query(
    `INSERT INTO institution_enrollment_requests
       (cbn_institution_id, proposed_name, proposed_type, reporting_period, submitted_by, submission_comment)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [cbnInstitutionId, name, type, reportingPeriod, user.id, comment],
  );
  await recordAudit({
    userId: user.id,
    action: "submit",
    entityType: "institution_enrollment",
    entityId: name,
    actorUsername: user.username,
    actorName: `${user.first_name} ${user.last_name}`,
    actorRole: user.profile_role,
    details: { proposedName: name, comment },
  });
  revalidatePath("/directory");
  return `${name} was submitted for enrolment approval.`;
}

export async function decideEnrollmentAction(formData: FormData) {
  const user = requireUser(await getSessionUser());
  if (!canReview(user)) throw new Error("Your profile cannot review enrolment requests.");
  const requestId = Number(formData.get("requestId"));
  const action = String(formData.get("action") ?? "").toLowerCase();
  const comment = String(formData.get("comment") ?? "").trim();
  if (!["approve", "decline"].includes(action)) throw new Error("Enrolment action must be approve or decline.");
  if (!comment) throw new Error("A comment is required for every enrolment submission and decision.");
  const request = await one<{
    id: number;
    proposed_name: string;
    proposed_type: string;
    reporting_period: string;
    status: string;
    submitted_by: number | null;
    cbn_institution_id: number | null;
  }>(
    `SELECT id, proposed_name, proposed_type, reporting_period, status, submitted_by, cbn_institution_id
     FROM institution_enrollment_requests WHERE id = $1`,
    [requestId],
  );
  if (!request) throw new Error("Enrolment request not found.");
  if (request.status !== "pending") throw new Error(`This enrolment request is already ${request.status}.`);
  if (!isAdmin(user) && request.submitted_by === user.id) {
    throw new Error("The person who submitted this enrolment cannot review it.");
  }

  if (action === "decline") {
    await query(
      `UPDATE institution_enrollment_requests
       SET status = 'declined', reviewed_by = $2, review_comment = $3, reviewed_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [requestId, user.id, comment],
    );
    await recordAudit({
      userId: user.id,
      action: "decline",
      entityType: "institution_enrollment",
      entityId: String(requestId),
      actorUsername: user.username,
      actorName: `${user.first_name} ${user.last_name}`,
      actorRole: user.profile_role,
      details: { proposedName: request.proposed_name, comment },
    });
    revalidatePath("/directory");
    return "Institution enrolment was declined with a recorded comment.";
  }

  const institutionId = await createWorkspaceInstitution(
    request.proposed_name,
    request.proposed_type,
    request.reporting_period,
    user,
    request.cbn_institution_id,
  );
  await query(
    `UPDATE institution_enrollment_requests
     SET status = 'approved', reviewed_by = $2, review_comment = $3, reviewed_at = now(),
       portfolio_institution_id = $4, updated_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [requestId, user.id, comment, institutionId],
  );
  await recordAudit({
    userId: user.id,
    action: "approve",
    entityType: "institution_enrollment",
    entityId: String(requestId),
    actorUsername: user.username,
    actorName: `${user.first_name} ${user.last_name}`,
    actorRole: user.profile_role,
    details: { proposedName: request.proposed_name, comment, institutionId },
  });
  revalidatePath("/directory");
  revalidatePath("/");
  return `${request.proposed_name} was approved and enrolled.`;
}

export async function nominateInstitutionState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    return { ok: true, message: await nominateInstitutionAction(formData) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function decideEnrollmentState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    return { ok: true, message: await decideEnrollmentAction(formData) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export type ActionState = { ok: boolean; message: string } | null;

export async function saveAssessmentState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await saveAssessmentAction(formData);
    return { ok: true, message: "Assessment saved and the working rating recalculated." };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function submitAssessmentState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await submitAssessmentAction(formData);
    return { ok: true, message: "Submitted for independent review." };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function reviewAssessmentState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await reviewAssessmentAction(formData);
    return { ok: true, message: "Review decision recorded." };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function reopenAssessmentState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await reopenAssessmentAction(formData);
    return { ok: true, message: "Assessment reopened for editing." };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function saveProfileState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await saveProfileAction(formData);
    return { ok: true, message: "Profile and workspace preferences saved. Email delivery remains a future service." };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function updateUserState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await updateUserAction(formData);
    return { ok: true, message: "User profile updated." };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function addEvidenceAction(formData: FormData) {
  const user = requireUser(await getSessionUser());
  if (!canEdit(user)) throw new Error("Your profile cannot add evidence.");
  const institutionId = Number(formData.get("institutionId"));
  const signalId = String(formData.get("signalId") ?? "").trim();
  if (!signalId) throw new Error("Choose the signal this evidence supports.");
  const review = await one<{ cycle_number: number; status: string; reporting_period: string }>(
    `SELECT r.cycle_number, r.status, i.reporting_period FROM institution_reviews r
     JOIN institutions i ON i.id = r.institution_id WHERE r.institution_id = $1`,
    [institutionId],
  );
  if (!review) throw new Error("Institution review not found.");
  if (review.status === "approved") throw new Error("Approved ratings are frozen. Reopen before adding evidence.");

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const evidenceId = await withTransaction(async (client) => {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO evidence (institution_id, signal_id, reporting_period, evidence_grade, summary,
         primary_source_url, secondary_source_url, assessment_note, created_by, cycle_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        institutionId,
        signalId,
        review.reporting_period,
        Math.max(0, Math.min(3, Number(formData.get("grade")) || 0)),
        String(formData.get("summary") ?? "").trim(),
        String(formData.get("primarySourceUrl") ?? "").trim(),
        String(formData.get("secondarySourceUrl") ?? "").trim(),
        String(formData.get("assessmentNote") ?? "").trim(),
        user.id,
        review.cycle_number,
      ],
    );
    const id = inserted.rows[0].id;
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const digest = createHash("sha256").update(bytes).digest("hex");
      const storedName = `${randomBytes(8).toString("hex")}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const storagePath = `evidence/${institutionId}/${id}/${storedName}`;
      await client.query(
        `INSERT INTO evidence_attachments (evidence_id, original_name, stored_name, storage_path, mime_type, size_bytes, sha256, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, file.name, storedName, storagePath, file.type || "application/octet-stream", bytes.length, digest, user.id],
      );
      await client.query("INSERT INTO evidence_blobs (storage_path, content) VALUES ($1,$2)", [storagePath, bytes]);
    }
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details_json, actor_username, actor_name, actor_role)
       VALUES ($1,'create','evidence',$2,$3,$4,$5,$6)`,
      [user.id, String(id), JSON.stringify({ institutionId, signalId, files: files.length }), user.username,
        `${user.first_name} ${user.last_name}`, user.profile_role],
    );
    return id;
  });
  revalidatePath("/evidence");
  revalidatePath("/assessment");
  return evidenceId;
}

export async function removeEvidenceAction(formData: FormData) {
  const user = requireUser(await getSessionUser());
  if (!canEdit(user)) throw new Error("Your profile cannot change evidence.");
  const evidenceId = Number(formData.get("evidenceId"));
  const institutionId = Number(formData.get("institutionId"));
  const review = await one<{ status: string }>(
    "SELECT status FROM institution_reviews WHERE institution_id = $1",
    [institutionId],
  );
  if (!review) throw new Error("Institution review not found.");
  if (review.status === "approved") throw new Error("Approved ratings are frozen. Reopen before changing evidence.");
  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM evidence_blobs WHERE storage_path IN
         (SELECT storage_path FROM evidence_attachments WHERE evidence_id = $1)`,
      [evidenceId],
    );
    await client.query("DELETE FROM evidence_attachments WHERE evidence_id = $1", [evidenceId]);
    await client.query("DELETE FROM evidence WHERE id = $1 AND institution_id = $2", [evidenceId, institutionId]);
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details_json, actor_username, actor_name, actor_role)
       VALUES ($1,'delete','evidence',$2,$3,$4,$5,$6)`,
      [
        user.id,
        String(evidenceId),
        JSON.stringify({ institutionId }),
        user.username,
        `${user.first_name} ${user.last_name}`,
        user.profile_role,
      ],
    );
  });
  revalidatePath("/evidence");
  revalidatePath("/assessment");
}

export async function removeEvidenceState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await removeEvidenceAction(formData);
    return { ok: true, message: "Evidence record removed." };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function addEvidenceState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await addEvidenceAction(formData);
    return { ok: true, message: "Evidence record and attachments saved." };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

async function requireAdmin(): Promise<PlatformUser> {
  const user = requireUser(await getSessionUser());
  if (!isAdmin(user)) throw new Error("Administrator access required.");
  return user;
}

async function authIdFor(userId: number): Promise<string | null> {
  const row = await one<{ auth_user_id: string | null }>("SELECT auth_user_id FROM users WHERE id = $1", [userId]);
  if (!row) throw new Error("User profile not found.");
  return row.auth_user_id;
}

export async function createPlatformUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const username = String(formData.get("username") || "").trim();
  const jobTitle = String(formData.get("jobTitle") || "").trim();
  const profileRole = String(formData.get("role") || "analyst");
  const gender = String(formData.get("gender") || "Prefer not to say");
  const passcode = String(formData.get("passcode") || "");
  const confirmPasscode = String(formData.get("confirmPasscode") || "");
  if (!firstName || !lastName || !jobTitle) throw new Error("First name, last name and job title are required.");
  if (!/^[A-Za-z0-9._-]{2,64}$/.test(username)) {
    throw new Error("Username must be 2–64 characters using letters, numbers, dots, underscores or hyphens.");
  }
  if (!["admin", "analyst", "reviewer", "partner"].includes(profileRole)) throw new Error("Invalid profile.");
  if (!/^\d{4}$/.test(passcode)) throw new Error("Passcodes must contain exactly four digits.");
  if (passcode !== confirmPasscode) throw new Error("The two passcodes do not match.");
  const email = `${username}@denhamandgrey.com`;
  const existing = await one<{ id: number }>(
    "SELECT id FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($2)",
    [username, email],
  );
  if (existing) throw new Error("An account with that username already exists.");

  const { data, error } = await authAdmin.createUser({
    email,
    password: authPassword(passcode),
    name: `${firstName} ${lastName}`,
  });
  if (error) throw new Error(error.message || "The sign-in credential could not be created.");
  const authUserId = data?.user?.id ?? null;

  try {
    await query(
      `INSERT INTO users (auth_user_id, username, email, role, profile_role, first_name, last_name,
         job_title, gender, timezone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Africa/Lagos')`,
      [authUserId, username, email, profileRole === "partner" || profileRole === "reviewer" ? "viewer" : "analyst",
        profileRole, firstName, lastName, jobTitle, gender],
    );
  } catch (insertError) {
    if (authUserId) await authAdmin.removeUser({ userId: authUserId }).catch(() => undefined);
    throw insertError;
  }
  if (authUserId) await syncAuthRole(authUserId, profileRole);
  await recordAudit({
    userId: admin.id,
    action: "create",
    entityType: "user",
    entityId: username,
    actorUsername: admin.username,
    actorName: `${admin.first_name} ${admin.last_name}`,
    actorRole: admin.profile_role,
    details: { username, profileRole, jobTitle },
  });
  revalidatePath("/admin");
  return `Account created for ${firstName} ${lastName}.`;
}

export async function resetUserPasscodeAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = Number(formData.get("userId"));
  const newPasscode = String(formData.get("newPasscode") || "");
  const confirmPasscode = String(formData.get("confirmPasscode") || "");
  if (!Number.isFinite(userId)) throw new Error("Choose a user account.");
  if (!/^\d{4}$/.test(newPasscode)) throw new Error("Passcodes must contain exactly four digits.");
  if (newPasscode !== confirmPasscode) throw new Error("The two passcodes do not match.");
  const authUserId = await authIdFor(userId);
  if (!authUserId) throw new Error("This profile has no sign-in credential attached yet.");
  const { error } = await authAdmin.setUserPassword({ userId: authUserId, newPassword: authPassword(newPasscode) });
  if (error) throw new Error(error.message || "The passcode could not be reset.");
  await authAdmin.revokeUserSessions({ userId: authUserId }).catch(() => undefined);
  const target = await one<{ first_name: string; last_name: string }>(
    "SELECT first_name, last_name FROM users WHERE id = $1",
    [userId],
  );
  await recordAudit({
    userId: admin.id,
    action: "update",
    entityType: "user",
    entityId: String(userId),
    actorUsername: admin.username,
    actorName: `${admin.first_name} ${admin.last_name}`,
    actorRole: admin.profile_role,
    details: { field: "passcode", target: target ? `${target.first_name} ${target.last_name}` : String(userId) },
  });
  revalidatePath("/admin");
  return `Passcode reset for ${target?.first_name ?? "user"} ${target?.last_name ?? ""}; their active sessions were ended.`;
}

export async function setUserActiveAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = Number(formData.get("userId"));
  const active = String(formData.get("active")) === "true";
  if (!Number.isFinite(userId)) throw new Error("Choose a user account.");
  if (userId === admin.id) throw new Error("You cannot suspend your own account.");
  const target = await one<{ first_name: string; last_name: string; auth_user_id: string | null; retired: boolean }>(
    "SELECT first_name, last_name, auth_user_id, retired FROM users WHERE id = $1",
    [userId],
  );
  if (!target) throw new Error("User profile not found.");
  if (target.retired) throw new Error("Retired accounts cannot be reactivated.");
  await query("UPDATE users SET active = $2, updated_at = now() WHERE id = $1", [userId, active]);
  if (target.auth_user_id) {
    if (active) {
      await authAdmin.unbanUser({ userId: target.auth_user_id }).catch(() => undefined);
    } else {
      await authAdmin.banUser({ userId: target.auth_user_id, banReason: "Suspended by administrator." }).catch(() => undefined);
    }
  }
  await recordAudit({
    userId: admin.id,
    action: active ? "activate" : "suspend",
    entityType: "user",
    entityId: String(userId),
    actorUsername: admin.username,
    actorName: `${admin.first_name} ${admin.last_name}`,
    actorRole: admin.profile_role,
    details: { target: `${target.first_name} ${target.last_name}` },
  });
  revalidatePath("/admin");
  return `${target.first_name} ${target.last_name} was ${active ? "activated" : "suspended"}.`;
}

export async function setUserLockAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = Number(formData.get("userId"));
  const locked = String(formData.get("locked")) === "true";
  const reason = String(formData.get("reason") || "").trim();
  if (!Number.isFinite(userId)) throw new Error("Choose a user account.");
  if (userId === admin.id) throw new Error("You cannot lock your own account.");
  if (!reason) throw new Error("State the reason for this access decision.");
  const target = await one<{ first_name: string; last_name: string; auth_user_id: string | null; retired: boolean }>(
    "SELECT first_name, last_name, auth_user_id, retired FROM users WHERE id = $1",
    [userId],
  );
  if (!target) throw new Error("User profile not found.");
  if (target.retired) throw new Error("Retired accounts cannot be locked or unlocked.");
  await query(
    "UPDATE users SET manually_locked = $2, lock_reason = $3, updated_at = now() WHERE id = $1",
    [userId, locked, locked ? reason : ""],
  );
  if (target.auth_user_id) {
    if (locked) {
      await authAdmin.banUser({ userId: target.auth_user_id, banReason: reason }).catch(() => undefined);
    } else {
      await authAdmin.unbanUser({ userId: target.auth_user_id }).catch(() => undefined);
    }
  }
  await recordAudit({
    userId: admin.id,
    action: locked ? "lock" : "unlock",
    entityType: "user",
    entityId: String(userId),
    actorUsername: admin.username,
    actorName: `${admin.first_name} ${admin.last_name}`,
    actorRole: admin.profile_role,
    details: { target: `${target.first_name} ${target.last_name}`, reason },
  });
  revalidatePath("/admin");
  return `${target.first_name} ${target.last_name}'s account was ${locked ? "locked" : "unlocked"}.`;
}

export async function retireUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = Number(formData.get("userId"));
  const confirmation = String(formData.get("confirmUsername") || "").trim();
  if (!Number.isFinite(userId)) throw new Error("Choose a user account.");
  if (userId === admin.id) throw new Error("You cannot retire your own account.");
  const target = await one<{
    first_name: string;
    last_name: string;
    username: string;
    auth_user_id: string | null;
    retired: boolean;
  }>(
    "SELECT first_name, last_name, username, auth_user_id, retired FROM users WHERE id = $1",
    [userId],
  );
  if (!target) throw new Error("User profile not found.");
  if (target.retired) throw new Error("This account is already retired.");
  if (confirmation !== target.username) throw new Error("Type the exact username to confirm removal.");
  await query("UPDATE users SET retired = true, active = false, updated_at = now() WHERE id = $1", [userId]);
  if (target.auth_user_id) {
    await authAdmin
      .banUser({ userId: target.auth_user_id, banReason: "Account retired by administrator." })
      .catch(() => undefined);
  }
  await recordAudit({
    userId: admin.id,
    action: "retire",
    entityType: "user",
    entityId: String(userId),
    actorUsername: admin.username,
    actorName: `${admin.first_name} ${admin.last_name}`,
    actorRole: admin.profile_role,
    details: { target: target.username },
  });
  revalidatePath("/admin");
  return `${target.first_name} ${target.last_name}'s account was retired; immutable governance history was retained.`;
}

export async function updateManagedUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = Number(formData.get("userId"));
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const jobTitle = String(formData.get("jobTitle") || "").trim();
  const profileRole = String(formData.get("role") || "analyst");
  const department = String(formData.get("department") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const gender = String(formData.get("gender") || "Prefer not to say");
  const timezones = ["Africa/Lagos", "UTC", "Europe/London", "America/New_York"];
  const timezone = timezones.includes(String(formData.get("timezone")))
    ? String(formData.get("timezone"))
    : "Africa/Lagos";
  if (!Number.isFinite(userId)) throw new Error("Choose a user account.");
  if (!firstName || !lastName || !jobTitle) throw new Error("First name, last name and job title are required.");
  if (!["admin", "analyst", "reviewer", "partner"].includes(profileRole)) throw new Error("Invalid profile.");
  if (userId === admin.id && profileRole !== "admin") {
    throw new Error("You cannot remove your own administrator access.");
  }
  const authUserId = await authIdFor(userId);
  await query(
    `UPDATE users SET first_name = $2, last_name = $3, job_title = $4, profile_role = $5,
       role = CASE WHEN $5 IN ('admin','analyst') THEN 'analyst' ELSE 'viewer' END,
       department = $6, phone = $7, gender = $8, timezone = $9, updated_at = now()
     WHERE id = $1`,
    [userId, firstName, lastName, jobTitle, profileRole, department, phone, gender, timezone],
  );
  if (authUserId) {
    await syncAuthRole(authUserId, profileRole);
    await authAdmin.revokeUserSessions({ userId: authUserId }).catch(() => undefined);
  }
  await recordAudit({
    userId: admin.id,
    action: "update",
    entityType: "user",
    entityId: String(userId),
    actorUsername: admin.username,
    actorName: `${admin.first_name} ${admin.last_name}`,
    actorRole: admin.profile_role,
    details: { firstName, lastName, jobTitle, profileRole, department },
  });
  revalidatePath("/admin");
  return "User profile updated.";
}

export async function createInstitutionAction(formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "").trim();
  const reportingPeriod = String(formData.get("reportingPeriod") || "Baseline").trim() || "Baseline";
  const comment = String(formData.get("comment") || "").trim();
  if (!name || name.length > 200) {
    throw new Error("Institution name is required and must be 200 characters or fewer.");
  }
  if (!type) throw new Error("Select an institution category.");
  if (!comment) throw new Error("An administrator approval comment is required.");
  const institutionId = await createWorkspaceInstitution(name, type, reportingPeriod, admin, null);
  await query(
    `INSERT INTO institution_enrollment_requests
       (proposed_name, proposed_type, reporting_period, status, submitted_by, submission_comment,
        reviewed_by, review_comment, reviewed_at, portfolio_institution_id)
     VALUES ($1,$2,$3,'approved',$4,$5,$4,$5,now(),$6)`,
    [name, type, reportingPeriod, admin.id, comment, institutionId],
  );
  await recordAudit({
    userId: admin.id,
    action: "create",
    entityType: "institution",
    entityId: String(institutionId),
    actorUsername: admin.username,
    actorName: `${admin.first_name} ${admin.last_name}`,
    actorRole: admin.profile_role,
    details: { name, type, reportingPeriod, comment },
  });
  revalidatePath("/admin");
  revalidatePath("/directory");
  revalidatePath("/");
  return `${name} was approved and added to the rating workspace.`;
}

export async function updateInstitutionAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "").trim();
  const reportingPeriod = String(formData.get("reportingPeriod") || "").trim();
  if (!Number.isFinite(id)) throw new Error("Choose an institution.");
  if (!name || !type || !reportingPeriod) throw new Error("Name, category and reporting period are required.");
  await query(
    "UPDATE institutions SET name = $2, type = $3, reporting_period = $4, updated_at = now() WHERE id = $1",
    [id, name, type, reportingPeriod],
  );
  await recordAudit({
    userId: admin.id,
    action: "update",
    entityType: "institution",
    entityId: String(id),
    actorUsername: admin.username,
    actorName: `${admin.first_name} ${admin.last_name}`,
    actorRole: admin.profile_role,
    details: { name, type, reportingPeriod },
  });
  revalidatePath("/admin");
  revalidatePath("/");
  return "Institution updated.";
}

export async function deleteInstitutionAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  const confirmName = String(formData.get("confirmName") || "").trim();
  if (!Number.isFinite(id)) throw new Error("Choose an institution.");
  const institution = await one<{ name: string; deletable: boolean }>(
    `SELECT i.name,
       CASE WHEN
         EXISTS (SELECT 1 FROM rating_certificates c WHERE c.institution_id = i.id)
         OR EXISTS (SELECT 1 FROM assessment_snapshots sn WHERE sn.institution_id = i.id)
         OR EXISTS (SELECT 1 FROM workflow_events we WHERE we.institution_id = i.id)
         OR EXISTS (SELECT 1 FROM evidence e WHERE e.institution_id = i.id)
         OR EXISTS (SELECT 1 FROM assessments a WHERE a.institution_id = i.id AND a.assessed)
       THEN false ELSE true END AS deletable
     FROM institutions i WHERE i.id = $1`,
    [id],
  );
  if (!institution) throw new Error("Institution not found.");
  if (!institution.deletable) {
    throw new Error("Records with assessment, evidence, workflow, or certificate history cannot be deleted.");
  }
  if (confirmName !== institution.name) throw new Error("Type the exact institution name to confirm removal.");
  await withTransaction(async (client) => {
    await client.query(
      "UPDATE cbn_institutions SET portfolio_institution_id = NULL WHERE portfolio_institution_id = $1",
      [id],
    );
    await client.query("DELETE FROM institutions WHERE id = $1", [id]);
  });
  await recordAudit({
    userId: admin.id,
    action: "delete",
    entityType: "institution",
    entityId: String(id),
    actorUsername: admin.username,
    actorName: `${admin.first_name} ${admin.last_name}`,
    actorRole: admin.profile_role,
    details: { name: institution.name },
  });
  revalidatePath("/admin");
  revalidatePath("/");
  return `${institution.name} was removed.`;
}

export async function createPlatformUserState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    return { ok: true, message: await createPlatformUserAction(formData) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function resetUserPasscodeState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    return { ok: true, message: await resetUserPasscodeAction(formData) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function setUserActiveState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    return { ok: true, message: await setUserActiveAction(formData) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function setUserLockState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    return { ok: true, message: await setUserLockAction(formData) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function retireUserState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    return { ok: true, message: await retireUserAction(formData) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function updateManagedUserState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    return { ok: true, message: await updateManagedUserAction(formData) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function createInstitutionState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    return { ok: true, message: await createInstitutionAction(formData) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function updateInstitutionState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    return { ok: true, message: await updateInstitutionAction(formData) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function deleteInstitutionState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    return { ok: true, message: await deleteInstitutionAction(formData) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
