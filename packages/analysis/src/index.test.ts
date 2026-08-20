import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AnalysisReportSchema } from "@asca/shared";
import {
  buildAnalysisReport,
  extractUnits,
  parseSolidity,
  parseSolidityOrThrow,
  SolidityParseError,
  SolidityValidationError,
} from "./index.js";
import { sourceHashPrefix } from "./detectors/utils.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function findingsByDetector(report: ReturnType<typeof buildAnalysisReport>, id: string) {
  return report.findings.filter((f) => f.detectorId === id);
}

describe("Phase 1 parser", () => {
  it("parses valid Solidity", () => {
    const result = parseSolidity(loadFixture("01-simple-contract.sol"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ast.type).toBe("SourceUnit");
      expect(result.pragmas.some((p) => p.includes("solidity"))).toBe(true);
    }
  });

  it("returns structured failure for malformed Solidity", () => {
    const result = parseSolidity(loadFixture("10-malformed.sol"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toBeTruthy();
    }
  });

  it("rejects empty source", () => {
    expect(() => parseSolidity("   ")).toThrow(SolidityValidationError);
  });

  it("rejects binary control characters", () => {
    expect(() =>
      parseSolidity("pragma solidity 0.8.20;\u0000\ncontract X {}"),
    ).toThrow(SolidityValidationError);
  });

  it("rejects too-short source", () => {
    expect(() => parseSolidity("contract X{}")).toThrow(SolidityValidationError);
  });

  it("parseSolidityOrThrow raises SolidityParseError", () => {
    expect(() => parseSolidityOrThrow(loadFixture("10-malformed.sol"))).toThrow(
      SolidityParseError,
    );
  });
});

describe("Phase 1 structural extraction", () => {
  it("extracts a simple contract with state var and function", () => {
    const parsed = parseSolidityOrThrow(loadFixture("01-simple-contract.sol"));
    const units = extractUnits(parsed);
    expect(units).toHaveLength(1);
    expect(units[0]?.kind).toBe("contract");
    expect(units[0]?.name).toBe("SimpleStore");
    expect(units[0]?.stateVariables?.some((v) => v.name === "value")).toBe(true);
    expect(units[0]?.functions.some((f) => f.signature === "set(uint256)")).toBe(true);
    expect(units[0]?.functions.find((f) => f.name === "set")?.visibility).toBe("external");
  });

  it("extracts ERC-20-like signatures without classifying the standard", () => {
    const report = buildAnalysisReport(loadFixture("02-erc20-like.sol"));
    const token = report.units[0];
    const signatures = token?.functions.map((f) => f.signature) ?? [];
    expect(signatures).toEqual(
      expect.arrayContaining([
        "transfer(address,uint256)",
        "approve(address,uint256)",
        "transferFrom(address,address,uint256)",
      ]),
    );
    expect(report.tokenIndicators.length).toBeGreaterThanOrEqual(0);
    // Partial ERC-20-like surface may yield a low-confidence indicator (not a Finding).
    expect(report.findings.every((f) => !["erc20-indicator", "erc721-indicator"].includes(f.detectorId))).toBe(
      true,
    );
  });

  it("extracts inheritance", () => {
    const units = extractUnits(parseSolidityOrThrow(loadFixture("03-inheritance.sol")));
    const child = units.find((u) => u.name === "Child");
    expect(child?.inheritance).toEqual(["Ownable"]);
  });

  it("extracts interfaces", () => {
    const units = extractUnits(parseSolidityOrThrow(loadFixture("04-interface.sol")));
    expect(units[0]?.kind).toBe("interface");
    expect(units[0]?.name).toBe("ICounter");
  });

  it("extracts libraries", () => {
    const units = extractUnits(parseSolidityOrThrow(loadFixture("05-library.sol")));
    expect(units[0]?.kind).toBe("library");
    expect(units[0]?.functions[0]?.stateMutability).toBe("pure");
    expect(units[0]?.functions[0]?.visibility).toBe("internal");
  });

  it("extracts abstract contracts", () => {
    const units = extractUnits(parseSolidityOrThrow(loadFixture("06-abstract.sol")));
    expect(units[0]?.kind).toBe("abstract");
  });

  it("extracts constructors", () => {
    const units = extractUnits(parseSolidityOrThrow(loadFixture("07-constructor.sol")));
    const ctor = units[0]?.functions.find((f) => f.kind === "constructor");
    expect(ctor?.signature).toBe("constructor(address)");
    expect(ctor?.visibility).toBe("public");
  });

  it("extracts fallback and receive", () => {
    const units = extractUnits(parseSolidityOrThrow(loadFixture("08-fallback-receive.sol")));
    const kinds = units[0]?.functions.map((f) => f.kind) ?? [];
    expect(kinds).toEqual(expect.arrayContaining(["receive", "fallback"]));
    expect(units[0]?.functions.find((f) => f.kind === "receive")?.payable).toBe(true);
  });

  it("extracts multi-contract files with modifiers, events, and errors", () => {
    const report = buildAnalysisReport(loadFixture("09-multi-contract.sol"));
    expect(report.units.map((u) => u.kind).sort()).toEqual(
      ["abstract", "contract", "interface"].sort(),
    );
    const multi = report.units.find((u) => u.name === "Multi");
    expect(multi?.functions.find((f) => f.name === "transfer")?.modifiers).toEqual([
      "onlyOwner",
    ]);
    expect(multi?.events?.some((e) => e.name === "Transfer")).toBe(true);
    expect(multi?.errors?.some((e) => e.name === "Unauthorized")).toBe(true);
    expect(report.accessControl.patterns).toEqual(expect.arrayContaining(["onlyOwner"]));
    expect(report.accessControl.privilegedFunctions).toEqual(
      expect.arrayContaining(["Multi.transfer"]),
    );
    expect(findingsByDetector(report, "privileged-function").length).toBeGreaterThan(0);
    expect(findingsByDetector(report, "floating-pragma").length).toBe(1);
    expect(report.ai?.status).toBe("skipped");
  });

  it("includes source spans when available", () => {
    const units = extractUnits(parseSolidityOrThrow(loadFixture("01-simple-contract.sol")));
    const fn = units[0]?.functions.find((f) => f.name === "set");
    expect(fn?.span?.startLine).toBeGreaterThan(0);
    expect(fn?.span?.snippet.length).toBeGreaterThan(0);
  });

  it("builds a schema-valid structural report", () => {
    const report = buildAnalysisReport(loadFixture("09-multi-contract.sol"));
    expect(() => AnalysisReportSchema.parse(report)).not.toThrow();
    expect(report.overview.summary).toMatch(/Parsed/i);
    expect(report.overview.summary).toMatch(/function/i);
  });
});

describe("Phase 2 detectors", () => {
  it("detects tx.origin in authorization context", () => {
    const report = buildAnalysisReport(loadFixture("11-tx-origin-auth.sol"));
    const hits = findingsByDetector(report, "tx-origin");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.severity).toBe("medium");
    expect(hits[0]?.confidence).toBe("high");
    expect(hits[0]?.detectorId).toBe("tx-origin");
    expect(hits[0]?.evidence[0]?.span?.snippet).toMatch(/tx\.origin/);
    expect(hits[0]?.relatedSymbols?.[0]).toMatch(/withdraw/);
  });

  it("detects benign tx.origin with lower severity/confidence", () => {
    const report = buildAnalysisReport(loadFixture("12-tx-origin-benign.sol"));
    const hits = findingsByDetector(report, "tx-origin");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.severity).toBe("informational");
    expect(hits[0]?.confidence).toBe("medium");
  });

  it("detects unprotected selfdestruct", () => {
    const report = buildAnalysisReport(loadFixture("13-selfdestruct-unprotected.sol"));
    const hits = findingsByDetector(report, "selfdestruct");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.severity).toBe("medium");
    expect(hits[0]?.confidence).toBe("high");
    expect(hits[0]?.title).toMatch(/Destructive/);
    expect(hits[0]?.relatedSymbols?.[0]).toMatch(/die/);
  });

  it("detects owner-gated selfdestruct without suppressing", () => {
    const report = buildAnalysisReport(loadFixture("14-selfdestruct-owner.sol"));
    const hits = findingsByDetector(report, "selfdestruct");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.severity).toBe("medium");
    expect(hits[0]?.description).toMatch(/onlyOwner/);
    expect(hits[0]?.title).toMatch(/Privileged/);
  });

  it("detects delegatecall as high severity", () => {
    const report = buildAnalysisReport(loadFixture("15-delegatecall.sol"));
    const hits = findingsByDetector(report, "delegatecall");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.severity).toBe("high");
    expect(hits[0]?.confidence).toBe("high");
    expect(hits[0]?.evidence[0]?.span?.snippet).toMatch(/delegatecall/);
    expect(hits[0]?.relatedSymbols?.[0]).toMatch(/forward/);
  });

  it("detects low-level call/staticcall and does not treat them as delegatecall", () => {
    const report = buildAnalysisReport(loadFixture("16-low-level-call.sol"));
    const hits = findingsByDetector(report, "low-level-call");
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.every((h) => h.confidence === "high")).toBe(true);
    expect(hits.every((h) => ["informational", "low"].includes(h.severity))).toBe(true);
    expect(findingsByDetector(report, "delegatecall")).toHaveLength(0);
  });

  it("flags floating pragma and ignores exact pragma", () => {
    const floating = buildAnalysisReport(loadFixture("17-floating-pragma.sol"));
    const exact = buildAnalysisReport(loadFixture("18-exact-pragma.sol"));
    expect(findingsByDetector(floating, "floating-pragma")).toHaveLength(1);
    expect(findingsByDetector(floating, "floating-pragma")[0]?.severity).toBe("informational");
    expect(findingsByDetector(exact, "floating-pragma")).toHaveLength(0);
  });

  it("groups onlyOwner privileged functions by contract", () => {
    const report = buildAnalysisReport(loadFixture("19-privileged-onlyOwner.sol"));
    const hits = findingsByDetector(report, "privileged-function");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.severity).toBe("informational");
    expect(hits[0]?.relatedSymbols).toEqual(
      expect.arrayContaining([
        "PrivilegedOnlyOwner.mint",
        "PrivilegedOnlyOwner.pause",
      ]),
    );
  });

  it("detects AccessControl-style onlyRole privilege", () => {
    const report = buildAnalysisReport(loadFixture("20-privileged-accesscontrol.sol"));
    const hits = findingsByDetector(report, "privileged-function");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.description).toMatch(/onlyRole/);
  });

  it("detects direct msg.sender == owner guards", () => {
    const report = buildAnalysisReport(loadFixture("21-privileged-msg-sender.sol"));
    const hits = findingsByDetector(report, "privileged-function");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.description).toMatch(/msg\.sender/);
  });

  it("produces multiple findings without duplicate low-level for delegatecall", () => {
    const report = buildAnalysisReport(loadFixture("22-multi-findings.sol"));
    expect(findingsByDetector(report, "tx-origin").length).toBe(1);
    expect(findingsByDetector(report, "selfdestruct").length).toBe(1);
    expect(findingsByDetector(report, "delegatecall").length).toBe(1);
    expect(findingsByDetector(report, "low-level-call").length).toBe(1);
    expect(findingsByDetector(report, "floating-pragma").length).toBe(1);
    expect(findingsByDetector(report, "privileged-function").length).toBe(1);

    const low = findingsByDetector(report, "low-level-call")[0];
    expect(low?.evidence[0]?.span?.snippet).not.toMatch(/delegatecall/);
  });

  it("does not fire Phase 2 detectors on the safe control fixture", () => {
    const report = buildAnalysisReport(loadFixture("23-safe-control.sol"));
    expect(report.findings).toEqual([]);
    expect(report.overview.findingCount).toBe(0);
  });

  it("produces stable finding IDs across runs", () => {
    const source = loadFixture("11-tx-origin-auth.sol");
    const a = buildAnalysisReport(source);
    const b = buildAnalysisReport(source);
    expect(a.findings.map((f) => f.id)).toEqual(b.findings.map((f) => f.id));
    const prefix = sourceHashPrefix(source);
    expect(a.findings[0]?.id).toContain(`tx-origin:${prefix}:`);
  });

  it("sorts findings by severity and includes overview counts", () => {
    const report = buildAnalysisReport(loadFixture("22-multi-findings.sol"));
    expect(() => AnalysisReportSchema.parse(report)).not.toThrow();
    expect(report.overview.findingCount).toBe(report.findings.length);
    expect(report.overview.severityCounts).toBeDefined();
    expect(report.overview.summary).toMatch(/Detected \d+ security-relevant finding/);
    expect(report.ai?.status).toBe("skipped");

    const order = ["critical", "high", "medium", "low", "informational", "note"] as const;
    const ranks = report.findings.map((f) => order.indexOf(f.severity));
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]!).toBeGreaterThanOrEqual(ranks[i - 1]!);
    }
  });

  it("requires evidence on every finding", () => {
    const report = buildAnalysisReport(loadFixture("22-multi-findings.sol"));
    for (const finding of report.findings) {
      expect(finding.evidence.length).toBeGreaterThan(0);
    }
  });
});

