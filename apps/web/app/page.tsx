"use client";

import { useMemo, useState } from "react";
import type {
  AnalysisReport,
  AiInterpretation,
  ContractUnit,
  Finding,
  FunctionSummary,
  Severity,
} from "@asca/shared";
import {
  EXAMPLE_CONTRACT,
  V1_DETECTOR_COVERAGE,
  V1_TOKEN_INDICATORS,
} from "../lib/coverage";

const DISCLAIMER =
  "Experimental developer tool for identifying and explaining potential smart-contract risks. Results are not a substitute for a professional security audit.";

const FINDINGS_TRUST =
  "Findings are produced by deterministic and heuristic rules with limited coverage. Absence of findings does not imply security.";

const PRIVACY_NOTE =
  "Source is analyzed server-side. Full source is not sent to the AI layer — only bounded finding/evidence data may be sent to the configured AI provider when AI interpretation is enabled. Do not paste proprietary/private contracts unless you are comfortable with server-side analysis.";

function formatFunction(fn: FunctionSummary): string {
  const sig = fn.signature ?? fn.name;
  const bits = [sig, fn.visibility];
  if (fn.stateMutability && fn.stateMutability !== "nonpayable") {
    bits.push(fn.stateMutability);
  }
  if (fn.modifiers && fn.modifiers.length > 0) {
    bits.push(`modifiers: ${fn.modifiers.join(", ")}`);
  }
  return bits.join(" · ");
}

function byteLengthUtf8(text: string): number {
  return new TextEncoder().encode(text).length;
}

