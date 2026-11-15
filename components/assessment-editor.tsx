"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  reopenAssessmentState,
  reviewAssessmentState,
  saveAssessmentState,
  submitAssessmentState,
} from "@/lib/actions";
import { showToast } from "@/components/toast";
import { EvidenceDialog } from "@/components/evidence-dialog";
import { SignalGuideDialog, type SignalGuide } from "@/components/signal-guide-dialog";
import { formatDate, formatNumber } from "@/lib/format";

export type AssessmentDraftRow = {
  signalId: string;
  pillar: string;
  signal: string;
  weight: number;
  score: number | null;
  assessed: boolean;
  evidenceGrade: number;
  applicable: boolean;
  naReason: string;
  evidenceRecords: number;
  evidenceFiles: number;
};

export type AssessmentWorkflow = {
  status: string;
  revision: number;
  submittedByName: string;
  submittedAt: string | null;
  submissionNote: string;
  reviewedByName: string;
  reviewedAt: string | null;
  reviewNote: string;
  history: {
    id: number;
    action: string;
    note: string;
    actorName: string;
    actorUsername: string;
    actorRole: string;
    createdAt: string;
  }[];
};

type CommentAction = "submit" | "approve" | "decline" | "reopen";

const WORKFLOW_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted for review",
  approved: "Approved",
  changes_requested: "Declined / returned",
  declined: "Declined / returned",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  reviewer: "Reviewer",
  analyst: "Analyst",
  partner: "Partner",
};

const COMMENT_CONFIG: Record<
  CommentAction,
  { title: string; label: string; button: string; context: string; danger?: boolean }
> = {
  submit: {
    title: "Submit assessment for review",
    label: "Analyst submission comment",
    button: "Submit for review",
    context:
      "Explain the basis of the rating and call out judgement areas for the independent Reviewer. The working result remains provisional until approved.",
  },
  approve: {
    title: "Approve rating",
    label: "Approval comment",
    button: "Approve & issue certificate",
    context:
      "Confirm the review performed and why this rating should become effective. Approval automatically issues a new certificate and preserves the previous rating in history.",
  },
  decline: {
    title: "Decline and return rating",
    label: "Decline / return comment",
    button: "Decline & return",
    context: "Explain what the Analyst must correct. The submitted changes will not take effect.",
    danger: true,
  },
  reopen: {
    title: "Reopen approved assessment",
    label: "Reopening reason",
    button: "Reopen assessment",
    context:
      "Explain why a new working revision is required. Partner profiles continue to see the last approved certificate-backed result.",
  },
};

function signalIsAssessed(row: AssessmentDraftRow) {
  return row.assessed !== false && (!row.applicable || (row.score !== null && row.score !== undefined));
}

