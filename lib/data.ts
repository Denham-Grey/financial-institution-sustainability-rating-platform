import { one, query } from "@/lib/db";
import { calculateRankings, type Ranking, type ScoreRow } from "@/lib/scoring";

export type Institution = {
  id: number;
  name: string;
  type: string;
  reporting_period: string;
  cbn_institution_id: number | null;
  licence_status: string;
  regulatory_source_url: string;
};

export type Review = {
  institution_id: number;
  status: "draft" | "submitted" | "approved" | "changes_requested";
  cycle_number: number;
  revision: number;
  methodology_version: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  submission_note: string;
  review_note: string;
  approved_snapshot_id: number | null;
};

export async function getInstitutions(): Promise<Institution[]> {
  return query<Institution>(
    `SELECT id, name, type, reporting_period, cbn_institution_id, licence_status, regulatory_source_url
     FROM institutions ORDER BY name`,
  );
}

export async function getInstitution(id: number): Promise<Institution | null> {
  return one<Institution>(
    `SELECT id, name, type, reporting_period, cbn_institution_id, licence_status, regulatory_source_url
     FROM institutions WHERE id = $1`,
    [id],
  );
}

export async function getReview(institutionId: number): Promise<Review | null> {
  return one<Review>(`SELECT * FROM institution_reviews WHERE institution_id = $1`, [institutionId]);
}

export async function getRankings(): Promise<Ranking[]> {
  const rows = await query<ScoreRow>(
    `SELECT i.id AS "institutionId", i.name AS institution, i.type AS "institutionType",
       i.reporting_period AS "reportingPeriod", r.status AS "workflowStatus",
       r.cycle_number AS "cycleNumber", r.revision, r.methodology_version AS "methodologyVersion",
       s.pillar, s.weight, a.score, a.assessed, a.evidence_grade AS "evidenceGrade", a.applicable
     FROM institutions i
     LEFT JOIN institution_reviews r ON r.institution_id = i.id
     LEFT JOIN assessments a ON a.institution_id = i.id
     LEFT JOIN signals s ON s.signal_id = a.signal_id
     ORDER BY i.name, s.signal_id`,
  );
  const complete = rows.filter((row) => row.pillar);
  return calculateRankings(complete);
}

export type SignalRow = {
  signal_id: string;
  pillar: string;
  name: string;
  weight: number;
  definition: string;
  measurement: string;
  evidence_required: string;
  score_guide: string;
  primary_framework: string;
  source_url: string;
  notes: string;
  justification: string;
  references_json: { label: string; url: string }[];
  methodology_version: string;
};

export async function getSignals(): Promise<SignalRow[]> {
  return query<SignalRow>(`SELECT * FROM signals ORDER BY signal_id`);
}

export type AssessmentCell = {
  signal_id: string;
  pillar: string;
  name: string;
  weight: number;
  score: number;
  assessed: boolean;
  evidence_grade: number;
  applicable: boolean;
  na_reason: string;
};

export async function getAssessmentRows(institutionId: number): Promise<AssessmentCell[]> {
  return query<AssessmentCell>(
    `SELECT s.signal_id, s.pillar, s.name, s.weight,
       COALESCE(a.score, 0) AS score, COALESCE(a.assessed, false) AS assessed,
       COALESCE(a.evidence_grade, 0) AS evidence_grade, COALESCE(a.applicable, true) AS applicable,
       COALESCE(a.na_reason, '') AS na_reason
     FROM signals s
     LEFT JOIN assessments a ON a.signal_id = s.signal_id AND a.institution_id = $1
     ORDER BY s.signal_id`,
    [institutionId],
  );
}

export type ReviewActors = {
  submitted_by_name: string;
  reviewed_by_name: string;
};

export async function getReviewActors(institutionId: number): Promise<ReviewActors | null> {
  return one<ReviewActors>(
    `SELECT COALESCE(NULLIF(btrim(su.first_name || ' ' || su.last_name), ''), su.username, '') AS submitted_by_name,
       COALESCE(NULLIF(btrim(ru.first_name || ' ' || ru.last_name), ''), ru.username, '') AS reviewed_by_name
     FROM institution_reviews r
     LEFT JOIN users su ON su.id = r.submitted_by
     LEFT JOIN users ru ON ru.id = r.reviewed_by
     WHERE r.institution_id = $1`,
    [institutionId],
  );
}

export type WorkflowEvent = {
  id: number;
  action: string;
  note: string;
  actor_name: string;
  actor_username: string;
  actor_role: string;
  created_at: string;
};

export async function getWorkflowEvents(institutionId: number, limit = 8): Promise<WorkflowEvent[]> {
  return query<WorkflowEvent>(
    `SELECT id, action, note, actor_name, actor_username, actor_role, created_at
     FROM workflow_events WHERE institution_id = $1
     ORDER BY created_at DESC, id DESC LIMIT $2`,
    [institutionId, limit],
  );
}

