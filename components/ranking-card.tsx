"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Ranking } from "@/lib/scoring";
import { formatNumber, ratingClass } from "@/lib/format";

export function RankingCard({ rankings }: { rankings: Ranking[] }) {
  const router = useRouter();
  const [type, setType] = useState("All institution types");
  const types = ["All institution types", ...Array.from(new Set(rankings.map((row) => row.institutionType).filter(Boolean)))];
  const rows = type === "All institution types" ? rankings : rankings.filter((row) => row.institutionType === type);

  return (
    <article className="card ranking-card internal-only">
      <div className="card-heading responsive-heading">
        <div>
          <p className="eyebrow">Market view</p>
          <h2>Dynamic institutional ranking</h2>
        </div>
        <label className="compact-field">
          <span>Category</span>
          <select id="ranking-type-filter" value={type} onChange={(event) => setType(event.target.value)}>
            {types.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Institution</th>
              <th>Category</th>
              <th>Adjusted</th>
              <th>Rating</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody id="ranking-table-body">
            {rows.length ? (
              rows.map((row) => {
                const provisional = row.provisional;
                const workflowStatus = row.workflowStatus || "draft";
                return (
                  <tr key={row.institutionId}>
                    <td>
                      <span className="rank-number">{row.rank}</span>
                    </td>
                    <td>
                      <button
                        className="table-link"
                        type="button"
                        data-select-institution={row.institutionId}
                        onClick={() => router.push(`?institution=${row.institutionId}`)}
                      >
                        {row.institution}
                      </button>
                      {workflowStatus || provisional ? (
                        <span className="table-secondary">
                          {provisional
                            ? `Provisional · ${workflowStatus || "draft"} · ${formatNumber(row.completionPercentage, 0)}% complete`
                            : workflowStatus}
                        </span>
                      ) : null}
                    </td>
                    <td>{row.institutionType}</td>
                    <td>
                      <strong>{formatNumber(row.adjustedGreenScore)}</strong>
                    </td>
                    <td>
                      <span className={`pill pill-${ratingClass(row.rating)}`}>{row.ratingLabel || row.rating}</span>
                    </td>
                    <td>{Math.round(row.evidenceConfidence * 100)}%</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="empty-row">
                  No institutions match this category.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
