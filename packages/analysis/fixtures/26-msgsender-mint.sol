// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract MsgSenderGuardedMint {
    address public owner;
    mapping(address => uint256) public balanceOf;

    constructor() {
        owner = msg.sender;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        balanceOf[to] += amount;
    }
}
