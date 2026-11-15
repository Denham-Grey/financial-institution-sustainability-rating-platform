import Link from "next/link";
import { getCertificates } from "@/lib/data";
import { RatingPill } from "@/components/rating-pill";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const certificates = await getCertificates();
  const certificate = certificates.find((row) => row.verification_token === token);

  return (
    <section className="route active">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Certificate verification</p>
          <h1>{certificate ? "Certificate verified" : "Certificate not found"}</h1>
          <p className="page-subtitle">
            {certificate
              ? "This token matches an issued rating certificate."
              : "No certificate matches this verification token."}
          </p>
        </div>
      </div>
      {certificate ? (
        <article className="card rating-card">
          <p className="eyebrow">{certificate.certificate_number}</p>
          <h2>{certificate.institution_name}</h2>
          <p className="page-subtitle">
            {certificate.institution_type} · {certificate.reporting_period}
          </p>
          <p className="gauge-score">
            <span className="rating-gauge">{Number(certificate.adjusted_score).toFixed(1)}</span>
            <RatingPill rating={certificate.rating} />
          </p>
          <p className="metric-meta">
            Lifecycle: {certificate.lifecycle_status} · issued{" "}
            {new Date(certificate.issued_at).toISOString().slice(0, 10)} · valid to{" "}
            {new Date(certificate.valid_until).toISOString().slice(0, 10)}
          </p>
          <Link className="button button-secondary" href="/certificates">
            Back to certificates
          </Link>
        </article>
      ) : (
        <Link className="button button-secondary" href="/certificates">
          Back to certificates
        </Link>
      )}
    </section>
  );
}
