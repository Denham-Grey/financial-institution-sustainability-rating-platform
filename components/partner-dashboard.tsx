import type { CertificateRow, Institution, PartnerView } from "@/lib/data";
import { certificateDisplayState, formatDate, formatNumber, ratingClass } from "@/lib/format";

export function PartnerDashboard({
  view,
  institutions,
  selected,
  certificates,
}: {
  view: PartnerView;
  institutions: Institution[];
  selected: Institution | null;
  certificates: CertificateRow[];
}) {
  const active = selected
    ? view.activeCertificates.find((row) => row.institution_id === selected.id) ?? null
    : null;
  const subtitle = selected
    ? `${selected.name} · ${active ? selected.type : "No current certificate-backed rating"}`
    : institutions.length
      ? "Select an institution to review its approved outcome."
      : "No institutions are available in this workspace.";
  const total = view.ratingDistribution.reduce((sum, row) => sum + row.count, 0);
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

  const metrics: [string, string, string][] = active
    ? [
        ["Approved score", formatNumber(active.adjusted_score), "Approved result / 100"],
        ["Current rating", active.rating || "—", "Reviewer-approved classification"],
        ["Reporting period", active.reporting_period || "—", "Certificate-backed outcome"],
        ["Approved institutions", formatNumber(view.approvedInstitutions, 0), "Condensed approved portfolio"],
        ["Active certificates", formatNumber(view.activeCertificates.length, 0), "Permanent verification records"],
      ]
    : [
        [
          "Current approved rating",
          "—",
          "No active certificate. Expired, revoked or superseded results are shown only as clearly labelled history.",
        ],
      ];

  return (
    <section id="route-dashboard" className="route active" data-route-panel="dashboard">
      <div className="page-heading dashboard-heading">
        <div>
          <p id="dashboard-eyebrow" className="eyebrow">
            Approved institutional intelligence
          </p>
          <h1 id="dashboard-heading-title">Sustainability rating overview</h1>
          <p id="dashboard-subtitle" className="page-subtitle">
            {subtitle}
          </p>
        </div>
        <span id="dashboard-updated" className="updated-label">
          {selected
            ? active
              ? `Reporting period: ${selected.reporting_period || active.reporting_period || "—"} · APPROVED OUTCOME`
              : "HISTORICAL RECORDS AVAILABLE IN CERTIFICATES"
            : ""}
        </span>
      </div>

      <article id="partner-overview" className="partner-overview card">
        <div>
          <p className="eyebrow">Approved public-facing view</p>
          <h2>Independent sustainability-rating intelligence</h2>
          <p>
            This condensed workspace presents approved institutional outcomes, verified certificates, rating history
            and licensed-institution reference data. Internal scoring signals, evidence files and proprietary
            methodology remain protected.
          </p>
        </div>
        <span className="partner-assurance-badge">CONTROLLED VIEW</span>
      </article>

      <div id="partner-assurance-grid" className="partner-assurance-grid" aria-label="Rating system assurance">
        <article className="card">
          <span>01</span>
          <strong>Nine-principle coverage</strong>
          <p>Institutional sustainability is considered across the Nigerian Sustainable Banking Principles.</p>
        </article>
        <article className="card">
          <span>02</span>
          <strong>Evidence-linked review</strong>
          <p>Every approved outcome has passed structured evidence and completeness controls.</p>
        </article>
        <article className="card">
          <span>03</span>
          <strong>Independent maker-checker</strong>
          <p>Analyst work does not take effect until a Reviewer or Administrator decides it.</p>
        </article>
        <article className="card">
          <span>04</span>
          <strong>Certificate traceability</strong>
          <p>Approved revisions produce unique, verifiable and permanently retrievable certificates.</p>
        </article>
      </div>

      <article id="partner-distribution-card" className="card partner-distribution-card">
        <div className="card-heading responsive-heading">
          <div>
            <p className="eyebrow">Approved portfolio</p>
            <h2>Rating distribution</h2>
          </div>
          <span id="partner-distribution-total" className="count-badge">
            {total} approved
          </span>
        </div>
        <div
          id="partner-rating-distribution"
          className="partner-rating-distribution"
          aria-label="Distribution of approved institutional ratings"
        >
          {view.ratingDistribution.length ? (
            view.ratingDistribution.map((row) => {
              const percent = total ? (row.count / total) * 100 : 0;
              return (
                <div key={row.rating}>
                  <span>{row.rating}</span>
                  <div className="distribution-track">
                    <i
                      className={`pill-${ratingClass(row.rating)}`}
                      style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
                    />
                  </div>
                  <strong>{row.count}</strong>
                </div>
              );
            })
          ) : (
            <div className="empty-directory">
              Approved rating distribution will appear as institutions complete review.
            </div>
          )}
        </div>
      </article>

      <div id="metrics-grid" className="metrics-grid" aria-label="Institution rating summary">
        {metrics.map(([label, value, meta]) => (
          <article className="metric" key={label}>
            <span className="metric-label">{label}</span>
            <strong className="metric-value">{value}</strong>
            <span className="metric-meta">{meta}</span>
          </article>
        ))}
      </div>

      <article id="partner-approved-register" className="card partner-approved-register">
        <div className="card-heading responsive-heading">
          <div>
            <p className="eyebrow">Approved outcomes only</p>
            <h2>Latest institutional ratings</h2>
          </div>
          <span id="partner-approved-count" className="count-badge">
            {view.activeCertificates.length}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Institution</th>
                <th>Category</th>
                <th>Reporting period</th>
                <th>Approved score</th>
                <th>Rating</th>
                <th>Certificate</th>
              </tr>
            </thead>
            <tbody id="partner-approved-body">
              {view.activeCertificates.length ? (
                view.activeCertificates.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <a className="table-link" href={`/?institution=${row.institution_id}`}>
                        {row.institution_name || "—"}
                      </a>
                    </td>
                    <td>{row.institution_type || "—"}</td>
                    <td>{row.reporting_period || "—"}</td>
                    <td>
                      <strong>{formatNumber(row.adjusted_score)}</strong>
                    </td>
                    <td>
                      <span className={`pill pill-${ratingClass(row.rating)}`}>{row.rating || "—"}</span>
                    </td>
                    <td>
                      <a href={`/api/certificates/${row.id}/pdf`} download>
                        {row.certificate_number}
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-row">
                    No approved institutional ratings are available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card rating-trend-card">
        <div className="card-heading responsive-heading">
          <div>
            <p className="eyebrow">Rating history</p>
            <h2 id="rating-trend-title">
              Approved rating trend{selected ? ` — ${selected.name}` : ""}
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
                      <td>{row.token ? <a href={`/verify/${row.token}`}>{row.certificateNumber}</a> : "—"}</td>
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
    </section>
  );
}