export type EvidenceCount = { signal_id: string; records: number; files: number };

export async function getEvidenceCounts(institutionId: number): Promise<EvidenceCount[]> {
  return query<EvidenceCount>(
    `SELECT e.signal_id, count(DISTINCT e.id)::int AS records, count(a.id)::int AS files
     FROM evidence e LEFT JOIN evidence_attachments a ON a.evidence_id = e.id
     WHERE e.institution_id = $1
     GROUP BY e.signal_id`,
    [institutionId],
  );
}

export type EvidenceRow = {
  id: number;
  signal_id: string;
  signal_name: string;
  reporting_period: string;
  evidence_grade: number;
  summary: string;
  primary_source_url: string;
  secondary_source_url: string;
  assessment_note: string;
  cycle_number: number;
  created_by_name: string;
  created_at: string;
  attachments: { id: number; original_name: string; size_bytes: number; sha256: string; storage_path: string }[];
};

export async function getEvidence(institutionId: number): Promise<EvidenceRow[]> {
  const rows = await query<Omit<EvidenceRow, "attachments"> & { signal_name: string }>(
    `SELECT e.id, e.signal_id, s.name AS signal_name, e.reporting_period, e.evidence_grade,
       e.summary, e.primary_source_url, e.secondary_source_url, e.assessment_note, e.cycle_number,
       COALESCE(NULLIF(btrim(u.first_name || ' ' || u.last_name), ''), u.username, 'System') AS created_by_name,
       e.created_at
     FROM evidence e JOIN signals s ON s.signal_id = e.signal_id
     LEFT JOIN users u ON u.id = e.created_by
     WHERE e.institution_id = $1 ORDER BY e.signal_id`,
    [institutionId],
  );
  const attachments = await query<
    EvidenceRow["attachments"][number] & { evidence_id: number }
  >(
    `SELECT a.id, a.evidence_id, a.original_name, a.size_bytes, a.sha256, a.storage_path
     FROM evidence_attachments a JOIN evidence e ON e.id = a.evidence_id
     WHERE e.institution_id = $1 ORDER BY a.original_name`,
    [institutionId],
  );
  return rows.map((row) => ({
    ...row,
    attachments: attachments.filter((item) => item.evidence_id === row.id),
  }));
}

export type CertificateRow = {
  id: number;
  certificate_number: string;
  institution_id: number;
  institution_name: string;
  institution_type: string;
  reporting_period: string;
  adjusted_score: number;
  raw_score: number;
  evidence_confidence: number;
  rating: string;
  issued_at: string;
  valid_until: string;
  lifecycle_status: string;
  verification_token: string;
  issuer_name: string;
  revocation_reason: string;
};

export async function getCertificates(institutionId?: number): Promise<CertificateRow[]> {
  return query<CertificateRow>(
    `SELECT id, certificate_number, institution_id, institution_name, institution_type, reporting_period,
       adjusted_score, raw_score, evidence_confidence, rating, issued_at, valid_until,
       lifecycle_status, verification_token, issuer_name, revocation_reason
     FROM rating_certificates
     ${institutionId ? "WHERE institution_id = $1" : ""}
     ORDER BY issued_at DESC`,
    institutionId ? [institutionId] : [],
  );
}

export type PartnerApprovedRow = {
  id: number;
  certificate_number: string;
  institution_id: number;
  institution_name: string;
  institution_type: string;
  reporting_period: string;
  adjusted_score: number;
  rating: string;
  verification_token: string;
  issued_at: string;
};

export type PartnerView = {
  approvedInstitutions: number;
  activeCertificates: PartnerApprovedRow[];
  ratingDistribution: { rating: string; count: number }[];
};

export async function getPartnerView(): Promise<PartnerView> {
  const activeCertificates = await query<PartnerApprovedRow>(
    `SELECT id, certificate_number, institution_id, institution_name, institution_type, reporting_period,
       adjusted_score, rating, verification_token, issued_at
     FROM rating_certificates
     WHERE lifecycle_status = 'active'
     ORDER BY issued_at DESC`,
  );
  const counts = new Map<string, number>();
  for (const row of activeCertificates) {
    const key = row.rating || "Unclassified";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    approvedInstitutions: new Set(activeCertificates.map((row) => row.institution_id)).size,
    activeCertificates,
    ratingDistribution: [...counts].map(([rating, count]) => ({ rating, count })),
  };
}

export type DirectoryRow = {
  id: number;
  official_name: string;
  category_code: string;
  category_name: string;
  licence_number: string;
  licence_status: string;
  state: string;
  website: string;
  source_url: string;
  source_record_id: string;
  portfolio_institution_id: number | null;
};

