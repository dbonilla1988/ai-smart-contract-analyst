import { describe, expect, it } from "vitest";
import {
  AnalysisReportSchema,
  FindingSchema,
  FunctionSummarySchema,
  SeveritySchema,
} from "./schemas.js";

describe("@asca/shared schemas", () => {
  it("accepts severity informational", () => {
    expect(SeveritySchema.parse("informational")).toBe("informational");
  });

  it("rejects ai as a finding source", () => {
    const result = FindingSchema.safeParse({
      id: "x",
      detectorId: "tx-origin",
      title: "t",
      severity: "high",
      confidence: "high",
      category: "access-control",
      description: "d",
      remediation: "r",
      evidence: [],
      tags: [],
      source: "ai_interpretation",
    });
    expect(result.success).toBe(false);
  });

  it("accepts extended function summaries", () => {
    const fn = FunctionSummarySchema.parse({
      name: "transfer",
      kind: "function",
      visibility: "public",
      stateMutability: "nonpayable",
      modifiers: ["onlyOwner"],
      payable: false,
      parameters: ["address", "uint256"],
      signature: "transfer(address,uint256)",
    });
    expect(fn.signature).toBe("transfer(address,uint256)");
  });

  it("parses a minimal AnalysisReport", () => {
    const report = AnalysisReportSchema.parse({
      reportId: "rpt_test",
      createdAt: new Date().toISOString(),
      input: {
        language: "solidity",
        byteLength: 12,
        hash: "abc",
      },
      overview: {
        summary: "Parsed 1 contract and 0 functions.",
        contractCount: 1,
        detectorVersion: "0.1.0-phase1",
      },
      units: [],
      accessControl: { patterns: [], privilegedFunctions: [] },
      externalCalls: { count: 0, items: [] },
      tokenIndicators: [],
      findings: [],
      ai: {
        status: "ok",
        summary: "No findings",
        interpretation: "Limited coverage",
        priorityActions: ["Review limitations"],
        riskThemes: [],
        citedFindingIds: [],
        model: "stub",
      },
      limitations: ["Phase 1 structural extraction"],
    });
    expect(report.reportId).toBe("rpt_test");
    expect(report.ai?.summary).toBe("No findings");
  });
});
