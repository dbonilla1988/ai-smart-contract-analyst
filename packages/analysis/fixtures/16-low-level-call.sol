// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract LowLevelCalls {
    function rawCall(address target, bytes calldata data) external returns (bool ok) {
        (ok, ) = target.call(data);
    }

    function rawStatic(address target, bytes calldata data) external view returns (bool ok) {
        (ok, ) = target.staticcall(data);
    }
}
