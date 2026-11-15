import { getCertificates, getInstitutions, getPartnerView, getRankings, getReview } from "@/lib/data";
import { PILLARS } from "@/lib/scoring";
import { certificateDisplayState, formatDate, formatNumber, ratingClass } from "@/lib/format";
import { getSessionUser } from "@/lib/session";
import { RankingCard } from "@/components/ranking-card";
import { PartnerDashboard } from "@/components/partner-dashboard";

export const dynamic = "force-dynamic";

const RATING_DESCRIPTIONS: Record<string, string> = {
  "Sustainability Leader": "Leading performance with strong evidence across the assessed principles.",
  Advanced: "Mature implementation with credible evidence and some room to deepen outcomes.",
  Transitioning: "Material progress is visible, but implementation or evidence remains uneven.",
  Emerging: "Core practices are developing; substantial control and evidence gaps remain.",
  Lagging: "Limited evidence of systematic implementation across the framework.",
  "Not Applicable": "No signals are currently applicable to this institution.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ institution?: string }>;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  if (user?.profile_role === "partner") {
    const [partnerView, institutions] = await Promise.all([getPartnerView(), getInstitutions()]);
    const selectedId =
      Number(params.institution) || partnerView.activeCertificates[0]?.institution_id || institutions[0]?.id;
    const institution = institutions.find((row) => row.id === selectedId) ?? null;
    const certificates = selectedId ? await getCertificates(selectedId) : [];
    return (
      <PartnerDashboard
        view={partnerView}
        institutions={institutions}
        selected={institution}
        certificates={certificates}
      />
    );
  }
  const [rankings, institutions] = await Promise.all([getRankings(), getInstitutions()]);
  const selectedId = Number(params.institution) || institutions[0]?.id;
  const selected = rankings.find((row) => row.institutionId === selectedId) ?? rankings[0];
  const institution = institutions.find((row) => row.id === selected?.institutionId);
  const review = selected ? await getReview(selected.institutionId) : null;
  const certificates = selected ? await getCertificates(selected.institutionId) : [];

  if (!selected || !institution) {
    return (
      <section id="route-dashboard" className="route active" data-route-panel="dashboard">
        <div className="page-heading dashboard-heading">
          <div>
            <p className="eyebrow">Portfolio intelligence</p>
            <h1>Sustainability rating dashboard</h1>
            <p className="page-subtitle">
              {institutions.length ? "Select an institution to begin." : "No institutions are available in this workspace."}
            </p>
          </div>
        </div>
        <div className="metrics-grid">
          <article className="metric metric-state">
            <span className="metric-label">Institution overview</span>
            <strong className="metric-value">—</strong>
            <span className="metric-meta">
              {institutions.length ? "Select an institution to begin." : "No institutions are available in this workspace."}
            </span>
          </article>
        </div>
      </section>
    );
  }

  const workflowStatus = review?.status || selected.workflowStatus || "draft";
  const provisional = selected.provisional;
  const gauge = Math.max(0, Math.min(100, selected.adjustedGreenScore));

  const metrics: [string, string, string][] = [
    ["Adjusted score", formatNumber(selected.adjustedGreenScore), "Evidence-weighted / 100"],
    ["Raw score", formatNumber(selected.rawGreenScore), "Performance before confidence"],
    [
      "Rating",
      selected.ratingLabel || selected.rating,
      provisional
        ? `${formatNumber(selected.completionPercentage, 0)}% complete · provisional`
        : "Approved classification",
    ],
    ["Evidence confidence", `${Math.round(selected.evidenceConfidence * 100)}%`, "Weighted evidence strength"],
    ["Portfolio rank", `${selected.rank} / ${rankings.length}`, "All institutions"],
  ];

  const trend = [...certificates]
    .map((row) => ({
      score: Number(row.adjusted_score),
      date: row.issued_at,
      reportingPeriod: row.reporting_period,
      rating: row.rating,
      certificateNumber: row.certificate_number,
      token: row.verification_token,
      lifecycle: certificateDisplayState(row),
    }))
    .filter((row) => Number.isFinite(row.score))
    .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

  const firstScore = trend[0]?.score ?? 0;
  const latestScore = trend.at(-1)?.score ?? 0;
  const totalChange = trend.length > 1 ? latestScore - firstScore : 0;
  const trendSummary =
    trend.length === 0
      ? "No approved history"
      : trend.length === 1
        ? "Baseline established"
        : `${totalChange >= 0 ? "+" : ""}${formatNumber(totalChange)} points since first approval`;

  return (
    <section id="route-dashboard" className="route active" data-route-panel="dashboard">
      <div className="page-heading dashboard-heading">
        <div>
          <p id="dashboard-eyebrow" className="eyebrow">
            Portfolio intelligence
          </p>
          <h1 id="dashboard-heading-title">Sustainability rating dashboard</h1>
          <p id="dashboard-subtitle" className="page-subtitle">
            {institution.name} · {institution.type}
          </p>
        </div>
        <span id="dashboard-updated" className="updated-label">
          Reporting period: {institution.reporting_period} · Assessment: {workflowStatus.replaceAll("_", " ")}
        </span>
      </div>

      <div
        id="rating-governance-banner"
        className={`rating-governance-banner internal-only ${workflowStatus === "approved" ? "effective" : "working"}`}
      >
        {workflowStatus === "approved" ? (
          <>
            <strong>APPROVED / EFFECTIVE</strong>
            <span>This rating completed independent review and is the institution’s current effective result.</span>
          </>
        ) : (
          <>
            <strong>WORKING / PROVISIONAL</strong>
            <span>
              These analyst calculations are not effective and are never shown to Partner profiles until a Reviewer or
              Administrator approves them.
            </span>
          </>
        )}
      </div>

      <div id="metrics-grid" className="metrics-grid" aria-label="Institution rating summary">
        {metrics.map(([label, value, meta]) => (
          <article className="metric" key={label}>
            <span className="metric-label">{label}</span>
            <strong className="metric-value">{value}</strong>
            <span className="metric-meta">{meta}</span>
          </article>
        ))}
      </div>

      <div className="dashboard-grid internal-only">
        <article className="card pillar-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Performance profile</p>
              <h2>Nine principle pillars</h2>
            </div>
            <span className="legend">
              <i /> Adjusted score
            </span>
          </div>
          <div id="pillar-bars" className="pillar-bars">
            {PILLARS.map((pillar) => {
              const value = selected.pillars[pillar];
              const name = pillar.replace(/^Principle\s+\d+\s*[—-]\s*/, "");
              return (
                <div className="pillar-row" key={pillar}>
                  <span className="pillar-name" title={name}>
                    {name}
                  </span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${value == null ? 0 : Math.max(0, Math.min(100, value))}%` }}
                    />
                  </div>
                  <span className="bar-value">{value == null ? "N/A" : formatNumber(value)}</span>
                </div>
              );
            })}
          </div>
        </article>
        <article className="card position-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Relative position</p>
              <h2>Rating interpretation</h2>
            </div>
          </div>
          <div
            id="rating-gauge"
            className="rating-gauge"
            style={{ ["--gauge-value" as string]: `${gauge}%` } as React.CSSProperties}
          >
            <div className="gauge-score">{formatNumber(selected.adjustedGreenScore)}</div>
            <span>Adjusted score</span>
          </div>
          <div id="rating-copy" className="rating-copy">
            <strong>{selected.ratingLabel || selected.rating}</strong>
            {RATING_DESCRIPTIONS[selected.rating]}
          </div>
        </article>
      </div>

      <RankingCard rankings={rankings} />

      <article className="card rating-trend-card">
        <div className="card-heading responsive-heading">
          <div>
            <p className="eyebrow">Rating history</p>
            <h2 id="rating-trend-title">
              Approved rating trend{trend.length ? ` — ${institution.name}` : ""}
            </h2>
          </div>
          <span id="rating-trend-summary" className="updated-label">
            {trendSummary}
          </span>
        </div>
        <div
          id="rating-trend-chart"
          className="rating-trend-chart"
          role="img"
          aria-label={
            trend.length
              ? `${trend.length} approved ratings. Latest score ${formatNumber(latestScore)} out of 100; overall change ${
                  totalChange >= 0 ? "plus " : "minus "
                }${formatNumber(Math.abs(totalChange))} points.`
              : "Approved rating score trend"
          }
        >
          {trend.length ? (
            trend.map((row, index) => {
              const previous = index ? trend[index - 1].score : null;
              const delta = previous == null ? null : row.score - previous;
              return (
                <div
                  className="trend-column"
                  key={`${row.certificateNumber}-${index}`}
                  title={`${row.reportingPeriod || formatDate(row.date)}: ${formatNumber(row.score)} · ${row.lifecycle.label}`}
                >
                  <span className="trend-value">{formatNumber(row.score)}</span>
                  <div className="trend-bar-track">
                    <i
                      className={`trend-bar ${delta == null ? "baseline" : delta >= 0 ? "up" : "down"}`}
                      style={{ height: `${Math.max(5, Math.min(100, row.score))}%` }}
                    />
                  </div>
                  <small>{row.reportingPeriod || formatDate(row.date)}</small>
                </div>
              );
            })
          ) : (
            <div className="empty-directory">The first approved rating will establish the trend baseline.</div>
          )}
        </div>
        <div className="table-wrap">
          <table className="rating-trend-table">
            <thead>
              <tr>
                <th>Approval / issue date</th>
                <th>Reporting period</th>
                <th>Score</th>
                <th>Rating</th>
                <th>Change</th>
                <th>Status</th>
                <th>Certificate</th>
              </tr>
            </thead>
            <tbody id="rating-trend-table-body">
              {trend.length ? (
                trend.map((row, index) => {
                  const previous = index ? trend[index - 1].score : null;
                  const delta = previous == null ? null : row.score - previous;
                  return (
                    <tr key={`${row.certificateNumber}-row-${index}`}>
                      <td>{formatDate(row.date)}</td>
                      <td>{row.reportingPeriod || "—"}</td>
                      <td>
                        <strong>{formatNumber(row.score)}</strong>
                      </td>
                      <td>
                        <span className={`pill pill-${ratingClass(row.rating)}`}>{row.rating || "—"}</span>
                      </td>
                      <td>
                        <span className={`trend-change ${delta == null ? "" : delta >= 0 ? "positive" : "negative"}`}>
                          {delta == null ? "Baseline" : `${delta >= 0 ? "+" : ""}${formatNumber(delta)} pts`}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${row.lifecycle.className}`}>{row.lifecycle.label}</span>
                      </td>
                      <td>
                        {row.token ? <a href={`/verify/${row.token}`}>{row.certificateNumber}</a> : "—"}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="empty-row">
                    No approved rating history is available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article id="rating-comparison-card" className="card rating-comparison-card internal-only">
        <div className="card-heading responsive-heading">
          <div>
            <p className="eyebrow">Immutable approved snapshots</p>
            <h2 id="rating-comparison-title">Previous-to-new rating comparison</h2>
            <p className="page-subtitle">Review the rating and every signal score retained at each approval.</p>
          </div>
          <label className="compact-field">
            <span>Approved rating</span>
            <select id="rating-comparison-select" aria-label="Select approved rating to compare" disabled>
              <option>{certificates.length ? "Baseline only" : "No comparison available"}</option>
            </select>
          </label>
        </div>
        <div id="rating-comparison-summary" className="rating-comparison-summary" aria-live="polite">
          <div className="empty-directory">
            {certificates.length
              ? "The first approved rating is retained as the baseline. A previous-to-new comparison will appear after the next approval."
              : "No certificate-backed approved snapshot is available yet."}
          </div>
        </div>
        <div className="table-wrap">
          <table className="rating-comparison-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Previous signal score</th>
                <th>New signal score</th>
                <th>Score change</th>
                <th>Previous evidence grade</th>
                <th>New evidence grade</th>
                <th>Evidence change</th>
              </tr>
            </thead>
            <tbody id="rating-comparison-table-body">
              <tr>
                <td colSpan={7} className="empty-row">
                  A comparison will appear after the institution has two approved ratings.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
