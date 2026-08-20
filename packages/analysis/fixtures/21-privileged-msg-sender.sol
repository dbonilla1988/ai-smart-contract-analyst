// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract PrivilegedMsgSenderGuard {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function configure(uint256 value) external {
        require(msg.sender == owner, "not owner");
        value;
    }
}
