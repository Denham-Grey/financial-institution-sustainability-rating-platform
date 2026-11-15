export const PILLARS = [
  "Principle 1 — E&S Risk Management",
  "Principle 2 — E&S Footprint",
  "Principle 3 — Human Rights",
  "Principle 4 — Women's Economic Empowerment",
  "Principle 5 — Financial Inclusion",
  "Principle 6 — E&S Governance",
  "Principle 7 — Capacity Building",
  "Principle 8 — Collaborative Partnership",
  "Principle 9 — Reporting",
] as const;

const TOP_RATING = "Sustainability Leader";

export function ratingFromScore(score: number): string {
  if (score >= 85) return TOP_RATING;
  if (score >= 70) return "Advanced";
  if (score >= 55) return "Transitioning";
  if (score >= 40) return "Emerging";
  return "Lagging";
}

export type ScoreRow = {
  institutionId: number;
  signalId?: string;
  institution: string;
  institutionType: string;
  reportingPeriod?: string;
  workflowStatus?: string;
  cycleNumber?: number;
  revision?: number;
  methodologyVersion?: string;
  signalMethodologyVersion?: string;
  pillar: string;
  weight: number;
  score: number;
  assessed: boolean;
  evidenceGrade: number;
  applicable: boolean;
};

export type Ranking = {
  institutionId: number;
  institution: string;
  institutionType: string;
  reportingPeriod: string;
  workflowStatus: string;
  cycleNumber: number;
  revision: number;
  methodologyVersion: string;
  rawGreenScore: number;
  adjustedGreenScore: number;
  evidenceConfidence: number;
  applicableWeight: number;
  applicableSignalCount: number;
  assessedSignalCount: number;
  unassessedSignalCount: number;
  totalSignalCount: number;
  completeness: number;
  completionPercentage: number;
  naSignalCount: number;
  rating: string;
  ratingLabel: string;
  resultStatus: "provisional" | "approved";
  provisional: boolean;
  publicationEligible: boolean;
  pillars: Record<string, number | null>;
  rank: number;
};

