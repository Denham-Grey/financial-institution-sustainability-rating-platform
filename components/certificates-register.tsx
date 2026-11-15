"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeCertificateState } from "@/lib/actions";
import { showToast } from "@/components/toast";
import { certificateDisplayState, formatDate, formatNumber, ratingClass } from "@/lib/format";

export type CertificateDisplay = {
  id: number;
  certificateNumber: string;
  institutionName: string;
  institutionType: string;
  reportingPeriod: string;
  rating: string;
  adjustedScore: number;
  issuedAt: string;
  validUntil: string;
  lifecycleStatus: string;
  revocationReason: string;
  issuerName: string;
  verificationToken: string;
};

type VerificationState =
  | { status: "loading" }
  | {
      status: "ready";
      valid: boolean;
      certificate: {
        certificateNumber: string;
        institutionName: string;
        institutionType: string;
        reportingPeriod: string;
        rating: string;
        adjustedScore: number;
        issuedAt: string;
        validUntil: string;
        lifecycleStatus: string;
      };
    }
  | { status: "error"; message: string };

function certificateValidity(certificate: { issuedAt: string; validUntil: string }) {
  const issuedDate = String(certificate.issuedAt || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
  const validDate = String(certificate.validUntil || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
  return `${formatDate(issuedDate)} to ${formatDate(validDate)}`;
}

export function CertificatesRegister({
  certificates,
  canReview,
  showIssuer,
}: {
  certificates: CertificateDisplay[];
  canReview: boolean;
  showIssuer: boolean;
}) {
  const pageSize = 50;
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pending, startTransition] = useTransition();
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationState>({ status: "loading" });
  const dialogRef = useRef<HTMLDialogElement>(null);

  const total = certificates.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = certificates.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (verifyToken && !dialog.open) dialog.showModal();
    if (!verifyToken && dialog.open) dialog.close();
  }, [verifyToken]);

  useEffect(() => {
    if (!verifyToken) return;
    let cancelled = false;
    setVerification({ status: "loading" });
    fetch(`/api/certificates/verify/${encodeURIComponent(verifyToken)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("The verification register could not be reached.");
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setVerification({ status: "ready", valid: payload.valid, certificate: payload.certificate });
      })
      .catch((error: Error) => {
        if (!cancelled) setVerification({ status: "error", message: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [verifyToken]);

  function revoke(certificateId: number) {
    const reason = window.prompt("State the reason for revoking this certificate.", "");
    if (reason === null) return;
    if (!reason.trim()) {
      showToast("A revocation reason is required.", "error");
      return;
    }
    const data = new FormData();
    data.set("certificateId", String(certificateId));
    data.set("reason", reason.trim());
    startTransition(async () => {
      const result = await revokeCertificateState(null, data);
      if (result?.ok) {
        showToast(result.message);
        router.refresh();
      } else {
        showToast(result?.message || "Certificate could not be revoked.", "error");
      }
    });
  }

  return (
    <section id="route-certificates" className="route active" data-route-panel="certificates">
      <div className="page-heading">
        <h1>Issued certificates</h1>
      </div>
      <article className="card">
        <div className="table-wrap">
          <table aria-label="Issued rating certificates">
            <thead>
              <tr>
                <th>Certificate number</th>
                <th>Institution</th>
                <th>Reporting period</th>
                <th>Rating and score</th>
                <th>Validity period</th>
                <th>Status</th>
                <th>Verification</th>
                <th>PDF and actions</th>
              </tr>
            </thead>
            <tbody id="certificate-table-body">
              {visible.length ? (
                visible.map((certificate) => {
                  const displayStatus = certificateDisplayState({
                    lifecycle_status: certificate.lifecycleStatus,
                    valid_until: certificate.validUntil,
                  });
                  const pdfUrl = `/api/certificates/${certificate.id}/pdf`;
                  return (
                    <tr key={certificate.id}>
                      <td>
                        <strong className="mono-value">{certificate.certificateNumber}</strong>
                      </td>
                      <td>
                        <span className="table-primary">{certificate.institutionName || "—"}</span>
                        <span className="table-secondary">{certificate.institutionType || ""}</span>
                      </td>
                      <td>{certificate.reportingPeriod || "—"}</td>
                      <td>
                        <span className={`pill pill-${ratingClass(certificate.rating)}`}>{certificate.rating || "—"}</span>
                        <span className="table-secondary">Adjusted score {formatNumber(certificate.adjustedScore)}</span>
                      </td>
                      <td className="certificate-validity">
                        {certificateValidity(certificate)}
                        {showIssuer && certificate.issuerName ? (
                          <span className="table-secondary">Issued by {certificate.issuerName}</span>
                        ) : null}
                      </td>
                      <td>
                        <span className={`pill ${displayStatus.className}`}>{displayStatus.label}</span>
                        {certificate.revocationReason ? (
                          <span className="table-secondary">{certificate.revocationReason}</span>
                        ) : null}
                      </td>
                      <td>
                        {certificate.verificationToken ? (
                          <button
                            className="mini-link"
                            type="button"
                            data-verify-certificate={certificate.verificationToken}
                            aria-label={`Verify certificate ${certificate.certificateNumber}`}
                            onClick={() => setVerifyToken(certificate.verificationToken)}
                          >
                            Verify
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <div className="table-actions">
                          <a
                            href={`${pdfUrl}?view=1`}
                            target="_blank"
                            rel="noopener"
                            aria-label={`View PDF for ${certificate.certificateNumber}`}
                          >
                            View PDF
                          </a>
                          <a href={pdfUrl} download aria-label={`Download PDF for ${certificate.certificateNumber}`}>
                            Download PDF
                          </a>
                          {canReview && displayStatus.key === "active" ? (
                            <button
                              className="button button-danger"
                              type="button"
                              data-revoke-certificate={certificate.id}
                              disabled={pending}
                              onClick={() => revoke(certificate.id)}
                            >
                              Revoke
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="empty-row">
                    No rating certificates have been issued.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div id="certificate-pagination" className="pagination-bar" hidden={!total}>
          <span id="certificate-page-count" aria-live="polite">
            {total.toLocaleString("en-NG")} {total === 1 ? "certificate" : "certificates"}
          </span>
          <div>
            <button
              id="certificate-prev"
              className="button button-secondary"
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </button>
            <span id="certificate-page-label">
              Page {currentPage} of {Math.max(1, totalPages)}
            </span>
            <button
              id="certificate-next"
              className="button button-secondary"
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </article>

      <dialog
        id="certificate-verification-dialog"
        className="signal-dialog compact-dialog"
        aria-labelledby="certificate-verification-title"
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === event.currentTarget) setVerifyToken(null);
        }}
        onCancel={(event) => {
          event.preventDefault();
          setVerifyToken(null);
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Public verification</p>
            <h2 id="certificate-verification-title">Rating certificate status</h2>
          </div>
          <button
            id="close-certificate-verification-dialog"
            className="icon-button"
            type="button"
            aria-label="Close certificate verification"
            onClick={() => setVerifyToken(null)}
          >
            ×
          </button>
        </div>
        <div id="certificate-verification-content" className="verification-result" aria-live="polite">
          {verification.status === "loading" ? (
            <p className="route-state">Checking the public verification register…</p>
          ) : null}
          {verification.status === "error" ? (
            <div className="route-state error-state">
              <strong>Verification unavailable</strong>
              <p>{verification.message}</p>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  const token = verifyToken;
                  setVerifyToken(null);
                  window.setTimeout(() => setVerifyToken(token), 0);
                }}
              >
                Retry
              </button>
            </div>
          ) : null}
          {verification.status === "ready"
            ? (() => {
                const displayStatus = certificateDisplayState({
                  lifecycle_status: verification.certificate.lifecycleStatus,
                  valid_until: verification.certificate.validUntil,
                });
                const verified = verification.valid && displayStatus.key === "active";
                return (
                  <>
                    <div className={`verification-banner ${verified ? "verified" : "not-verified"}`}>
                      <span className={`pill ${verified ? "pill-leader" : displayStatus.className}`}>
                        {verified ? "Valid" : displayStatus.label}
                      </span>
                      <strong>{verified ? "Certificate verified" : "Certificate is not currently valid"}</strong>
                    </div>
                    <dl className="verification-grid">
                      <div>
                        <dt>Certificate</dt>
                        <dd>{verification.certificate.certificateNumber || "—"}</dd>
                      </div>
                      <div>
                        <dt>Institution</dt>
                        <dd>{verification.certificate.institutionName || "—"}</dd>
                      </div>
                      <div>
                        <dt>Institution category</dt>
                        <dd>{verification.certificate.institutionType || "—"}</dd>
                      </div>
                      <div>
                        <dt>Reporting period</dt>
                        <dd>{verification.certificate.reportingPeriod || "—"}</dd>
                      </div>
                      <div>
                        <dt>Rating</dt>
                        <dd>{verification.certificate.rating || "—"}</dd>
                      </div>
                      <div>
                        <dt>Adjusted score</dt>
                        <dd>{formatNumber(verification.certificate.adjustedScore)}</dd>
                      </div>
                      <div>
                        <dt>Validity period</dt>
                        <dd>{certificateValidity(verification.certificate)}</dd>
                      </div>
                    </dl>
                  </>
                );
              })()
            : null}
        </div>
      </dialog>
    </section>
  );
}