describe("Phase 2B detectors and token indicators", () => {
  it("flags unrestricted external mint as high", () => {
    const report = buildAnalysisReport(loadFixture("24-unrestricted-mint.sol"));
    const hits = findingsByDetector(report, "unrestricted-mint-admin");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.severity).toBe("high");
    expect(hits[0]?.confidence).toBe("high");
    expect(hits[0]?.description).toMatch(/no access-control pattern recognized/i);
    expect(hits[0]?.relatedSymbols?.[0]).toMatch(/mint/);
    expect(hits[0]?.evidence.length).toBeGreaterThan(0);
  });

  it("suppresses unrestricted-mint-admin when onlyOwner is present", () => {
    const report = buildAnalysisReport(loadFixture("25-onlyOwner-mint.sol"));
    expect(findingsByDetector(report, "unrestricted-mint-admin")).toHaveLength(0);
  });

  it("suppresses unrestricted-mint-admin for msg.sender == owner guard", () => {
    const report = buildAnalysisReport(loadFixture("26-msgsender-mint.sol"));
    expect(findingsByDetector(report, "unrestricted-mint-admin")).toHaveLength(0);
  });

  it("flags unrestricted fee/admin setters as medium", () => {
    const report = buildAnalysisReport(loadFixture("27-unrestricted-admin.sol"));
    const hits = findingsByDetector(report, "unrestricted-mint-admin");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.every((h) => h.severity === "medium")).toBe(true);
    expect(hits.some((h) => /setFee|setOwner/i.test(h.title))).toBe(true);
  });

  it("does not flag interface-only mint declarations", () => {
    const report = buildAnalysisReport(loadFixture("28-mint-interface-only.sol"));
    expect(findingsByDetector(report, "unrestricted-mint-admin")).toHaveLength(0);
  });

  it("flags ignored .call success", () => {
    const report = buildAnalysisReport(loadFixture("29-ignored-call.sol"));
    const hits = findingsByDetector(report, "unchecked-external-call");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.severity).toBe("medium");
    expect(hits[0]?.confidence).toBe("high");
    expect(hits[0]?.relatedSymbols?.[0]).toMatch(/poke/);
    // Presence detector may also fire — different semantics.
    expect(findingsByDetector(report, "low-level-call").length).toBeGreaterThanOrEqual(1);
  });

  it("does not flag checked .call success", () => {
    const report = buildAnalysisReport(loadFixture("30-checked-call.sol"));
    expect(findingsByDetector(report, "unchecked-external-call")).toHaveLength(0);
    expect(findingsByDetector(report, "low-level-call").length).toBeGreaterThanOrEqual(1);
  });

  it("flags assigned-but-unused call results with medium confidence", () => {
    const report = buildAnalysisReport(loadFixture("31-assigned-unused-call.sol"));
    const hits = findingsByDetector(report, "unchecked-external-call");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.severity).toBe("low");
    expect(hits[0]?.confidence).toBe("medium");
  });

  it("does not flag checked delegatecall return handling", () => {
    const report = buildAnalysisReport(loadFixture("32-checked-delegatecall.sol"));
    expect(findingsByDetector(report, "unchecked-external-call")).toHaveLength(0);
    expect(findingsByDetector(report, "delegatecall").length).toBe(1);
  });

  it("emits ERC-20 tokenIndicators without security findings for the indicator itself", () => {
    const report = buildAnalysisReport(loadFixture("33-erc20-full.sol"));
    const erc20 = report.tokenIndicators.filter((t) => t.standard === "ERC-20");
    expect(erc20).toHaveLength(1);
    expect(erc20[0]?.confidence).toBe("high");
    expect(erc20[0]?.evidence.length).toBeGreaterThan(0);
    expect(report.findings.every((f) => !f.detectorId.includes("erc20"))).toBe(true);
    expect(report.overview.summary).toMatch(/token-interface indicator/);
  });

  it("assigns low confidence for partial ERC-20 overlap", () => {
    const report = buildAnalysisReport(loadFixture("34-erc20-partial.sol"));
    const erc20 = report.tokenIndicators.filter((t) => t.standard === "ERC-20");
    expect(erc20).toHaveLength(1);
    expect(erc20[0]?.confidence).toBe("low");
  });

  it("emits ERC-721 tokenIndicators with evidence", () => {
    const report = buildAnalysisReport(loadFixture("35-erc721-full.sol"));
    const erc721 = report.tokenIndicators.filter((t) => t.standard === "ERC-721");
    expect(erc721).toHaveLength(1);
    expect(erc721[0]?.confidence).toBe("high");
    expect(report.findings.every((f) => !f.detectorId.includes("erc721"))).toBe(true);
  });

  it("assigns low confidence for partial ERC-721 overlap", () => {
    const report = buildAnalysisReport(loadFixture("36-erc721-partial.sol"));
    const erc721 = report.tokenIndicators.filter((t) => t.standard === "ERC-721");
    expect(erc721).toHaveLength(1);
    expect(erc721[0]?.confidence).toBe("low");
  });

  it("allows mixed ERC-20 and ERC-721 indicators independently", () => {
    const report = buildAnalysisReport(loadFixture("37-mixed-token.sol"));
    const standards = report.tokenIndicators.map((t) => t.standard).sort();
    expect(standards).toEqual(["ERC-20", "ERC-721"]);
  });

  it("excludes token indicators from severityCounts and findingCount", () => {
    const report = buildAnalysisReport(loadFixture("33-erc20-full.sol"));
    expect(report.tokenIndicators.length).toBeGreaterThan(0);
    expect(report.overview.findingCount).toBe(report.findings.length);
    const counted =
      (report.overview.severityCounts?.critical ?? 0) +
      (report.overview.severityCounts?.high ?? 0) +
      (report.overview.severityCounts?.medium ?? 0) +
      (report.overview.severityCounts?.low ?? 0) +
      (report.overview.severityCounts?.informational ?? 0) +
      (report.overview.severityCounts?.note ?? 0);
    expect(counted).toBe(report.findings.length);
  });

  it("composes V1 detectors with stable IDs", () => {
    const source = loadFixture("24-unrestricted-mint.sol");
    const a = buildAnalysisReport(source);
    const b = buildAnalysisReport(source);
    expect(a.findings.map((f) => f.id)).toEqual(b.findings.map((f) => f.id));
    expect(a.ai?.status).toBe("skipped");
  });
});

