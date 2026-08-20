// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract CheckedDelegatecall {
    address public impl;

    constructor(address _impl) {
        impl = _impl;
    }

    function forward(bytes calldata data) external returns (bytes memory ret) {
        (bool ok, bytes memory result) = impl.delegatecall(data);
        require(ok, "delegatecall failed");
        return result;
    }
}
