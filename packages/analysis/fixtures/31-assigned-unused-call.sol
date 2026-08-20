// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract AssignedUnusedCall {
    function poke(address target, bytes calldata data) external {
        (bool ok, ) = target.call(data);
        // ok never checked
        ok;
    }
}
