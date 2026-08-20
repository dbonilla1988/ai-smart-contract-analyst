// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract UnrestrictedFeeAdmin {
    uint256 public protocolFee;

    function setFee(uint256 fee) external {
        protocolFee = fee;
    }

    function setOwner(address next) public {
        // owner not declared; still an admin-style name for the heuristic
        next;
    }
}
