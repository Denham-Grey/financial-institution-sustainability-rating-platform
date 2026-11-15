"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeEvidenceState } from "@/lib/actions";
import { EvidenceDialog, type EvidenceSignalOption } from "@/components/evidence-dialog";
import { showToast } from "@/components/toast";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";

export type EvidenceDisplayRow = {
  signalId: string;
  signal: string;
  pillar: string;
  applicable: boolean;
  evidenceGrade: number;
  item: {
    id: number;
    summary: string;
    primarySourceUrl: string;
    secondarySourceUrl: string;
    assessmentNote: string;
    createdBy: string;
    createdAt: string;
    attachments: { id: number; originalName: string; sizeBytes: number }[];
  } | null;
};

function sourceLink(url: string | null | undefined, label: string) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return (
      <a href={parsed.toString()} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  } catch {
    return null;
  }
}

export function EvidenceRegister({
  institutionId,
  institutionName,
  reportingPeriod,
  status,
  canEdit,
  rows,
  signals,
}: {
  institutionId: number;
  institutionName: string;
  reportingPeriod: string;
  status: string;
  canEdit: boolean;
  rows: EvidenceDisplayRow[];
  signals: EvidenceSignalOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const locked = status === "submitted" || status === "approved";
  const editable = canEdit && !locked;

  const filtered = rows.filter((row) => {
    if (!query.trim()) return true;
    const haystack = [
      row.signalId,
      row.pillar,
      row.signal,
      row.item?.summary,
      row.item?.assessmentNote,
      row.item?.createdBy,
      ...(row.item?.attachments || []).flatMap((attachment) => [attachment.originalName]),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  function remove(evidenceId: number) {
    if (!window.confirm("Remove this evidence record? This action is recorded in the audit trail.")) return;
    const data = new FormData();
    data.set("evidenceId", String(evidenceId));
    data.set("institutionId", String(institutionId));
    startTransition(async () => {
      const result = await removeEvidenceState(null, data);
      if (result?.ok) {
        showToast(result.message);
        router.refresh();
      } else {
        showToast(result?.message || "Evidence could not be removed.", "error");
      }
    });
  }

  return (
    <section id="route-evidence" className="route active" data-route-panel="evidence">
      <div className="page-heading action-heading">
        <div>
          <p className="eyebrow">Source assurance</p>
          <h1>Evidence register</h1>
          <p className="page-subtitle">
            Add, inspect, attach or remove supporting evidence records here. Evidence scores are edited from the Assessment
            editor and remain provisional until Reviewer or Administrator approval.
          </p>
        </div>
        <button
          id="open-evidence-form-button"
          className="button button-primary editor-only"
          type="button"
          hidden={!canEdit}
          disabled={locked || pending}
          title={locked ? "Reopen the assessment before editing evidence." : ""}
          onClick={() => setDialogOpen(true)}
        >
          + Add evidence
        </button>
      </div>
      <div id="evidence-workflow-status" className="workflow-inline" aria-live="polite">
        {locked ? (
          <>
            <strong>{status.replaceAll("_", " ")}</strong>
            <span>Evidence is read-only while this assessment is in review or approved.</span>
          </>
        ) : (
          <>
            <strong>Open for evidence updates</strong>
            <span>Changes remain auditable until the assessment is submitted.</span>
          </>
        )}
      </div>
      <article className="card">
        <div className="card-heading responsive-heading">
          <div>
            <p className="eyebrow">Coverage</p>
            <h2 id="evidence-title">Institution evidence — {institutionName}</h2>
          </div>
          <label className="compact-field">
            <span>Search register</span>
            <input
              id="evidence-search"
              type="search"
              placeholder="Search signal or evidence"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
        </div>
        <div className="table-wrap">
          <table className="evidence-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Grade</th>
                <th>Evidence summary</th>
                <th>Sources</th>
                <th>Attachments</th>
                <th>Assessment note</th>
                <th>Owner</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="evidence-table-body">
              {filtered.length ? (
                filtered.map((row, index) => {
                  const item = row.item;
                  const primary = sourceLink(item?.primarySourceUrl, "Primary source");
                  const secondary = sourceLink(item?.secondarySourceUrl, "Secondary source");
                  return (
                    <tr key={`${row.signalId}-${item?.id ?? index}`} className={row.applicable ? "" : "na-row"}>
                      <td>
                        <span className="signal-id">{row.signalId}</span>
                        <span className="table-primary">{row.signal}</span>
                        <span className="table-secondary">{row.pillar}</span>
                      </td>
                      <td>
                        {row.applicable ? (
                          <span
                            className={`pill pill-${
                              row.evidenceGrade >= 3
                                ? "leader"
                                : row.evidenceGrade >= 2
                                  ? "advanced"
                                  : row.evidenceGrade >= 1
                                    ? "transitioning"
                                    : "na"
                            }`}
                          >
                            {formatNumber(row.evidenceGrade, 0)} / 3
                          </span>
                        ) : (
                          <span className="pill pill-na">N/A</span>
                        )}
                      </td>
                      <td>{item ? item.summary || "—" : <span className="table-secondary">No evidence recorded</span>}</td>
                      <td>
                        <span className="source-links">
                          {primary || secondary ? (
                            <>
                              {primary}
                              {secondary}
                            </>
                          ) : (
                            "—"
                          )}
                        </span>
                      </td>
                      <td>
                        <span className="attachment-list">
                          {item?.attachments.length ? (
                            item.attachments.map((attachment) => (
                              <span key={attachment.id} className="attachment-link">
                                <a href={`/api/evidence/${attachment.id}`} download>
                                  {attachment.originalName}
                                </a>
                                <small>{formatBytes(attachment.sizeBytes)}</small>
                              </span>
                            ))
                          ) : (
                            "—"
                          )}
                        </span>
                      </td>
                      <td>{item ? item.assessmentNote || "—" : "—"}</td>
                      <td>
                        {item ? (
                          <>
                            <span className="table-primary">{item.createdBy}</span>
                            <span className="table-secondary">{formatDate(item.createdAt)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {item && editable ? (
                          <span className="evidence-actions">
                            <button
                              className="button button-danger delete-evidence"
                              type="button"
                              data-delete-evidence={item.id}
                              disabled={pending}
                              onClick={() => remove(item.id)}
                            >
                              Remove
                            </button>
                          </span>
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="empty-row">
                    No evidence records match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
      <EvidenceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        institutionId={institutionId}
        reportingPeriod={reportingPeriod}
        signals={signals}
        origin="register"
      />
    </section>
  );
}
