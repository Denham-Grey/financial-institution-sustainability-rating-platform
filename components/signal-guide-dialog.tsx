"use client";

import { useEffect, useRef } from "react";

export type SignalGuide = {
  signalId: string;
  pillar: string;
  name: string;
  weight: number;
  definition: string;
  measurement: string;
  evidenceRequired: string;
  scoreGuide: string;
  primaryFramework: string;
  sourceUrl: string;
  references: { label: string; url: string }[];
  methodologyVersion: string;
};

function safeUrl(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function SignalGuideDialog({
  signal,
  onClose,
}: {
  signal: SignalGuide | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (signal && !dialog.open) dialog.showModal();
    if (!signal && dialog.open) dialog.close();
  }, [signal]);

  const levels = String(signal?.scoreGuide || "").match(/[0-5] — .*?(?=\s[0-5] — |$)/g) || [];
  const references = (signal?.references || [])
    .map((reference) => ({ label: reference.label, url: safeUrl(reference.url) }))
    .filter((reference): reference is { label: string; url: string } => Boolean(reference.url));
  const fallbackUrl = safeUrl(signal?.sourceUrl || "");

  return (
    <dialog
      id="signal-dialog"
      className="signal-dialog"
      aria-labelledby="signal-dialog-title"
      ref={dialogRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <p id="signal-dialog-meta" className="eyebrow">
            {signal
              ? `${signal.signalId} · ${signal.pillar} · ${Number(signal.weight).toFixed(1)}% weight · Methodology ${signal.methodologyVersion || "2026.1"}`
              : ""}
          </p>
          <h2 id="signal-dialog-title">{signal?.name || "Signal guide"}</h2>
        </div>
        <button id="close-signal-dialog" className="icon-button" type="button" aria-label="Close signal guide" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="guide-grid">
        <section>
          <h3>Definition</h3>
          <p id="signal-dialog-definition">{signal?.definition || "Not specified."}</p>
        </section>
        <section>
          <h3>Measurement rule</h3>
          <p id="signal-dialog-measurement">{signal?.measurement || "Not specified."}</p>
        </section>
        <section className="guide-span">
          <h3>Required evidence</h3>
          <p id="signal-dialog-evidence">{signal?.evidenceRequired || "Not specified."}</p>
        </section>
        <section className="guide-span">
          <h3>0–5 scoring guide</h3>
          <ol id="signal-dialog-scores" className="score-guide">
            {levels.map((level) => {
              const [number, ...description] = level.split(" — ");
              return (
                <li key={level}>
                  <span>{number}</span>
                  <p>{description.join(" — ")}</p>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="guide-span">
          <h3>Authoritative references</h3>
          <div id="signal-dialog-references" className="reference-list">
            {references.map((reference) => (
              <a key={reference.url} href={reference.url} target="_blank" rel="noopener noreferrer">
                {reference.label}
              </a>
            ))}
            {!references.length && fallbackUrl ? (
              <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">
                {signal?.primaryFramework || "Primary framework"}
              </a>
            ) : null}
          </div>
        </section>
      </div>
    </dialog>
  );
}
