/**
 * Vendor negative scoring model.
 *
 * Every Goods Receipt feedback contributes a penalty:
 *   - Star penalty      = (5 - stars) * 10           → 0 (5★) … 40 (1★)
 *   - Improvement areas = 5 points per flagged area  → 0 … 20 (4 areas)
 *   - Max penalty per feedback = 60, normalised to a 0-100 scale.
 *
 * The vendor's Negative Score is the average normalised penalty across all
 * feedback received. Lower is better; 0 means a spotless record.
 */

export const IMPROVEMENT_AREAS = [
  { value: "quality", label: "Quality" },
  { value: "time_to_deliver", label: "Time to Deliver" },
  { value: "better_communication", label: "Better Communication" },
  { value: "discipline_integrity", label: "Overall Discipline of Functioning & Integrity" },
] as const;

export type ImprovementArea = (typeof IMPROVEMENT_AREAS)[number]["value"];

export const improvementLabel = (v: string) =>
  IMPROVEMENT_AREAS.find((a) => a.value === v)?.label || v;

export const MAX_FEEDBACK_PENALTY = 60;

export function feedbackPenalty(stars: number, areas: string[] = []): number {
  const s = Math.min(5, Math.max(1, Number(stars) || 0));
  const starPenalty = (5 - s) * 10;
  const areaPenalty = Math.min(4, (areas || []).length) * 5;
  return Math.round(((starPenalty + areaPenalty) / MAX_FEEDBACK_PENALTY) * 100);
}

export interface VendorScoreBand {
  label: string;
  className: string;
  description: string;
}

export function scoreBand(score: number | null): VendorScoreBand {
  if (score === null) {
    return { label: "No Data", className: "bg-muted text-muted-foreground", description: "No feedback captured yet." };
  }
  if (score <= 20) {
    return { label: "Low Risk", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", description: "Consistently strong performance." };
  }
  if (score <= 40) {
    return { label: "Moderate Risk", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", description: "Occasional issues reported; monitor closely." };
  }
  if (score <= 70) {
    return { label: "High Risk", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", description: "Repeated shortfalls; corrective action recommended." };
  }
  return { label: "Critical", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", description: "Severe, recurring failures; review vendor engagement." };
}

export interface VendorFeedbackRow {
  overall_experience?: number | null;
  improvement_areas?: string[] | null;
}

export function rollupNegativeScore(rows: VendorFeedbackRow[]) {
  const list = (rows || []).filter((r) => r.overall_experience != null);
  if (list.length === 0) return { score: null as number | null, count: 0, areaCounts: {} as Record<string, number> };
  const total = list.reduce(
    (sum, r) => sum + feedbackPenalty(Number(r.overall_experience), r.improvement_areas || []),
    0,
  );
  const areaCounts: Record<string, number> = {};
  list.forEach((r) => (r.improvement_areas || []).forEach((a) => { areaCounts[a] = (areaCounts[a] || 0) + 1; }));
  return { score: Math.round(total / list.length), count: list.length, areaCounts };
}
