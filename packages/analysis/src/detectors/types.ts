import type { Finding, ContractUnit } from "@asca/shared";
import type { ParseSuccess } from "../parse/types.js";

export interface DetectorContext {
  source: string;
  parsed: ParseSuccess;
  units: ContractUnit[];
}

export interface Detector {
  /** Stable detector id, e.g. "tx-origin" */
  id: string;
  title: string;
  description: string;
  run: (ctx: DetectorContext) => Finding[];
}

export function createPlaceholderDetector(
  id: string,
  title: string,
  description: string,
): Detector {
  return {
    id,
    title,
    description,
    run: () => [],
  };
}
