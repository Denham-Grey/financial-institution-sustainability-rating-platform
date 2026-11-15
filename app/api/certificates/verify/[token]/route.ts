import { one } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { certificateDisplayState } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { token } = await params;
  const certificate = await one<{
    certificate_number: string;
    institution_name: string;
    institution_type: string;
    reporting_period: string;
    rating: string;
    adjusted_score: number;
    issued_at: string;
    valid_until: string;
    status: string;
    lifecycle_status: string;
    verification_token: string;
  }>(
    `SELECT certificate_number, institution_name, institution_type, reporting_period, rating,
       adjusted_score, issued_at, valid_until, status, lifecycle_status, verification_token
     FROM rating_certificates WHERE verification_token = $1`,
    [token],
  );
  if (!certificate) return Response.json({ valid: false, certificate: null }, { status: 404 });

  const displayStatus = certificateDisplayState(certificate);
  return Response.json({
    valid: displayStatus.key === "active",
    certificate: {
      certificateNumber: certificate.certificate_number,
      institutionName: certificate.institution_name,
      institutionType: certificate.institution_type,
      reportingPeriod: certificate.reporting_period,
      rating: certificate.rating,
      adjustedScore: certificate.adjusted_score,
      issuedAt: certificate.issued_at,
      validUntil: certificate.valid_until,
      status: certificate.status,
      lifecycleStatus: certificate.lifecycle_status,
      verificationToken: certificate.verification_token,
    },
  });
}
