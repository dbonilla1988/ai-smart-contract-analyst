// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract PrivilegedOnlyOwner {
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        // privileged mint surface
        to;
        amount;
    }

    function pause() external onlyOwner {}
}
