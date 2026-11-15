import {
  getAssessmentRows,
  getEvidenceCounts,
  getInstitution,
  getInstitutions,
  getReview,
  getReviewActors,
  getSignals,
  getWorkflowEvents,
} from "@/lib/data";
import { getSessionUser, canEdit, canReview, isAdmin } from "@/lib/session";
import { redirect } from "next/navigation";
import { AssessmentEditor, type AssessmentDraftRow } from "@/components/assessment-editor";
import type { SignalGuide } from "@/components/signal-guide-dialog";

export const dynamic = "force-dynamic";

export default async function AssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ institution?: string }>;
}) {
  const params = await searchParams;
  const [user, institutions] = await Promise.all([getSessionUser(), getInstitutions()]);
  if (user?.profile_role === "partner") redirect("/");
  const institutionId = Number(params.institution) || institutions[0]?.id || 0;
  const [institution, cells, review, actors, events, signals, evidenceCounts] = await Promise.all([
    getInstitution(institutionId),
    getAssessmentRows(institutionId),
    getReview(institutionId),
    getReviewActors(institutionId),
    getWorkflowEvents(institutionId),
    getSignals(),
    getEvidenceCounts(institutionId),
  ]);

  const countsBySignal = new Map(evidenceCounts.map((entry) => [entry.signal_id, entry]));
  const rows: AssessmentDraftRow[] = cells.map((cell) => {
    const counts = countsBySignal.get(cell.signal_id);
    return {
      signalId: cell.signal_id,
      pillar: cell.pillar,
      signal: cell.name,
      weight: cell.weight,
      score: cell.assessed ? cell.score : null,
      assessed: cell.assessed,
      evidenceGrade: cell.evidence_grade,
      applicable: cell.applicable,
      naReason: cell.na_reason,
      evidenceRecords: counts?.records ?? 0,
      evidenceFiles: counts?.files ?? 0,
    };
  });

  const guideSignals: Record<string, SignalGuide> = Object.fromEntries(
    signals.map((signal) => [
      signal.signal_id,
      {
        signalId: signal.signal_id,
        pillar: signal.pillar,
        name: signal.name,
        weight: signal.weight,
        definition: signal.definition,
        measurement: signal.measurement,
        evidenceRequired: signal.evidence_required,
        scoreGuide: signal.score_guide,
        primaryFramework: signal.primary_framework,
        sourceUrl: signal.source_url,
        references: Array.isArray(signal.references_json) ? signal.references_json : [],
        methodologyVersion: signal.methodology_version,
      },
    ]),
  );

  return (
    <AssessmentEditor
      institutionId={institutionId}
      institutionName={institution?.name ?? "Institution"}
      reportingPeriod={institution?.reporting_period ?? ""}
      rows={rows}
      workflow={{
        status: review?.status ?? "draft",
        revision: review?.revision ?? 0,
        submittedByName: actors?.submitted_by_name ?? "",
        submittedAt: review?.submitted_at ?? null,
        submissionNote: review?.submission_note ?? "",
        reviewedByName: actors?.reviewed_by_name ?? "",
        reviewedAt: review?.reviewed_at ?? null,
        reviewNote: review?.review_note ?? "",
        history: events.map((event) => ({
          id: event.id,
          action: event.action,
          note: event.note,
          actorName: event.actor_name,
          actorUsername: event.actor_username,
          actorRole: event.actor_role,
          createdAt: event.created_at,
        })),
      }}
      canEdit={canEdit(user)}
      canReview={canReview(user)}
      isAdmin={isAdmin(user)}
      guideSignals={guideSignals}
    />
  );
}
