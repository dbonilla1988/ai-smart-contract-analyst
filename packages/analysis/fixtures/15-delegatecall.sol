// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract DelegateTarget {
    function ping() external {}
}

contract UsesDelegatecall {
    address public impl;

    constructor(address _impl) {
        impl = _impl;
    }

    function forward(bytes calldata data) external returns (bool ok, bytes memory ret) {
        (ok, ret) = impl.delegatecall(data);
    }
}