export function calculateRankings(rows: ScoreRow[]): Ranking[] {
  type Accumulator = {
    institutionId: number;
    institution: string;
    institutionType: string;
    reportingPeriod: string;
    workflowStatus: string;
    cycleNumber: number;
    revision: number;
    methodologyVersion: string;
    rawWeightedPoints: number;
    adjustedWeightedPoints: number;
    evidenceWeightedTotal: number;
    applicableWeight: number;
    applicableSignalCount: number;
    assessedSignalCount: number;
    unassessedSignalCount: number;
    totalSignalCount: number;
    naSignalCount: number;
    pillarAdjusted: Record<string, number>;
    pillarWeights: Record<string, number>;
    pillarSignalCounts: Record<string, number>;
  };

  const byInstitution = new Map<number, Accumulator>();

  for (const row of rows) {
    if (!byInstitution.has(row.institutionId)) {
      byInstitution.set(row.institutionId, {
        institutionId: row.institutionId,
        institution: row.institution,
        institutionType: row.institutionType,
        reportingPeriod: row.reportingPeriod ?? "",
        workflowStatus: row.workflowStatus ?? "draft",
        cycleNumber: Number(row.cycleNumber) || 1,
        revision: Number(row.revision) || 0,
        methodologyVersion: row.methodologyVersion ?? row.signalMethodologyVersion ?? "",
        rawWeightedPoints: 0,
        adjustedWeightedPoints: 0,
        evidenceWeightedTotal: 0,
        applicableWeight: 0,
        applicableSignalCount: 0,
        assessedSignalCount: 0,
        unassessedSignalCount: 0,
        totalSignalCount: 0,
        naSignalCount: 0,
        pillarAdjusted: {},
        pillarWeights: {},
        pillarSignalCounts: {},
      });
    }

    const record = byInstitution.get(row.institutionId)!;
    const weight = Number(row.weight) || 0;
    const pillar = row.pillar;
    record.totalSignalCount += 1;
    if (row.assessed) record.assessedSignalCount += 1;
    else record.unassessedSignalCount += 1;
    record.pillarSignalCounts[pillar] = (record.pillarSignalCounts[pillar] || 0) + 1;

    if (!row.applicable) {
      record.naSignalCount += 1;
      continue;
    }

    const score = Math.max(0, Math.min(5, Number(row.score) || 0));
    const grade = Math.max(0, Math.min(3, Number(row.evidenceGrade) || 0));
    const raw = (score / 5) * weight;
    const adjusted = raw * (grade / 3);

    record.rawWeightedPoints += raw;
    record.adjustedWeightedPoints += adjusted;
    record.evidenceWeightedTotal += weight * (grade / 3);
    record.applicableWeight += weight;
    record.applicableSignalCount += 1;
    record.pillarAdjusted[pillar] = (record.pillarAdjusted[pillar] || 0) + adjusted;
    record.pillarWeights[pillar] = (record.pillarWeights[pillar] || 0) + weight;
  }

  const results = [...byInstitution.values()].map((record): Omit<Ranking, "rank"> => {
    const scale = record.applicableWeight > 0 ? 100 / record.applicableWeight : 0;
    const rawGreenScore = record.rawWeightedPoints * scale;
    const adjustedGreenScore = record.adjustedWeightedPoints * scale;
    const pillars: Record<string, number | null> = {};

    for (const pillar of PILLARS) {
      const denominator = record.pillarWeights[pillar] || 0;
      const signalCount = record.pillarSignalCounts[pillar] || 0;
      pillars[pillar] =
        signalCount > 0 && denominator === 0
          ? null
          : denominator > 0
            ? ((record.pillarAdjusted[pillar] || 0) / denominator) * 100
            : 0;
    }

    const completeness = record.totalSignalCount > 0 ? record.assessedSignalCount / record.totalSignalCount : 0;
    const provisional = record.workflowStatus !== "approved" || completeness < 1;
    const rating = record.applicableWeight > 0 ? ratingFromScore(adjustedGreenScore) : "Not Applicable";

    return {
      institutionId: record.institutionId,
      institution: record.institution,
      institutionType: record.institutionType,
      reportingPeriod: record.reportingPeriod,
      workflowStatus: record.workflowStatus,
      cycleNumber: record.cycleNumber,
      revision: record.revision,
      methodologyVersion: record.methodologyVersion,
      rawGreenScore,
      adjustedGreenScore,
      evidenceConfidence:
        record.applicableWeight > 0 ? record.evidenceWeightedTotal / record.applicableWeight : 0,
      applicableWeight: record.applicableWeight,
      applicableSignalCount: record.applicableSignalCount,
      assessedSignalCount: record.assessedSignalCount,
      unassessedSignalCount: record.unassessedSignalCount,
      totalSignalCount: record.totalSignalCount,
      completeness,
      completionPercentage: completeness * 100,
      naSignalCount: record.naSignalCount,
      rating,
      ratingLabel: provisional ? `Provisional — ${rating}` : rating,
      resultStatus: provisional ? "provisional" : "approved",
      provisional,
      publicationEligible: !provisional,
      pillars,
    };
  });

  results.sort((a, b) => {
    if (b.adjustedGreenScore !== a.adjustedGreenScore) return b.adjustedGreenScore - a.adjustedGreenScore;
    const riskPillar = PILLARS[0];
    if ((b.pillars[riskPillar] ?? -1) !== (a.pillars[riskPillar] ?? -1)) {
      return (b.pillars[riskPillar] ?? -1) - (a.pillars[riskPillar] ?? -1);
    }
    return a.institution.localeCompare(b.institution);
  });

  return results.map((row, index) => ({ ...row, rank: index + 1 }));
}
