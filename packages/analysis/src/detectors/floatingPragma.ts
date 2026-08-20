import type { Finding } from "@asca/shared";
import type { Detector, DetectorContext } from "./types.js";
import { buildFinding, evidenceFromLoc, makeFindingId, walkScoped } from "./utils.js";

function isFloatingPragmaValue(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  // Exact version like 0.8.27 or =0.8.27
  if (/^=?\s*\d+\.\d+\.\d+\s*$/.test(v)) return false;
  // Floating markers
  return /[\^~><=]/.test(v) || /\s+-\s+/.test(v) || /\|\|/.test(v);
}

export const floatingPragmaDetector: Detector = {
  id: "floating-pragma",
  title: "Floating Solidity pragma",
  description: "Detects non-exact compiler version constraints.",
  run(ctx: DetectorContext): Finding[] {
    const findings: Finding[] = [];

    walkScoped(ctx.parsed.ast, {
      PragmaDirective(node) {
        if (node.name !== "solidity") return;
        const value = node.value?.trim() ?? "";
        if (!isFloatingPragmaValue(value)) return;

        const line = node.loc?.start.line ?? 0;
        findings.push(
          buildFinding({
            id: makeFindingId("floating-pragma", ctx.source, line || value),
            detectorId: "floating-pragma",
            title: "Floating Solidity compiler constraint",
            severity: "informational",
            confidence: "high",
            category: "build-reproducibility",
            description: `Detected floating Solidity pragma constraint "${value}". Floating ranges can reduce reproducibility across build and audit environments. This is not an exploitable vulnerability by itself.`,
            remediation:
              "Pin an exact compiler version in pragma (for example `pragma solidity 0.8.27;`) and lock the same version in build tooling.",
            evidence: [
              evidenceFromLoc(
                ctx.source,
                node.loc,
                `floating pragma solidity ${value}`,
              ),
            ],
            tags: ["pragma", "reproducibility", "informational", "deterministic"],
          }),
        );
      },
    });

    // Also catch floating pragmas from extracted text if AST omitted oddly
    if (findings.length === 0) {
      for (const pragma of ctx.parsed.pragmas) {
        const m = /^solidity\s+(.+)$/i.exec(pragma.trim());
        if (!m?.[1] || !isFloatingPragmaValue(m[1])) continue;
        findings.push(
          buildFinding({
            id: makeFindingId("floating-pragma", ctx.source, m[1]),
            detectorId: "floating-pragma",
            title: "Floating Solidity compiler constraint",
            severity: "informational",
            confidence: "high",
            category: "build-reproducibility",
            description: `Detected floating Solidity pragma constraint "${m[1]}". Floating ranges can reduce reproducibility across build and audit environments. This is not an exploitable vulnerability by itself.`,
            remediation:
              "Pin an exact compiler version in pragma and lock the same version in build tooling.",
            evidence: [
              {
                kind: "pattern_match",
                description: `pragma ${pragma}`,
              },
            ],
            tags: ["pragma", "reproducibility", "informational", "deterministic"],
          }),
        );
      }
    }

    return findings;
  },
};
