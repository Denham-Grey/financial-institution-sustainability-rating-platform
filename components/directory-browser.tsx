"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideEnrollmentState, nominateInstitutionState } from "@/lib/actions";
import { showToast } from "@/components/toast";
import { formatDate, formatNumber } from "@/lib/format";

export type DirectoryEntry = {
  id: number;
  officialName: string;
  categoryCode: string;
  categoryName: string;
  licenceNumber: string;
  licenceStatus: string;
  state: string;
  sourceUrl: string;
  portfolioInstitutionId: number | null;
};

export type DirectoryCategory = { code: string; name: string; count: number };

export type EnrollmentEntry = {
  id: number;
  cbnInstitutionId: number | null;
  proposedName: string;
  proposedType: string;
  reportingPeriod: string;
  status: string;
  submissionComment: string;
  submittedAt: string;
  reviewComment: string;
  submittedByName: string;
};

type EnrollmentModal = {
  mode: "nominate" | "approve" | "decline";
  title: string;
  context: string;
  commentLabel: string;
  help: string;
  button: string;
  danger?: boolean;
  showPeriod: boolean;
  name: string;
  type: string;
  directoryInstitutionId: number | null;
  requestId: number | null;
};

function sourceLink(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return (
      <a href={parsed.toString()} target="_blank" rel="noopener noreferrer">
        CBN record
      </a>
    );
  } catch {
    return null;
  }
}

