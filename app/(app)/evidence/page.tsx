import { getAssessmentRows, getEvidence, getInstitution, getInstitutions, getReview } from "@/lib/data";
import { getSessionUser, canEdit } from "@/lib/session";
import { redirect } from "next/navigation";
import { EvidenceRegister, type EvidenceDisplayRow } from "@/components/evidence-register";

export const dynamic = "force-dynamic";

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ institution?: string }>;
}) {
  const params = await searchParams;
  const [user, institutions] = await Promise.all([getSessionUser(), getInstitutions()]);
  if (user?.profile_role === "partner") redirect("/");
  const institutionId = Number(params.institution) || institutions[0]?.id || 0;
  const [institution, evidence, assessments, review] = await Promise.all([
    getInstitution(institutionId),
    getEvidence(institutionId),
    getAssessmentRows(institutionId),
    getReview(institutionId),
  ]);

  const evidenceBySignal = new Map<string, typeof evidence>();
  for (const item of evidence) {
    const bucket = evidenceBySignal.get(item.signal_id) ?? [];
    bucket.push(item);
    evidenceBySignal.set(item.signal_id, bucket);
  }

  const rows: EvidenceDisplayRow[] = [];
  for (const assessment of assessments) {
    const items = evidenceBySignal.get(assessment.signal_id) ?? [];
    if (items.length) {
      for (const item of items) {
        rows.push({
          signalId: assessment.signal_id,
          signal: assessment.name,
          pillar: assessment.pillar,
          applicable: assessment.applicable,
          evidenceGrade: assessment.evidence_grade,
          item: {
            id: item.id,
            summary: item.summary,
            primarySourceUrl: item.primary_source_url,
            secondarySourceUrl: item.secondary_source_url,
            assessmentNote: item.assessment_note,
            createdBy: item.created_by_name,
            createdAt: item.created_at,
            attachments: item.attachments.map((attachment) => ({
              id: attachment.id,
              originalName: attachment.original_name,
              sizeBytes: attachment.size_bytes,
            })),
          },
        });
      }
    } else {
      rows.push({
        signalId: assessment.signal_id,
        signal: assessment.name,
        pillar: assessment.pillar,
        applicable: assessment.applicable,
        evidenceGrade: assessment.evidence_grade,
        item: null,
      });
    }
  }

  return (
    <EvidenceRegister
      institutionId={institutionId}
      institutionName={institution?.name ?? "Institution"}
      reportingPeriod={institution?.reporting_period ?? ""}
      status={review?.status ?? "draft"}
      canEdit={canEdit(user)}
      rows={rows}
      signals={assessments
        .filter((assessment) => assessment.applicable)
        .map((assessment) => ({ signalId: assessment.signal_id, name: assessment.name }))}
    />
  );
}