export async function searchDirectory(
  search: string,
  category: string,
  page: number,
  pageSize = 25,
): Promise<{ rows: DirectoryRow[]; total: number }> {
  const filters: string[] = [];
  const params: unknown[] = [];
  if (search) {
    params.push(`%${search}%`);
    filters.push(`(c.official_name ILIKE $${params.length} OR c.licence_number ILIKE $${params.length})`);
  }
  if (category) {
    params.push(category);
    filters.push(`c.category_code = $${params.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM cbn_institutions c ${where}`,
    params,
  );
  params.push(pageSize, Math.max(0, (page - 1) * pageSize));
  const rows = await query<DirectoryRow>(
    `SELECT c.id, c.official_name, c.category_code, cat.official_name AS category_name,
       c.licence_number, c.licence_status, c.state, c.website, c.source_url, c.source_record_id,
       c.portfolio_institution_id
     FROM cbn_institutions c JOIN cbn_categories cat ON cat.code = c.category_code
     ${where}
     ORDER BY c.official_name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: totalRow?.total ?? 0 };
}

export async function getDirectoryCategories() {
  return query<{ code: string; official_name: string; count: number }>(
    `SELECT cat.code, cat.official_name, count(c.id)::int AS count
     FROM cbn_categories cat LEFT JOIN cbn_institutions c ON c.category_code = cat.code
     GROUP BY cat.code, cat.official_name ORDER BY cat.official_name`,
  );
}

export type EnrollmentRequest = {
  id: number;
  cbn_institution_id: number | null;
  proposed_name: string;
  proposed_type: string;
  reporting_period: string;
  status: string;
  submission_comment: string;
  submitted_at: string;
  review_comment: string;
  submitted_by_name: string;
  portfolio_institution_id: number | null;
};

export async function getEnrollmentRequests(): Promise<EnrollmentRequest[]> {
  return query<EnrollmentRequest>(
    `SELECT er.id, er.cbn_institution_id, er.proposed_name, er.proposed_type, er.reporting_period,
       er.status, er.submission_comment, er.submitted_at, er.review_comment,
       COALESCE(NULLIF(btrim(u.first_name || ' ' || u.last_name), ''), u.username, 'Analyst') AS submitted_by_name,
       er.portfolio_institution_id
     FROM institution_enrollment_requests er
     LEFT JOIN users u ON u.id = er.submitted_by
     ORDER BY er.submitted_at DESC`,
  );
}

export async function getAudit(limit = 40) {
  return query<{
    id: number;
    action: string;
    entity_type: string;
    entity_id: string;
    actor_name: string;
    actor_role: string;
    created_at: string;
    details_json: Record<string, unknown>;
  }>(
    `SELECT id, action, entity_type, entity_id, actor_name, actor_role, created_at, details_json
     FROM audit_log ORDER BY created_at DESC, id DESC LIMIT $1`,
    [limit],
  );
}

export async function getPlatformUsers() {
  return query<{
    id: number;
    username: string;
    email: string;
    profile_role: string;
    first_name: string;
    last_name: string;
    job_title: string;
    department: string;
    phone: string;
    gender: string;
    timezone: string;
    active: boolean;
    manually_locked: boolean;
    lock_reason: string;
    retired: boolean;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, username, email, profile_role, first_name, last_name, job_title, department, phone,
       gender, timezone, active, manually_locked, lock_reason, retired, created_at, updated_at
     FROM users ORDER BY first_name, last_name`,
  );
}

export type AdminInstitution = {
  id: number;
  name: string;
  type: string;
  reporting_period: string;
  deletable: boolean;
};

export async function getAdminInstitutions(): Promise<AdminInstitution[]> {
  return query<AdminInstitution>(
    `SELECT i.id, i.name, i.type, i.reporting_period,
       CASE WHEN
         EXISTS (SELECT 1 FROM rating_certificates c WHERE c.institution_id = i.id)
         OR EXISTS (SELECT 1 FROM assessment_snapshots sn WHERE sn.institution_id = i.id)
         OR EXISTS (SELECT 1 FROM workflow_events we WHERE we.institution_id = i.id)
         OR EXISTS (SELECT 1 FROM evidence e WHERE e.institution_id = i.id)
         OR EXISTS (SELECT 1 FROM assessments a WHERE a.institution_id = i.id AND a.assessed)
       THEN false ELSE true END AS deletable
     FROM institutions i ORDER BY i.name`,
  );
}

export async function recordAudit(input: {
  userId: number;
  action: string;
  entityType: string;
  entityId: string;
  actorUsername: string;
  actorName: string;
  actorRole: string;
  details?: unknown;
}) {
  await query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details_json, actor_username, actor_name, actor_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.userId,
      input.action,
      input.entityType,
      input.entityId,
      JSON.stringify(input.details ?? {}),
      input.actorUsername,
      input.actorName,
      input.actorRole,
    ],
  );
}
