// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract SelfdestructOwner {
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function die(address payable recipient) external onlyOwner {
        selfdestruct(recipient);
    }
}
