"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addEvidenceState } from "@/lib/actions";
import { showToast } from "@/components/toast";

export type EvidenceSignalOption = {
  signalId: string;
  name: string;
};

export function EvidenceDialog({
  open,
  onClose,
  institutionId,
  reportingPeriod,
  signals,
  fixedSignalId = "",
  origin = "register",
}: {
  open: boolean;
  onClose: () => void;
  institutionId: number;
  reportingPeriod: string;
  signals: EvidenceSignalOption[];
  fixedSignalId?: string;
  origin?: "assessment" | "register";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    formRef.current?.reset();
    setFiles([]);
  }, [open]);

  function close() {
    onClose();
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("institutionId", String(institutionId));
    if (fixedSignalId) data.set("signalId", fixedSignalId);
    startTransition(async () => {
      const result = await addEvidenceState(null, data);
      if (result?.ok) {
        showToast(result.message);
        close();
        router.refresh();
      } else {
        showToast(result?.message || "Evidence could not be saved.", "error");
      }
    });
  }

  return (
    <dialog
      id="evidence-dialog"
      className="signal-dialog evidence-dialog"
      aria-labelledby="evidence-dialog-title"
      ref={dialogRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="dialog-heading">
        <div>
          <p id="evidence-dialog-eyebrow" className="eyebrow">
            {origin === "assessment" ? "Assessment evidence" : "Evidence register"}
          </p>
          <h2 id="evidence-dialog-title">
            {fixedSignalId ? `Attach evidence — ${fixedSignalId}` : "Attach supporting evidence"}
          </h2>
          <p id="evidence-dialog-context" className="page-subtitle">
            {fixedSignalId
              ? "Add supporting material for this signal without leaving the Assessment editor. It will appear in the Evidence Register immediately."
              : "Create a record and attach one or several supporting files."}
          </p>
        </div>
        <button id="close-evidence-form-button" className="icon-button" type="button" aria-label="Close evidence form" onClick={close}>
          ×
        </button>
      </div>
      <form id="evidence-form" className="evidence-form dialog-form" ref={formRef} onSubmit={submit}>
        <div className="form-grid two-columns">
          <label className="field">
            <span>Signal</span>
            <select name="signalId" id="evidence-signal-select" defaultValue={fixedSignalId} required disabled={Boolean(fixedSignalId)}>
              {signals.map((signal) => (
                <option key={signal.signalId} value={signal.signalId}>
                  {signal.signalId} — {signal.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Reporting period</span>
            <input name="reportingPeriod" defaultValue={reportingPeriod || ""} placeholder="e.g. FY2026" required />
          </label>
        </div>
        <p className="form-note">
          Evidence grades are entered only in the Assessment editor. Saving here adds this record and its files to the
          Evidence Register immediately.
        </p>
        <label className="field">
          <span>Evidence summary</span>
          <textarea name="summary" rows={3} placeholder="What does the evidence demonstrate?" />
        </label>
        <div className="form-grid two-columns">
          <label className="field">
            <span>Primary source URL</span>
            <input name="primarySourceUrl" type="url" placeholder="https://..." />
          </label>
          <label className="field">
            <span>Secondary source URL</span>
            <input name="secondarySourceUrl" type="url" placeholder="https://..." />
          </label>
        </div>
        <label className="field">
          <span>Assessment note</span>
          <textarea name="assessmentNote" rows={2} placeholder="Add any limitations, scope notes or review observations." />
        </label>
        <div className="attachment-uploader">
          <label className="file-drop" htmlFor="evidence-files">
            <span className="file-drop-icon" aria-hidden="true">
              ⇧
            </span>
            <span>
              <strong>Attach supporting files</strong>
              <small>Select one or several PDF, spreadsheet, image, or document files.</small>
            </span>
            <input
              id="evidence-files"
              name="files"
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt"
              onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []).map((file) => file.name))}
            />
          </label>
          <div>
            <p className="naming-convention">
              <strong>Stored file format</strong> institution-slug_signal-slug_period-slug_YYYYMMDD_######-sequence.ext. The
              six-digit record ID is assigned on save.
            </p>
            <div id="evidence-file-list" className="file-selection">
              {files.length ? (
                files.map((name) => <span key={name}>{name}</span>)
              ) : (
                <span>No files selected.</span>
              )}
            </div>
          </div>
        </div>
        <div className="dialog-actions">
          <button id="cancel-evidence-form" className="button button-secondary" type="button" onClick={close}>
            Cancel
          </button>
          <button className="button button-primary" type="submit" disabled={pending}>
            Save evidence
          </button>
        </div>
      </form>
    </dialog>
  );
}
