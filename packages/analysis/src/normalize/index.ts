import type { Finding } from "@asca/shared";

/** Sort findings by severity rank then detector id for stable reports. */
const SEVERITY_RANK: Record<Finding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  informational: 4,
  note: 5,
};

export function normalizeFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const bySev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySev !== 0) return bySev;
    return a.id.localeCompare(b.id);
  });
}
