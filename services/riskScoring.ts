// src/services/riskScoring.ts

export type RiskLevel = "MODÉRÉ" | "SURVEILLANCE" | "ÉLEVÉ" | "CRITIQUE";

export type RiskMeta = {
  level: RiskLevel;
  color: string;
  rank: number;
  overdueCount: number;
  unpaidCount: number;
  partialCount: number;
  averageCoverageRate: number; // 0 à 100
};

function asNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type RiskInputRow = {
  expected: number;
  paid: number;
  remain: number;
};

export function computeRiskFromOverdueRows(rows: RiskInputRow[]): RiskMeta {
  const overdueRows = rows.filter((r) => asNumber(r.remain) > 0);

  const overdueCount = overdueRows.length;

  const unpaidCount = overdueRows.filter((r) => asNumber(r.paid) <= 0).length;

  const partialCount = overdueRows.filter(
    (r) => asNumber(r.paid) > 0 && asNumber(r.remain) > 0
  ).length;

  const averageCoverageRate =
    overdueCount > 0
      ? overdueRows.reduce((sum, r) => {
          const expected = asNumber(r.expected);
          const paid = asNumber(r.paid);

          if (expected <= 0) return sum + 100;

          const rate = Math.min(100, Math.max(0, (paid / expected) * 100));
          return sum + rate;
        }, 0) / overdueCount
      : 100;

  if (overdueCount <= 0) {
    return {
      level: "MODÉRÉ",
      color: "bg-blue-100 text-blue-800 border-blue-200",
      rank: 1,
      overdueCount,
      unpaidCount,
      partialCount,
      averageCoverageRate,
    };
  }

  // CRITIQUE
  if (
    overdueCount >= 4 ||
    unpaidCount >= 3 ||
    (overdueCount >= 3 && averageCoverageRate < 20)
  ) {
    return {
      level: "CRITIQUE",
      color: "bg-red-100 text-red-800 border-red-200",
      rank: 4,
      overdueCount,
      unpaidCount,
      partialCount,
      averageCoverageRate,
    };
  }

  // ÉLEVÉ
  if (
    overdueCount >= 3 ||
    unpaidCount >= 2 ||
    (overdueCount >= 2 && averageCoverageRate < 35)
  ) {
    return {
      level: "ÉLEVÉ",
      color: "bg-orange-100 text-orange-800 border-orange-200",
      rank: 3,
      overdueCount,
      unpaidCount,
      partialCount,
      averageCoverageRate,
    };
  }

  // SURVEILLANCE
  if (
    overdueCount >= 2 ||
    (overdueCount === 1 && averageCoverageRate < 50)
  ) {
    return {
      level: "SURVEILLANCE",
      color: "bg-yellow-100 text-yellow-800 border-yellow-200",
      rank: 2,
      overdueCount,
      unpaidCount,
      partialCount,
      averageCoverageRate,
    };
  }

  // MODÉRÉ
  return {
    level: "MODÉRÉ",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    rank: 1,
    overdueCount,
    unpaidCount,
    partialCount,
    averageCoverageRate,
  };
}