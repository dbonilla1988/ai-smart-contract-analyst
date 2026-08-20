/**
 * Current V1 detector / indicator coverage for UI transparency.
 * Not a claim of comprehensive audit coverage.
 */
export const V1_DETECTOR_COVERAGE = [
  { id: "tx-origin", label: "tx.origin authentication patterns" },
  { id: "selfdestruct", label: "selfdestruct / suicide usage" },
  { id: "delegatecall", label: "delegatecall usage" },
  { id: "low-level-call", label: "low-level call / staticcall / callcode" },
  { id: "privileged-function", label: "privileged / admin function surface" },
  { id: "floating-pragma", label: "floating Solidity pragma" },
  { id: "unrestricted-mint-admin", label: "unrestricted mint / admin heuristics" },
  { id: "unchecked-external-call", label: "unchecked external call return handling" },
] as const;

export const V1_TOKEN_INDICATORS = [
  { id: "erc20-indicator", label: "ERC-20-like interface heuristic" },
  { id: "erc721-indicator", label: "ERC-721-like interface heuristic" },
] as const;

export const EXAMPLE_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract ExampleVault {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function withdraw(uint256 amount) external {
        require(tx.origin == owner, "not owner");
        payable(msg.sender).transfer(amount);
    }

    function mint(address to, uint256 amount) external {
        // unrestricted mint-style surface for demo detectors
        to;
        amount;
    }
}
`;