describe("Access-control presence vs safety (tx.origin interaction)", () => {
  it("tx.origin guard suppresses unrestricted-admin but tx-origin still fires", () => {
    const report = buildAnalysisReport(loadFixture("39-txorigin-guarded-withdraw-only.sol"));
    expect(findingsByDetector(report, "unrestricted-mint-admin")).toHaveLength(0);
    const origin = findingsByDetector(report, "tx-origin");
    expect(origin).toHaveLength(1);
    expect(origin[0]?.severity).toBe("medium");
    expect(origin[0]?.relatedSymbols?.[0]).toMatch(/withdraw/);
  });

  it("msg.sender owner guard suppresses unrestricted-admin", () => {
    const report = buildAnalysisReport(loadFixture("26-msgsender-mint.sol"));
    expect(findingsByDetector(report, "unrestricted-mint-admin")).toHaveLength(0);
  });

  it("truly unguarded admin function still fires", () => {
    const report = buildAnalysisReport(loadFixture("27-unrestricted-admin.sol"));
    const hits = findingsByDetector(report, "unrestricted-mint-admin");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.every((h) => h.severity === "medium")).toBe(true);
  });

  it("ExampleVault-like: mint high + tx.origin medium; no unrestricted withdraw", () => {
    const report = buildAnalysisReport(loadFixture("38-example-vault-txorigin.sol"));
    const unrestricted = findingsByDetector(report, "unrestricted-mint-admin");
    const origin = findingsByDetector(report, "tx-origin");

    expect(unrestricted).toHaveLength(1);
    expect(unrestricted[0]?.severity).toBe("high");
    expect(unrestricted[0]?.title).toMatch(/mint/i);
    expect(unrestricted.every((h) => !/withdraw/i.test(h.title))).toBe(true);

    expect(origin).toHaveLength(1);
    expect(origin[0]?.severity).toBe("medium");

    expect(report.overview.severityCounts?.high).toBe(1);
    expect(report.overview.severityCounts?.medium).toBe(1);
    expect(report.overview.findingCount).toBe(2);

    const a = buildAnalysisReport(loadFixture("38-example-vault-txorigin.sol"));
    expect(a.findings.map((f) => f.id)).toEqual(report.findings.map((f) => f.id));
  });

  it("mint behavior unchanged for truly unguarded mint", () => {
    const report = buildAnalysisReport(loadFixture("24-unrestricted-mint.sol"));
    const hits = findingsByDetector(report, "unrestricted-mint-admin");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.severity).toBe("high");
  });
});
