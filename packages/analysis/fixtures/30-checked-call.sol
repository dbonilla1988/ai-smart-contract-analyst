// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract CheckedCall {
    function poke(address target, bytes calldata data) external returns (bytes memory ret) {
        (bool ok, bytes memory result) = target.call(data);
        require(ok, "call failed");
        return result;
    }
}
