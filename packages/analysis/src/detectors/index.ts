import type { Detector } from "./types.js";
import { txOriginDetector } from "./txOrigin.js";
import { selfdestructDetector } from "./selfdestruct.js";
import { delegatecallDetector } from "./delegatecall.js";
import { lowLevelCallDetector } from "./lowLevelCall.js";
import { privilegedFunctionDetector } from "./privilegedFunction.js";
import { floatingPragmaDetector } from "./floatingPragma.js";
import { unrestrictedMintAdminDetector } from "./unrestrictedMintAdmin.js";
import { uncheckedExternalCallDetector } from "./uncheckedExternalCall.js";

/**
 * Security detector registry (V1 complete).
 * ERC-20 / ERC-721 live in indicators/ — not Finding producers.
 */
export const DETECTOR_IDS = [
  "tx-origin",
  "selfdestruct",
  "low-level-call",
  "delegatecall",
  "privileged-function",
  "unrestricted-mint-admin",
  "floating-pragma",
  "unchecked-external-call",
] as const;

export type DetectorId = (typeof DETECTOR_IDS)[number];

export const IMPLEMENTED_DETECTOR_IDS = DETECTOR_IDS;

/** Legacy catalog IDs retained for docs/tests that still name the indicator path. */
export const INDICATOR_IDS = ["erc20-indicator", "erc721-indicator"] as const;

export const detectors: Detector[] = [
  txOriginDetector,
  selfdestructDetector,
  delegatecallDetector,
  lowLevelCallDetector,
  privilegedFunctionDetector,
  floatingPragmaDetector,
  unrestrictedMintAdminDetector,
  uncheckedExternalCallDetector,
];

export function runDetectors(
  ...args: Parameters<Detector["run"]>
): ReturnType<Detector["run"]> {
  return detectors.flatMap((d) => d.run(...args));
}

export type { Detector, DetectorContext } from "./types.js";
export { createPlaceholderDetector } from "./types.js";
