import { getCertificates } from "@/lib/data";
import { getSessionUser, canReview } from "@/lib/session";
import { CertificatesRegister } from "@/components/certificates-register";

export const dynamic = "force-dynamic";

export default async function CertificatesPage() {
  const [certificates, user] = await Promise.all([getCertificates(), getSessionUser()]);
  return (
    <CertificatesRegister
      certificates={certificates.map((certificate) => ({
        id: certificate.id,
        certificateNumber: certificate.certificate_number,
        institutionName: certificate.institution_name,
        institutionType: certificate.institution_type,
        reportingPeriod: certificate.reporting_period,
        rating: certificate.rating,
        adjustedScore: certificate.adjusted_score,
        issuedAt: certificate.issued_at,
        validUntil: certificate.valid_until,
        lifecycleStatus: certificate.lifecycle_status,
        revocationReason: certificate.revocation_reason,
        issuerName: certificate.issuer_name,
        verificationToken: certificate.verification_token,
      }))}
      canReview={canReview(user)}
      showIssuer={user?.profile_role !== "partner"}
    />
  );
}
