"use client";

import { useState } from "react";
import { SignalGuideDialog, type SignalGuide } from "@/components/signal-guide-dialog";
import { formatNumber } from "@/lib/format";

export type FrameworkSignal = SignalGuide & {
  justification: string;
  searchText: string;
};

function safeUrl(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function FrameworkCatalogue({ signals }: { signals: FrameworkSignal[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SignalGuide | null>(null);
  const trimmed = query.trim().toLowerCase();
  const visible = signals.filter((signal) => !trimmed || signal.searchText.includes(trimmed));

  return (
    <article className="card">
      <div className="card-heading responsive-heading">
        <div>
          <p className="eyebrow">Signal catalogue</p>
          <h2>Model definitions and sources</h2>
        </div>
        <label className="compact-field">
          <span>Find signal</span>
          <input
            id="framework-search"
            type="search"
            placeholder="Search framework"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Pillar</th>
              <th>Signal</th>
              <th>Weight</th>
              <th>Rationale</th>
              <th>Framework</th>
              <th>Guide</th>
            </tr>
          </thead>
          <tbody id="framework-table-body">
            {visible.length ? (
              visible.map((signal) => {
                const sourceUrl = safeUrl(signal.sourceUrl);
                return (
                  <tr key={signal.signalId}>
                    <td>
                      <span className="signal-id">{signal.signalId}</span>
                    </td>
                    <td>{signal.pillar}</td>
                    <td>
                      <span className="table-primary">{signal.name}</span>
                      {signal.definition ? <span className="table-secondary">{signal.definition}</span> : null}
                    </td>
                    <td>{formatNumber(signal.weight)}%</td>
                    <td>{signal.justification || "Model rationale"}</td>
                    <td>
                      {sourceUrl ? (
                        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                          {signal.primaryFramework || "Open source"}
                        </a>
                      ) : null}
                    </td>
                    <td>
                      <button
                        className="button button-secondary guide-button"
                        type="button"
                        data-view-signal={signal.signalId}
                        onClick={() => setSelected(signal)}
                      >
                        Open guide
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="empty-row">
                  {signals.length
                    ? "No framework signals match this search."
                    : "The framework catalogue is not available."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <SignalGuideDialog signal={selected} onClose={() => setSelected(null)} />
    </article>
  );
}
