// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// Control fixture: no Phase 2 detector patterns.
contract SafeControl {
    uint256 public value;

    function set(uint256 newValue) external {
        value = newValue;
    }
}
