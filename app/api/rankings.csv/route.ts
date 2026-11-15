import { getRankings } from "@/lib/data";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const rankings = await getRankings();
  const header = ["Rank", "Institution", "Category", "Reporting period", "Adjusted score", "Rating", "Confidence", "Status"];
  const lines = [
    header.join(","),
    ...rankings.map((row) =>
      [
        row.rank,
        row.institution,
        row.institutionType,
        row.reportingPeriod,
        row.adjustedGreenScore.toFixed(2),
        row.ratingLabel,
        row.evidenceConfidence.toFixed(3),
        row.workflowStatus,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ngfi-rankings.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
