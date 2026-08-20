// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MultiFindingSurface {
    address public owner;
    address public impl;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address _impl) {
        owner = msg.sender;
        impl = _impl;
    }

    function authWithOrigin() external {
        require(tx.origin == owner, "bad origin");
    }

    function destroy() external onlyOwner {
        selfdestruct(payable(owner));
    }

    function proxy(bytes calldata data) external onlyOwner returns (bool ok, bytes memory ret) {
        (ok, ret) = impl.delegatecall(data);
    }

    function poke(address target) external returns (bool ok) {
        (ok, ) = target.call("");
    }
}
