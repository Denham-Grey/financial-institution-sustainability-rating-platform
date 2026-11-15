import { getSignals } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { formatNumber } from "@/lib/format";
import { FrameworkCatalogue, type FrameworkSignal } from "@/components/framework-catalogue";

export const dynamic = "force-dynamic";

const pillarDescriptions: Record<string, string> = {
  "Principle 1 — E&S Risk Management":
    "How environmental and social risks are identified, assessed, controlled, and monitored in financing decisions.",
  "Principle 2 — E&S Footprint":
    "The institution’s direct environmental and social performance across operations, people, facilities, and suppliers.",
  "Principle 3 — Human Rights":
    "Policies, due diligence, grievance mechanisms, and remedies that protect people affected by the institution.",
  "Principle 4 — Women's Economic Empowerment":
    "Women's access to finance, workplace opportunity, leadership, protection, and measurable outcomes.",
  "Principle 5 — Financial Inclusion":
    "Affordable, accessible services and demonstrable outcomes for underserved people and businesses.",
  "Principle 6 — E&S Governance":
    "Board oversight, management accountability, policies, controls, assurance, and performance incentives.",
  "Principle 7 — Capacity Building":
    "The skills, systems, training, and support required to implement sustainable banking effectively.",
  "Principle 8 — Collaborative Partnership":
    "Partnerships and knowledge-sharing that strengthen standards and expand sustainable-finance impact.",
  "Principle 9 — Reporting":
    "Transparent, comparable, timely, and credible disclosure of commitments, performance, and outcomes.",
};

export default async function FrameworkPage() {
  const user = await getSessionUser();
  if (user?.profile_role === "partner") redirect("/");
  const signals = await getSignals();

  const pillars = [...new Set(signals.map((signal) => signal.pillar))];
  const pillarWeights = new Map(
    pillars.map((pillar) => [
      pillar,
      signals
        .filter((signal) => signal.pillar === pillar)
        .reduce((total, signal) => total + Number(signal.weight), 0),
    ]),
  );

  const catalogueSignals: FrameworkSignal[] = signals.map((signal) => ({
    signalId: signal.signal_id,
    pillar: signal.pillar,
    name: signal.name,
    weight: signal.weight,
    definition: signal.definition,
    measurement: signal.measurement,
    evidenceRequired: signal.evidence_required,
    scoreGuide: signal.score_guide,
    primaryFramework: signal.primary_framework,
    sourceUrl: signal.source_url,
    references: Array.isArray(signal.references_json) ? signal.references_json : [],
    methodologyVersion: signal.methodology_version,
    justification: signal.justification,
    searchText: Object.values({
      signalId: signal.signal_id,
      pillar: signal.pillar,
      name: signal.name,
      weight: signal.weight,
      definition: signal.definition,
      measurement: signal.measurement,
      evidenceRequired: signal.evidence_required,
      scoreGuide: signal.score_guide,
      primaryFramework: signal.primary_framework,
      sourceUrl: signal.source_url,
      notes: signal.notes,
      justification: signal.justification,
      references: (Array.isArray(signal.references_json) ? signal.references_json : [])
        .map((reference) => `${reference.label} ${reference.url}`)
        .join(" "),
      methodologyVersion: signal.methodology_version,
    })
      .join(" ")
      .toLowerCase(),
  }));

  return (
    <section id="route-framework" className="route active" data-route-panel="framework">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Methodology · Version 2026.1</p>
          <h1>Nigerian Sustainable Banking Principles</h1>
          <p className="page-subtitle">
            Nine pillars, {signals.length} measurable signals, and a confidence adjustment grounded in
            evidence quality. The 0–5 scoring guides are an analytical rating methodology, not a
            CBN-prescribed scale.
          </p>
        </div>
      </div>

      <div id="principle-cards" className="principle-grid">
        {pillars.map((pillar, index) => (
          <article className="principle-card" key={pillar}>
            <span className="principle-number">P{index + 1}</span>
            <span className="principle-weight">{formatNumber(pillarWeights.get(pillar), 0)}%</span>
            <h3>{pillar.replace(/^Principle\s+\d+\s*[—-]\s*/, "")}</h3>
            <p>{pillarDescriptions[pillar]}</p>
          </article>
        ))}
      </div>

      <div className="framework-grid">
        <article className="card">
          <p className="eyebrow">Calculation logic</p>
          <h2>From signal to rating</h2>
          <ol className="method-steps">
            <li>
              <strong>Raw contribution</strong>
              <span>(Signal score ÷ 5) × signal weight</span>
            </li>
            <li>
              <strong>Adjusted contribution</strong>
              <span>Raw contribution × (evidence grade ÷ 3)</span>
            </li>
            <li>
              <strong>Final score</strong>
              <span>Sum of adjusted contributions, scaled for legitimate N/A weights</span>
            </li>
          </ol>
        </article>
        <article className="card">
          <p className="eyebrow">Rating bands</p>
          <h2>Performance classification</h2>
          <div className="band-list">
            <span>
              <i className="leader" />
              <strong>85–100</strong> Sustainability Leader
            </span>
            <span>
              <i className="advanced" />
              <strong>70–84.9</strong> Advanced
            </span>
            <span>
              <i className="transitioning" />
              <strong>55–69.9</strong> Transitioning
            </span>
            <span>
              <i className="emerging" />
              <strong>40–54.9</strong> Emerging
            </span>
            <span>
              <i className="lagging" />
              <strong>0–39.9</strong> Lagging
            </span>
          </div>
        </article>
        <article className="card evidence-rubric-card">
          <p className="eyebrow">Evidence confidence</p>
          <h2>Evidence-grade rubric</h2>
          <div className="evidence-rubric">
            <span>
              <strong>0</strong>No evidence
            </span>
            <span>
              <strong>1</strong>Limited or indirect evidence
            </span>
            <span>
              <strong>2</strong>Institution-published evidence
            </span>
            <span>
              <strong>3</strong>Independently assured, certified, accredited or regulatory evidence
            </span>
          </div>
        </article>
      </div>

      <FrameworkCatalogue signals={catalogueSignals} />
    </section>
  );
}
