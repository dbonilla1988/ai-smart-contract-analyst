import type { Finding } from "@asca/shared";
import type {
  ASTNode,
  FunctionDefinition,
} from "@solidity-parser/parser/dist/src/ast-types.js";
import type { Detector, DetectorContext } from "./types.js";
import {
  mentionsMsgSenderEqualsOwner,
  privilegedModifierNames,
} from "./accessControl.js";
import {
  buildFinding,
  evidenceFromLoc,
  functionLabel,
  makeFindingId,
  walkScoped,
} from "./utils.js";

export const privilegedFunctionDetector: Detector = {
  id: "privileged-function",
  title: "Privileged function surface",
  description: "Surfaces public/external functions with clear privilege guards.",
  run(ctx: DetectorContext): Finding[] {
    type Hit = {
      contract: string;
      functionName: string;
      reason: string;
      loc: FunctionDefinition["loc"];
    };
    const hits: Hit[] = [];

    walkScoped(ctx.parsed.ast, {
      FunctionDefinition(node, walkCtx) {
        if (node.visibility !== "public" && node.visibility !== "external") return;
        if (node.isConstructor || node.isReceiveEther || node.isFallback) return;

        const mods = privilegedModifierNames(node);
        if (mods.length === 0) return;
        hits.push({
          contract: walkCtx.contractName ?? "Unknown",
          functionName: functionLabel(node),
          reason: `modifier(s): ${mods.join(", ")}`,
          loc: node.loc,
        });
      },
      FunctionCall(node, walkCtx) {
        if (!walkCtx.functionNode) return;
        const fn = walkCtx.functionNode;
        if (fn.visibility !== "public" && fn.visibility !== "external") return;
        if (fn.isConstructor || fn.isReceiveEther || fn.isFallback) return;
        if (node.expression.type !== "Identifier") return;
        if (!["require", "assert"].includes(node.expression.name)) return;
        const arg = node.arguments[0] as ASTNode | undefined;
        if (!mentionsMsgSenderEqualsOwner(arg)) return;

        hits.push({
          contract: walkCtx.contractName ?? "Unknown",
          functionName: functionLabel(fn),
          reason: "require/assert msg.sender == owner/admin",
          loc: fn.loc,
        });
      },
    });

    const byContract = new Map<string, Hit[]>();
    for (const hit of hits) {
      const list = byContract.get(hit.contract) ?? [];
      if (!list.some((h) => h.functionName === hit.functionName && h.reason === hit.reason)) {
        list.push(hit);
        byContract.set(hit.contract, list);
      }
    }

    const findings: Finding[] = [];
    for (const [contract, list] of byContract) {
      const names = list.map((h) => `${h.functionName} (${h.reason})`);
      const related = list.map((h) => `${contract}.${h.functionName}`);

      findings.push(
        buildFinding({
          id: makeFindingId("privileged-function", ctx.source, contract),
          detectorId: "privileged-function",
          title: `Privileged/admin function surface in ${contract}`,
          severity: "informational",
          confidence: "high",
          category: "access-control",
          description: `Detected externally reachable function(s) with clear privilege guards in ${contract}: ${names.join("; ")}. This surfaces centralized/admin control for review and is not itself a vulnerability classification.`,
          remediation:
            "Document privileged roles, minimize admin surface, consider timelocks/multisigs for sensitive powers, and ensure events/audit logs cover privileged actions.",
          evidence: list.map((h) =>
            evidenceFromLoc(
              ctx.source,
              h.loc,
              `Privileged function ${h.functionName}: ${h.reason}`,
              `${contract}.${h.functionName}`,
            ),
          ),
          tags: ["privileged", "access-control", "informational", "heuristic"],
          relatedSymbols: related,
          source: "heuristic",
        }),
      );
    }

    return findings;
  },
};
