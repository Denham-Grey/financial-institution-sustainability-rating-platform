import {
  getDirectoryCategories,
  getEnrollmentRequests,
  searchDirectory,
} from "@/lib/data";
import { getSessionUser, canEdit, canReview, isAdmin } from "@/lib/session";
import { DirectoryBrowser } from "@/components/directory-browser";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = String(params.q ?? "").trim();
  const category = String(params.category ?? "").trim();
  const page = Math.max(1, Number(params.page) || 1);
  const user = await getSessionUser();
  const internal = user?.profile_role !== "partner";
  const [directory, categories, enrollmentRequests] = await Promise.all([
    searchDirectory(q, category, page, PAGE_SIZE),
    getDirectoryCategories(),
    internal ? getEnrollmentRequests() : Promise.resolve([]),
  ]);

  return (
    <DirectoryBrowser
      q={q}
      category={category}
      page={page}
      total={directory.total}
      totalPages={Math.max(1, Math.ceil(directory.total / PAGE_SIZE))}
      rows={directory.rows.map((row) => ({
        id: row.id,
        officialName: row.official_name,
        categoryCode: row.category_code,
        categoryName: row.category_name,
        licenceNumber: row.licence_number,
        licenceStatus: row.licence_status,
        state: row.state,
        sourceUrl: row.source_url,
        portfolioInstitutionId: row.portfolio_institution_id,
      }))}
      categories={categories.map((entry) => ({
        code: entry.code,
        name: entry.official_name,
        count: entry.count,
      }))}
      enrollmentRequests={enrollmentRequests.map((request) => ({
        id: request.id,
        cbnInstitutionId: request.cbn_institution_id,
        proposedName: request.proposed_name,
        proposedType: request.proposed_type,
        reportingPeriod: request.reporting_period,
        status: request.status,
        submissionComment: request.submission_comment,
        submittedAt: request.submitted_at,
        reviewComment: request.review_comment,
        submittedByName: request.submitted_by_name,
      }))}
      canNominate={canEdit(user)}
      canReview={canReview(user)}
      isAdmin={isAdmin(user)}
      isPartner={!internal}
    />
  );
}