function UnitBlock({ unit }: { unit: ContractUnit }) {
  return (
    <article className="unit">
      <h3>
        {unit.kind}: {unit.name}
      </h3>
      {unit.inheritance.length > 0 ? (
        <p className="meta">
          Inheritance: {unit.name} → {unit.inheritance.join(", ")}
        </p>
      ) : null}
      <h4>Functions</h4>
      {unit.functions.length === 0 ? (
        <p className="empty">None</p>
      ) : (
        <ul>
          {unit.functions.map((fn) => (
            <li key={`${unit.name}:${fn.kind}:${fn.signature ?? fn.name}`}>
              <code>{formatFunction(fn)}</code>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function severityLabel(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "CRITICAL";
    case "high":
      return "HIGH";
    case "medium":
      return "MEDIUM";
    case "low":
      return "LOW";
    case "informational":
      return "INFO";
    case "note":
      return "NOTE";
  }
}

function SeverityTally({ report }: { report: AnalysisReport }) {
  const counts = report.overview.severityCounts ?? {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
    note: 0,
  };
  return (
    <p className="severity-tally" aria-label="Severity counts">
      <span>HIGH {counts.high}</span>
      <span>MEDIUM {counts.medium}</span>
      <span>LOW {counts.low}</span>
      <span>INFO {counts.informational}</span>
    </p>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const symbol =
    finding.relatedSymbols?.[0] ??
    finding.evidence.find((e) => e.symbol)?.symbol ??
    null;
  return (
    <article className="finding">
      <div className="finding-header">
        <span className={`sev sev-${finding.severity}`}>{severityLabel(finding.severity)}</span>
        <h4>{finding.title}</h4>
      </div>
      <p className="finding-badge">Deterministic / Heuristic Finding</p>
      <p>{finding.description}</p>
      <p className="meta">
        Confidence: {finding.confidence}
        {symbol ? ` · Affected: ${symbol}` : null}
      </p>
      <h5>Evidence</h5>
      <ul>
        {finding.evidence.map((ev, idx) => (
          <li key={`${finding.id}:ev:${idx}`}>
            {ev.description}
            {ev.span?.snippet ? (
              <pre className="evidence-snippet">{ev.span.snippet}</pre>
            ) : null}
          </li>
        ))}
      </ul>
      <h5>Recommendation</h5>
      <p>{finding.remediation}</p>
    </article>
  );
}

function TokenIndicatorsSection({ report }: { report: AnalysisReport }) {
  return (
    <section>
      <h3>Detected Standards / Token Interfaces</h3>
      <p className="meta">
        Interface indicators are heuristic and do not prove standards compliance.
      </p>
      {report.tokenIndicators.length === 0 ? (
        <p className="empty">No token-interface indicators detected.</p>
      ) : (
        report.tokenIndicators.map((indicator, idx) => (
          <article
            className="token-indicator"
            key={`${indicator.standard}:${indicator.confidence}:${idx}`}
          >
            <h4>{indicator.standard}-like</h4>
            <p className="meta">Confidence: {indicator.confidence}</p>
            <h5>Evidence</h5>
            <ul>
              {indicator.evidence.map((ev, evIdx) => (
                <li key={`${indicator.standard}:ev:${evIdx}`}>{ev.description}</li>
              ))}
            </ul>
          </article>
        ))
      )}
    </section>
  );
}

function aiStatusNote(ai: AiInterpretation | undefined): string | null {
  if (!ai) return null;
  if (ai.status === "skipped") {
    return ai.interpretation ?? "AI explanation was skipped.";
  }
  if (ai.status === "failed") {
    return (
      ai.interpretation ??
      "AI explanation failed. Deterministic findings below are unchanged."
    );
  }
  return null;
}

function AiInterpretationSection({ ai }: { ai: AiInterpretation | undefined }) {
  if (!ai) return null;

  const note = aiStatusNote(ai);

  return (
    <section className="ai-section">
      <h3>AI Interpretation</h3>
      <p className="finding-badge">AI-assisted explanation of deterministic findings</p>
      <p className="meta">
        The AI layer does not create or validate security findings.
      </p>

      {ai.status !== "ok" ? (
        <p className="ai-status">{note}</p>
      ) : (
        <div className="ai-body">
          {ai.summary ? (
            <>
              <h4>Summary</h4>
              <p>{ai.summary}</p>
            </>
          ) : null}

          {ai.riskThemes && ai.riskThemes.length > 0 ? (
            <>
              <h4>Risk themes</h4>
              <ul>
                {ai.riskThemes.map((theme, idx) => (
                  <li key={`theme:${idx}:${theme.title}`}>
                    <strong>{theme.title}</strong>
                    <p>{theme.explanation}</p>
                    <p className="meta">Cites: {theme.findingIds.join(", ")}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {ai.priorityActions && ai.priorityActions.length > 0 ? (
            <>
              <h4>Priority actions</h4>
              <ul>
                {ai.priorityActions.map((action, idx) => (
                  <li key={`action:${idx}`}>{action}</li>
                ))}
              </ul>
            </>
          ) : null}

          {ai.interpretation ? (
            <>
              <h4>Narrative</h4>
              <p>{ai.interpretation}</p>
            </>
          ) : null}

          {ai.model ? <p className="meta">Model: {ai.model}</p> : null}
        </div>
      )}
    </section>
  );
}

function CoverageSection() {
  return (
    <section>
      <h3>Current V1 coverage</h3>
      <p className="meta">
        Limited deterministic/heuristic checks — not comprehensive audit coverage.
      </p>
      <h4>Security detectors</h4>
      <ul>
        {V1_DETECTOR_COVERAGE.map((d) => (
          <li key={d.id}>
            <code>{d.id}</code> — {d.label}
          </li>
        ))}
      </ul>
      <h4>Token-interface heuristics</h4>
      <ul>
        {V1_TOKEN_INDICATORS.map((d) => (
          <li key={d.id}>
            <code>{d.id}</code> — {d.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

type ApiErrorPayload = {
  error?: { code?: string; message?: string } | string;
  message?: string;
};

function readApiError(data: ApiErrorPayload, fallback: string): string {
  if (data.error && typeof data.error === "object" && data.error.message) {
    return data.error.message;
  }
  if (typeof data.error === "string") return data.error;
  if (data.message) return data.message;
  return fallback;
}

export default function HomePage() {
  const [source, setSource] = useState<string>(EXAMPLE_CONTRACT);
  const [includeAi, setIncludeAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);

  const chars = source.length;
  const bytes = useMemo(() => byteLengthUtf8(source), [source]);

  async function onAnalyze() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          options: { includeAiInterpretation: includeAi },
        }),
      });
      const data = (await res.json()) as AnalysisReport | ApiErrorPayload;
      if (!res.ok) {
        throw new Error(readApiError(data as ApiErrorPayload, "Analyze request failed"));
      }
      setReport(data as AnalysisReport);
    } catch (err) {
      // Keep any prior deterministic report visible on client/network errors.
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  function onClear() {
    if (loading) return;
    setSource("");
    setError(null);
    setReport(null);
  }

  function onLoadExample() {
    if (loading) return;
    setSource(EXAMPLE_CONTRACT);
    setError(null);
  }

  return (
    <main>
      <h1>AI Smart Contract Analyst</h1>
      <p className="subtitle">
        Deterministic-first Solidity analysis with an optional grounded AI explanation.
      </p>

      <section className="panel">
        <label htmlFor="solidity-source">Solidity source</label>
        <textarea
          id="solidity-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
          disabled={loading}
        />
        <p className="meta source-stats">
          {chars.toLocaleString()} characters · {bytes.toLocaleString()} bytes
        </p>
        <label className="checkbox-row" htmlFor="include-ai">
          <input
            id="include-ai"
            type="checkbox"
            checked={includeAi}
            disabled={loading}
            onChange={(e) => setIncludeAi(e.target.checked)}
          />
          Include AI interpretation
        </label>
        <div className="actions">
          <button type="button" onClick={onAnalyze} disabled={loading || !source.trim()}>
            {loading ? "Analyzing…" : "Analyze Contract"}
          </button>
          <button type="button" className="secondary" onClick={onLoadExample} disabled={loading}>
            Load example
          </button>
          <button type="button" className="secondary" onClick={onClear} disabled={loading}>
            Clear
          </button>
        </div>
        <p className="disclaimer">{DISCLAIMER}</p>
        <p className="disclaimer">{PRIVACY_NOTE}</p>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="report panel" aria-live="polite">
        <h2>Report</h2>
        {!report ? (
          <p className="empty">No report yet. Paste Solidity and run Analyze Contract.</p>
        ) : (
          <div className="structural-report">
            <section>
              <h3>Contract Overview</h3>
              <p>{report.overview.summary}</p>
              <p className="meta">
                Units: {report.overview.contractCount} · Detector version:{" "}
                {report.overview.detectorVersion}
                {typeof report.overview.findingCount === "number"
                  ? ` · Findings: ${report.overview.findingCount}`
                  : null}
              </p>
              <p className="disclaimer">{FINDINGS_TRUST}</p>
            </section>

            <section>
              <h3>Security Findings</h3>
              <SeverityTally report={report} />
              {report.findings.length === 0 ? (
                <p className="empty">
                  No security findings from the current detector suite. {FINDINGS_TRUST}
                </p>
              ) : (
                report.findings.map((finding) => (
                  <FindingCard key={finding.id} finding={finding} />
                ))
              )}
            </section>

            <AiInterpretationSection ai={report.ai} />

            <TokenIndicatorsSection report={report} />

            <CoverageSection />

            <section>
              <h3>Detected Units</h3>
              <ul>
                {report.units.map((unit) => (
                  <li key={`${unit.kind}:${unit.name}`}>
                    {unit.kind}: {unit.name}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3>Inheritance</h3>
              {report.units.every((u) => u.inheritance.length === 0) ? (
                <p className="empty">No inheritance relationships detected.</p>
              ) : (
                <ul>
                  {report.units
                    .filter((u) => u.inheritance.length > 0)
                    .map((u) => (
                      <li key={`inh:${u.name}`}>
                        {u.name} → {u.inheritance.join(", ")}
                      </li>
                    ))}
                </ul>
              )}
            </section>

            <section>
              <h3>Unit Details</h3>
              {report.units.map((unit) => (
                <UnitBlock key={`detail:${unit.kind}:${unit.name}`} unit={unit} />
              ))}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
