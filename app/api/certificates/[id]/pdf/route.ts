import { one } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { createRatingCertificatePdf } from "@/lib/reporting.mjs";

export const dynamic = "force-dynamic";

type CertificateRecord = {
  certificate_number: string;
  institution_name: string;
  institution_type: string;
  reporting_period: string;
  adjusted_score: number;
  raw_score: number;
  evidence_confidence: number;
  rating: string;
  methodology_version: string;
  verification_token: string;
  issued_at: string;
  valid_until: string;
  status: string;
  issuer_name: string;
  issuer_username: string;
  issuer_role: string;
};

function safeFilename(value: string) {
  return String(value || "certificate").replace(/[^\w.\-]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const certificate = await one<CertificateRecord>(
    `SELECT certificate_number, institution_name, institution_type, reporting_period,
       adjusted_score, raw_score, evidence_confidence, rating, methodology_version,
       verification_token, issued_at, valid_until, status, issuer_name, issuer_username, issuer_role
     FROM rating_certificates WHERE id = $1`,
    [Number(id)],
  );
  if (!certificate) return new Response("Not found", { status: 404 });

  const origin = new URL(request.url).origin;
  const content = createRatingCertificatePdf({
    certificate: {
      certificateNumber: certificate.certificate_number,
      adjustedScore: certificate.adjusted_score,
      rawScore: certificate.raw_score,
      evidenceConfidence: certificate.evidence_confidence,
      rating: certificate.rating,
      reportingPeriod: certificate.reporting_period,
      methodologyVersion: certificate.methodology_version,
      issuerName: certificate.issuer_name,
      verificationToken: certificate.verification_token,
      verificationUrl: `${origin}/verify/${certificate.verification_token}`,
      status: certificate.status,
      issuedAt: certificate.issued_at,
      validUntil: certificate.valid_until,
    },
    institution: {
      name: certificate.institution_name,
      type: certificate.institution_type,
      reportingPeriod: certificate.reporting_period,
    },
    issuer: {
      name: certificate.issuer_name,
      username: certificate.issuer_username,
      role: certificate.issuer_role,
    },
  });

  const disposition = new URL(request.url).searchParams.get("view") === "1" ? "inline" : "attachment";
  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${safeFilename(certificate.institution_name)}-${safeFilename(certificate.certificate_number)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
