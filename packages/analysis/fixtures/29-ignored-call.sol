// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract IgnoredCall {
    function poke(address target, bytes calldata data) external {
        target.call(data);
    }
}