export function AssessmentEditor({
  institutionId,
  institutionName,
  reportingPeriod,
  rows: serverRows,
  workflow,
  canEdit,
  canReview,
  isAdmin,
  guideSignals,
}: {
  institutionId: number;
  institutionName: string;
  reportingPeriod: string;
  rows: AssessmentDraftRow[];
  workflow: AssessmentWorkflow;
  canEdit: boolean;
  canReview: boolean;
  isAdmin: boolean;
  guideSignals: Record<string, SignalGuide>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<AssessmentDraftRow[]>(serverRows);
  const [query, setQuery] = useState("");
  const [guideSignalId, setGuideSignalId] = useState<string | null>(null);
  const [evidenceSignalId, setEvidenceSignalId] = useState<string | null>(null);
  const [commentAction, setCommentAction] = useState<CommentAction | null>(null);
  const [commentNote, setCommentNote] = useState("");
  const [pending, startTransition] = useTransition();
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const commentDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setRows(serverRows);
  }, [serverRows]);

  useEffect(() => {
    const dialog = commentDialogRef.current;
    if (!dialog) return;
    if (commentAction && !dialog.open) dialog.showModal();
    if (!commentAction && dialog.open) dialog.close();
  }, [commentAction]);

  const status = workflow.status || "draft";
  const locked = status === "submitted" || status === "approved";
  const readOnly = !canEdit || locked;
  const applicableRows = useMemo(
    () => rows.filter((row) => row.applicable).map((row) => ({ signalId: row.signalId, name: row.signal })),
    [rows],
  );

  const filtered = rows.filter((row) =>
    !query.trim() ? true : [row.signalId, row.pillar, row.signal].join(" ").toLowerCase().includes(query.trim().toLowerCase()),
  );

  function patchRow(signalId: string, patch: Partial<AssessmentDraftRow>) {
    setRows((current) =>
      current.map((row) => {
        if (row.signalId !== signalId) return row;
        const next = { ...row, ...patch };
        if (patch.applicable === false) next.evidenceGrade = 0;
        if (patch.applicable === true) next.naReason = "";
        return next;
      }),
    );
  }

  function save() {
    if (!canEdit) {
      showToast("An Analyst or Administrator role is required to edit and recalculate an assessment.", "error");
      return;
    }
    if (locked) {
      showToast("This assessment must be reopened before it can be edited.", "error");
      return;
    }
    const incomplete = rows.find((row) => !signalIsAssessed(row));
    if (incomplete) {
      showToast(`Complete the score or applicability decision for ${incomplete.signalId} before saving.`, "error");
      return;
    }
    const missingReason = rows.find((row) => !row.applicable && !String(row.naReason || "").trim());
    if (missingReason) {
      showToast(`Add an N/A reason for ${missingReason.signalId}.`, "error");
      return;
    }
    const data = new FormData();
    data.set("institutionId", String(institutionId));
    data.set("revision", String(workflow.revision));
    for (const row of rows) {
      data.append("signalId", row.signalId);
      data.set(`score-${row.signalId}`, String(row.score ?? 0));
      data.set(`grade-${row.signalId}`, String(row.evidenceGrade));
      if (row.applicable) data.set(`applicable-${row.signalId}`, "on");
      if (row.assessed) data.set(`assessed-${row.signalId}`, "on");
      data.set(`na-${row.signalId}`, row.naReason);
    }
    startTransition(async () => {
      const result = await saveAssessmentState(null, data);
      if (result?.ok) {
        showToast(
          isAdmin
            ? "Assessment saved and rankings recalculated."
            : "Working assessment saved. It remains provisional until submitted and approved.",
        );
        router.refresh();
      } else {
        showToast(result?.message || "Assessment could not be saved.", "error");
      }
    });
  }

  function openComment(action: CommentAction) {
    setCommentNote("");
    setCommentAction(action);
    window.setTimeout(() => commentInputRef.current?.focus(), 0);
  }

  function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commentAction) return;
    const action = commentAction;
    const note = commentNote.trim();
    if (!note) {
      showToast("A comment is required for every submission and decision.", "error");
      commentInputRef.current?.focus();
      return;
    }
    const data = new FormData();
    data.set("institutionId", String(institutionId));
    data.set("note", note);
    if (action === "approve") data.set("decision", "approved");
    if (action === "decline") data.set("decision", "changes_requested");
    startTransition(async () => {
      const result =
        action === "submit"
          ? await submitAssessmentState(null, data)
          : action === "reopen"
            ? await reopenAssessmentState(null, data)
            : await reviewAssessmentState(null, data);
      if (result?.ok) {
        showToast(
          {
            submit: "Assessment submitted for review.",
            approve: "Rating approved and its new certificate was issued automatically.",
            decline: "Assessment declined and returned to the Analyst.",
            reopen: "Assessment reopened for editing.",
          }[action],
        );
        setCommentAction(null);
        router.refresh();
      } else {
        showToast(result?.message || "Workflow action failed.", "error");
      }
    });
  }

  const details: string[] = [];
  if (workflow.submittedByName)
    details.push(`Submitted by ${workflow.submittedByName} on ${formatDate(workflow.submittedAt)}`);
  if (workflow.submissionNote) details.push(`Submission comment: ${workflow.submissionNote}`);
  if (workflow.reviewedByName) details.push(`Reviewed by ${workflow.reviewedByName} on ${formatDate(workflow.reviewedAt)}`);
  if (workflow.reviewNote) details.push(`Decision comment: ${workflow.reviewNote}`);
  if (!details.length) details.push("This assessment is open for editing.");

  const actions: { action: CommentAction; label: string; className: string }[] = [];
  if (canEdit && ["draft", "changes_requested", "declined"].includes(status)) {
    actions.push({ action: "submit", label: "Submit for review", className: "button button-primary" });
  }
  if (canReview && status === "submitted") {
    actions.push({ action: "approve", label: "Approve rating", className: "button button-primary" });
    actions.push({ action: "decline", label: "Decline & return", className: "button button-danger" });
  }
  if (isAdmin && status === "approved") {
    actions.push({ action: "reopen", label: "Reopen assessment", className: "button button-secondary" });
  }

  const commentConfig = commentAction ? COMMENT_CONFIG[commentAction] : null;

  return (
    <section id="route-assessment" className="route active" data-route-panel="assessment">
      <div className="page-heading action-heading">
        <div>
          <p className="eyebrow">Analyst workspace · Edit and recalculate</p>
          <h1>Assessment editor</h1>
          <p className="page-subtitle">
            Enter each signal score and evidence grade together, attach its supporting evidence without leaving this page,
            then save to recalculate the working rating.
          </p>
        </div>
        {canEdit ? (
          <button
            id="save-assessment-button"
            className="button button-primary editor-only"
            type="button"
            hidden={!canEdit}
            disabled={locked || pending}
            title={locked ? "Reopen the assessment before editing." : ""}
            onClick={save}
          >
            Save &amp; recalculate
          </button>
        ) : null}
      </div>
      <div className="info-banner">
        <strong>N/A governance rule</strong>
        <span>
          Use Not Applicable only when a signal falls outside the institution’s mandate or operating model—not when evidence
          is missing or performance is weak.
        </span>
      </div>
      <div id="assessment-evidence-grade-guide" className="assessment-evidence-guide" aria-label="Evidence grade guide">
        <div>
          <p className="eyebrow">Evidence grade guide · 0–3</p>
          <strong>Choose the quality of evidence supporting each signal.</strong>
        </div>
        <span>
          <b>0</b>No evidence
        </span>
        <span>
          <b>1</b>Limited or indirect
        </span>
        <span>
          <b>2</b>Institution-published
        </span>
        <span>
          <b>3</b>Independently assured, certified, accredited or regulatory
        </span>
      </div>
      <article id="workflow-panel" className="workflow-panel" aria-live="polite">
        <div>
          <span id="workflow-status" className={`workflow-status workflow-${status}`}>
            {WORKFLOW_LABELS[status] || status}
          </span>
          <strong>Assessment review</strong>
          <p id="workflow-detail">{details.join(" · ")}</p>
        </div>
        <div id="workflow-actions" className="workflow-actions">
          {actions.map((entry) => (
            <button
              key={entry.action}
              className={entry.className}
              type="button"
              disabled={pending}
              onClick={() => openComment(entry.action)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div id="workflow-history" className="workflow-history" aria-label="Assessment submission and decision comments">
          {workflow.history.length ? (
            workflow.history.slice(0, 8).map((event) => {
              const action = String(event.action || "updated").replaceAll("_", " ");
              const knownRole = ["admin", "reviewer", "viewer", "analyst", "partner"].includes(
                String(event.actorRole || "").toLowerCase(),
              );
              return (
                <article key={event.id}>
                  <div>
                    <strong>{action}</strong>
                    <span>
                      {event.actorName || event.actorUsername || "System"} ·{" "}
                      {knownRole ? ROLE_LABELS[event.actorRole.toLowerCase()] || event.actorRole : "System"}
                    </span>
                  </div>
                  <p>{event.note || "No comment recorded"}</p>
                  <time>{formatDate(event.createdAt)}</time>
                </article>
              );
            })
          ) : (
            <p className="table-secondary">Submission and decision comments will appear here.</p>
          )}
        </div>
      </article>
      <article className="card">
        <div className="card-heading responsive-heading">
          <div>
            <p className="eyebrow">47-signal framework</p>
            <h2 id="assessment-title">Signal inputs — {institutionName}</h2>
          </div>
          <label className="compact-field">
            <span>Find signal</span>
            <input
              id="assessment-search"
              type="search"
              placeholder="Search ID, pillar or signal"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
        </div>
        <div className="table-wrap assessment-table-wrap">
          <table className="assessment-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Weight</th>
                <th>Applicability</th>
                <th>Signal score</th>
                <th>Evidence grade &amp; files</th>
                <th>Adjusted contribution</th>
              </tr>
            </thead>
            <tbody id="assessment-table-body">
              {filtered.length ? (
                filtered.map((row) => {
                  const assessed = signalIsAssessed(row);
                  const contribution =
                    row.applicable && assessed ? ((Number(row.score) || 0) / 5) * Number(row.weight) * (Number(row.evidenceGrade) / 3) : 0;
                  return (
                    <tr key={row.signalId} className={row.applicable ? "" : "na-row"} data-signal-row={row.signalId}>
                      <td>
                        <span className="signal-id">{row.signalId}</span>
                        <span className="signal-pillar">{row.pillar}</span>
                        <span className="signal-title">{row.signal}</span>
                        <button
                          className="mini-link"
                          type="button"
                          data-view-signal={row.signalId}
                          onClick={() => setGuideSignalId(row.signalId)}
                        >
                          View scoring guide
                        </button>
                      </td>
                      <td>{formatNumber(row.weight)}%</td>
                      <td>
                        <div className="applicability-control">
                          <select
                            data-assessment-field="applicable"
                            value={row.applicable ? "true" : "false"}
                            disabled={readOnly}
                            onChange={(event) =>
                              patchRow(row.signalId, { applicable: event.currentTarget.value === "true" })
                            }
                          >
                            <option value="true">Applicable</option>
                            <option value="false">Not applicable</option>
                          </select>
                          <textarea
                            className="na-reason-input"
                            data-assessment-field="naReason"
                            rows={3}
                            placeholder="Required N/A reason"
                            hidden={row.applicable}
                            disabled={readOnly}
                            value={row.naReason}
                            onChange={(event) => patchRow(row.signalId, { naReason: event.currentTarget.value })}
                          />
                        </div>
                      </td>
                      <td>
                        <input
                          className={`score-control ${assessed ? "" : "incomplete-control"}`}
                          data-assessment-field="score"
                          type="number"
                          min={0}
                          max={5}
                          step={1}
                          value={assessed ? String(row.score ?? "") : ""}
                          aria-label={`Score for ${row.signalId}`}
                          disabled={!row.applicable || readOnly}
                          onChange={(event) => {
                            const raw = event.currentTarget.value;
                            if (raw === "") {
                              patchRow(row.signalId, { score: null, assessed: false });
                            } else {
                              patchRow(row.signalId, {
                                score: Math.max(0, Math.min(5, Number(raw))),
                                assessed: true,
                              });
                            }
                          }}
                        />
                        {assessed ? null : <span className="table-secondary">Decision required</span>}
                      </td>
                      <td>
                        <div className="assessment-evidence-control">
                          <select
                            className="evidence-grade-control"
                            data-assessment-field="evidenceGrade"
                            aria-label={`Evidence grade for ${row.signalId}`}
                            aria-describedby="assessment-evidence-grade-guide"
                            value={String(row.applicable ? row.evidenceGrade : 0)}
                            disabled={!row.applicable || readOnly}
                            onChange={(event) =>
                              patchRow(row.signalId, {
                                evidenceGrade: Math.max(0, Math.min(3, Number(event.currentTarget.value))),
                              })
                            }
                          >
                            <option value={0}>0 — No evidence</option>
                            <option value={1}>1 — Limited or indirect</option>
                            <option value={2}>2 — Institution-published</option>
                            <option value={3}>3 — Independently assured</option>
                          </select>
                          {canEdit && !locked ? (
                            <button
                              className="button button-secondary assessment-evidence-attach"
                              type="button"
                              data-add-assessment-evidence={row.signalId}
                              disabled={!row.applicable}
                              onClick={() => setEvidenceSignalId(row.signalId)}
                            >
                              Attach evidence
                            </button>
                          ) : null}
                          <span className="table-secondary">
                            {row.applicable
                              ? `${row.evidenceRecords} ${row.evidenceRecords === 1 ? "record" : "records"} · ${row.evidenceFiles} ${row.evidenceFiles === 1 ? "file" : "files"}`
                              : "Not applicable · grade fixed at 0"}
                          </span>
                        </div>
                      </td>
                      <td data-contribution="">{formatNumber(contribution, 3)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="empty-row">
                    No signals match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <SignalGuideDialog
        signal={guideSignalId ? guideSignals[guideSignalId] ?? null : null}
        onClose={() => setGuideSignalId(null)}
      />
      {evidenceSignalId ? (
        <EvidenceDialog
          open={Boolean(evidenceSignalId)}
          onClose={() => setEvidenceSignalId(null)}
          institutionId={institutionId}
          reportingPeriod={reportingPeriod}
          signals={applicableRows}
          fixedSignalId={evidenceSignalId}
          origin="assessment"
        />
      ) : null}

      <dialog
        id="workflow-comment-dialog"
        className="signal-dialog compact-dialog"
        aria-labelledby="workflow-comment-title"
        ref={commentDialogRef}
        onCancel={(event) => {
          event.preventDefault();
          setCommentAction(null);
        }}
      >
        <div className="dialog-heading">
          <div>
            <p id="workflow-comment-eyebrow" className="eyebrow">
              Assessment governance
            </p>
            <h2 id="workflow-comment-title">{commentConfig?.title}</h2>
          </div>
          <button
            id="close-workflow-comment-dialog"
            className="icon-button"
            type="button"
            aria-label="Close assessment decision"
            onClick={() => setCommentAction(null)}
          >
            ×
          </button>
        </div>
        <form id="workflow-comment-form" className="stack-form dialog-form" onSubmit={submitComment}>
          <input name="action" type="hidden" value={commentAction ?? ""} />
          <p id="workflow-comment-context" className="page-subtitle">
            {commentConfig?.context}
          </p>
          <label className="field">
            <span id="workflow-comment-label">{commentConfig?.label}</span>
            <textarea
              name="note"
              rows={5}
              maxLength={2000}
              required
              aria-describedby="workflow-comment-help"
              ref={commentInputRef}
              value={commentNote}
              onChange={(event) => setCommentNote(event.currentTarget.value)}
            />
          </label>
          <p id="workflow-comment-help" className="form-note">
            The comment becomes part of the permanent assessment audit trail.
          </p>
          <div className="dialog-actions">
            <button
              id="cancel-workflow-comment"
              className="button button-secondary"
              type="button"
              onClick={() => setCommentAction(null)}
            >
              Cancel
            </button>
            <button
              id="submit-workflow-comment"
              className={`button ${commentConfig?.danger ? "button-danger" : "button-primary"}`}
              type="submit"
              disabled={pending}
            >
              {commentConfig?.button}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
