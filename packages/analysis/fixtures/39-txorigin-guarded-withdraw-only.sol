// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract TxOriginGuardedWithdraw {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function withdraw(uint256 amount) external {
        require(tx.origin == owner, "not owner");
        payable(msg.sender).transfer(amount);
    }
}