export function DirectoryBrowser({
  q,
  category,
  page,
  total,
  totalPages,
  rows,
  categories,
  enrollmentRequests,
  canNominate,
  canReview,
  isAdmin,
  isPartner,
}: {
  q: string;
  category: string;
  page: number;
  total: number;
  totalPages: number;
  rows: DirectoryEntry[];
  categories: DirectoryCategory[];
  enrollmentRequests: EnrollmentEntry[];
  canNominate: boolean;
  canReview: boolean;
  isAdmin: boolean;
  isPartner: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(q);
  const [modal, setModal] = useState<EnrollmentModal | null>(null);
  const [comment, setComment] = useState("");
  const [period, setPeriod] = useState("Baseline");
  const [customType, setCustomType] = useState("");
  const customFormRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setSearch(q);
  }, [q]);

  useEffect(() => {
    if (search === q) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (category) params.set("category", category);
      startTransition(() => router.replace(`/directory${params.toString() ? `?${params}` : ""}`));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, q, category, router]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (modal && !dialog.open) dialog.showModal();
    if (!modal && dialog.open) dialog.close();
  }, [modal]);

  function applyCategory(nextCategory: string) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (nextCategory) params.set("category", nextCategory);
    startTransition(() => router.replace(`/directory${params.toString() ? `?${params}` : ""}`));
  }

  function goToPage(nextPage: number) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (category) params.set("category", category);
    if (nextPage > 1) params.set("page", String(nextPage));
    startTransition(() => router.replace(`/directory${params.toString() ? `?${params}` : ""}`));
  }

  function openNomination(entry: DirectoryEntry) {
    setComment("");
    setPeriod("Baseline");
    setModal({
      mode: "nominate",
      title: isAdmin ? "Approve and enrol institution" : "Nominate institution",
      context: `${entry.officialName} · ${entry.categoryName || "CBN register"}`,
      commentLabel: isAdmin ? "Approval comment" : "Analyst nomination comment",
      help: isAdmin
        ? "Your comment records why this institution was approved for immediate enrolment."
        : "The institution will remain pending until a Reviewer or Administrator approves it.",
      button: isAdmin ? "Approve & enrol" : "Submit nomination",
      showPeriod: true,
      name: entry.officialName,
      type: entry.categoryName,
      directoryInstitutionId: entry.id,
      requestId: null,
    });
  }

  function openDecision(request: EnrollmentEntry, action: "approve" | "decline") {
    setComment("");
    setModal({
      mode: action,
      title: action === "approve" ? "Approve institution enrolment" : "Decline institution enrolment",
      context: `${request.proposedName || "Institution"} · Submitted by ${request.submittedByName || "Analyst"}`,
      commentLabel: action === "approve" ? "Approval comment" : "Decline comment",
      help:
        action === "approve"
          ? "Approval adds the institution to the rating workspace and records your decision."
          : "Explain why the nomination is declined. It will not enter the rating workspace.",
      button: action === "approve" ? "Approve & enrol" : "Decline request",
      danger: action === "decline",
      showPeriod: false,
      name: request.proposedName,
      type: request.proposedType,
      directoryInstitutionId: request.cbnInstitutionId,
      requestId: request.id,
    });
  }

  function submitModal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    if (!comment.trim()) {
      showToast("A comment is required for every enrolment submission and decision.", "error");
      return;
    }
    const data = new FormData();
    data.set("comment", comment.trim());
    if (modal.mode === "nominate") {
      data.set("name", modal.name);
      data.set("type", modal.type);
      data.set("reportingPeriod", period.trim() || "Baseline");
      if (modal.directoryInstitutionId) data.set("cbnInstitutionId", String(modal.directoryInstitutionId));
    } else {
      data.set("requestId", String(modal.requestId));
      data.set("action", modal.mode);
    }
    startTransition(async () => {
      const result =
        modal.mode === "nominate"
          ? await nominateInstitutionState(null, data)
          : await decideEnrollmentState(null, data);
      if (result?.ok) {
        showToast(result.message);
        setModal(null);
        router.refresh();
      } else {
        showToast(result?.message || "The enrolment action failed.", "error");
      }
    });
  }

  function submitCustom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const type = String(data.get("type") ?? "").trim();
    if (!type) {
      showToast("Select an institution category.", "error");
      return;
    }
    startTransition(async () => {
      const result = await nominateInstitutionState(null, data);
      if (result?.ok) {
        showToast(result.message);
        customFormRef.current?.reset();
        setCustomType("");
        router.refresh();
      } else {
        showToast(result?.message || "The institution could not be submitted.", "error");
      }
    });
  }

  const pendingRequestFor = (entryId: number) =>
    enrollmentRequests.find(
      (request) => Number(request.cbnInstitutionId) === Number(entryId) && request.status === "pending",
    );

  return (
    <section id="route-directory" className="route active" data-route-panel="directory">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Regulatory universe</p>
          <h1>Financial Institutions Directory</h1>
          <p className="page-subtitle">Official CBN nomenclature and source-linked licensed-institution records.</p>
        </div>
        <span className="source-stamp">SOURCE · CENTRAL BANK OF NIGERIA</span>
      </div>

      {canNominate ? (
        <article id="custom-enrollment-card" className="card custom-enrollment-card internal-only">
          <div className="card-heading">
            <div>
              <h2 id="custom-enrollment-title">Add an institution outside the CBN directory</h2>
              <p id="custom-enrollment-description" className="page-subtitle"></p>
            </div>
          </div>
          <form id="custom-enrollment-form" className="form-grid custom-enrollment-form" ref={customFormRef} onSubmit={submitCustom}>
            <label className="field">
              <span>Institution name</span>
              <input name="name" maxLength={200} required />
            </label>
            <label className="field">
              <span>Institution category</span>
              <select
                id="custom-enrollment-category-select"
                name="type"
                required
                value={customType}
                onChange={(event) => setCustomType(event.currentTarget.value)}
              >
                <option value="">Select an institution category</option>
                {categories.map((entry) => (
                  <option key={entry.code} value={entry.name}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Initial reporting period</span>
              <input name="reportingPeriod" defaultValue="Baseline" maxLength={100} required />
            </label>
            <label className="field custom-enrollment-comment">
              <span id="custom-enrollment-comment-label">Enrolment comment</span>
              <textarea
                name="comment"
                rows={4}
                maxLength={2000}
                placeholder="Explain why the institution should be considered for enrolment."
                required
              />
            </label>
            <button className="button button-primary" type="submit" disabled={pending}>
              Submit for approval
            </button>
          </form>
        </article>
      ) : null}

      <div id="cbn-category-summary" className="directory-summary-grid" aria-label="Institution categories">
        {categories.length ? (
          categories.map((entry) => (
            <button
              key={entry.code}
              className={`directory-summary-card ${category === entry.code ? "selected" : ""}`}
              type="button"
              data-directory-category={entry.code}
              onClick={() => applyCategory(entry.code)}
            >
              <span>{formatNumber(entry.count, 0)}</span>
              <strong>{entry.name}</strong>
              <small>CBN register category</small>
            </button>
          ))
        ) : (
          <article className="card empty-directory">No official CBN categories are available.</article>
        )}
      </div>

      <article className="card directory-card">
        <div className="card-heading directory-toolbar">
          <div>
            <p className="eyebrow">Licensed universe</p>
            <h2>Financial institutions</h2>
          </div>
          <div className="directory-filters">
            <label className="compact-field">
              <span>Search</span>
              <input
                id="cbn-directory-search"
                type="search"
                placeholder="Institution or licence number"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
            </label>
            <label className="compact-field">
              <span>Category</span>
              <select
                id="cbn-directory-category"
                value={category}
                onChange={(event) => applyCategory(event.currentTarget.value)}
              >
                <option value="">All CBN categories</option>
                {categories.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="directory-provenance">
          <strong>Official-data notice</strong>
          <span id="cbn-directory-provenance">
            Records retain their official CBN source and retrieval date. Enrolment adds an institution to this analytical
            workspace and does not change its regulatory status.
          </span>
        </div>
        <div className="table-wrap">
          <table className="cbn-directory-table">
            <thead>
              <tr>
                <th>Institution</th>
                <th>Official CBN category</th>
                <th>Licence / authorisation</th>
                <th>Location</th>
                <th>Status</th>
                <th>Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="cbn-directory-body">
              {rows.length ? (
                rows.map((entry) => {
                  const status = entry.licenceStatus || "listed-at-retrieval";
                  const request = pendingRequestFor(entry.id);
                  let enrollmentAction: React.ReactNode = "";
                  if (entry.portfolioInstitutionId) {
                    enrollmentAction = <span className="pill pill-leader">Enrolled</span>;
                  } else if (request) {
                    enrollmentAction = <span className="pill pill-transitioning">Pending review</span>;
                  } else if (canNominate) {
                    enrollmentAction = (
                      <button
                        className="button button-primary directory-enrol-button"
                        type="button"
                        data-enrol-cbn={entry.id}
                        onClick={() => openNomination(entry)}
                      >
                        {isAdmin ? "Approve & enrol" : "Nominate"}
                      </button>
                    );
                  }
                  return (
                    <tr key={entry.id}>
                      <td>
                        <strong className="table-primary">{entry.officialName}</strong>
                      </td>
                      <td>{entry.categoryName || "—"}</td>
                      <td>
                        <span className="table-primary">{status}</span>
                        <span className="table-secondary mono-value">{entry.licenceNumber || "—"}</span>
                      </td>
                      <td>{entry.state || "Nigeria"}</td>
                      <td>
                        <span className={`pill ${/(revok|legacy|suspend|expired)/i.test(status) ? "pill-lagging" : "pill-leader"}`}>
                          {status}
                        </span>
                      </td>
                      <td>
                        <span className="source-links">{sourceLink(entry.sourceUrl) || "CBN register"}</span>
                      </td>
                      <td>{isPartner ? "" : enrollmentAction}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="empty-row">
                    No Financial Institutions Directory records match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <span id="cbn-directory-count">
            {total.toLocaleString("en-NG")} Financial Institutions Directory records
          </span>
          <div>
            <button
              id="cbn-directory-prev"
              className="button button-secondary"
              type="button"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              Previous
            </button>
            <span id="cbn-directory-page">
              Page {page} of {Math.max(1, totalPages)}
            </span>
            <button
              id="cbn-directory-next"
              className="button button-secondary"
              type="button"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </article>

      {!isPartner ? (
        <article id="enrollment-queue-card" className="card enrollment-workflow-card internal-only">
          <div className="card-heading responsive-heading">
            <div>
              <p className="eyebrow">Controlled enrolment</p>
              <h2>Institution enrolment requests</h2>
              <p className="page-subtitle">
                Analyst nominations take effect only after Reviewer or Administrator approval. Every decision requires a
                comment.
              </p>
            </div>
            <button
              id="refresh-enrollment-requests"
              className="button button-secondary"
              type="button"
              onClick={() => router.refresh()}
            >
              Refresh queue
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Institution</th>
                  <th>Category</th>
                  <th>Submitted by</th>
                  <th>Submission comment</th>
                  <th>Status</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody id="enrollment-request-body">
                {enrollmentRequests.length ? (
                  enrollmentRequests.map((request) => {
                    const requestStatus = String(request.status || "pending").toLowerCase();
                    const isPending = requestStatus === "pending";
                    return (
                      <tr key={request.id}>
                        <td>
                          <span className="table-primary">{request.proposedName || "—"}</span>
                          <span className="table-secondary">{request.reportingPeriod || "Baseline"}</span>
                        </td>
                        <td>{request.proposedType || "—"}</td>
                        <td>
                          <span className="table-primary">{request.submittedByName || "—"}</span>
                          <span className="table-secondary">{formatDate(request.submittedAt)}</span>
                        </td>
                        <td className="wrap-cell">{request.submissionComment || "—"}</td>
                        <td>
                          <span
                            className={`pill ${
                              requestStatus === "approved"
                                ? "pill-leader"
                                : requestStatus === "declined"
                                  ? "pill-lagging"
                                  : "pill-transitioning"
                            }`}
                          >
                            {requestStatus.replaceAll("_", " ")}
                          </span>
                          {request.reviewComment ? (
                            <span className="table-secondary">{request.reviewComment}</span>
                          ) : null}
                        </td>
                        <td>
                          {canReview && isPending ? (
                            <div className="table-actions">
                              <button
                                className="button button-primary"
                                type="button"
                                data-enrollment-decision="approve"
                                data-enrollment-request={request.id}
                                onClick={() => openDecision(request, "approve")}
                              >
                                Approve
                              </button>
                              <button
                                className="button button-danger"
                                type="button"
                                data-enrollment-decision="decline"
                                data-enrollment-request={request.id}
                                onClick={() => openDecision(request, "decline")}
                              >
                                Decline
                              </button>
                            </div>
                          ) : (
                            <span className="table-secondary">
                              {isPending ? "Awaiting review" : "Decision recorded"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="empty-row">
                      No institution enrolment requests.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      <dialog
        id="enrollment-dialog"
        className="signal-dialog compact-dialog"
        aria-labelledby="enrollment-dialog-title"
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === event.currentTarget) setModal(null);
        }}
        onCancel={(event) => {
          event.preventDefault();
          setModal(null);
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Controlled institution enrolment</p>
            <h2 id="enrollment-dialog-title">{modal?.title}</h2>
          </div>
          <button
            id="close-enrollment-dialog"
            className="icon-button"
            type="button"
            aria-label="Close institution enrolment"
            onClick={() => setModal(null)}
          >
            ×
          </button>
        </div>
        <form id="enrollment-form" className="stack-form dialog-form" onSubmit={submitModal}>
          <input name="directoryInstitutionId" type="hidden" value={modal?.directoryInstitutionId ?? ""} />
          <input name="requestId" type="hidden" value={modal?.requestId ?? ""} />
          <input name="mode" type="hidden" value={modal?.mode ?? ""} />
          <p id="enrollment-dialog-context" className="page-subtitle">
            {modal?.context}
          </p>
          <label id="enrollment-period-field" className="field" hidden={!modal?.showPeriod}>
            <span>Initial reporting period</span>
            <input
              name="reportingPeriod"
              value={period}
              maxLength={100}
              required={modal?.showPeriod}
              onChange={(event) => setPeriod(event.currentTarget.value)}
            />
          </label>
          <label className="field">
            <span id="enrollment-comment-label">{modal?.commentLabel}</span>
            <textarea
              name="comment"
              rows={5}
              maxLength={2000}
              required
              aria-describedby="enrollment-comment-help"
              value={comment}
              onChange={(event) => setComment(event.currentTarget.value)}
            />
          </label>
          <p id="enrollment-comment-help" className="form-note">
            {modal?.help}
          </p>
          <div className="dialog-actions">
            <button id="cancel-enrollment" className="button button-secondary" type="button" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              id="submit-enrollment"
              className={`button ${modal?.danger ? "button-danger" : "button-primary"}`}
              type="submit"
              disabled={pending}
            >
              {modal?.button}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
